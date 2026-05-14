import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LeaseGuard — Read what you sign",
  description:
    "AI-powered Ontario lease analysis. Every risk grounded in real law.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
