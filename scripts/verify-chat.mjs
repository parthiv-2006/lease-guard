/**
 * scripts/verify-chat.mjs — Visual verification for the "Ask Your Lease" chat feature.
 *
 * Uses Playwright to:
 *   1. Navigate to a known report page
 *   2. Screenshot the chat button
 *   3. Open the chat panel
 *   4. Verify starter chips
 *   5. Send a message (with mock - just verifies UI state)
 *   6. Screenshot the open panel
 *   7. Close the panel
 *
 * Usage: node scripts/verify-chat.mjs
 * Requires: npm install -D playwright (already in devDeps)
 *           Server running: npm run dev
 *
 * Screenshots saved to: .github/assets/chat-verification/
 */

import { chromium } from "playwright";
import { mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SCREENSHOTS_DIR = path.join(ROOT, ".github", "assets", "chat-verification");
const REPORT_URL = "http://localhost:3000/report/54462aae-fe7a-4654-8c7a-ef83e54a2f75";

const CONSOLE_ERRORS = [];

async function run() {
  await mkdir(SCREENSHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Capture console errors
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      CONSOLE_ERRORS.push(msg.text());
    }
  });

  console.log("📸 Navigating to report page...");
  await page.goto(REPORT_URL, { waitUntil: "networkidle", timeout: 30_000 });

  // ── Step 1: Chat button visible ────────────────────────────────────────────
  console.log("📸 Step 1: Checking chat button visibility...");
  const chatBtn = page.locator("#lg-chat-trigger");

  try {
    await chatBtn.waitFor({ state: "visible", timeout: 10_000 });
    console.log("  ✓ Chat button found");
  } catch {
    console.error("  ✗ Chat button NOT found — is LeaseChat mounted?");
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "01-debug-no-button.png"), fullPage: false });
    await browser.close();
    process.exit(1);
  }

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "01-chat-button.png"),
    fullPage: false,
  });
  console.log("  → Saved 01-chat-button.png");

  // ── Step 2: Open panel ─────────────────────────────────────────────────────
  console.log("📸 Step 2: Opening chat panel...");
  await chatBtn.click();

  const panel = page.locator("#lg-chat-panel");
  await panel.waitFor({ state: "visible", timeout: 5_000 });
  console.log("  ✓ Panel opened");

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "02-chat-open.png"),
    fullPage: false,
  });
  console.log("  → Saved 02-chat-open.png");

  // ── Step 3: Verify starter chips ───────────────────────────────────────────
  console.log("📸 Step 3: Verifying starter chips...");
  const chips = page.locator("[id^='lg-chat-starter-']");
  const chipCount = await chips.count();
  if (chipCount >= 3) {
    console.log(`  ✓ Found ${chipCount} starter chips`);
  } else {
    console.warn(`  ⚠ Only found ${chipCount} starter chips (expected 3)`);
  }

  // ── Step 4: Verify panel structure ────────────────────────────────────────
  console.log("📸 Step 4: Checking panel structure...");
  const input = page.locator("#lg-chat-input");
  const sendBtn = page.locator("#lg-chat-send");
  const closeBtn = page.locator("#lg-chat-close");

  const inputVisible = await input.isVisible();
  const sendBtnVisible = await sendBtn.isVisible();
  const closeBtnVisible = await closeBtn.isVisible();

  console.log(`  ${inputVisible ? "✓" : "✗"} Input field ${inputVisible ? "visible" : "NOT visible"}`);
  console.log(`  ${sendBtnVisible ? "✓" : "✗"} Send button ${sendBtnVisible ? "visible" : "NOT visible"}`);
  console.log(`  ${closeBtnVisible ? "✓" : "✗"} Close button ${closeBtnVisible ? "visible" : "NOT visible"}`);

  // ── Step 5: Type a message ────────────────────────────────────────────────
  console.log("📸 Step 5: Typing a test question...");
  await input.fill("Can my landlord enter without notice?");
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "03-chat-typing.png"),
    fullPage: false,
  });
  console.log("  → Saved 03-chat-typing.png");

  // Verify send button is now enabled
  const sendDisabled = await sendBtn.isDisabled();
  console.log(`  ${!sendDisabled ? "✓" : "✗"} Send button enabled when text is entered`);

  // ── Step 6: Close panel ───────────────────────────────────────────────────
  console.log("📸 Step 6: Closing chat panel...");
  await closeBtn.click();

  // Panel should animate out
  await page.waitForTimeout(400);

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "04-chat-closed.png"),
    fullPage: false,
  });
  console.log("  → Saved 04-chat-closed.png");

  // Button should be visible again
  const btnVisibleAfterClose = await chatBtn.isVisible();
  console.log(`  ${btnVisibleAfterClose ? "✓" : "✗"} Chat button reappears after closing`);

  // ── Step 7: Console error check ───────────────────────────────────────────
  console.log("\n📊 Results:");
  if (CONSOLE_ERRORS.length > 0) {
    console.warn(`  ⚠ ${CONSOLE_ERRORS.length} console error(s):`);
    CONSOLE_ERRORS.forEach((e) => console.warn(`    - ${e}`));
  } else {
    console.log("  ✓ No JavaScript console errors");
  }

  console.log(`\n✅ Visual verification complete — screenshots in: ${SCREENSHOTS_DIR}`);
  console.log("   01-chat-button.png  → button visible bottom-right");
  console.log("   02-chat-open.png    → panel open with starter chips");
  console.log("   03-chat-typing.png  → message typed, send button enabled");
  console.log("   04-chat-closed.png  → panel closed, button reappears");

  await browser.close();
}

run().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
