import { test, expect } from "@playwright/test";
import { TENANT_TOOLS } from "../lib/tenant-tools";

/**
 * e2e/tenant-tools.spec.ts — Tenant tools hub and checker navigation.
 *
 * Verifies that:
 * - /tools lists one card per registered checker, each linking to its route
 * - every checker page renders and highlights the Tenant Tools nav link
 * - the header no longer lists the checkers individually
 * - the landing page and sitemap expose the hub and every checker
 */

test.describe("Tenant tools hub", () => {
  test("/tools lists every registered checker", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const response = await page.goto("/tools");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/Tenant Tools/i);

    const cards = page.getByTestId("tenant-tool-card");
    await expect(cards).toHaveCount(TENANT_TOOLS.length);
    for (const tool of TENANT_TOOLS) {
      await expect(page.locator(`[data-testid="tenant-tool-card"][href="${tool.href}"]`)).toContainText(tool.title);
    }

    expect(errors).toHaveLength(0);
  });

  test("clicking a tool card opens that checker", async ({ page }) => {
    const tool = TENANT_TOOLS[0];
    await page.goto("/tools");
    await page.locator(`[data-testid="tenant-tool-card"][href="${tool.href}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${tool.href}$`));
    await expect(page.locator("h1")).toHaveText(tool.question);
  });

  for (const tool of TENANT_TOOLS) {
    test(`${tool.href} — highlights Tenant Tools in the header`, async ({ page }) => {
      await page.goto(tool.href);
      const nav = page.locator("header nav");
      const toolsLink = nav.getByRole("link", { name: "Tenant Tools" });
      await expect(toolsLink).toHaveAttribute("href", "/tools");
      await expect(toolsLink).toHaveCSS("font-weight", "600");
      await expect(nav.getByRole("link", { name: tool.title })).toHaveCount(0);
    });
  }

  test("landing page links to the hub and every checker", async ({ page }) => {
    await page.goto("/");
    const section = page.getByTestId("landing-tenant-tools");
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator('a[href="/tools"]')).toBeVisible();
    for (const tool of TENANT_TOOLS) {
      await expect(section.locator(`a[href="${tool.href}"]`)).toBeVisible();
    }
  });

  test("sitemap includes the hub and every checker", async ({ page }) => {
    const response = await page.goto("/sitemap.xml");
    const content = (await response?.text()) ?? "";
    expect(content).toMatch(/<loc>[^<]*\/tools<\/loc>/);
    for (const tool of TENANT_TOOLS) {
      expect(content).toContain(`${tool.href}</loc>`);
    }
  });
});
