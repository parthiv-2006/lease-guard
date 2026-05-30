export async function register() {
  // Production guard: if TLS verification was accidentally disabled via an env
  // var (e.g. NODE_TLS_REJECT_UNAUTHORIZED=0 set on Vercel), crash loudly
  // rather than silently running with MITM-vulnerable outbound connections.
  if (process.env.NODE_ENV === "production") {
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
      throw new Error(
        "SECURITY: NODE_TLS_REJECT_UNAUTHORIZED=0 must not be set in production. " +
        "Remove this environment variable from Vercel settings immediately."
      );
    }
    return;
  }

  // Windows dev only: Node.js OpenSSL CA bundle may not include Supabase's
  // intermediate cert (government CAs not in default Windows trust store).
  // Vercel runs Linux with a complete CA bundle — the NODE_ENV guard above
  // ensures this never executes in production.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}
