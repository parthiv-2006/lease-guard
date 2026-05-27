// One-off script to capture README screenshots from the running dev server.
// Run: node scripts/capture-screenshots.mjs
import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../.github/assets');
const BASE = 'http://localhost:3000';
const REPORT = `${BASE}/report/ebf8bf97-563d-4b7d-859f-8ecf76905335`;

async function shot(page, name, fullPage = false) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage });
  console.log('saved', name);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// ── 1. Landing page ─────────────────────────────────────────────────────────
await page.goto(BASE, { waitUntil: 'networkidle' });
await shot(page, 'landing.png', true);

// ── 2. Dashboard ─────────────────────────────────────────────────────────────
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await shot(page, 'dashboard.png', true);

// ── Report: navigate once and reuse ──────────────────────────────────────────
await page.goto(REPORT, { waitUntil: 'networkidle' });
await page.waitForSelector('text=OVERALL RISK', { timeout: 10000 });
await page.waitForTimeout(600);

// ── 3. Report — Overview ─────────────────────────────────────────────────────
await shot(page, 'report-overview.png');

// ── 4. Red Flags ─────────────────────────────────────────────────────────────
await page.click('a:has-text("Red Flags"), button:has-text("Red Flags"), [role="link"]:has-text("Red Flags")');
await page.waitForTimeout(500);
await shot(page, 'report-red-flags.png');

// ── 5. Clause Explorer ───────────────────────────────────────────────────────
await page.click('a:has-text("Clause Explorer"), button:has-text("Clause Explorer"), [role="link"]:has-text("Clause Explorer")');
await page.waitForTimeout(500);
await shot(page, 'report-clause-explorer.png');

// ── 6. Negotiation Guide ─────────────────────────────────────────────────────
await page.click('a:has-text("Negotiation Guide"), button:has-text("Negotiation Guide"), [role="link"]:has-text("Negotiation Guide")');
await page.waitForTimeout(500);
await shot(page, 'report-negotiation.png');

// ── 7. Negotiation Copilot modal ─────────────────────────────────────────────
try {
  const copilotBtn = page.locator('button:has-text("Generate Proposal"), button:has-text("Copilot"), button:has-text("AI Draft")').first();
  if (await copilotBtn.isVisible({ timeout: 3000 })) {
    await copilotBtn.click();
    await page.waitForTimeout(800);
    await shot(page, 'report-negotiation-copilot.png');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
} catch {}

// ── 8. Missing Protections — reload to clear any modal overlay ───────────────
await page.goto(REPORT, { waitUntil: 'networkidle' });
await page.waitForSelector('text=OVERALL RISK', { timeout: 10000 });
await page.waitForTimeout(600);
await page.click('a:has-text("Missing Protections"), button:has-text("Missing Protections"), [role="link"]:has-text("Missing Protections")');
await page.waitForTimeout(500);
await shot(page, 'report-missing-protections.png');

// ── 9. Contradictions ────────────────────────────────────────────────────────
await page.goto(REPORT, { waitUntil: 'networkidle' });
await page.waitForSelector('text=OVERALL RISK', { timeout: 10000 });
await page.waitForTimeout(500);
await page.click('a:has-text("Contradictions"), button:has-text("Contradictions"), [role="link"]:has-text("Contradictions")');
await page.waitForTimeout(500);
await shot(page, 'report-contradictions.png');

// ── 10. Sources ───────────────────────────────────────────────────────────────
await page.goto(REPORT, { waitUntil: 'networkidle' });
await page.waitForSelector('text=OVERALL RISK', { timeout: 10000 });
await page.waitForTimeout(500);
await page.click('a:has-text("Sources"), button:has-text("Sources"), [role="link"]:has-text("Sources")');
await page.waitForTimeout(500);
await shot(page, 'report-sources.png');

// ── 11. Agent Trace ───────────────────────────────────────────────────────────
await page.goto(REPORT, { waitUntil: 'networkidle' });
await page.waitForSelector('text=OVERALL RISK', { timeout: 10000 });
await page.waitForTimeout(500);
await page.click('a:has-text("Agent Trace"), button:has-text("Agent Trace"), [role="link"]:has-text("Agent Trace")');
await page.waitForTimeout(800);
await shot(page, 'report-agent-trace.png');

// ── 12. PDF Viewer (click View PDF button) ────────────────────────────────────
await page.goto(REPORT, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
try {
  const pdfBtn = page.locator('button:has-text("View PDF"), a:has-text("View PDF")').first();
  if (await pdfBtn.isVisible({ timeout: 3000 })) {
    await pdfBtn.click();
    await page.waitForTimeout(1500);
    await shot(page, 'report-pdf-viewer.png');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
} catch {}

// ── 13. Ask Your Lease chat ───────────────────────────────────────────────────
await page.goto(REPORT, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
try {
  const chatBtn = page.locator('button:has-text("Ask your lease"), button:has-text("Ask Your Lease"), [aria-label*="chat"], [aria-label*="Chat"]').first();
  if (await chatBtn.isVisible({ timeout: 3000 })) {
    await chatBtn.click();
    await page.waitForTimeout(800);
    await shot(page, 'report-chat.png');
  }
} catch {}

// ── 14. Mobile — landing ─────────────────────────────────────────────────────
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mPage = await mobile.newPage();
await mPage.goto(BASE, { waitUntil: 'networkidle' });
await mPage.screenshot({ path: path.join(OUT, 'landing-mobile.png'), fullPage: true });
console.log('saved landing-mobile.png');
await mobile.close();

await browser.close();
console.log('\nAll screenshots saved to .github/assets/');
