import {
  addToCart,
  addToCartButton,
  expect,
  newAccount,
  register,
  signIn,
  signOut,
  test,
} from '../support/fixtures.js';

test.describe('cart', () => {
  test('sends a signed-out visitor to sign in before adding to the cart', async ({ page }) => {
    await page.goto('/products/the-pragmatic-programmer');
    await addToCartButton(page).click();

    await expect(page).toHaveURL(/\/login\?/);
  });

  test('adds items and changes quantities, with totals from the server', async ({ page }) => {
    await register(page, newAccount());
    await addToCart(page, 'the-pragmatic-programmer');
    await addToCart(page, 'leather-bifold-wallet');

    await page.goto('/cart');
    const items = page.getByRole('main').locator('ul > li');
    await expect(items).toHaveCount(2);
    const book = items.filter({ hasText: 'The Pragmatic Programmer' });
    const subtotal = page.getByRole('main').getByText(/^₹/).last();
    const before = await subtotal.innerText();

    await book.getByRole('button', { name: 'Increase quantity' }).click();
    await expect(book).toContainText('2');
    await expect(subtotal).not.toHaveText(before);

    await book.getByRole('button', { name: 'Decrease quantity' }).click();
    await expect(subtotal).toHaveText(before);

    await items
      .filter({ hasText: 'Leather Bifold Wallet' })
      .getByRole('button', { name: 'Remove' })
      .click();
    await expect(items).toHaveCount(1);
  });

  test('keeps the cart across sign-outs and on another device', async ({ page, browser }) => {
    const account = newAccount();
    await register(page, account);
    await addToCart(page, 'canvas-backpack-25l');
    await signOut(page);

    // A separate browser context shares nothing with the first: a second device.
    const otherDevice = await browser.newContext();
    const otherPage = await otherDevice.newPage();
    await signIn(otherPage, account);
    await otherPage.goto('/cart');
    await expect(otherPage.getByRole('main')).toContainText('Canvas Backpack, 25 L');
    await otherDevice.close();

    await signIn(page, account);
    await page.goto('/cart');
    await expect(page.getByRole('main')).toContainText('Canvas Backpack, 25 L');
  });
});
