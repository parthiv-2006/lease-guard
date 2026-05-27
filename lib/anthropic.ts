/**
 * Anthropic client — dual-mode authentication.
 *
 * Mode A (production / CI): set ANTHROPIC_API_KEY in environment.
 * Mode B (local dev):       authenticate with `claude auth login` and leave
 *                           ANTHROPIC_API_KEY unset. Credentials are read from
 *                           ~/.claude/.credentials.json automatically.
 *
 * The client is a lazy singleton — it is created on first use, not at import
 * time, so tests can inject env vars before the first call.
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import os from "os";

let _client: Anthropic | null = null;

/** Candidate paths where Claude Code stores OAuth credentials. */
const CLAUDE_CRED_PATHS = [
  path.join(os.homedir(), ".claude", ".credentials.json"),
  path.join(os.homedir(), ".claude", "credentials.json"),
];

/**
 * Resolve an API key from the environment or from Claude Code credentials.
 * Returns undefined if neither source is available.
 */
function resolveApiKey(): string | undefined {
  // Mode A: explicit API key wins unconditionally
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  // Mode B: read Claude Code OAuth token from disk
  // (only attempted when USE_CLAUDE_CODE_AUTH is not explicitly "false")
  if (process.env.USE_CLAUDE_CODE_AUTH === "false") return undefined;

  for (const credPath of CLAUDE_CRED_PATHS) {
    try {
      if (!fs.existsSync(credPath)) continue;
      const raw = fs.readFileSync(credPath, "utf-8");
      const creds = JSON.parse(raw) as Record<string, unknown>;

      // Claude Code stores the token under different keys depending on version
      const token =
        (creds.claudeAiOauth as Record<string, string> | undefined)
          ?.accessToken ??
        (creds as Record<string, string>).access_token ??
        (creds as Record<string, string>).apiKey;

      if (token) return token;
    } catch {
      // File unreadable or malformed — try the next path
    }
  }

  return undefined;
}

/**
 * Create an Anthropic client configured for the given token.
 * OAuth tokens (sk-ant-oat…) use SDK authToken → Authorization: Bearer.
 * Regular API keys (sk-ant-api…) use SDK apiKey → x-api-key.
 */
function makeAnthropicClient(token: string): Anthropic {
  const isOAuth = token.startsWith("sk-ant-oat");
  if (isOAuth) {
    // authToken sends Authorization: Bearer <token> without any x-api-key header.
    // apiKey: null suppresses the SDK's automatic ANTHROPIC_API_KEY env-var fallback,
    // which would otherwise send the OAuth token as x-api-key and get a 401.
    return new Anthropic({ authToken: token, apiKey: null });
  }
  return new Anthropic({ apiKey: token });
}

/**
 * Return the shared Anthropic client, creating it on first call.
 * Throws if no credentials are available.
 */
export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = resolveApiKey();
    if (!apiKey) {
      throw new Error(
        "No Anthropic credentials found.\n" +
          "  • For direct API access:       set ANTHROPIC_API_KEY in .env.local\n" +
          "  • For Claude Code subscription: run `claude auth login` in your terminal"
      );
    }
    _client = makeAnthropicClient(apiKey);
  }
  return _client;
}

/**
 * Reset the singleton (test helper — do not call in production code).
 */
export function _resetClientForTesting(): void {
  _client = null;
}

/** Absolute path to the compiled MCP server entry point. */
export const MCP_SERVER_PATH = path.resolve(
  process.cwd(),
  "mcp-server",
  "dist",
  "start.js"
);
