import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rent Increase Checker — LeaseGuard",
  description:
    "Check whether a rent increase notice you received complies with Ontario's Residential Tenancies Act — the 90-day notice rule, the 12-month rule, and the annual guideline cap.",
};

export default function RentIncreaseCheckerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
