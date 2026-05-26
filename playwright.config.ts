import { defineConfig, devices } from "@playwright/test";

/**
 * LeaseGuard Playwright E2E Configuration
 *
 * Test tiers:
 *   e2e/landing.spec.ts       — Landing page structure & content
 *   e2e/static-pages.spec.ts  — Info pages, auth pages, 404, sitemap, robots
 *   e2e/report.spec.ts        — Full report: all 8 panels, PDF viewer, RAG drawer
 *   e2e/chat.spec.ts          — Ask Your Lease chat panel
 *
 * Environment variables:
 *   BASE_URL          — Override base URL (default: http://localhost:3000)
 *   E2E_LEASE_FAULTY  — Known-good faulty lease ID for report tests
 *   E2E_LEASE_COMPLIANT — Known-good compliant lease ID for report tests
 *
 * The webServer block starts `next dev` automatically when running locally.
 * In CI the server is started separately so `reuseExistingServer: true` picks it up.
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // report tests hit real DB — keep sequential to avoid flake
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  timeout: 60_000,

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ...(process.env.CI ? [["github"] as ["github"]] : []),
  ],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
