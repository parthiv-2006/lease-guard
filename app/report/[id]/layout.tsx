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
      .select("property_address, property_city, overall_risk_level, overall_risk_score")
      .eq("id", id)
      .single();

    if (!data) throw new Error("not found");

    const address = [data.property_address, data.property_city]
      .filter(Boolean)
      .join(", ");

    const riskLabel = data.overall_risk_level
      ? `${data.overall_risk_level.charAt(0).toUpperCase()}${data.overall_risk_level.slice(1)} risk`
      : null;

    const titleParts = [address || "Lease Analysis", riskLabel].filter(Boolean);
    const title = titleParts.join(" — ");

    const score =
      data.overall_risk_score != null
        ? ` Score: ${data.overall_risk_score}/100.`
        : "";

    return {
      title,
      description: `LeaseGuard analysis for ${address || "your lease"}.${score} Every finding grounded in Ontario RTA statute and tribunal decisions.`,
      robots: { index: false, follow: false },
    };
  } catch {
    return {
      title: "Lease Analysis",
      description:
        "AI-powered Ontario lease analysis grounded in real law — not AI guesswork.",
      robots: { index: false, follow: false },
    };
  }
}

export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
