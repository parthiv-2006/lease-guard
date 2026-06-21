import type { Metadata } from "next";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";

// The middleware applies a per-request CSP nonce with 'strict-dynamic'. Next.js
// can only stamp that nonce onto its <script> tags when the page is rendered
// per-request — a statically prerendered page ships build-time HTML whose scripts
// have no nonce, so 'strict-dynamic' blocks every bundle and React never hydrates.
// Forcing dynamic rendering app-wide is the documented requirement for nonce CSP.
export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "https://leaseguard.ca";

const OG_TITLE = "LeaseGuard — Read what you sign";
const OG_DESCRIPTION =
  "Upload your Ontario lease. An AI agent reads every clause against 2,372 RTA sections and flags what may not be enforceable — cited, grounded, free.";

export const metadata: Metadata = {
  title: {
    default: OG_TITLE,
    template: "%s | LeaseGuard",
  },
  description: OG_DESCRIPTION,
  metadataBase: new URL(SITE_URL),
  openGraph: {
    type: "website",
    siteName: "LeaseGuard",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&family=Fira+Code:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <NextTopLoader
          color="#181614"
          height={2}
          showSpinner={false}
          easing="ease"
          speed={200}
          shadow="none"
        />
        {children}
      </body>
    </html>
  );
}
