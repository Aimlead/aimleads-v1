import { test, expect } from '@playwright/test';
import { TEST_USER, login } from './helpers.js';

test.describe('Authentication flows', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/AimLeads|Lead/i);
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password|mot de passe/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|login|connexion/i })).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('wrong@example.com');
    await page.getByLabel(/password|mot de passe/i).fill('wrongpassword');
    await page.getByRole('button', { name: /sign in|login|connexion/i }).click();
    const error = page.getByText(/invalid|incorrect|error|erreur/i).first();
    await expect(error).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/login/);
  });

  test('forgot password page is reachable', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /forgot|oublié/i }).click();
    await expect(page).toHaveURL(/forgot-password/);
    await expect(page.getByRole('button', { name: /send|envoyer|reset/i })).toBeVisible();
  });

  test('unauthenticated access redirects to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/login/);
  });

  test('pricing page accessible without auth', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page).not.toHaveURL(/login/);
    await expect(page.getByText(/starter|team|scale/i).first()).toBeVisible();
  });
});
