// Shared helpers for E2E tests

export const TEST_USER = {
  email: process.env.E2E_TEST_EMAIL || 'e2e-test@aimleads.io',
  password: process.env.E2E_TEST_PASSWORD || 'TestPassword123!',
  name: 'E2E Test User',
};

export const DEMO_CSV = `company_name,website_url,industry,company_size,country,contact_name,contact_role,contact_email
Acme Corp,https://acmecorp.com,SaaS,50,France,Alice Martin,VP Sales,alice@acmecorp.com
Beta Tech,https://betatech.io,Fintech,200,France,Bob Dupont,CTO,bob@betatech.io
`;

export async function login(page, email = TEST_USER.email, password = TEST_USER.password) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password|mot de passe/i).fill(password);
  await page.getByRole('button', { name: /sign in|login|connexion/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 15_000 });
}

export async function logout(page) {
  const menu = page.getByRole('button', { name: /account|profile|user/i }).first();
  if (await menu.isVisible()) {
    await menu.click();
    const logoutBtn = page.getByRole('menuitem', { name: /logout|sign out|déconnexion/i });
    if (await logoutBtn.isVisible()) await logoutBtn.click();
  }
}

export async function uploadCSV(page, csvContent = DEMO_CSV) {
  const { writeFileSync } = await import('fs');
  const tmpPath = '/tmp/e2e-test-leads.csv';
  writeFileSync(tmpPath, csvContent);

  await page.goto('/dashboard');
  const importBtn = page.getByRole('button', { name: /import|importer/i });
  await importBtn.waitFor({ state: 'visible', timeout: 8_000 });
  await importBtn.click();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(tmpPath);
  return tmpPath;
}
