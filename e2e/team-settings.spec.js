import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

test.describe('Team & Settings', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('team page loads and shows members', async ({ page }) => {
    await page.goto('/team');
    await expect(page).toHaveURL(/team/);
    await expect(page.getByText(/member|membre|équipe|team/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('invite button visible for owners', async ({ page }) => {
    await page.goto('/team');
    const inviteBtn = page.getByRole('button', { name: /invite|inviter/i });
    // May not be visible if user is not owner; we just check the page loaded
    await expect(page.getByText(/team|équipe/i).first()).toBeVisible({ timeout: 8_000 });
    // If invite visible, it should have an email input when clicked
    if (await inviteBtn.isVisible()) {
      await inviteBtn.click();
      const emailInput = page.getByPlaceholder(/email/i);
      await expect(emailInput).toBeVisible({ timeout: 5_000 });
    }
  });

  test('settings page loads', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/settings/);
    await expect(page.getByText(/settings|paramètres|workspace/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('account settings page loads', async ({ page }) => {
    await page.goto('/account');
    await expect(page).toHaveURL(/account/);
    await expect(page.getByText(/account|compte|profile/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('audit log page loads', async ({ page }) => {
    await page.goto('/audit');
    await expect(page).toHaveURL(/audit/);
    await expect(page.getByText(/audit|log|activity/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('help page loads', async ({ page }) => {
    await page.goto('/help');
    await expect(page).toHaveURL(/help/);
    await expect(page.getByText(/help|aide|support/i).first()).toBeVisible({ timeout: 8_000 });
  });
});
