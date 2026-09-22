import { test, expect } from "@playwright/test";

/**
 * e2e/landlord-entry-checker.spec.ts — Landlord Entry Checker flow.
 *
 * Verifies that:
 * - the page renders with every entry reason in the dropdown
 * - a repair entry with a full notice given 24+ hours ahead appears permitted
 * - a notice given less than 24 hours ahead fails and points at a T2 application
 * - an entry at 9 p.m. fails the 8 a.m. to 8 p.m. window
 * - an emergency entry needs no notice
 * - the Ontario RTA reference links its entry section to the checker
 */

test.describe("Landlord Entry Checker", () => {
  test("renders the form with every entry reason", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const response = await page.goto("/landlord-entry-checker");
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveText("Was your landlord allowed to come in?");
    await expect(page.locator("#entryReason option")).toHaveCount(10);

    expect(errors).toHaveLength(0);
  });

  test("repair entry with full 24-hour notice appears permitted", async ({ page }) => {
    await page.goto("/landlord-entry-checker");
    await page.locator("#entryReason").selectOption("repairs_or_work");
    await page.locator("#entryDate").fill("2026-03-10");
    await page.locator("#entryTime").fill("10:00");
    await page.locator("#gotWrittenNotice").check();
    await page.locator("#noticeDate").fill("2026-03-08");
    await page.locator("#noticeTime").fill("18:00");
    await page.locator("#noticeStatedReason").check();
    await page.locator("#noticeStatedTime").check();
    await page.getByRole("button", { name: "Check this entry" }).click();

    await expect(page.getByTestId("entry-check-verdict")).toHaveText(/appears permitted/i);
    await expect(page.getByTestId("entry-checks")).toContainText("40 hours before the entry");
    await expect(page.getByTestId("letter-builder")).toHaveCount(0);
  });

  test("short notice fails and points at a T2 application", async ({ page }) => {
    await page.goto("/landlord-entry-checker");
    await page.locator("#entryReason").selectOption("inspection");
    await page.locator("#entryDate").fill("2026-03-10");
    await page.locator("#entryTime").fill("10:00");
    await page.locator("#gotWrittenNotice").check();
    await page.locator("#noticeDate").fill("2026-03-09");
    await page.locator("#noticeTime").fill("16:00");
    await page.locator("#noticeStatedReason").check();
    await page.locator("#noticeStatedTime").check();
    await page.getByRole("button", { name: "Check this entry" }).click();

    await expect(page.getByTestId("entry-check-verdict")).toHaveText(/may not have been permitted/i);
    await expect(page.getByTestId("entry-checks")).toContainText("only 18 hours");
    const steps = page.getByTestId("entry-next-steps");
    await expect(steps).toContainText("Form T2");
    await expect(steps).toContainText("by March 10, 2027");
    await expect(page.getByTestId("entry-check-result")).not.toContainText(/illegal/i);
  });

  test("entry at 9 p.m. fails the 8 a.m. to 8 p.m. window", async ({ page }) => {
    await page.goto("/landlord-entry-checker");
    await page.locator("#entryReason").selectOption("showing_to_prospective_tenant");
    await page.locator("#entryDate").fill("2026-03-10");
    await page.locator("#entryTime").fill("21:00");
    await page.locator("#tenancyEnding").check();
    await page.locator("#tenantInformedBeforehand").check();
    await page.getByRole("button", { name: "Check this entry" }).click();

    await expect(page.getByTestId("entry-check-verdict")).toHaveText(/may not have been permitted/i);
    await expect(page.getByTestId("entry-checks")).toContainText("9:00 p.m. was outside");
  });

  test("Ontario RTA reference links its entry section to the checker", async ({ page }) => {
    await page.goto("/ontario-rta");
    const links = page.getByTestId("rta-section-tool-link");
    await expect(links).toHaveCount(4);
    await page.getByRole("link", { name: /Try the Landlord Entry Checker/ }).click();
    await expect(page).toHaveURL(/\/landlord-entry-checker$/);
  });

  test("emergency entry needs no notice", async ({ page }) => {
    await page.goto("/landlord-entry-checker");
    await page.locator("#entryReason").selectOption("emergency");
    await expect(page.locator("#gotWrittenNotice")).toHaveCount(0);
    await page.locator("#entryDate").fill("2026-03-10");
    await page.locator("#entryTime").fill("03:00");
    await page.getByRole("button", { name: "Check this entry" }).click();

    await expect(page.getByTestId("entry-check-verdict")).toHaveText(/appears permitted/i);
    await expect(page.getByTestId("entry-checks")).toContainText("RTA s.26(1)(a)");
  });
});
