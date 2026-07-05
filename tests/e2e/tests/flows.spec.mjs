import { test, expect } from "@playwright/test";

// Phase 2 user flows against the live app. Each registers a fresh user through
// the UI (RU forced for deterministic labels), then exercises a real feature.

async function registerAndLogin(page) {
  await page.addInitScript(() => localStorage.setItem("lang", "ru"));
  await page.goto("/");
  await page.locator("#auth-toggle-text a").click();
  await expect(page.locator("#auth-name")).toBeVisible();
  const email = `e2e_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.fill("#auth-name", "E2E");
  await page.fill("#auth-email", email);
  await page.fill("#auth-password", "E2ePass123!");
  await page.click("#auth-submit");
  await expect(page.locator("#app-page")).toBeVisible({ timeout: 15_000 });
}

test("add water updates the daily total (onclick -> API -> DOM)", async ({ page }) => {
  await registerAndLogin(page);
  await expect(page.locator("#water-summary")).toBeVisible();
  await expect(page.locator("#water-percent")).toHaveText("0%");

  // "💧 +200" quick button — first water-type quick button
  await page.locator('button.water-quick[data-type="water"]').first().click();

  // default goal (no weight) is 2000 ml -> 200/2000 = 10%
  await expect(page.locator("#water-percent")).toHaveText("10%");
  await expect(page.locator("#water-summary")).toContainText("200 /");
});

test("theme choice persists across reload (onclick -> localStorage -> init)", async ({ page }) => {
  await registerAndLogin(page);

  await page.locator('button[onclick="openSettings()"]').click();
  await page.locator("#theme-light-btn").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  // initTheme() reapplies from localStorage on every load
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
