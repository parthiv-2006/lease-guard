import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "demo-record.spec.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 180_000,

  reporter: [["list"]],

  use: {
    baseURL: BASE_URL,
    video: "on",
    trace: "off",
    screenshot: "off",
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
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
