import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// IMPORTANT: Do NOT throw here at module evaluation time.
// A module-level throw crashes the process before app.listen() is ever called,
// making Railway return 502 on all routes (including /health) with zero log output.
// Instead, log a clear warning — tools that need Supabase will fail at call time
// with a meaningful error rather than silently killing the server.
if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error(
    "[LeaseGuard MCP] FATAL CONFIG: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. " +
      "Supabase-dependent tools will fail at runtime. " +
      "Go to Railway → leaseguard-mcp → Variables and add these env vars."
  );
}

export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseServiceRoleKey ?? "placeholder-service-role-key",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
