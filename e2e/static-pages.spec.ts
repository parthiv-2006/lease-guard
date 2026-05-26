import { test, expect } from "@playwright/test";

/**
 * e2e/static-pages.spec.ts — LeaseGuard static/info page E2E tests.
 *
 * Verifies that all public informational pages render without errors:
 * - /about
 * - /how-it-works
 * - /ontario-rta
 * - /privacy
 * - /terms
 * - /sign-in
 * - /not-found (404 page)
 * - /sitemap.xml
 * - /robots.txt
 */

const STATIC_PAGES = [
  { path: "/about", titleMatch: /LeaseGuard/i, headingMatch: null },
  { path: "/how-it-works", titleMatch: /LeaseGuard/i, headingMatch: null },
  { path: "/ontario-rta", titleMatch: /LeaseGuard/i, headingMatch: null },
  {
    path: "/privacy",
    titleMatch: /Privacy|LeaseGuard/i,
    headingMatch: /Privacy Policy/i,
  },
  {
    path: "/terms",
    titleMatch: /Terms|LeaseGuard/i,
    headingMatch: /Terms of Service/i,
  },
  {
    path: "/sign-in",
    titleMatch: /Sign In|LeaseGuard/i,
    headingMatch: null,
  },
];

test.describe("Static / info pages", () => {
  for (const { path, titleMatch, headingMatch } of STATIC_PAGES) {
    test(`${path} — loads without error`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBeLessThan(500);

      await expect(page).toHaveTitle(titleMatch);

      if (headingMatch) {
        const heading = page
          .locator("h1, h2")
          .filter({ hasText: headingMatch })
          .first();
        await expect(heading).toBeVisible({ timeout: 10_000 });
      }

      const fatal = errors.filter(
        (e) =>
          !e.includes("ResizeObserver") &&
          !e.includes("Non-Error promise rejection") &&
          !e.includes("Loading chunk")
      );
      expect(fatal).toHaveLength(0);
    });
  }

  test("/privacy — has at least 5 sections", async ({ page }) => {
    await page.goto("/privacy");
    // Privacy policy should have multiple section headings
    const headings = page.locator("h2, h3");
    const count = await headings.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test("/terms — has at least 5 sections", async ({ page }) => {
    await page.goto("/terms");
    const headings = page.locator("h2, h3");
    const count = await headings.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test("/sign-in — shows sign-in form elements", async ({ page }) => {
    await page.goto("/sign-in");
    await page.waitForLoadState("networkidle");
    // Should have either an email input, a Google OAuth button, or a guest link
    const hasEmailInput = (await page.locator("input[type='email']").count()) > 0;
    const hasGoogleBtn =
      (await page.locator("text=/Google/i").count()) > 0;
    const hasGuestLink =
      (await page.locator("text=/guest|continue without/i").count()) > 0;
    expect(hasEmailInput || hasGoogleBtn || hasGuestLink).toBe(true);
  });

  test("404 page renders for unknown route", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist-xyz");
    // Next.js returns 404 status for unknown routes
    expect(response?.status()).toBe(404);
    // Our branded not-found.tsx should show "404" text
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toMatch(/404|not found|page not found/i);
  });

  test("/sitemap.xml returns XML with URLs", async ({ page }) => {
    const response = await page.goto("/sitemap.xml");
    expect(response?.status()).toBe(200);
    const content = await response?.text();
    expect(content).toContain("<urlset");
    expect(content).toContain("<loc>");
  });

  test("/robots.txt disallows protected routes", async ({ page }) => {
    const response = await page.goto("/robots.txt");
    expect(response?.status()).toBe(200);
    const content = await response?.text();
    expect(content).toContain("Disallow: /dashboard");
    expect(content).toContain("Disallow: /api/");
  });
});
