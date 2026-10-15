import { defineConfig, devices } from "@playwright/test";

const port = 3200;

/**
 * End-to-end tests run the real app without Supabase, i.e. the local preview
 * with the deterministic provider. Signed-in flows need Google OAuth and are
 * covered by the database tests plus a manual acceptance pass (docs/decisions/0016).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    // Different zones on each side of UTC catch dates that shift by a day.
    { name: "desktop", use: { ...devices["Desktop Chrome"], locale: "en-IN", timezoneId: "Asia/Kolkata" } },
    { name: "mobile", use: { ...devices["Pixel 7"], locale: "en-US", timezoneId: "America/Los_Angeles" } },
  ],
  webServer: {
    command: `next dev --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Empty values (as in .env.example) select the in-memory preview and
      // take precedence over anything in .env.local.
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      AI_PROVIDER: "demo",
    },
  },
});
