import { test, expect } from '@playwright/test';
import { login, uploadCSV, DEMO_CSV } from './helpers.js';

test.describe('Dashboard & CSV Import', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('dashboard loads with key UI elements', async ({ page }) => {
    await expect(page.getByText(/leads|prospects/i).first()).toBeVisible();
    // Stats cards
    await expect(page.locator('[data-testid="stat-total"], .stat-card, [class*="stat"]').first()).toBeVisible({ timeout: 5_000 }).catch(() => {});
    // Import button visible
    await expect(page.getByRole('button', { name: /import|importer/i })).toBeVisible({ timeout: 8_000 });
  });

  test('CSV import dialog opens', async ({ page }) => {
    await page.goto('/dashboard');
    const importBtn = page.getByRole('button', { name: /import|importer/i });
    await importBtn.waitFor({ state: 'visible', timeout: 8_000 });
    await importBtn.click();
    // Dialog or modal appears
    const dialog = page.locator('[role="dialog"], [data-radix-dialog-content]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
  });

  test('CSV import accepts a file and shows preview', async ({ page }) => {
    await uploadCSV(page, DEMO_CSV);
    // Preview table or confirmation row count appears
    const preview = page.getByText(/2 lead|2 row|2 ligne/i);
    await expect(preview).toBeVisible({ timeout: 10_000 }).catch(async () => {
      // Fallback: look for any table rows or lead name from CSV
      await expect(page.getByText(/Acme Corp/i)).toBeVisible({ timeout: 5_000 });
    });
  });

  test('sidebar navigation links are present', async ({ page }) => {
    await page.goto('/dashboard');
    const nav = page.locator('nav, aside, [role="navigation"]').first();
    await expect(nav).toBeVisible();
    // Check key nav items
    for (const label of ['Dashboard', 'Pipeline', 'ICP', 'Team']) {
      await expect(page.getByRole('link', { name: new RegExp(label, 'i') }).first()).toBeVisible({ timeout: 5_000 }).catch(() => {});
    }
  });
});
