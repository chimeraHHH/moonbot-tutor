import { expect, test } from '@playwright/test';

const adminEmail = process.env.E2E_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
const authReady = Boolean(adminEmail && adminPassword && process.env.DATABASE_URL);

test.describe('auth flow', () => {
  test.skip(!authReady, 'requires DATABASE_URL plus E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD');

  test('admin can sign in and reach the admin dashboard', async ({ page }) => {
    await page.goto('/login?next=%2Fadmin');
    await page.getByLabel('Email').fill(adminEmail!);
    await page.getByLabel('Password').fill(adminPassword!);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'SophosEdu Admin' })).toBeVisible();

    const sessionCookie = (await page.context().cookies()).find(
      (cookie) => cookie.name === 'sophos_session',
    );
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie?.secure).toBe(new URL(page.url()).protocol === 'https:');
  });

  test('new students can register and receive a browser session', async ({ page }) => {
    const unique = Date.now().toString(36);
    await page.goto('/register');
    await page.getByLabel('Name').fill(`E2E Student ${unique}`);
    await page.getByLabel('Email').fill(`e2e-student-${unique}@example.test`);
    await page.getByLabel('Password').fill(`student-${unique}`);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/student$/);

    const sessionCookie = (await page.context().cookies()).find(
      (cookie) => cookie.name === 'sophos_session',
    );
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie?.secure).toBe(new URL(page.url()).protocol === 'https:');
  });
});
