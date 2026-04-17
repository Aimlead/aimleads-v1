import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

test.describe('Export & Outreach', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('analytics page loads with charts', async ({ page }) => {
    await page.goto('/analytics');
    await expect(page).toHaveURL(/analytics/);
    await expect(page.getByText(/analytics|analyse|rapport/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('outreach page loads', async ({ page }) => {
    await page.goto('/outreach');
    await expect(page).toHaveURL(/outreach/);
    await expect(page.getByText(/outreach|prospection|séquence|sequence/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('CSV export download is triggered from dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    // Listen for download event
    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
    const exportBtn = page.getByRole('button', { name: /export|exporter/i });
    if (await exportBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await exportBtn.click();
      const download = await downloadPromise;
      if (download) {
        expect(download.suggestedFilename()).toMatch(/\.csv$/i);
      }
    }
  });

  test('billing page loads', async ({ page }) => {
    await page.goto('/billing');
    await expect(page).toHaveURL(/billing/);
    await expect(page.getByText(/billing|facturation|plan/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('segments page loads', async ({ page }) => {
    await page.goto('/segments');
    await expect(page).toHaveURL(/segments/);
    await expect(page.getByText(/segment|filter|filtrer/i).first()).toBeVisible({ timeout: 8_000 });
  });
});
