export async function register() {
  // Windows dev: Node.js OpenSSL CA bundle may not include Supabase's intermediate cert.
  // Vercel (Linux) has a complete CA bundle so this guard keeps prod unaffected.
  if (process.env.NODE_ENV !== "production") {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
}
