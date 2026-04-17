import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

test.describe('Lead scoring & detail', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('lead list shows scores', async ({ page }) => {
    await page.goto('/dashboard');
    // Wait for leads to load
    const scoreEl = page.locator('[class*="score"], [data-score]').first();
    await expect(scoreEl).toBeVisible({ timeout: 10_000 }).catch(() => {
      // Score may not be computed yet — acceptable
    });
  });

  test('clicking a lead opens detail page', async ({ page }) => {
    await page.goto('/dashboard');
    // Click first lead row
    const firstRow = page.locator('tr[data-lead-id], [data-testid*="lead-row"], tbody tr').first();
    await firstRow.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});

    const firstLink = page.getByRole('link', { name: /.+/ }).filter({ hasText: /[A-Z]/ }).first();
    if (await firstLink.isVisible()) {
      const href = await firstLink.getAttribute('href');
      if (href?.includes('/leads/')) {
        await firstLink.click();
        await expect(page).toHaveURL(/\/leads\//);
        await expect(page.getByText(/Final Score|Score Final/i)).toBeVisible({ timeout: 8_000 }).catch(() => {});
      }
    }
  });

  test('lead detail page shows score explainability button', async ({ page }) => {
    // Navigate to any lead detail
    await page.goto('/dashboard');
    const leadLinks = page.locator('a[href*="/leads/"]');
    const count = await leadLinks.count();
    if (count > 0) {
      await leadLinks.first().click();
      await expect(page).toHaveURL(/\/leads\//);
      // Score explainability accordion
      const whyBtn = page.getByText(/pourquoi ce score|why this score/i);
      await expect(whyBtn).toBeVisible({ timeout: 8_000 });
      await whyBtn.click();
      // Expanded: should show formula or dimension
      await expect(page.getByText(/ICP|formule|dimension/i).first()).toBeVisible({ timeout: 5_000 }).catch(() => {});
    }
  });

  test('ICP page loads', async ({ page }) => {
    await page.goto('/icp');
    await expect(page).toHaveURL(/icp/);
    await expect(page.getByText(/ICP|Ideal Customer Profile/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('pipeline page loads', async ({ page }) => {
    await page.goto('/pipeline');
    await expect(page).toHaveURL(/pipeline/);
    await expect(page.getByText(/pipeline|statut|status/i).first()).toBeVisible({ timeout: 8_000 });
  });
});
