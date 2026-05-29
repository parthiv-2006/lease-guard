/**
 * McpClient — manages a single MCP server connection.
 *
 * Two modes:
 *   HTTP mode  — when MCP_SERVER_URL is set, POSTs each JSON-RPC request to
 *                {MCP_SERVER_URL}/mcp and reads a JSON response. The Railway
 *                server uses StreamableHTTPServerTransport with enableJsonResponse:true,
 *                so each POST returns a complete JSON-RPC response synchronously.
 *   Stdio mode — when MCP_SERVER_URL is not set, spawns the MCP server as a
 *                local subprocess and communicates over stdin/stdout.
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

/** Per-tool-call timeout. PDF parsing can take ~60s; give headroom. */
const TOOL_TIMEOUT_MS = 90_000;

/** Timeout for the MCP initialize handshake. */
const INIT_TIMEOUT_MS = 20_000;

/** Time to wait for graceful stdin.end() before SIGKILL (stdio mode). */
const CLOSE_GRACE_MS = 2_000;

// ---------------------------------------------------------------------------
// McpClient
// ---------------------------------------------------------------------------

export class McpClient {
  private readonly mode: "http" | "stdio";
  private readonly mcpUrl: string;
  private readonly proc?: ChildProcess;
  private buffer = "";
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private closed = false;

  private constructor(options:
    | { mode: "http"; mcpUrl: string }
    | { mode: "stdio"; proc: ChildProcess }
  ) {
    if (options.mode === "http") {
      this.mode = "http";
      this.mcpUrl = options.mcpUrl;
    } else {
      this.mode = "stdio";
      this.mcpUrl = "";
      this.proc = options.proc;

      this.proc.stdout!.setEncoding("utf8");
      this.proc.stdout!.on("data", (chunk: string) => {
        this.buffer += chunk;
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) this.dispatchLine(trimmed);
        }
      });

      this.proc.stderr?.on("data", (chunk: Buffer) => {
        process.stderr.write(`[mcp-server] ${chunk.toString()}`);
      });

      this.proc.on("error", (err) => {
        this.rejectAll(new Error(`MCP process error: ${err.message}`));
      });

      this.proc.on("close", (code) => {
        if (!this.closed && code !== 0 && code !== null) {
          this.rejectAll(new Error(`MCP process exited unexpectedly with code ${code}`));
        }
      });
    }
  }

  // -------------------------------------------------------------------------
  // Stdio helpers
  // -------------------------------------------------------------------------

  private dispatchLine(line: string): void {
    let msg: JsonRpcResponse;
    try {
      msg = JSON.parse(line) as JsonRpcResponse;
    } catch {
      return;
    }
    if (msg.id === undefined || msg.id === null) return;

    const pending = this.pending.get(msg.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(msg.id);

    if (msg.error) {
      pending.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
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

  // -------------------------------------------------------------------------
  // HTTP helpers
  // -------------------------------------------------------------------------

  /**
   * POST a JSON-RPC message to /mcp and return the parsed response.
   * With enableJsonResponse:true on the server, every POST returns a
   * complete JSON-RPC response object (no SSE streaming needed).
   */
  private async httpPost(
    msg: JsonRpcRequest | JsonRpcNotification,
    timeoutMs: number
  ): Promise<JsonRpcResponse | null> {
    if (this.closed) throw new Error("McpClient is closed");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.mcpUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
        },
        body: JSON.stringify(msg),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `MCP HTTP request failed: ${response.status} ${response.statusText}`
        );
      }

      // Notifications (no id) return 202/204 with no body.
      const text = await response.text();
      if (!text || text.trim() === "") return null;

      return JSON.parse(text) as JsonRpcResponse;
    } finally {
      clearTimeout(timer);
    }
  }

  // -------------------------------------------------------------------------
  // Shared request/notify
  // -------------------------------------------------------------------------

  private request(
    method: string,
    params?: unknown,
    timeoutMs = TOOL_TIMEOUT_MS
  ): Promise<unknown> {
    const id = this.nextId++;

    if (this.mode === "http") {
      return this.httpPost(
        { jsonrpc: "2.0", id, method, params },
        timeoutMs
      ).then((resp) => {
        if (!resp) throw new Error(`No response received for ${method}`);
        if (resp.error) {
          throw new Error(`MCP error ${resp.error.code}: ${resp.error.message}`);
        }
        return resp.result;
      });
    }

    // stdio mode
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out after ${timeoutMs}ms: ${method} (id=${id})`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      try {
        this.proc!.stdin!.write(
          JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"
        );
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error(`Failed to write to MCP stdin: ${err instanceof Error ? err.message : String(err)}`));
      }
    });
  }

  private notify(method: string, params?: unknown): void {
    const msg: JsonRpcNotification = { jsonrpc: "2.0", method, params };

    if (this.mode === "http") {
      // Fire-and-forget — notifications don't expect a response
      this.httpPost(msg, INIT_TIMEOUT_MS).catch((err) => {
        console.error(`[McpClient] Failed to send notification ${method}:`, err.message);
      });
      return;
    }

    // stdio mode
    try {
      this.proc!.stdin!.write(JSON.stringify(msg) + "\n");
    } catch (err) {
      console.error(`[McpClient] Failed to send notification: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  static async create(serverPath: string): Promise<McpClient> {
    const mcpServerUrl = process.env.MCP_SERVER_URL;

    if (mcpServerUrl) {
      const mcpUrl = `${mcpServerUrl}/mcp`;
      const client = new McpClient({ mode: "http", mcpUrl });

      await client.request(
        "initialize",
        {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "leaseguard-agent", version: "1.0.0" },
        },
        INIT_TIMEOUT_MS
      );

      client.notify("notifications/initialized");
      return client;
    }

    // Stdio mode: spawn the MCP server locally
    const cleanEnv = { ...process.env };
    delete cleanEnv.PORT;
    const proc = spawn("node", [serverPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: cleanEnv,
    });

    const client = new McpClient({ mode: "stdio", proc });

    await client.request(
      "initialize",
      {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "leaseguard-agent", version: "1.0.0" },
      },
      INIT_TIMEOUT_MS
    );

    client.notify("notifications/initialized");
    return client;
  }

  /**
   * Call an MCP tool by name and return the parsed JSON result.
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
      throw new Error(`Tool "${name}" returned non-JSON: ${text.slice(0, 300)}`);
    }

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
   * Gracefully shut down the connection.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;

    if (this.mode === "http") {
      this.rejectAll(new Error("McpClient closed"));
      return;
    }

    // stdio mode
    try {
      this.proc?.stdin?.end();
    } catch {
      // ignore
    }

    const killTimer = setTimeout(() => {
      if (this.proc && !this.proc.killed) {
        this.proc.kill("SIGKILL");
      }
    }, CLOSE_GRACE_MS);

    if (killTimer.unref) killTimer.unref();
  }
}
