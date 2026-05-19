/**
 * LeaseGuard E2E visual verification script
 * Usage: node scripts/e2e-verify.mjs [leaseId]
 *
 * Tests the full report page UI — all 8 panels, Agent Trace, Sources, etc.
 * Requires: npx playwright install chromium
 */

import { chromium } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LEASE_ID =
  process.argv[2] ?? "a4f94cb3-4a46-445e-8e70-dd1fdc4d2739";
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const SCREENSHOTS_DIR = path.join(__dirname, "..", "screenshots");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  // Create screenshots dir
  const { mkdirSync } = await import("fs");
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  let pass = 0;
  let fail = 0;

  function check(name, value, expected) {
    const ok = expected === undefined ? !!value : value === expected;
    const icon = ok ? "✅" : "❌";
    console.log(`${icon} ${name}${expected !== undefined ? ` (got: ${value})` : ` (${value})`}`);
    ok ? pass++ : fail++;
    return ok;
  }

  console.log(`\n🔍 LeaseGuard E2E — lease ${LEASE_ID}\n`);

  // ── 1. Landing page ─────────────────────────────────────────────────────
  console.log("── Landing page ──");
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "01-landing.png"), fullPage: true });
  check("Landing page title", await page.title(), "LeaseGuard — Read what you sign");
  check("Upload area visible", await page.locator("input[type=file]").count() > 0);

  // ── 2. Report page ───────────────────────────────────────────────────────
  console.log("\n── Report page ──");
  await page.goto(`${BASE_URL}/report/${LEASE_ID}`, { waitUntil: "networkidle", timeout: 30000 });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "02-report-overview.png"), fullPage: false });

  const pageText = await page.evaluate(() => document.body.innerText);
  const notFound = pageText.includes("not found") || pageText.includes("Could not load");
  check("Report loaded (no error)", !notFound);

  if (notFound) {
    console.log("\n⛔ Report page returned error — stopping early");
    await browser.close();
    return;
  }

  // ── 3. Panel tabs ────────────────────────────────────────────────────────
  console.log("\n── Panel tabs ──");
  const tabSelectors = [
    { label: "Clause Explorer", keyword: "clause" },
    { label: "Red Flags", keyword: "flag" },
    { label: "Missing Protections", keyword: "missing" },
    { label: "Contradictions", keyword: "contradiction" },
    { label: "Negotiation", keyword: "negotiat" },
    { label: "Sources", keyword: "source" },
    { label: "Agent Trace", keyword: "trace" },
  ];

  for (const { label, keyword } of tabSelectors) {
    try {
      // Find tab by text (case-insensitive partial match)
      const tab = page.locator(`button, [role="tab"]`).filter({ hasText: new RegExp(label, "i") }).first();
      const tabCount = await tab.count();
      if (tabCount === 0) {
        check(`Tab: ${label} visible`, false);
        continue;
      }
      await tab.click();
      await page.waitForTimeout(400);
      const panelText = await page.evaluate(() => document.body.innerText);
      check(`Tab: ${label} loads content`, panelText.length > 200);
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `03-tab-${keyword}.png`),
        fullPage: false,
      });
    } catch (e) {
      check(`Tab: ${label}`, false);
    }
  }

  // ── 4. Agent Trace specific ──────────────────────────────────────────────
  console.log("\n── Agent Trace detail ──");
  try {
    const traceTab = page.locator(`button, [role="tab"]`).filter({ hasText: /agent.?trace/i }).first();
    if (await traceTab.count() > 0) {
      await traceTab.click();
      await page.waitForTimeout(500);
      const traceText = await page.evaluate(() => document.body.innerText);
      check("Agent Trace shows tool names", traceText.includes("parse_document") || traceText.includes("parse"));
      check("Agent Trace shows benchmark_clause", traceText.includes("benchmark_clause") || traceText.includes("benchmark"));
      check("Agent Trace shows durations", /\d+\s*ms/.test(traceText));
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "04-agent-trace.png"), fullPage: true });
    } else {
      check("Agent Trace tab found", false);
    }
  } catch (e) {
    check("Agent Trace", false);
  }

  // ── 5. Sources full_text ─────────────────────────────────────────────────
  console.log("\n── Sources panel ──");
  try {
    const sourcesTab = page.locator(`button, [role="tab"]`).filter({ hasText: /sources/i }).first();
    if (await sourcesTab.count() > 0) {
      await sourcesTab.click();
      await page.waitForTimeout(500);
      const sourcesText = await page.evaluate(() => document.body.innerText);
      check("Sources panel has statute references", sourcesText.includes("RTA") || sourcesText.includes("s."));
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "05-sources.png"), fullPage: true });
    }
  } catch (e) {
    check("Sources panel", false);
  }

  // ── 6. Console errors ────────────────────────────────────────────────────
  console.log("\n── Console ──");
  const consoleErrors = [];
  page.on("console", msg => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  // Re-navigate to capture any runtime errors
  await page.goto(`${BASE_URL}/report/${LEASE_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  check("No JS console errors", consoleErrors.length === 0);
  if (consoleErrors.length > 0) {
    consoleErrors.slice(0, 3).forEach(e => console.log("   Error:", e.slice(0, 120)));
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${pass} passed, ${fail} failed`);
  console.log(`Screenshots saved to: screenshots/`);

  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
