import fs from "fs";
import path from "path";
import { TENANT_TOOLS } from "../lib/tenant-tools";
import { LETTER_CATALOG } from "../lib/tenant-letters/catalog";
import { isNavLinkActive, NAV_LINKS, LETTERS_HREF } from "../app/components/site-nav";

describe("LETTER_CATALOG", () => {
  it("has one entry per letter kind", () => {
    const kinds = LETTER_CATALOG.map((e) => e.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds.sort()).toEqual(
      ["deposit_interest_demand", "eviction_notice_response", "rent_increase_dispute", "repair_request"]
    );
  });

  it("points every letter at a registered checker", () => {
    const slugs = TENANT_TOOLS.map((t) => t.slug);
    for (const entry of LETTER_CATALOG) expect(slugs).toContain(entry.checkerSlug);
  });

  it("never describes a situation as illegal", () => {
    for (const entry of LETTER_CATALOG) expect(entry.whenToUse.toLowerCase()).not.toContain("illegal");
  });
});

describe("letters hub", () => {
  it("has a page at /letters", () => {
    expect(fs.existsSync(path.join(__dirname, "..", "app", "letters", "page.tsx"))).toBe(true);
  });

  it("highlights the Tenant Tools nav link", () => {
    const tools = NAV_LINKS.find((l) => l.label === "Tenant Tools")!;
    expect(isNavLinkActive(tools, LETTERS_HREF)).toBe(true);
  });
});
