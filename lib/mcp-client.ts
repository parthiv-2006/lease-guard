/**
 * McpClient — manages a single MCP server subprocess for one lease analysis.
 *
 * Protocol: MCP JSON-RPC over stdio (newline-delimited JSON).
 * One process is spawned per analysis and kept alive for the full pipeline,
 * then cleanly shut down in the finally block of the agent.
 *
 * Lifecycle:
 *   const mcp = await McpClient.create(serverPath);
 *   try {
 *     const result = await mcp.callTool("classify_clause", { ... });
 *   } finally {
 *     mcp.close();
 *   }
 */

import { spawn, ChildProcess } from "child_process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface McpToolContent {
  type: "text";
  text: string;
}

interface McpToolResult {
  content: McpToolContent[];
  isError?: boolean;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Per-tool-call timeout. PDF parsing can take ~30s; give headroom. */
const TOOL_TIMEOUT_MS = 90_000;

/** Timeout for the MCP initialize handshake (server startup). */
const INIT_TIMEOUT_MS = 20_000;

/** Time to wait for graceful stdin.end() before SIGKILL. */
const CLOSE_GRACE_MS = 2_000;

// ---------------------------------------------------------------------------
// McpClient
// ---------------------------------------------------------------------------

export class McpClient {
  private readonly proc: ChildProcess;
  private buffer = "";
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private closed = false;

  private constructor(proc: ChildProcess) {
    this.proc = proc;

    // Accumulate stdout chunks and dispatch complete lines
    proc.stdout!.setEncoding("utf8");
    proc.stdout!.on("data", (chunk: string) => {
      this.buffer += chunk;
      const lines = this.buffer.split("\n");
      // Keep the incomplete last segment in the buffer
      this.buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) this.dispatchLine(trimmed);
      }
    });

    // Stderr goes to the parent process log — useful for debugging
    proc.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(`[mcp-server] ${chunk.toString()}`);
    });

    proc.on("error", (err) => {
      this.rejectAll(new Error(`MCP process error: ${err.message}`));
    });

    proc.on("close", (code) => {
      if (!this.closed && code !== 0 && code !== null) {
        this.rejectAll(
          new Error(`MCP process exited unexpectedly with code ${code}`)
        );
      }
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private dispatchLine(line: string): void {
    let msg: JsonRpcResponse;
    try {
      msg = JSON.parse(line) as JsonRpcResponse;
    } catch {
      // Non-JSON lines (rare) — ignore
      return;
    }

    // Notifications have no id — skip
    if (msg.id === undefined || msg.id === null) return;

    const pending = this.pending.get(msg.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(msg.id);

    if (msg.error) {
      pending.reject(
        new Error(`MCP error ${msg.error.code}: ${msg.error.message}`)
      );
    } else {
      pending.resolve(msg.result);
    }
  }

  private rejectAll(err: Error): void {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(err);
    }
    this.pending.clear();
  }

  private write(msg: JsonRpcRequest | JsonRpcNotification): void {
    if (this.closed) throw new Error("McpClient is closed");
    try {
      this.proc.stdin!.write(JSON.stringify(msg) + "\n");
    } catch (err) {
      throw new Error(
        `Failed to write to MCP stdin: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private request(
    method: string,
    params?: unknown,
    timeoutMs = TOOL_TIMEOUT_MS
  ): Promise<unknown> {
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `MCP request timed out after ${timeoutMs}ms: ${method} (id=${id})`
          )
        );
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.write({ jsonrpc: "2.0", id, method, params });
    });
  }

  private notify(method: string, params?: unknown): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Spawn the MCP server process and complete the initialize handshake.
   * Returns a ready-to-use McpClient.
   */
  static async create(serverPath: string): Promise<McpClient> {
    const proc = spawn("node", [serverPath], {
      stdio: ["pipe", "pipe", "pipe"],
      // Pass the full environment so the server picks up SUPABASE_*, GEMINI_*, etc.
      env: { ...process.env },
    });

    const client = new McpClient(proc);

    // MCP initialize handshake (required before any tool/list calls)
    await client.request(
      "initialize",
      {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "leaseguard-agent", version: "1.0.0" },
      },
      INIT_TIMEOUT_MS
    );

    // Acknowledge initialization — server starts accepting tool calls after this
    client.notify("notifications/initialized");

    return client;
  }

  /**
   * Call an MCP tool by name and return the parsed JSON result.
   *
   * Throws if:
   *  - the request times out
   *  - the JSON-RPC layer reports an error
   *  - the tool itself returns { error: string } in its content
   */
  async callTool(name: string, args: unknown): Promise<unknown> {
    const result = (await this.request("tools/call", {
      name,
      arguments: args,
    })) as McpToolResult;

    const text = result?.content?.[0]?.text;
    if (!text) {
      throw new Error(`Tool "${name}" returned empty content`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(
        `Tool "${name}" returned non-JSON: ${text.slice(0, 300)}`
      );
    }

    // Surface tool-level errors (Zod validation failures, subprocess crashes, etc.)
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).error === "string"
    ) {
      const toolError = (parsed as Record<string, unknown>).error as string;
      const details = (parsed as Record<string, unknown>).details;
      throw new Error(
        `Tool "${name}" failed: ${toolError}${details ? ` — ${JSON.stringify(details)}` : ""}`
      );
    }

    return parsed;
  }

  /**
   * Gracefully shut down the MCP server process.
   * Safe to call multiple times.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;

    try {
      this.proc.stdin?.end();
    } catch {
      // ignore
    }

    // Give the process a moment to exit cleanly, then force-kill
    const killTimer = setTimeout(() => {
      if (!this.proc.killed) {
        this.proc.kill("SIGKILL");
      }
    }, CLOSE_GRACE_MS);

    // Don't keep the Node.js event loop alive for this timer
    if (killTimer.unref) killTimer.unref();
  }
}
