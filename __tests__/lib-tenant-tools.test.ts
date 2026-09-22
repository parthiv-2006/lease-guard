import fs from "fs";
import path from "path";
import { TENANT_TOOLS, toolsForClauseType } from "../lib/tenant-tools";

describe("TENANT_TOOLS", () => {
  it("has unique slugs and hrefs", () => {
    const slugs = TENANT_TOOLS.map((t) => t.slug);
    const hrefs = TENANT_TOOLS.map((t) => t.href);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("points every href at an existing app route", () => {
    for (const tool of TENANT_TOOLS) {
      expect(tool.href).toBe(`/${tool.slug}`);
      const pagePath = path.join(__dirname, "..", "app", tool.slug, "page.tsx");
      expect(fs.existsSync(pagePath)).toBe(true);
    }
  });

  it("cites at least one RTA section per tool", () => {
    for (const tool of TENANT_TOOLS) {
      expect(tool.statuteRefs.length).toBeGreaterThan(0);
      for (const ref of tool.statuteRefs) {
        expect(ref).toMatch(/^s\. \d+/);
      }
    }
  });

  it("never describes a clause or fee as illegal in its blurb", () => {
    for (const tool of TENANT_TOOLS) {
      expect(tool.blurb.toLowerCase()).not.toContain("illegal");
    }
  });
});

describe("toolsForClauseType", () => {
  it("maps rent increase clauses to the rent increase checker", () => {
    expect(toolsForClauseType("rent_increase").map((t) => t.slug)).toEqual(["rent-increase-checker"]);
  });

  it("maps deposit clauses to the deposit and fees checker", () => {
    expect(toolsForClauseType("security_deposit").map((t) => t.slug)).toEqual(["deposit-fees-checker"]);
  });

  it("maps maintenance clauses to the maintenance and repairs checker", () => {
    expect(toolsForClauseType("maintenance_repairs").map((t) => t.slug)).toEqual(["maintenance-repairs-checker"]);
  });

  it("maps entry rights clauses to the landlord entry checker", () => {
    expect(toolsForClauseType("entry_rights").map((t) => t.slug)).toEqual(["landlord-entry-checker"]);
  });

  it("only maps clause types the classifier actually produces", () => {
    const labels = fs.readFileSync(path.join(__dirname, "..", "app", "components", "shared.tsx"), "utf8");
    for (const tool of TENANT_TOOLS) {
      for (const clauseType of tool.clauseTypes) {
        expect(labels).toContain(`${clauseType}:`);
      }
    }
  });

  it("returns nothing for clause types no tool covers", () => {
    expect(toolsForClauseType("parking_storage")).toEqual([]);
    expect(toolsForClauseType("unknown")).toEqual([]);
  });
});
