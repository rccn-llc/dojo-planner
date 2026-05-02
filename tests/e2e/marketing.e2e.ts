import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { faker } from '@faker-js/faker';
import { expect, test } from '@playwright/test';

import { loadSharedCredentials, navigateTo, signIn } from '../TestUtils';

test.describe('Marketing — Coupons', () => {
  test.beforeEach(async ({ page }) => {
    loadSharedCredentials();
    await setupClerkTestingToken({ page });
    await signIn(page);
  });

  test('should display marketing page with heading', async ({ page }) => {
    await navigateTo(page, '/dashboard/marketing');

    await expect(page.getByRole('heading', { name: /marketing/i })).toBeVisible();
    await expect(page.getByText('Total Coupons')).toBeVisible();
  });

  test('should create a percentage discount coupon', async ({ page }) => {
    await navigateTo(page, '/dashboard/marketing');

    await page.getByRole('button', { name: /add new coupon/i }).click();

    const dialog = page.getByRole('dialog');

    await expect(dialog).toBeVisible();

    const couponCode = `PCT${faker.string.alphanumeric(6).toUpperCase()}`;

    // Use data-testid selectors within dialog — click to focus, then fill
    const codeInput = dialog.locator('[data-testid="coupon-code-input"]');

    await expect(codeInput).toBeVisible();

    await codeInput.click();
    await codeInput.fill(couponCode);

    await dialog.locator('[data-testid="coupon-description-input"]').fill('10% off membership');
    // Type defaults to "Percentage", applyTo defaults to "Memberships"
    await dialog.locator('[data-testid="coupon-amount-input"]').fill('10');

    // Check "Never Expires" to avoid end date validation error
    await dialog.locator('[data-testid="coupon-never-expires-checkbox"]').click();

    await dialog.getByRole('button', { name: /add coupon/i }).click();

    // Real ORPC create — modal shows the success message for ~1.5s, then closes.
    await expect(dialog).toBeHidden({ timeout: 15000 });
  });

  test('should create a fixed amount coupon', async ({ page }) => {
    await navigateTo(page, '/dashboard/marketing');

    await page.getByRole('button', { name: /add new coupon/i }).click();

    const dialog = page.getByRole('dialog');

    await expect(dialog).toBeVisible();

    const couponCode = `FIX${faker.string.alphanumeric(6).toUpperCase()}`;

    const codeInput = dialog.locator('[data-testid="coupon-code-input"]');

    await expect(codeInput).toBeVisible();

    await codeInput.click();
    await codeInput.fill(couponCode);
    await dialog.locator('[data-testid="coupon-description-input"]').fill('$25 off');

    // Select type: Fixed Amount
    await dialog.locator('[data-testid="coupon-type-select"]').click();
    await page.getByRole('option', { name: /fixed amount/i }).click();

    await dialog.locator('[data-testid="coupon-amount-input"]').fill('25');

    // Check "Never Expires"
    await dialog.locator('[data-testid="coupon-never-expires-checkbox"]').click();

    await dialog.getByRole('button', { name: /add coupon/i }).click();

    // Real ORPC create — modal shows the success message for ~1.5s, then closes.
    await expect(dialog).toBeHidden({ timeout: 15000 });
  });

  test('should display status filter with default value', async ({ page }) => {
    await navigateTo(page, '/dashboard/marketing');

    // Status filter trigger should be visible and show default value
    const statusFilter = page.locator('[data-testid="coupon-status-filter"]');

    await expect(statusFilter).toBeVisible();
    await expect(statusFilter).toContainText('All Statuses');
  });

  test('should display type filter with default value', async ({ page }) => {
    await navigateTo(page, '/dashboard/marketing');

    // Type filter trigger should be visible and show default value
    const typeFilter = page.locator('[data-testid="coupon-type-filter"]');

    await expect(typeFilter).toBeVisible();
    await expect(typeFilter).toContainText('All Types');
  });

  test('should search by coupon code', async ({ page }) => {
    await navigateTo(page, '/dashboard/marketing');

    await page.locator('[data-testid="coupon-search-input"]').fill('PCT');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: /marketing/i })).toBeVisible();
  });

  test('should require coupon code when creating', async ({ page }) => {
    await navigateTo(page, '/dashboard/marketing');

    await page.getByRole('button', { name: /add new coupon/i }).click();

    await expect(page.getByRole('dialog')).toBeVisible();

    // Click "Add Coupon" without filling required fields — validation fires on submit
    await page.getByRole('button', { name: /add coupon/i }).click();

    // Should show validation error
    await expect(page.getByText('Please enter a coupon code.')).toBeVisible();
  });
});
