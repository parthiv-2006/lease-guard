/**
 * McpClient — manages a single MCP server connection (stdio subprocess or SSE transport)
 * for one lease analysis.
 *
 * Protocol: MCP JSON-RPC over stdio (newline-delimited JSON) OR SSE.
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
  private readonly proc?: ChildProcess;
  private readonly abortController?: AbortController;
  private readonly isSse: boolean;
  private postUrl = "";
  private buffer = "";
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private closed = false;

  private endpointPromise?: Promise<string>;
  private resolveEndpoint?: (url: string) => void;

  private constructor(options: {
    proc?: ChildProcess;
    abortController?: AbortController;
    isSse: boolean;
  }) {
    this.proc = options.proc;
    this.abortController = options.abortController;
    this.isSse = options.isSse;

    if (this.isSse) {
      let resolveEp: (url: string) => void;
      this.endpointPromise = new Promise<string>((resolve) => {
        resolveEp = resolve;
      });
      this.resolveEndpoint = resolveEp!;
    } else if (this.proc) {
      // Accumulate stdout chunks and dispatch complete lines
      this.proc.stdout!.setEncoding("utf8");
      this.proc.stdout!.on("data", (chunk: string) => {
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
      this.proc.stderr?.on("data", (chunk: Buffer) => {
        process.stderr.write(`[mcp-server] ${chunk.toString()}`);
      });

      this.proc.on("error", (err) => {
        this.rejectAll(new Error(`MCP process error: ${err.message}`));
      });

      this.proc.on("close", (code) => {
        if (!this.closed && code !== 0 && code !== null) {
          this.rejectAll(
            new Error(`MCP process exited unexpectedly with code ${code}`)
          );
        }
      });
    }
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

  private async startSseReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "";
    let currentData = "";

    try {
      while (!this.closed) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let lineEnd: number;
        while ((lineEnd = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, lineEnd).replace(/\r$/, "");
          buffer = buffer.slice(lineEnd + 1);

          if (line === "") {
            // End of SSE event block
            if (currentEvent === "endpoint" && currentData) {
              const sseUrl = `${process.env.MCP_SERVER_URL}/sse`;
              this.postUrl = new URL(currentData, sseUrl).toString();
              this.resolveEndpoint?.(this.postUrl);
            } else if (currentEvent === "message" && currentData) {
              this.dispatchLine(currentData);
            }
            currentEvent = "";
            currentData = "";
          } else if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const val = line.slice(5).trim();
            currentData = currentData ? currentData + "\n" + val : val;
          }
        }
      }
    } catch (err) {
      if (!this.closed) {
        this.rejectAll(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  private async write(msg: JsonRpcRequest | JsonRpcNotification): Promise<void> {
    if (this.closed) throw new Error("McpClient is closed");
    if (this.isSse) {
      if (!this.postUrl) {
        throw new Error("POST URL not resolved yet");
      }
      const res = await fetch(this.postUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg),
      });
      if (!res.ok) {
        throw new Error(`Failed to POST message: ${res.statusText}`);
      }
    } else {
      if (!this.proc || !this.proc.stdin) {
        throw new Error("Stdio process is not initialized");
      }
      try {
        this.proc.stdin.write(JSON.stringify(msg) + "\n");
      } catch (err) {
        throw new Error(
          `Failed to write to MCP stdin: ${err instanceof Error ? err.message : String(err)}`
        );
      }
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
      this.write({ jsonrpc: "2.0", id, method, params }).catch((err) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      });
    });
  }

  private notify(method: string, params?: unknown): void {
    this.write({ jsonrpc: "2.0", method, params }).catch((err) => {
      console.error(`Failed to send notification: ${err.message}`);
    });
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Spawn the MCP server process or connect to it over SSE.
   * Returns a ready-to-use McpClient.
   */
  static async create(serverPath: string): Promise<McpClient> {
    const mcpServerUrl = process.env.MCP_SERVER_URL;

    if (mcpServerUrl) {
      const abortController = new AbortController();
      const sseUrl = `${mcpServerUrl}/sse`;

      const response = await fetch(sseUrl, { signal: abortController.signal });
      if (!response.ok) {
        throw new Error(`Failed to connect to SSE at ${sseUrl}: ${response.statusText}`);
      }
      if (!response.body) {
        throw new Error(`SSE response from ${sseUrl} has no body`);
      }

      const client = new McpClient({
        isSse: true,
        abortController,
      });

      const reader = response.body.getReader();
      client.startSseReader(reader);

      // Wait for the event: endpoint URL to resolve
      await Promise.race([
        client.endpointPromise!,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout waiting for SSE endpoint event")), 10000)
        ),
      ]);

      // MCP initialize handshake
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
    } else {
      const cleanEnv = { ...process.env };
      delete cleanEnv.PORT;
      const proc = spawn("node", [serverPath], {
        stdio: ["pipe", "pipe", "pipe"],
        env: cleanEnv,
      });

      const client = new McpClient({
        proc,
        isSse: false,
      });

      // MCP initialize handshake
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
      throw new Error(
        `Tool "${name}" returned non-JSON: ${text.slice(0, 300)}`
      );
    }

    // Surface tool-level errors
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

    if (this.isSse) {
      try {
        this.abortController?.abort();
      } catch {
        // ignore
      }
      this.rejectAll(new Error("McpClient closed"));
    } else {
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
}
