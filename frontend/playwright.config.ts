import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against a real backend + the Vite dev server.
 * Requires `life_test` database + backend running on :8000
 * (see e2e/README notes in docs/TESTING.md).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30 * 1000,
  retries: 1,
  workers: 1, // backend + shared test db: keep sequential
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30 * 1000,
  },
});
