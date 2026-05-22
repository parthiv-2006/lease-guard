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

// 1. Landing page
await page.goto(BASE, { waitUntil: 'networkidle' });
await shot(page, 'landing.png', true);

// 2. How it works
await page.goto(`${BASE}/how-it-works`, { waitUntil: 'networkidle' });
await shot(page, 'how-it-works.png', true);

// 3. Report — Overview
await page.goto(REPORT, { waitUntil: 'networkidle' });
await page.waitForSelector('text=OVERALL RISK', { timeout: 10000 });
await shot(page, 'report-overview.png');

// 4. Red Flags panel
await page.click('button:has-text("Red Flags")');
await page.waitForTimeout(400);
await shot(page, 'report-red-flags.png');

// 5. Clause Explorer
await page.click('button:has-text("Clause Explorer")');
await page.waitForTimeout(400);
await shot(page, 'report-clause-explorer.png');

// 6. Negotiation Guide
await page.click('button:has-text("Negotiation Guide")');
await page.waitForTimeout(400);
await shot(page, 'report-negotiation.png');

// 7. Agent Trace
await page.click('button:has-text("Agent Trace")');
await page.waitForTimeout(600);
await shot(page, 'report-agent-trace.png');

// 8. Mobile — landing
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(BASE, { waitUntil: 'networkidle' });
await shot(page, 'landing-mobile.png', true);

await browser.close();
console.log('All screenshots saved to .github/assets/');
