import { defineConfig, devices } from "@playwright/test";

// E2E sur la build de prod (.output/chrome-mv3) avec le Chromium de Playwright,
// setup officiel WXT : https://wxt.dev/guide/essentials/e2e-testing
export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
