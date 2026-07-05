import { test, expect } from "@playwright/test";

// Real-browser counterpart of tests/frontend/smoke.mjs: proves the 11 split
// scripts load and boot in an actual Chromium against a live server — the
// thing jsdom cannot fully guarantee (real rendering + SW + interactivity).

test("app boots with no uncaught errors and shows the auth screen", async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

  await page.goto("/");

  await expect(page.locator("#auth-page")).toBeVisible();
  await expect(page.locator("#auth-submit")).toBeVisible();

  // Uncaught exceptions during load == a broken/misordered split. Must be zero.
  expect(pageErrors, "uncaught JS errors:\n" + pageErrors.join("\n")).toHaveLength(0);
  // console.error noise (SW/favicon/pre-login /auth/me) is logged, not fatal.
  if (consoleErrors.length) console.log("console.error (non-fatal):\n" + consoleErrors.join("\n"));
});

test("register flow reveals the app (split onclick handlers work interactively)", async ({ page }) => {
  await page.goto("/");

  // toggleAuthMode() — an inline onclick wired through the split
  await page.locator("#auth-toggle-text a").click();
  await expect(page.locator("#auth-name")).toBeVisible();

  const email = `e2e_${Date.now()}@example.com`;
  await page.fill("#auth-name", "E2E User");
  await page.fill("#auth-email", email);
  await page.fill("#auth-password", "E2ePass123!");
  await page.click("#auth-submit");

  // handleRegister -> setToken -> showApp(): auth hides, app shows
  await expect(page.locator("#app-page")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#auth-page")).toBeHidden();
});
