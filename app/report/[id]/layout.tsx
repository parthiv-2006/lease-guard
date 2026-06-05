import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data } = await supabase
      .from("leases")
      .select("overall_risk_level, overall_risk_score")
      .eq("id", id)
      .single();

    if (!data) throw new Error("not found");

    const score = data.overall_risk_score ?? null;
    const level = data.overall_risk_level ?? null;
    const levelLabel = level
      ? `${level.charAt(0).toUpperCase()}${level.slice(1)}`
      : null;

    const title =
      score != null && levelLabel
        ? `Lease risk: ${score} ${levelLabel} — LeaseGuard`
        : "Lease Analysis — LeaseGuard";

    const description = `LeaseGuard found ${levelLabel ?? "unknown"} risk in this Ontario lease. Every finding grounded in real RTA statute and tribunal decisions.`;

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ?? "https://leaseguard-sigma.vercel.app";
    const ogImage = `${baseUrl}/report/${id}/opengraph-image`;

    return {
      title,
      description,
      robots: { index: false, follow: false },
      openGraph: {
        title,
        description,
        images: [ogImage],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [ogImage],
      },
    };
  } catch {
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ?? "https://leaseguard-sigma.vercel.app";
    const fallbackDescription =
      "AI-powered Ontario lease analysis grounded in real law — not AI guesswork.";
    return {
      title: "Lease Analysis — LeaseGuard",
      description: fallbackDescription,
      robots: { index: false, follow: false },
      openGraph: {
        title: "Lease Analysis — LeaseGuard",
        description: fallbackDescription,
        images: [`${baseUrl}/opengraph-image`],
      },
      twitter: {
        card: "summary_large_image",
        title: "Lease Analysis — LeaseGuard",
        description: fallbackDescription,
        images: [`${baseUrl}/opengraph-image`],
      },
    };
  }
}

export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
