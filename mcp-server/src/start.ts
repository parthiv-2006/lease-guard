/**
 * Entry point for the LeaseGuard MCP server.
 *
 * Loads .env.local before importing anything that reads process.env at module
 * level (e.g. lib/supabase.ts). In ESM, static imports are hoisted, so we
 * must use a dynamic import for index.ts to guarantee env is populated first.
 */
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// First executable line after static imports — appears in Railway Deploy Logs
// immediately on startup. If this line is missing from logs, the Docker CMD
// itself failed (wrong path, missing file, etc.).
process.stderr.write(
  `[LeaseGuard MCP] start.ts: process started (Node ${process.version})\n`
);

const _dir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(_dir, "../../.env.local") }); // preferred
config({ path: resolve(_dir, "../../.env") });        // fallback

process.stderr.write(
  `[LeaseGuard MCP] start.ts: env loaded — PORT=${process.env.PORT ?? "(not set)"}, ` +
    `SUPABASE_URL=${process.env.SUPABASE_URL ? "set" : "MISSING"}, ` +
    `SUPABASE_SERVICE_ROLE_KEY=${process.env.SUPABASE_SERVICE_ROLE_KEY ? "set" : "MISSING"}, ` +
    `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY ? "set" : "MISSING"}, ` +
    `GEMINI_API_KEY=${process.env.GEMINI_API_KEY ? "set" : "MISSING"}\n`
);

try {
  await import("./index.js");
} catch (err) {
  // A module-level throw (e.g. from a lib/ file) lands here.
  // Log it explicitly so it appears in Railway Deploy Logs even if the process
  // exits too quickly for the default unhandledRejection handler to fire.
  process.stderr.write(
    `[LeaseGuard MCP] FATAL: index.js import failed — ` +
      `${err instanceof Error ? err.message : String(err)}\n`
  );
  if (err instanceof Error && err.stack) {
    process.stderr.write(`[LeaseGuard MCP] Stack: ${err.stack}\n`);
  }
  process.exit(1);
}
