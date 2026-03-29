const { chromium } = require('playwright');

const baseUrl = (process.argv[2] || 'http://127.0.0.1:4174').replace(/\/$/, '');

const now = Date.now();
const email = `smoke.${now}@aimleads.local`;
const inviteEmail = `invite.${now}@aimleads.local`;
const password = 'SmokeTest1234';

const severeConsoleMessages = [];
const pageErrors = [];

const isVisible = async (locator) => {
  try {
    return await locator.isVisible();
  } catch {
    return false;
  }
};

const firstVisible = async (...locators) => {
  for (const locator of locators) {
    if (await isVisible(locator)) return locator;
  }
  return null;
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const visited = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      severeConsoleMessages.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(String(error?.message || error));
  });

  const goto = async (pathname) => {
    const url = `${baseUrl}${pathname}`;
    await page.goto(url, { waitUntil: 'networkidle' });
    visited.push(page.url());
  };

  await goto('/login');

  const switchToSignup = await firstVisible(
    page.getByRole('button', { name: /Créer un compte|Create an account|Create account/i }),
    page.getByText(/Créer un compte|Create an account|Create account/i)
  );
  if (switchToSignup) {
    await switchToSignup.click();
  }

  await page.getByLabel(/Nom complet|Full name/i).fill('Smoke User');
  await page.getByLabel(/Email/i).fill(email);
  await page.getByLabel(/Mot de passe|Password/i).fill(password);
  await page.getByRole('button', { name: /Créer le compte|Create account|Sign up/i }).click();

  await page.waitForURL(/\/dashboard|\/pipeline|\/analytics|\/icp|\/team|\/settings/, { timeout: 30000 });
  visited.push(page.url());

  await goto('/team');
  await page.getByRole('heading', { name: /Team/i }).waitFor({ timeout: 15000 });
  await page.getByPlaceholder(/teammate@company.com/i).fill(inviteEmail);
  await page.getByRole('button', { name: /Create invite/i }).click();
  await page.getByText(inviteEmail, { exact: false }).waitFor({ timeout: 15000 });

  await goto('/settings');
  await page.getByRole('heading', { name: /Settings/i }).waitFor({ timeout: 15000 });

  await goto('/dashboard');
  await page.waitForLoadState('networkidle');
  const dashboardText = await page.locator('body').innerText();

  const summary = {
    ok: pageErrors.length === 0,
    baseUrl,
    email,
    inviteEmail,
    visited,
    pageErrors,
    severeConsoleMessages,
    dashboardHasCoreTerms:
      /Dashboard|Pipeline|ICP|Team|Settings/i.test(dashboardText),
  };

  console.log(JSON.stringify(summary, null, 2));

  if (pageErrors.length > 0) {
    process.exitCode = 1;
  }

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
