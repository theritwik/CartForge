import { expect, newAccount, register, signIn, signOut, test } from '../support/fixtures.js';

test.describe('accounts and sessions', () => {
  test('registers, signs out, and signs back in', async ({ page }) => {
    const account = newAccount();

    await register(page, account);
    await expect(page.getByRole('main')).toContainText(account.email);

    await signOut(page);
    await page.goto('/account');
    await expect(page).toHaveURL(/\/login/);

    await signIn(page, account);
    await page.goto('/account');
    await expect(page.getByRole('main')).toContainText(account.email);
  });

  test('rejects a wrong password without signing in', async ({ page }) => {
    const account = newAccount();
    await register(page, account);
    await signOut(page);

    await page.goto('/login');
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password').fill('not the password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Incorrect email or password',
    );
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows registration errors for invalid input', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Name').fill('Asha Rao');
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Password').fill('short');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.locator('#password-error')).toContainText('at least 10 characters');
    await expect(page).toHaveURL(/\/register/);
  });

  test('sends a signed-out visitor to sign in and back to the page they wanted', async ({
    page,
  }) => {
    const account = newAccount();
    await register(page, account);
    await signOut(page);

    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login\?/);
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password').fill(account.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.getByRole('heading', { name: 'Your orders' })).toBeVisible();
  });

  test('treats an expired session as signed out', async ({ page, db }) => {
    const account = newAccount();
    await register(page, account);

    // As if the idle or absolute timeout had passed.
    await db.session.updateMany({
      where: { user: { email: account.email } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await page.goto('/account');
    await expect(page).toHaveURL(/\/login/);
    expect(await db.session.count({ where: { user: { email: account.email } } })).toBe(0);
  });
});
