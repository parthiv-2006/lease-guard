import { test, expect, type Page } from "@playwright/test";
import { LETTER_CATALOG } from "../lib/tenant-letters/catalog";

/**
 * e2e/tenant-letters.spec.ts — Tenant letter generation from each checker.
 *
 * Verifies that:
 * - the /letters hub lists every letter and links to their checkers
 * - each checker offers a letter under a result that warrants one, and the
 *   preview fills in the party details and cites the RTA
 * - a compliant rent increase does not offer a dispute letter
 * - no letter ever uses the word "illegal"
 */

async function fillParties(page: Page) {
  await page.getByRole("button", { name: "Write a letter to my landlord" }).click();
  await page.locator("#letterTenantName").fill("Sam Lee");
  await page.locator("#letterLandlordName").fill("Acme Rentals");
  await page.locator("#letterRentalAddress").fill("12 King St, Unit 4, Toronto");
}

async function expectCompleteLetter(page: Page) {
  const preview = page.getByTestId("letter-preview");
  await expect(preview).toContainText("Dear Acme Rentals,");
  await expect(preview).toContainText("Rental unit: 12 King St, Unit 4, Toronto");
  await expect(preview).toContainText("Sam Lee");
  await expect(page.getByTestId("letter-placeholder-warning")).toHaveCount(0);
  await expect(preview).not.toContainText(/illegal/i);
  return preview;
}

test.describe("Tenant letters", () => {
  test("hub lists every letter and links to its checker", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const response = await page.goto("/letters");
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveText("Put it in writing.");
    const cards = page.getByTestId("tenant-letter-card");
    await expect(cards).toHaveCount(LETTER_CATALOG.length);
    await expect(cards.first()).toHaveAttribute("href", "/maintenance-repairs-checker");

    expect(errors).toHaveLength(0);
  });

  test("tools hub links to the letters hub", async ({ page }) => {
    await page.goto("/tools");
    await page.getByTestId("tools-letters-cta").getByRole("link", { name: "See tenant letters" }).click();
    await expect(page).toHaveURL(/\/letters$/);
  });

  test("repair checker writes a repair request", async ({ page }) => {
    await page.goto("/maintenance-repairs-checker");
    await page.locator("#issueType").selectOption("no_heat");
    await page.locator("#measuredTempC").fill("16");
    await page.locator("#asOfDate").fill("2026-01-12");
    await page.getByRole("button", { name: "Check my repair" }).click();
    await expect(page.getByTestId("repair-check-result")).toBeVisible();

    await fillParties(page);
    await page.locator("#letterProblemDescription").fill("The radiators have been cold since January 3.");
    const preview = await expectCompleteLetter(page);
    await expect(preview).toContainText("Re: Request for repair — No heat or not enough heat");
    await expect(preview).toContainText("The radiators have been cold since January 3.");
    await expect(preview).toContainText("unless the tenant controls the heat");
    await expect(preview).toContainText("RTA s.21(1)");
  });

  test("placeholder warning shows until party details are filled in", async ({ page }) => {
    await page.goto("/maintenance-repairs-checker");
    await page.locator("#issueType").selectOption("pests");
    await page.getByRole("button", { name: "Check my repair" }).click();
    await page.getByRole("button", { name: "Write a letter to my landlord" }).click();

    await expect(page.getByTestId("letter-placeholder-warning")).toBeVisible();
    await expect(page.getByTestId("letter-preview")).toContainText("Dear [Landlord's name],");
  });

  test("rent increase checker writes a dispute letter for a non-compliant increase", async ({ page }) => {
    await page.goto("/rent-increase-checker");
    await page.getByLabel("Current monthly rent ($)").fill("2000");
    await page.getByLabel("Proposed new rent ($)").fill("2200");
    await page.getByLabel("Date notice was given").fill("2026-08-15");
    await page.getByLabel("Effective date of new rent").fill("2026-10-01");
    await page.getByLabel("Date of last increase (or move-in date)").fill("2025-09-01");
    await page.getByRole("button", { name: "Check compliance" }).click();
    await expect(page.getByTestId("rent-increase-result")).toBeVisible();

    await fillParties(page);
    const preview = await expectCompleteLetter(page);
    await expect(preview).toContainText("from $2,000.00 to $2,200.00");
    await expect(preview).toContainText("90-day written notice:");
    await expect(preview).toContainText("may not be enforceable as proposed");
  });

  test("compliant rent increase offers no dispute letter", async ({ page }) => {
    await page.goto("/rent-increase-checker");
    await page.getByLabel("Current monthly rent ($)").fill("2000");
    await page.getByLabel("Proposed new rent ($)").fill("2020");
    await page.getByLabel("Date notice was given").fill("2026-06-01");
    await page.getByLabel("Effective date of new rent").fill("2026-10-01");
    await page.getByLabel("Date of last increase (or move-in date)").fill("2025-09-01");
    await page.getByRole("button", { name: "Check compliance" }).click();
    await expect(page.getByTestId("rent-increase-result")).toBeVisible();

    await expect(page.getByTestId("letter-builder")).toHaveCount(0);
  });

  test("deposit checker writes an interest demand including ticked fees", async ({ page }) => {
    await page.goto("/deposit-fees-checker");
    await page.getByLabel(/deposit amount/i).fill("2000");
    await page.getByLabel(/monthly rent/i).fill("2000");
    await page.getByLabel(/date.*paid/i).fill("2024-01-01");
    await page.getByLabel(/as of/i).fill("2026-01-01");
    await page.getByRole("button", { name: /calculate|check/i }).first().click();
    await expect(page.getByTestId("deposit-interest-result")).toBeVisible();

    await page.getByText("Pet deposit or pet fee").click();
    await fillParties(page);
    const preview = await expectCompleteLetter(page);
    await expect(preview).toContainText("Re: Interest owing on my last month's rent deposit");
    await expect(preview).toContainText("Pet deposit or pet fee (RTA s.105(1), s.14)");
    await expect(preview).toContainText("section 106(9)");
  });

  test("eviction checker writes a response to a short N4", async ({ page }) => {
    await page.goto("/eviction-notice-checker");
    await page.getByLabel(/date.*notice.*given|notice.*date/i).first().fill("2026-09-10");
    await page.getByLabel(/termination date/i).fill("2026-09-17");
    await page.getByRole("button", { name: /check/i }).last().click();
    await expect(page.getByTestId("eviction-notice-result")).toBeVisible();

    await fillParties(page);
    const preview = await expectCompleteLetter(page);
    await expect(preview).toContainText("Form N4 (non-payment of rent)");
    await expect(preview).toContainText("section 39 of the Act");
  });

  test("entry checker writes an objection to an entry without notice", async ({ page }) => {
    await page.goto("/landlord-entry-checker");
    await page.locator("#entryReason").selectOption("repairs_or_work");
    await page.locator("#entryDate").fill("2026-09-20");
    await page.locator("#entryTime").fill("21:15");
    await page.getByRole("button", { name: "Check this entry" }).click();
    await expect(page.getByTestId("entry-check-result")).toBeVisible();

    await fillParties(page);
    const preview = await expectCompleteLetter(page);
    await expect(preview).toContainText("Re: Entry into my unit on September 20, 2026");
    await expect(preview).toContainText("on September 20, 2026 at 9:15 p.m.");
    await expect(preview).toContainText("24 hours' written notice: No written notice was given.");
    await expect(preview).toContainText("RTA s.29(1), (2)");
  });
});
