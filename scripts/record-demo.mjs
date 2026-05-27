/**
 * Automated demo video recorder for LeaseGuard.
 *
 * Records a full user-flow walkthrough using Playwright's built-in video
 * capture and saves it as demo.webm in .github/assets/.
 *
 * Prerequisites:
 *   - Dev server running on http://localhost:3000  (npm run dev)
 *   - Playwright + Chromium installed (@playwright/test in devDeps)
 *
 * Usage:
 *   node scripts/record-demo.mjs
 *
 * Output:
 *   .github/assets/demo.webm
 *
 * To convert to MP4 for GitHub README embedding (requires ffmpeg):
 *   ffmpeg -i .github/assets/demo.webm -c:v libx264 -crf 22 -preset slow \
 *          -c:a aac -movflags +faststart .github/assets/demo.mp4
 */

import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, '../.github/assets');
const PDF_PATH   = path.join(__dirname, 'source-docs/ontario_standard_lease.pdf');
const BASE_URL   = 'http://localhost:3000';
// Navigate to this completed report rather than waiting 90s for analysis.
const KNOWN_REPORT_URL = `${BASE_URL}/report/ebf8bf97-563d-4b7d-859f-8ecf76905335`;

const W = 1440;
const H = 900;

// ── Helpers ──────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function smoothScroll(page, targetY, steps = 20, delayMs = 30) {
  const start = await page.evaluate(() => window.scrollY);
  const delta = targetY - start;
  for (let i = 1; i <= steps; i++) {
    await page.evaluate(
      ({ s, d, i, n }) => window.scrollTo(0, s + (d * i) / n),
      { s: start, d: delta, i, n: steps }
    );
    await sleep(delayMs);
  }
}

/** Dismiss any open overlay then click a sidebar nav button by label. */
async function clickPanel(page, label) {
  // Close any open modal
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(200);
  await page.mouse.click(W / 2, H / 2).catch(() => {}); // click backdrop if present
  await sleep(200);
  // Reset scroll so sticky headers don't intercept
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(150);
  await page.locator(`button:has-text("${label}")`).first().click({ force: true });
  await sleep(700);
}

/** Run a scene, log it, swallow errors so later scenes still run. */
async function scene(name, fn) {
  console.log(`  ${name}…`);
  try { await fn(); }
  catch (e) { console.warn(`    ⚠ ${name} failed: ${e.message?.slice(0, 120)}`); }
}

// ── Guards ───────────────────────────────────────────────────────────────────

if (!fs.existsSync(PDF_PATH)) {
  console.error('ERROR: ontario_standard_lease.pdf not found at', PDF_PATH);
  process.exit(1);
}

console.log('Starting LeaseGuard demo recording…');
console.log(`  PDF:    ${PDF_PATH}`);
console.log(`  Output: ${path.join(ASSETS_DIR, 'demo.webm')}\n`);

// ── Browser setup ─────────────────────────────────────────────────────────────

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const context = await browser.newContext({
  viewport:    { width: W, height: H },
  recordVideo: { dir: ASSETS_DIR, size: { width: W, height: H } },
});

const page = await context.newPage();

// ── Scenes — all wrapped in try/finally so video always saves ────────────────

try {

  await scene('1 – Landing page', async () => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await sleep(1500);
    await smoothScroll(page, 220, 30, 25);
    await sleep(1000);
    await smoothScroll(page, 0, 20, 25);
    await sleep(800);
    // Hover the upload zone
    await page.hover('input[type="file"]').catch(() =>
      page.hover('text=Drop').catch(() => {})
    );
    await sleep(1200);
  });

  await scene('2 – Upload lease PDF', async () => {
    const input = page.locator('input[type="file"]').first();
    await input.setInputFiles(PDF_PATH);
    await sleep(3500); // wait for 202 + redirect to job page
  });

  await scene('3 – Processing animation', async () => {
    // Show the animated processing screen for a few seconds
    await sleep(5000);
  });

  await scene('4 – Navigate to completed report', async () => {
    await page.goto(KNOWN_REPORT_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=OVERALL RISK', { timeout: 12000 }).catch(() => {});
    await sleep(1800);
  });

  await scene('5 – Overview panel', async () => {
    await smoothScroll(page, 200, 20, 30);
    await sleep(900);
    await smoothScroll(page, 450, 20, 30);
    await sleep(1200);
    await smoothScroll(page, 0, 20, 25);
    await sleep(700);
  });

  await scene('6 – Red Flags', async () => {
    await clickPanel(page, 'Red Flags');
    await smoothScroll(page, 320, 20, 30);
    await sleep(1400);
    await smoothScroll(page, 0, 15, 25);
    await sleep(500);
  });

  await scene('7 – Clause Explorer', async () => {
    await clickPanel(page, 'Clause Explorer');
    await smoothScroll(page, 350, 20, 30);
    await sleep(1200);
    await smoothScroll(page, 0, 15, 25);
    await sleep(500);
  });

  await scene('8 – Negotiation Guide + Copilot', async () => {
    await clickPanel(page, 'Negotiation Guide');
    await smoothScroll(page, 280, 20, 30);
    await sleep(1200);
    // Open copilot modal — button text is "Open Negotiation Copilot"
    const copilotBtn = page.locator('button:has-text("Open Negotiation Copilot")').first();
    if (await copilotBtn.count() > 0) {
      await smoothScroll(page, 0, 15, 20);
      await sleep(300);
      await copilotBtn.click({ force: true });
      await sleep(2000);
      // Optionally click Generate Proposal to show it working
      const genBtn = page.locator('button:has-text("Generate Proposal")').first();
      if (await genBtn.count() > 0) {
        await genBtn.click({ force: true });
        await sleep(3000);
      }
      // Close modal
      await page.keyboard.press('Escape');
      await sleep(400);
      await page.mouse.click(50, 50).catch(() => {});
      await sleep(400);
    }
    await smoothScroll(page, 0, 15, 25);
    await sleep(500);
  });

  await scene('9 – Missing Protections', async () => {
    await clickPanel(page, 'Missing Protections');
    await smoothScroll(page, 260, 20, 30);
    await sleep(1300);
    await smoothScroll(page, 0, 15, 25);
    await sleep(500);
  });

  await scene('10 – Sources', async () => {
    await clickPanel(page, 'Sources');
    await smoothScroll(page, 300, 20, 30);
    await sleep(1200);
    await smoothScroll(page, 0, 15, 25);
    await sleep(500);
  });

  await scene('11 – PDF Viewer', async () => {
    const btn = page.locator('button:has-text("View PDF"), a:has-text("View PDF")').first();
    if (await btn.count() > 0) {
      await btn.click({ force: true });
      await sleep(2800);
      await smoothScroll(page, 250, 20, 30);
      await sleep(1000);
      await page.keyboard.press('Escape');
      await sleep(300);
      await page.mouse.click(50, 50).catch(() => {});
      await sleep(500);
    }
  });

  await scene('12 – Agent Trace (Gantt)', async () => {
    await clickPanel(page, 'Agent Trace');
    await sleep(600);
    await smoothScroll(page, 260, 20, 30);
    await sleep(1500);
    // Switch to list view
    await page.locator('#trace-view-list, button:has-text("List")').first().click({ force: true }).catch(() => {});
    await sleep(800);
    await smoothScroll(page, 200, 15, 30);
    await sleep(1200);
    await smoothScroll(page, 0, 15, 25);
    await sleep(800);
  });

  await scene('13 – Ask Your Lease chat', async () => {
    // Navigate fresh to clear any overlays
    await page.goto(KNOWN_REPORT_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=OVERALL RISK', { timeout: 12000 }).catch(() => {});
    await sleep(900);
    // Chat trigger is a floating button bottom-right with text "Ask your lease"
    const chatBtn = page.locator('#lg-chat-trigger, button:has-text("Ask your lease")').first();
    if (await chatBtn.count() > 0) {
      await chatBtn.click({ force: true });
      await sleep(1000);
      // Type a natural question
      const question = 'Is the late fee clause enforceable under Ontario law?';
      const input = page.locator('textarea[placeholder], input[type="text"]').last();
      if (await input.count() > 0) {
        await input.click();
        for (const char of question) {
          await input.type(char);
          await sleep(30 + Math.floor(Math.random() * 25));
        }
        await sleep(700);
        await page.keyboard.press('Enter');
        // Wait for streaming response
        await sleep(5000);
        // Scroll down in chat to show the response
        await page.evaluate(() => {
          const chat = document.querySelector('#lg-chat-messages, [class*="messages"]');
          if (chat) chat.scrollTop = chat.scrollHeight;
        });
        await sleep(1500);
      }
    }
    await sleep(800);
  });

} finally {
  // context.close() triggers Playwright to finalise and write the .webm file
  console.log('\nClosing browser and finalising video…');
  await page.close().catch(() => {});
  await context.close();
  await browser.close();
}

// ── Rename generated file to demo.webm ───────────────────────────────────────

const webms = fs.readdirSync(ASSETS_DIR).filter(f => f.endsWith('.webm') && f !== 'demo.webm');
if (webms.length === 0) {
  console.error('No .webm found in', ASSETS_DIR);
  process.exit(1);
}

const newest = webms
  .map(f => ({ f, t: fs.statSync(path.join(ASSETS_DIR, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)[0].f;

const src = path.join(ASSETS_DIR, newest);
const dst = path.join(ASSETS_DIR, 'demo.webm');
fs.renameSync(src, dst);

const sizeMB = (fs.statSync(dst).size / 1024 / 1024).toFixed(1);
console.log(`\n✓  Saved: .github/assets/demo.webm  (${sizeMB} MB)`);
console.log('\nNext steps:');
console.log('  Upload to GitHub Releases (drag-and-drop in Releases → New release).');
console.log('  Or convert to MP4 for README embedding:');
console.log('    ffmpeg -i .github/assets/demo.webm \\');
console.log('           -c:v libx264 -crf 22 -preset slow \\');
console.log('           -c:a aac -movflags +faststart \\');
console.log('           .github/assets/demo.mp4');
