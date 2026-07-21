import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lazily construct the service-role client on first use rather than at module
// load. A top-level throw here crashes `next build`'s "Collecting page data"
// step in any environment that lacks the Supabase env vars (e.g. Vercel
// Preview deployments), even though those values are never needed at build
// time. Deferring construction keeps the import side-effect-free while still
// failing loudly the moment the client is actually used without configuration.
let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
    );
  }

  _client = createClient(supabaseUrl, supabaseKey);
  return _client;
}

// Proxy preserves the `import { supabase }` + `supabase.from(...)` call sites
// while routing every access through the lazy initialiser above.
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
