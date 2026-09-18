import { TENANT_TOOLS } from "@/lib/tenant-tools";

export const DEMO_LEASE_ID = "ebf8bf97-563d-4b7d-859f-8ecf76905335";

export const TOOLS_HUB_HREF = "/tools";

export interface NavLink {
  label: string;
  href: string;
  external?: boolean;
}

export const NAV_LINKS: NavLink[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Sample Report", href: `/report/${DEMO_LEASE_ID}` },
  { label: "Ontario RTA", href: "/ontario-rta" },
  { label: "Tenant Tools", href: TOOLS_HUB_HREF },
  { label: "GitHub", href: "https://github.com/parthiv-2006/lease-guard", external: true },
  { label: "Privacy", href: "/privacy" },
];

export function isNavLinkActive(link: NavLink, currentPath: string): boolean {
  if (link.external) return false;
  if (link.href === TOOLS_HUB_HREF) {
    return currentPath === TOOLS_HUB_HREF || TENANT_TOOLS.some((tool) => tool.href === currentPath);
  }
  return link.href === currentPath;
}
