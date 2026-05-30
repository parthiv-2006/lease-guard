import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Connect origins used by browser-side code (chat RAG, negotiation, auth)
const CONNECT_ORIGINS = [
  "'self'",
  "https://xtigqcoogbraorwhmshw.supabase.co",
  "wss://xtigqcoogbraorwhmshw.supabase.co",
  "https://api.groq.com",
  "https://generativelanguage.googleapis.com",
].join(" ");

// Content Security Policy
// - unsafe-inline for scripts: needed for Next.js App Router inline hydration scripts
// - unsafe-eval: development only (HMR); not present in production builds
// - unpkg.com: PDF.js web worker (loaded from CDN in pdf-viewer.tsx)
// - worker-src blob: PDF.js spins up a blob-URL worker
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://unpkg.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://xtigqcoogbraorwhmshw.supabase.co",
  "font-src 'self' data:",
  `connect-src ${CONNECT_ORIGINS}`,
  "worker-src blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  // Replaces the deprecated X-Frame-Options (frame-ancestors in CSP takes precedence
  // in modern browsers, but X-Frame-Options is kept for legacy browser compat).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: csp },
  // HSTS: only sent in production — dev uses HTTP or self-signed certs.
  // max-age=2 years; preload allows inclusion in browser HSTS preload lists.
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "leaseguard.ca", "www.leaseguard.ca"],
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
