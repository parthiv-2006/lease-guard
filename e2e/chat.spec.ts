import { test, expect } from "@playwright/test";

/**
 * e2e/chat.spec.ts — "Ask Your Lease" chat panel E2E tests.
 *
 * Uses the known-good faultyLease ID which has full clause data in Supabase.
 * Tests cover:
 *   1. Chat trigger button visible on report page
 *   2. Button animates with pulse (has chatPulse animation class/style)
 *   3. Clicking opens the chat panel
 *   4. Panel shows header with "Ask Your Lease" title
 *   5. Panel shows lease filename and risk score
 *   6. Starter chips are present (3 chips)
 *   7. Input field is present and focusable
 *   8. Send button disabled when input is empty
 *   9. Send button enables when text is typed
 *  10. Close button dismisses the panel
 *  11. Chat button reappears after closing
 *  12. No console errors during open/close cycle
 */

const REPORT_LEASE_ID =
  process.env.E2E_LEASE_FAULTY ?? "54462aae-fe7a-4654-8c7a-ef83e54a2f75";

test.describe("Ask Your Lease — chat panel", () => {
  test.skip(
    !!process.env.E2E_SKIP_DB_TESTS,
    "Skipped: E2E_SKIP_DB_TESTS set (no DB credentials)"
  );

  test.beforeEach(async ({ page }) => {
    await page.goto(`/report/${REPORT_LEASE_ID}`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
  });

  test("chat trigger button is visible in bottom-right", async ({ page }) => {
    const chatBtn = page.locator("#lg-chat-trigger");
    await expect(chatBtn).toBeVisible({ timeout: 10_000 });
  });

  test("chat trigger button shows 'Ask your lease' text", async ({ page }) => {
    const chatBtn = page.locator("#lg-chat-trigger");
    await expect(chatBtn).toContainText("Ask your lease");
  });

  test("clicking trigger opens the chat panel", async ({ page }) => {
    const chatBtn = page.locator("#lg-chat-trigger");
    await chatBtn.click();

    const panel = page.locator("#lg-chat-panel");
    await expect(panel).toBeVisible({ timeout: 5_000 });
  });

  test("chat panel header contains 'Ask Your Lease'", async ({ page }) => {
    await page.locator("#lg-chat-trigger").click();
    await page.locator("#lg-chat-panel").waitFor({ state: "visible" });

    // Header title text
    const panelText = await page.locator("#lg-chat-panel").innerText();
    expect(panelText).toMatch(/Ask Your Lease/i);
  });

  test("chat panel shows 'grounded in RTA law' subtitle", async ({ page }) => {
    await page.locator("#lg-chat-trigger").click();
    await page.locator("#lg-chat-panel").waitFor({ state: "visible" });

    const panelText = await page.locator("#lg-chat-panel").innerText();
    expect(panelText).toMatch(/grounded in RTA/i);
  });

  test("panel shows 3 starter chips in empty state", async ({ page }) => {
    await page.locator("#lg-chat-trigger").click();
    await page.locator("#lg-chat-panel").waitFor({ state: "visible" });

    const chips = page.locator("[id^='lg-chat-starter-']");
    await expect(chips).toHaveCount(3, { timeout: 5_000 });
  });

  test("input field is present and accepts text", async ({ page }) => {
    await page.locator("#lg-chat-trigger").click();
    await page.locator("#lg-chat-panel").waitFor({ state: "visible" });

    const input = page.locator("#lg-chat-input");
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled();

    await input.fill("Can my landlord enter without notice?");
    await expect(input).toHaveValue("Can my landlord enter without notice?");
  });

  test("send button is disabled when input is empty", async ({ page }) => {
    await page.locator("#lg-chat-trigger").click();
    await page.locator("#lg-chat-panel").waitFor({ state: "visible" });

    const sendBtn = page.locator("#lg-chat-send");
    await expect(sendBtn).toBeDisabled();
  });

  test("send button enables when text is typed", async ({ page }) => {
    await page.locator("#lg-chat-trigger").click();
    await page.locator("#lg-chat-panel").waitFor({ state: "visible" });

    const input = page.locator("#lg-chat-input");
    const sendBtn = page.locator("#lg-chat-send");

    await input.fill("Is my deposit legal?");
    await expect(sendBtn).toBeEnabled();
  });

  test("close button dismisses the panel", async ({ page }) => {
    await page.locator("#lg-chat-trigger").click();
    await page.locator("#lg-chat-panel").waitFor({ state: "visible" });

    const closeBtn = page.locator("#lg-chat-close");
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    // Panel should no longer be visible (CSS opacity: 0 + pointer-events: none)
    await page.waitForTimeout(400); // animation settle time
    const panel = page.locator("#lg-chat-panel");
    // Panel has opacity:0 and pointer-events:none when closed — it's in DOM but not interactive
    const isPointerEventsNone = await panel.evaluate(
      (el) => getComputedStyle(el).pointerEvents === "none"
    );
    expect(isPointerEventsNone).toBe(true);
  });

  test("chat trigger button reappears after closing panel", async ({ page }) => {
    const chatBtn = page.locator("#lg-chat-trigger");
    await chatBtn.click();
    await page.locator("#lg-chat-panel").waitFor({ state: "visible" });

    // Close panel
    await page.locator("#lg-chat-close").click();
    await page.waitForTimeout(400);

    // Trigger button should be visible again
    await expect(chatBtn).toBeVisible();
  });

  test("disclaimer text is shown in the panel", async ({ page }) => {
    await page.locator("#lg-chat-trigger").click();
    await page.locator("#lg-chat-panel").waitFor({ state: "visible" });

    const panelText = await page.locator("#lg-chat-panel").innerText();
    expect(panelText).toMatch(/not legal advice|educational information/i);
  });

  test("no console errors during open/close cycle", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    // Navigate fresh
    await page.goto(`/report/${REPORT_LEASE_ID}`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });

    const chatBtn = page.locator("#lg-chat-trigger");
    await chatBtn.click();
    await page.locator("#lg-chat-panel").waitFor({ state: "visible" });
    await page.locator("#lg-chat-close").click();
    await page.waitForTimeout(400);

    const fatal = errors.filter(
      (e) =>
        !e.includes("ResizeObserver") &&
        !e.includes("Non-Error promise rejection") &&
        !e.includes("Loading chunk") &&
        !e.includes("ANTHROPIC_API_KEY") // API key warning is expected in dev
    );
    expect(fatal).toHaveLength(0);
  });
});
