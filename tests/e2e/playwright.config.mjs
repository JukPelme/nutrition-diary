import { defineConfig } from "@playwright/test";

// Playwright boots the real FastAPI app on a throwaway SQLite DB, waits until
// /api/v1/version answers, runs the specs, then tears the server down.
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:8000",
    headless: true,
    trace: "on-first-retry",
  },
  webServer: {
    command: "uvicorn app.main:app --host 127.0.0.1 --port 8000 --app-dir ../..",
    url: "http://127.0.0.1:8000/api/v1/version",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: "sqlite+aiosqlite:///./e2e_test.db",
      SECRET_KEY: "e2e-secret-key-0000000000000000000000000000000000000000000000",
      DEBUG: "false",
    },
  },
});
