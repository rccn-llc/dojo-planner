import type { Page } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { faker } from '@faker-js/faker';
import { expect, test } from '@playwright/test';

import { loadSharedCredentials, navigateTo, signIn } from '../TestUtils';

/**
 * Card number field locator that works in both modes:
 * - Fallback: plain <input id="cardNumber"> (when IQPro not configured)
 * - TokenEx: <div id="tokenExIframeDiv"> (when IQPro configured)
 * Uses Playwright's .or() to match either element.
 */
function cardNumberLocator(page: Page) {
  return page.locator('#cardNumber').or(page.locator('#tokenExIframeDiv'));
}

/**
 * Whether the card number field is a plain <input> (fallback mode).
 * When false, the TokenEx iframe is active and card number can't be filled via E2E.
 */
async function isCardNumberFallback(page: Page): Promise<boolean> {
  return page.locator('#cardNumber').isVisible({ timeout: 2000 }).catch(() => false);
}

/**
 * Fill payment details in the wizard. Handles both fallback (plain input) and
 * iframe (TokenEx) modes. In iframe mode, switches to ACH since the iframe
 * can't be driven in E2E tests.
 */
async function fillPaymentStep(page: Page) {
  const isFallback = await isCardNumberFallback(page);

  if (isFallback) {
    await page.locator('#cardholderName').fill('Test Cardholder');
    await page.locator('#cardNumber').fill('4111111111111111');
    await page.locator('#cardExpiry').fill('12/30');
    await page.locator('#cardCvc').fill('999');
  } else {
    // TokenEx iframe can't be driven — use ACH instead
    await page.getByText('ACH Bank Account').click();
    await page.locator('#achAccountHolder').fill('Test Account Holder');
    await page.getByPlaceholder('9 digits').fill('021000021');
    await page.getByPlaceholder('Account number').fill('123456789');
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

type MemberDetails = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

/** Open the Add Member wizard dialog from the members page. */
async function openWizard(page: Page) {
  await navigateTo(page, '/dashboard/members');
  await page.getByRole('button', { name: /add member/i }).click();

  await expect(page.getByRole('dialog')).toBeVisible();
}

/** Select "Individual" member type and click Next. */
async function selectMemberType(page: Page) {
  await page.getByRole('heading', { name: 'Individual' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(page.getByText('Add Member Details').first()).toBeVisible();
}

/** Fill in all required details fields. Returns generated data. */
async function fillDetailsStep(page: Page): Promise<MemberDetails> {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const slug = faker.string.alphanumeric(6).toLowerCase();
  const email = `e2e_${slug}@test.example.com`;
  const phone = '5551234567';

  await page.getByPlaceholder('Enter first name').fill(firstName);
  await page.getByPlaceholder('Enter last name').fill(lastName);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('(555) 123-4567').fill(phone);

  // Date of birth — use an adult date
  await page.locator('input[type="date"]').fill('1990-01-15');

  // Address fields
  await page.getByPlaceholder('123 Main St').fill('100 Test Ave');
  await page.getByPlaceholder('San Francisco').fill('Testville');

  // State select — click the state trigger within the dialog, then pick CA
  const dialog = page.getByRole('dialog');
  await dialog.locator('[data-slot="select-trigger"]').first().click();
  await page.getByRole('option', { name: 'CA', exact: true }).click();

  await page.getByPlaceholder('94102').fill('90210');

  // Country defaults to US — leave as-is

  return { firstName, lastName, email, phone };
}

/** Navigate through steps 1-3 (type → details → photo) and land on subscription step. */
async function navigateToSubscriptionStep(page: Page): Promise<MemberDetails> {
  await openWizard(page);
  await selectMemberType(page);
  const details = await fillDetailsStep(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // Photo step — skip it
  await expect(page.getByText('Drop your image here to upload')).toBeVisible();

  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // Now on subscription step
  await expect(page.getByText('Choose Membership Plan').first()).toBeVisible();

  return details;
}

/** Navigate through steps 1-5 to land on payment step. */
async function navigateToPaymentStep(page: Page): Promise<MemberDetails> {
  const details = await navigateToSubscriptionStep(page);

  // Wait for plans to load and select the first one
  await expect(page.locator('button[aria-pressed]').first()).toBeVisible({ timeout: 10000 });

  await page.locator('button[aria-pressed]').first().click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // Waiver step auto-skips → lands on payment step
  await expect(page.getByText('Payment Information')).toBeVisible({ timeout: 10000 });

  return details;
}

// ── Tests ────────────────────────────────────────────────────────────

test.describe('Add Member Wizard', () => {
  test.beforeEach(async ({ page }) => {
    loadSharedCredentials();
    await setupClerkTestingToken({ page });
    await signIn(page);
  });

  // ── Step 1: Member Type ──────────────────────────────────────────

  test.describe('Step 1: Member Type', () => {
    test('should display member type options and require selection', async ({ page }) => {
      await openWizard(page);

      // All three options visible
      await expect(page.getByRole('heading', { name: 'Individual' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Family Member' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Head of Household' })).toBeVisible();

      // Next disabled without selection
      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();

      // Select Individual → Next enabled
      await page.getByRole('heading', { name: 'Individual' }).click();

      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
    });
  });

  // ── Step 2: Details ──────────────────────────────────────────────

  test.describe('Step 2: Details', () => {
    test('should show validation errors on empty required fields', async ({ page }) => {
      await openWizard(page);
      await selectMemberType(page);

      // Focus and blur first name to trigger validation
      await page.getByPlaceholder('Enter first name').focus();
      await page.getByPlaceholder('Enter first name').blur();

      await expect(page.getByText('Please enter a first name.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    });

    test('should validate email format', async ({ page }) => {
      await openWizard(page);
      await selectMemberType(page);

      await page.getByPlaceholder('you@example.com').fill('not-an-email');
      await page.getByPlaceholder('you@example.com').blur();

      await expect(page.getByText(/valid email/i)).toBeVisible();
    });

    test('should enable Next when all required fields are filled', async ({ page }) => {
      await openWizard(page);
      await selectMemberType(page);
      await fillDetailsStep(page);

      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
    });
  });

  // ── Step 3: Photo ────────────────────────────────────────────────

  test.describe('Step 3: Photo', () => {
    test('should allow skipping photo step', async ({ page }) => {
      await openWizard(page);
      await selectMemberType(page);
      await fillDetailsStep(page);
      await page.getByRole('button', { name: 'Next', exact: true }).click();

      // Photo step visible
      await expect(page.getByText('Drop your image here to upload')).toBeVisible();

      // Next enabled immediately (photo is optional)
      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
    });
  });

  // ── Step 4: Membership Plan ──────────────────────────────────────

  test.describe('Step 4: Membership Plan', () => {
    test('should display membership plans and require selection', async ({ page }) => {
      await navigateToSubscriptionStep(page);

      // Wait for plans to load
      await expect(page.locator('button[aria-pressed]').first()).toBeVisible({ timeout: 10000 });

      // Click a plan to ensure selection
      await page.locator('button[aria-pressed="false"]').first().click();

      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
    });
  });

  // ── Step 6: Payment ──────────────────────────────────────────────
  // Card number renders as plain <input id="cardNumber"> (fallback) or TokenEx iframe
  // container <div id="tokenExIframeDiv"> depending on IQPro config. Tests use
  // cardNumberLocator() which matches either via Playwright's .or() operator.

  test.describe('Step 6: Payment', () => {
    test('should display card payment form and disable Next without input', async ({ page }) => {
      await navigateToPaymentStep(page);

      // Common card fields always visible
      await expect(page.locator('#cardholderName')).toBeVisible();
      await expect(page.getByPlaceholder('MM/YY')).toBeVisible();
      await expect(page.locator('#cardCvc')).toBeVisible();

      // Card number field — matches either plain input or iframe container
      await expect(cardNumberLocator(page)).toBeVisible();

      // Next disabled with empty form
      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    });

    test('should enable Next when payment fields are filled', async ({ page }) => {
      await navigateToPaymentStep(page);

      // fillPaymentStep handles both card fallback and ACH (when iframe active)
      await fillPaymentStep(page);

      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
    });

    test('should switch between card and ACH payment methods', async ({ page }) => {
      await navigateToPaymentStep(page);

      // Initially card form is visible (plain input or iframe container)
      await expect(cardNumberLocator(page)).toBeVisible();

      // Switch to ACH
      await page.getByText('ACH Bank Account').click();

      // ACH fields visible
      await expect(page.locator('#achAccountHolder')).toBeVisible();
      await expect(page.getByPlaceholder('9 digits')).toBeVisible();
      await expect(page.getByPlaceholder('Account number')).toBeVisible();

      // Switch back to card
      await page.getByText('Debit / Credit Card').click();

      await expect(cardNumberLocator(page)).toBeVisible();
      await expect(page.locator('#achAccountHolder')).toBeHidden();
    });
  });

  // ── Full Flow ────────────────────────────────────────────────────

  test.describe('Full Flow', () => {
    test('should complete entire wizard from member type through success', async ({ page }) => {
      // Step 1: Member Type
      await openWizard(page);
      await page.getByRole('heading', { name: 'Individual' }).click();
      await page.getByRole('button', { name: 'Next', exact: true }).click();

      // Step 2: Details
      const details = await fillDetailsStep(page);
      await page.getByRole('button', { name: 'Next', exact: true }).click();

      // Step 3: Photo — skip
      await expect(page.getByText('Drop your image here to upload')).toBeVisible();

      await page.getByRole('button', { name: 'Next', exact: true }).click();

      // Step 4: Membership Plan
      await expect(page.getByText('Choose Membership Plan').first()).toBeVisible();

      await expect(page.locator('button[aria-pressed]').first()).toBeVisible({ timeout: 10000 });

      await page.locator('button[aria-pressed]').first().click();
      await page.getByRole('button', { name: 'Next', exact: true }).click();

      // Step 5: Waiver auto-skips → Step 6: Payment
      await expect(page.getByText('Payment Information')).toBeVisible({ timeout: 10000 });

      // Fill payment details (handles both card fallback and ACH when iframe active)
      await fillPaymentStep(page);

      // Submit — triggers member creation + payment attempt (payment may fail gracefully)
      await page.getByRole('button', { name: 'Next', exact: true }).click();

      // Step 7: Success
      await expect(page.getByText(/has successfully been added as a member/i)).toBeVisible({ timeout: 30000 });
      await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();

      // Verify member name shown
      await expect(page.getByText(details.firstName)).toBeVisible();

      // Close wizard
      await page.getByRole('button', { name: 'Done' }).click();

      await expect(page.getByRole('dialog')).toBeHidden();
    });
  });
});
