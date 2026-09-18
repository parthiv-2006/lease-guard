export const DEMO_LEASE_ID = "ebf8bf97-563d-4b7d-859f-8ecf76905335";

export interface NavLink {
  label: string;
  href: string;
  external?: boolean;
}

export const NAV_LINKS: NavLink[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Sample Report", href: `/report/${DEMO_LEASE_ID}` },
  { label: "Ontario RTA", href: "/ontario-rta" },
  { label: "Rent Increase Checker", href: "/rent-increase-checker" },
  { label: "Eviction Notice Checker", href: "/eviction-notice-checker" },
  { label: "Deposit & Fees Checker", href: "/deposit-fees-checker" },
  { label: "GitHub", href: "https://github.com/parthiv-2006/lease-guard", external: true },
  { label: "Privacy", href: "/privacy" },
];

export function isNavLinkActive(link: NavLink, currentPath: string): boolean {
  return !link.external && link.href === currentPath;
}
