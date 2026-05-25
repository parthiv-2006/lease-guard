/**
 * LeaseGuard RAG Grounding Drawer Visual Verification Script
 * Usage: node scripts/verify-rag-drawer.mjs [leaseId]
 */

import { chromium } from "@playwright/test";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = fs.realpathSync(fileURLToPath(new URL(".", import.meta.url)));

const LEASE_ID = process.argv[2] ?? "54462aae-fe7a-4654-8c7a-ef83e54a2f75";
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const ASSETS_DIR = fs.realpathSync(fs.mkdirSync(path.join(__dirname, "..", ".github", "assets"), { recursive: true }) || path.join(__dirname, "..", ".github", "assets"));

async function main() {
  console.log(`\n🔍 Verifying RAG Grounding Drawer for lease/report: ${LEASE_ID}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Navigate to report page
  console.log(`Navigating to ${BASE_URL}/report/${LEASE_ID}...`);
  await page.goto(`${BASE_URL}/report/${LEASE_ID}`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  // Take screenshot of general report view
  await page.screenshot({ path: path.join(ASSETS_DIR, "01-report-general.png") });
  console.log("Saved general report view screenshot.");

  // Toggle split view PDF
  console.log("Clicking 'View PDF' button to open split view...");
  const viewPdfBtn = page.locator("button").filter({ hasText: /View PDF/i }).first();
  await viewPdfBtn.click();
  await page.waitForTimeout(1000);

  // Take screenshot of split screen with drawer closed
  await page.screenshot({ path: path.join(ASSETS_DIR, "02-split-view-closed-drawer.png") });
  console.log("Saved split view (drawer closed) screenshot.");

  // Navigate to Clause Explorer tab
  console.log("Opening Clause Explorer tab...");
  const clauseTab = page.locator(`button, [role="tab"]`).filter({ hasText: /Clause Explorer/i }).first();
  await clauseTab.click();
  await page.waitForTimeout(500);

  // Click on "Security and Damage Deposit" clause or "Late Fees" clause card to trigger activation
  console.log("Clicking on 'Security and Damage Deposit' clause card...");
  // Each card is marked by text
  const depositCard = page.locator("button").filter({ hasText: /Security and Damage Deposit/i }).first();
  if (await depositCard.count() > 0) {
    await depositCard.click();
  } else {
    // Fallback: click first card header in clause list
    const firstCard = page.locator("button").filter({ hasText: /Clause/i }).first();
    await firstCard.click();
  }
  await page.waitForTimeout(1500);

  // Take screenshot of open drawer
  await page.screenshot({ path: path.join(ASSETS_DIR, "03-split-view-open-drawer.png") });
  console.log("Saved split view with RAG Grounding Drawer open screenshot.");

  // Check if Grounding Evidence text is visible
  const drawerHeader = page.locator("h3").filter({ hasText: /Grounding Evidence/i });
  const isHeaderVisible = await drawerHeader.isVisible();
  console.log(isHeaderVisible ? "✅ RAG Grounding Drawer Header is visible!" : "❌ RAG Grounding Drawer Header NOT visible!");

  // Check if RTA Statute badge is visible inside the drawer
  const statuteBadge = page.locator("span").filter({ hasText: /RTA Statute/i }).first();
  const isBadgeVisible = await statuteBadge.isVisible();
  console.log(isBadgeVisible ? "✅ RTA Statute badge is visible in drawer!" : "❌ RTA Statute badge NOT visible in drawer!");

  // Click on the Close button inside the drawer
  console.log("Clicking the close button in the RAG Grounding Drawer...");
  const closeBtn = page.locator("button").filter({ hasText: "✕" }).first();
  await closeBtn.click();
  await page.waitForTimeout(1000);

  // Take screenshot after closing drawer
  await page.screenshot({ path: path.join(ASSETS_DIR, "04-split-view-after-closing-drawer.png") });
  console.log("Saved screenshot after closing drawer.");

  await browser.close();
  console.log("\n✨ Visual verification completed successfully!\n");
}

main().catch(err => {
  console.error("Visual verification failed:", err);
  process.exit(1);
});
