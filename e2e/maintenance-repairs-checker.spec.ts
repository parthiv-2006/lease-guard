import { test, expect } from "@playwright/test";

/**
 * e2e/maintenance-repairs-checker.spec.ts — Maintenance & Repairs Checker flow.
 *
 * Verifies that:
 * - the page renders with every issue type in the dropdown
 * - an unreported problem tells the tenant to report it in writing
 * - an overdue heat problem below 20 °C in heat season flags the minimum and
 *   points at a T2 application
 * - a stale standard repair points at a T6 application
 */

test.describe("Maintenance & Repairs Checker", () => {
  test("renders the form with every issue type", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const response = await page.goto("/maintenance-repairs-checker");
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveText("Is your landlord keeping up with repairs?");
    await expect(page.locator("#issueType option")).toHaveCount(9);

    expect(errors).toHaveLength(0);
  });

  test("unreported problem tells the tenant to report in writing", async ({ page }) => {
    await page.goto("/maintenance-repairs-checker");
    await page.locator("#issueType").selectOption("pests");
    await page.getByRole("button", { name: "Check my repair" }).click();

    const result = page.getByTestId("repair-check-result");
    await expect(result).toBeVisible();
    await expect(page.getByTestId("repair-check-status")).toHaveText(/not yet reported/i);
    await expect(result).toContainText("O. Reg. 517/06 s.46");
    await expect(page.getByTestId("repair-next-steps")).toContainText("in writing");
  });

  test("overdue cold unit flags the 20 °C minimum and a T2 application", async ({ page }) => {
    await page.goto("/maintenance-repairs-checker");
    await page.locator("#issueType").selectOption("no_heat");
    await page.locator("#measuredTempC").fill("16");
    await page.locator("#alreadyReported").check();
    await page.locator("#reportedDate").fill("2026-01-05");
    await page.locator("#reportedInWriting").check();
    await page.locator("#asOfDate").fill("2026-01-12");
    await page.getByRole("button", { name: "Check my repair" }).click();

    const result = page.getByTestId("repair-check-result");
    await expect(page.getByTestId("repair-check-status")).toHaveText(/time to escalate/i);
    await expect(result).toContainText("below the 20 °C minimum");
    await expect(page.getByTestId("repair-next-steps")).toContainText("Form T2");
    await expect(result).not.toContainText(/illegal/i);
  });

  test("stale standard repair points at a T6 application", async ({ page }) => {
    await page.goto("/maintenance-repairs-checker");
    await page.locator("#issueType").selectOption("mould_leak");
    await page.locator("#alreadyReported").check();
    await page.locator("#reportedDate").fill("2026-03-01");
    await page.locator("#asOfDate").fill("2026-04-01");
    await page.getByRole("button", { name: "Check my repair" }).click();

    await expect(page.getByTestId("repair-check-status")).toHaveText(/time to escalate/i);
    const steps = page.getByTestId("repair-next-steps");
    await expect(steps).toContainText("Form T6");
    await expect(steps).toContainText("Follow up in writing");
  });
});
