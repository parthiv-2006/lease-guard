import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Static security headers applied to all routes (including static assets
// excluded from the middleware matcher).
// NOTE: Content-Security-Policy is NOT here — it is generated dynamically
// per-request in middleware.ts with a cryptographic nonce so that
// 'unsafe-inline' can be dropped from script-src.
const securityHeaders = [
  // X-Frame-Options kept for legacy browser compat (CSP frame-ancestors takes
  // precedence in modern browsers).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS here (not in middleware) so it also covers static assets that bypass
  // the middleware matcher.
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "leaseguard-sigma.vercel.app",
        "leaseguard.ca",
        "www.leaseguard.ca",
      ],
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
