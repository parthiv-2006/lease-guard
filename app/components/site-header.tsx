"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthButton } from "./auth-button";
import { NAV_LINKS, isNavLinkActive } from "./site-nav";

/**
 * Shared header for the content pages (tools hub, checkers, Ontario RTA).
 * Wide screens show the full nav inline; below 760px the links collapse into
 * a Menu toggle so the header never overflows the viewport. The breakpoint
 * swap is pure CSS (.lg-nav-full / .lg-nav-toggle in globals.css) so there is
 * no layout flash on hydration.
 */
export function SiteHeader({ currentPath }: { currentPath: string }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      style={{
        position: "relative",
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "0 clamp(20px,4vw,56px)",
        height: 66,
        borderBottom: "1px solid #17140f",
        background: "rgba(247,244,238,0.92)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        flexShrink: 0,
      }}
    >
      <Link
        href="/"
        style={{
          fontFamily: "'Newsreader', serif",
          fontStyle: "italic",
          fontWeight: 600,
          fontSize: 22,
          letterSpacing: "-0.01em",
          color: "#17140f",
          textDecoration: "none",
        }}
      >
        LeaseGuard
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <nav className="lg-nav-full" style={{ gap: "clamp(14px,2.4vw,28px)", alignItems: "center" }}>
          {NAV_LINKS.map((link) => (
            <NavItem key={link.label} link={link} active={isNavLinkActive(link, currentPath)} />
          ))}
        </nav>
        <button
          type="button"
          className="lg-nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="site-header-menu"
          onClick={() => setMenuOpen((open) => !open)}
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 12,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "6px 10px",
            border: "1px solid #17140f",
            background: menuOpen ? "#17140f" : "transparent",
            color: menuOpen ? "#f4efe4" : "#17140f",
            cursor: "pointer",
          }}
        >
          {menuOpen ? "Close" : "Menu"}
        </button>
        <AuthButton />
      </div>

      {menuOpen && (
        <nav
          id="site-header-menu"
          className="lg-nav-menu"
          aria-label="Site menu"
          style={{
            position: "absolute",
            top: 66,
            left: 0,
            right: 0,
            flexDirection: "column",
            background: "#f7f4ee",
            borderBottom: "1px solid #17140f",
            padding: "8px clamp(20px,4vw,56px) 16px",
          }}
        >
          {NAV_LINKS.map((link) => (
            <NavItem
              key={link.label}
              link={link}
              active={isNavLinkActive(link, currentPath)}
              stacked
              onNavigate={() => setMenuOpen(false)}
            />
          ))}
        </nav>
      )}
    </header>
  );
}

function NavItem({
  link,
  active,
  stacked = false,
  onNavigate,
}: {
  link: (typeof NAV_LINKS)[number];
  active: boolean;
  stacked?: boolean;
  onNavigate?: () => void;
}) {
  const { label, href, external } = link;
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      onClick={onNavigate}
      style={{
        fontSize: stacked ? 16 : 14,
        color: active ? "#17140f" : "#4a4438",
        fontWeight: active ? 600 : 400,
        textDecoration: "none",
        whiteSpace: "nowrap",
        ...(stacked
          ? { padding: "10px 0", borderBottom: "1px solid #e0d9c6" }
          : { borderBottom: active ? "1px solid #17140f" : "1px solid transparent", paddingBottom: 2 }),
      }}
    >
      {label}
    </a>
  );
}
