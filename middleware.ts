import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const isDev = process.env.NODE_ENV === "development";

const CONNECT_ORIGINS = [
  "'self'",
  "https://xtigqcoogbraorwhmshw.supabase.co",
  "wss://xtigqcoogbraorwhmshw.supabase.co",
  "https://api.groq.com",
  "https://generativelanguage.googleapis.com",
  // unpkg CDN: pdf.js worker fetch (connect-src) and worker load (worker-src)
  "https://unpkg.com",
].join(" ");

export async function middleware(request: NextRequest) {
  // Generate a per-request nonce — unique, random, base64-encoded UUID.
  // Replaces 'unsafe-inline' in script-src: Next.js reads x-nonce from the
  // forwarded request headers and applies it to all inline hydration scripts.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = [
    "default-src 'self'",
    // 'strict-dynamic' lets nonce'd scripts load further scripts dynamically
    // (e.g. lazy chunks). The https://unpkg.com allowlist is retained as a
    // fallback for browsers that don't support strict-dynamic.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://unpkg.com${isDev ? " 'unsafe-eval'" : ""}`,
    // Google Fonts stylesheet must be in style-src (it's a cross-origin <link>)
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://xtigqcoogbraorwhmshw.supabase.co",
    // Google Fonts files are served from fonts.gstatic.com
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src ${CONNECT_ORIGINS}`,
    // pdf.js worker: blob: for the inline blob URL, https://unpkg.com for
    // direct CDN worker loads depending on the pdf.js version path
    "worker-src blob: https://unpkg.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  // Forward nonce to server components via the request pipeline.
  // We rebuild headers in getAll/setAll so the nonce survives Supabase
  // session refreshes that re-create the NextResponse object.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // CRITICAL: Next.js reads the nonce from the Content-Security-Policy header on
  // the *request* (getScriptNonceFromHeader) and stamps it onto every script tag
  // it emits. Without this, none of Next's bundle/inline scripts carry the nonce,
  // and 'strict-dynamic' blocks them all — React never hydrates. Setting the CSP
  // here also opts the route into dynamic rendering, required for per-request nonces.
  requestHeaders.set("Content-Security-Policy", csp);

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Re-build headers here so x-nonce is preserved when Supabase
          // refreshes the session and overwrites supabaseResponse.
          const refreshedHeaders = new Headers(request.headers);
          refreshedHeaders.set("x-nonce", nonce);
          refreshedHeaders.set("Content-Security-Policy", csp);
          supabaseResponse = NextResponse.next({
            request: { headers: refreshedHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Security model: middleware uses getSession() (JWT from cookie, no network
  // call) for routing decisions only.  getSession() is NOT used for
  // authorization — it cannot verify token revocation.  Actual auth
  // enforcement (ownership checks, identity verification) is done server-side
  // with getUser() inside each API route and server component.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  if (!user && request.nextUrl.pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Set the dynamic CSP on the final response AFTER Supabase auth runs,
  // so it is always applied regardless of whether setAll re-created the
  // response object above.
  supabaseResponse.headers.set("Content-Security-Policy", csp);

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Skip Next.js internals and static assets
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
