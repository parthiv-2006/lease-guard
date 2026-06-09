/**
 * e2e/demo-record.spec.ts — LeaseGuard demo video recording script
 *
 * Run with:
 *   npx playwright test e2e/demo-record.spec.ts --video=on --headed --timeout=180000
 *
 * Output: test-results/<folder>/video.webm (~64s golden path)
 *
 * Shot sequence:
 *   [0:00] Landing — live stats bar counts up
 *   [0:05] Example findings card visible
 *   [0:09] Upload zone hover
 *   [0:12] Cut to pre-analysed report (skip 90s analysis wait)
 *   [0:17] Overview panel — risk gauge + stat cards
 *   [0:22] Red Flags — expand first clause, show statute citation
 *   [0:28] Negotiation Guide — open copilot, pick Assertive, generate
 *   [0:38] Agent Trace — replay animation, then drill-down drawer
 *   [0:50] Share modal — OG preview card
 *   [0:55] Ask Your Lease chat — ask + streamed answer
 *   [1:04] End
 */

import { test, expect } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DEMO_REPORT = `${BASE}/report/ebf8bf97-563d-4b7d-859f-8ecf76905335`;

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(180_000);

test("demo recording — golden path", async ({ page }) => {
  // ── [0:00] Landing page ──────────────────────────────────────────────────────
  await page.goto(BASE, { waitUntil: "networkidle" });

  // Let the stats bar fetch resolve and count up visibly
  await page.waitForTimeout(3000);

  // ── [0:05] Scroll to example findings card ───────────────────────────────────
  await page.evaluate(() => window.scrollBy({ top: 320, behavior: "smooth" }));
  await page.waitForTimeout(2000);

  // ── [0:09] Hover over upload zone ────────────────────────────────────────────
  const uploadZone = page.locator("text=Drop your lease PDF here").first();
  const uploadVisible = await uploadZone.isVisible().catch(() => false);
  if (uploadVisible) {
    await uploadZone.hover();
    await page.waitForTimeout(1500);
  } else {
    await page.waitForTimeout(1500);
  }

  // ── [0:12] Cut to pre-analysed report ────────────────────────────────────────
  // Skip the live upload + 90s analysis wait — navigate directly
  await page.goto(DEMO_REPORT, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  // ── [0:17] Overview panel ────────────────────────────────────────────────────
  // Risk gauge (9.5 Critical) and stat cards are visible by default
  // Use .nth(1) to target the visible span, not the page title
  await page.locator("span").filter({ hasText: /^9\.5$/ }).first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // ── [0:22] Red Flags tab ─────────────────────────────────────────────────────
  await page.getByRole("button", { name: /Red Flags/ }).click();
  await page.waitForTimeout(1000);

  // Expand the first clause card (already defaultOpen=true for index 0, but click to ensure)
  const firstFlag = page.locator("[data-clause-card], button").filter({ hasText: /10\.0|Critical/ }).first();
  const firstFlagVisible = await firstFlag.isVisible().catch(() => false);
  if (firstFlagVisible) {
    await firstFlag.click();
  }
  await page.waitForTimeout(2500);

  // ── [0:28] Negotiation Guide tab ─────────────────────────────────────────────
  await page.getByRole("button", { name: /Negotiation Guide/ }).click();
  await page.waitForTimeout(1500);

  // Open the copilot
  const copilotBtn = page.getByRole("button", { name: "Open Negotiation Copilot" });
  await copilotBtn.waitFor({ state: "visible", timeout: 8_000 }).catch(() => {});
  await copilotBtn.click().catch(() => {});
  await page.waitForTimeout(1000);

  // Select Assertive tone
  const assertiveBtn = page.getByText("Assertive").first();
  const assertiveVisible = await assertiveBtn.isVisible().catch(() => false);
  if (assertiveVisible) {
    await assertiveBtn.click();
    await page.waitForTimeout(500);
  }

  // Generate the proposal
  const generateBtn = page.getByRole("button", { name: /Generate Proposal/ });
  const generateVisible = await generateBtn.isVisible().catch(() => false);
  if (generateVisible) {
    await generateBtn.click();
    // Wait for Groq to stream — up to 6s
    await page.waitForTimeout(5500);
  } else {
    await page.waitForTimeout(4000);
  }

  // Close copilot modal — click the backdrop (top-left corner outside modal)
  await page.mouse.click(30, 30);
  await page.waitForTimeout(800);
  // If backdrop click didn't work, try clicking the X icon button
  const stillOpen = await page.getByRole("button", { name: "Open Negotiation Copilot" }).isVisible().catch(() => false);
  if (!stillOpen) {
    // Modal closed — good
  } else {
    // Try clicking any visible close/X button
    await page.locator("button").filter({ has: page.locator("svg") }).last().click().catch(() => {});
    await page.waitForTimeout(500);
  }
  // Ensure modal is fully gone before proceeding
  await page.waitForTimeout(800);

  // ── [0:38] Agent Trace tab ───────────────────────────────────────────────────
  await page.getByRole("button", { name: "Agent Trace" }).click({ force: true });
  await page.waitForTimeout(1500);

  // Hit replay
  const replayBtn = page.getByRole("button", { name: /Watch the agent work/ });
  await replayBtn.waitFor({ state: "visible", timeout: 8_000 }).catch(() => {});
  await replayBtn.click().catch(() => {});

  // Let animation play for 5s (shows tool calls firing)
  await page.waitForTimeout(5000);

  // Click a lookup_statute RAG bar to open drill-down
  const ragBar = page.locator("[title*='lookup_statute']").first();
  const ragVisible = await ragBar.isVisible().catch(() => false);
  if (ragVisible) {
    await ragBar.click();
    await page.waitForTimeout(2500);
    // Close drill-down by clicking outside
    await page.mouse.click(200, 400);
    await page.waitForTimeout(500);
  } else {
    await page.waitForTimeout(2000);
  }

  // ── [0:50] Share modal ───────────────────────────────────────────────────────
  const shareBtn = page.getByRole("button", { name: "Share Report" });
  await shareBtn.waitFor({ state: "visible", timeout: 8_000 }).catch(() => {});
  await shareBtn.click().catch(() => {});

  // Wait for OG card image to load
  await page.waitForTimeout(2500);

  // Close share modal — click its × button (first button inside the modal)
  await page.mouse.click(30, 30);
  await page.waitForTimeout(600);
  // If backdrop click didn't close it, try the X button inside the modal
  const modalClose = page.locator("button").filter({ has: page.locator("img") }).last();
  await modalClose.click({ force: true }).catch(() => {});
  await page.waitForTimeout(800);

  // ── [0:55] Ask Your Lease chat ───────────────────────────────────────────────
  const chatBubble = page.getByRole("button", { name: /Ask your lease/i });
  await chatBubble.waitFor({ state: "visible", timeout: 8_000 }).catch(() => {});
  await chatBubble.click({ force: true }).catch(() => {});
  await page.waitForTimeout(1000);

  // Type the question
  const chatInput = page.getByPlaceholder("Ask about your lease…");
  await chatInput.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
  await chatInput.click({ force: true });
  await chatInput.fill("Is this late fee legal?").catch(() =>
    chatInput.type("Is this late fee legal?", { delay: 40 }).catch(() => {})
  );
  await page.waitForTimeout(500);

  // Send
  await page.keyboard.press("Enter");

  // Wait for Groq to stream the answer — up to 7s
  await page.waitForTimeout(7000);

  // ── [1:04] End — hold on the final answer ────────────────────────────────────
  await page.waitForTimeout(2000);
});
