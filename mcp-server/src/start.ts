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

const _dir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(_dir, "../../.env.local") }); // preferred
config({ path: resolve(_dir, "../../.env") });        // fallback

await import("./index.js");
