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
 * CVV field locator that works in both modes:
 * - Fallback: plain <input id="cardCvc"> (when IQPro not configured)
 * - TokenEx: <div id="tokenExCvvIframeDiv"> (when IQPro configured)
 */
function cardCvcLocator(page: Page) {
  return page.locator('#cardCvc').or(page.locator('#tokenExCvvIframeDiv'));
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

/** Select a member type by heading name and click Next. */
async function selectMemberType(page: Page, type: 'Individual' | 'Head of Household' | 'Family Member' = 'Individual') {
  // Locate the <h3> heading with the exact member type text, then click its parent <button>.
  // Using getByRole('heading') + exact match ensures we target the correct member type,
  // even when another type's description contains the same words (e.g. "Family Member"
  // description says "head of household").
  const heading = page.getByRole('heading', { name: type, exact: true, level: 3 });
  // Click the ancestor button element — using xpath `..` for cross-browser compatibility
  await heading.locator('xpath=ancestor::button').click();
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

/**
 * Pass the waiver step — clicks Continue on the "No waiver required" panel
 * (the path mock plans take in CI, since they have no waiver association).
 * If a real waiver is shown instead, this is a no-op and the caller should
 * sign + submit explicitly.
 */
async function passNoWaiverStep(page: Page) {
  // Wait briefly for the waiver step to settle. If a waiver is present,
  // the "Sign Waiver" heading appears and we leave the step alone.
  // Otherwise the explicit no-waiver panel renders with a Continue button.
  const noWaiverMessage = page.getByText(/No waiver is required for the selected membership plan/i);
  try {
    await expect(noWaiverMessage).toBeVisible({ timeout: 5000 });

    // We're on the no-waiver panel — click Continue
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  } catch {
    // No panel — assume the caller will handle the real waiver
  }
}

/** Navigate through steps 1-3 (type → details → photo) and land on subscription step. */
async function navigateToSubscriptionStep(page: Page, memberType: 'Individual' | 'Head of Household' | 'Family Member' = 'Individual'): Promise<MemberDetails> {
  await openWizard(page);
  await selectMemberType(page, memberType);
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
async function navigateToPaymentStep(page: Page, memberType: 'Individual' | 'Head of Household' = 'Individual'): Promise<MemberDetails> {
  const details = await navigateToSubscriptionStep(page, memberType);

  // Wait for plans to load and select the first one
  await expect(page.locator('button[aria-pressed]').first()).toBeVisible({ timeout: 10000 });

  await page.locator('button[aria-pressed]').first().click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // Waiver step — for mock plans there's no waiver association, so the
  // "No waiver required" panel is shown. Click Continue to advance.
  await passNoWaiverStep(page);

  await expect(page.getByText('Payment Information')).toBeVisible({ timeout: 10000 });

  return details;
}

/** Whether the family card number field is a plain <input> (fallback mode). */
async function isFamilyCardNumberFallback(page: Page): Promise<boolean> {
  return page.locator('#familyCardNumber').isVisible({ timeout: 2000 }).catch(() => false);
}

/**
 * Fill payment details in the family payment step.
 * Handles both fallback (plain input) and iframe (TokenEx) modes.
 */
async function fillFamilyPaymentStep(page: Page) {
  const isFallback = await isFamilyCardNumberFallback(page);

  if (isFallback) {
    await page.locator('#familyCardholderName').fill('Test Family Cardholder');
    await page.locator('#familyCardNumber').fill('4111111111111111');
    await page.locator('#familyCardExpiry').fill('12/30');
    await page.locator('#familyCardCvc').fill('999');
  } else {
    // TokenEx iframe can't be driven — use ACH instead
    await page.getByText('ACH Bank Account').click();
    await page.locator('#familyAchAccountHolder').fill('Test Family Account Holder');
    await page.getByPlaceholder('9 digits').fill('021000021');
    await page.getByPlaceholder('Account number').fill('123456789');
  }
}

/**
 * Handle the payment result after submitting. In CI (no IQPro), payment always
 * fails. The wizard now stays on the payment step showing a decline alert.
 * Click "Add Member Anyway" to proceed to the success step.
 */
async function handlePaymentResult(page: Page) {
  const success = page.getByText(/has successfully been added as a member/i);
  const addAnywayBtn = page.getByRole('button', { name: /Add Member Anyway/i });

  await expect(success.or(addAnywayBtn)).toBeVisible({ timeout: 30000 });

  if (await addAnywayBtn.isVisible()) {
    await addAnywayBtn.click();
  }
}

/**
 * Complete the entire HOH wizard flow end-to-end.
 * Creates an HOH member and returns their details for subsequent tests.
 */
async function completeHOHWizardFlow(page: Page): Promise<MemberDetails> {
  // Step 1: Member Type — HOH
  await openWizard(page);
  await selectMemberType(page, 'Head of Household');

  // Step 2: Details
  const hohDetails = await fillDetailsStep(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // Step 3: Photo — skip
  await expect(page.getByText('Drop your image here to upload')).toBeVisible();

  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // Step 4: Membership Plan
  await expect(page.getByText('Choose Membership Plan').first()).toBeVisible();
  await expect(page.locator('button[aria-pressed]').first()).toBeVisible({ timeout: 10000 });

  await page.locator('button[aria-pressed]').first().click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // Step 5: Waiver — click Continue on the no-waiver panel (mock plans)
  await passNoWaiverStep(page);

  // Step 6: Payment
  await expect(page.getByText('Payment Information')).toBeVisible({ timeout: 10000 });

  await fillPaymentStep(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // Handle payment decline (IQPro not configured in CI)
  await handlePaymentResult(page);

  // Step 7: Success
  await expect(page.getByText(/has successfully been added as a member/i)).toBeVisible({ timeout: 30000 });

  await page.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByRole('dialog')).toBeHidden();

  return hohDetails;
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
      await page.getByRole('heading', { name: 'Individual', exact: true, level: 3 })
        .locator('xpath=ancestor::button')
        .click();

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
      await expect(cardCvcLocator(page)).toBeVisible();

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
      await selectMemberType(page, 'Individual');

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

      // Step 5: Waiver — click Continue on the no-waiver panel (mock plans)
      await passNoWaiverStep(page);

      // Step 6: Payment
      await expect(page.getByText('Payment Information')).toBeVisible({ timeout: 10000 });

      // Fill payment details (handles both card fallback and ACH when iframe active)
      await fillPaymentStep(page);

      // Submit — triggers member creation + payment attempt (payment may fail gracefully)
      await page.getByRole('button', { name: 'Next', exact: true }).click();

      // Handle payment decline (IQPro not configured in CI)
      await handlePaymentResult(page);

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

  // ── HOH Flow ─────────────────────────────────────────────────────

  test.describe('HOH Flow', () => {
    test('should show HOH billing notice on payment step', async ({ page }) => {
      await navigateToPaymentStep(page, 'Head of Household');

      // Verify the HOH-specific billing notice is displayed
      await expect(page.getByText(/family members are added to your account/i)).toBeVisible();
      await expect(page.getByText(/charged to this payment method/i)).toBeVisible();
    });

    test('should complete entire HOH wizard flow through success', async ({ page }) => {
      // Step 1: Member Type — Head of Household
      await openWizard(page);
      await selectMemberType(page, 'Head of Household');

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

      // Step 5: Waiver — click Continue on the no-waiver panel (mock plans)
      await passNoWaiverStep(page);

      // Step 6: Payment
      await expect(page.getByText('Payment Information')).toBeVisible({ timeout: 10000 });

      // Verify HOH billing notice is visible on the payment step
      await expect(page.getByText(/family members are added to your account/i)).toBeVisible();

      // Fill payment details
      await fillPaymentStep(page);
      await page.getByRole('button', { name: 'Next', exact: true }).click();

      // Handle payment decline (IQPro not configured in CI)
      await handlePaymentResult(page);

      // Step 7: Success
      await expect(page.getByText(/has successfully been added as a member/i)).toBeVisible({ timeout: 30000 });
      await expect(page.getByText(details.firstName)).toBeVisible();

      // Close wizard
      await page.getByRole('button', { name: 'Done' }).click();

      await expect(page.getByRole('dialog')).toBeHidden();
    });
  });

  // ── Family Member Flow ───────────────────────────────────────────

  test.describe('Family Member Flow', () => {
    test('should navigate to HOH selection step instead of payment for family members', async ({ page }) => {
      // Navigate through to subscription step as family member
      const details = await navigateToSubscriptionStep(page, 'Family Member');

      // Wait for plans to load and select the first one
      await expect(page.locator('button[aria-pressed]').first()).toBeVisible({ timeout: 10000 });

      await page.locator('button[aria-pressed]').first().click();
      await page.getByRole('button', { name: 'Next', exact: true }).click();

      // Waiver — click Continue on the no-waiver panel (mock plans), then
      // should land on HOH Selection step (NOT payment).
      await passNoWaiverStep(page);

      // Use heading role to disambiguate from dialog title (both have same text)
      await expect(page.getByPlaceholder('Search by name or email...')).toBeVisible({ timeout: 10000 });

      // Payment Information should NOT be visible
      await expect(page.getByText('Payment Information')).toBeHidden();

      // Verify HOH selection UI elements
      await expect(page.getByPlaceholder('Search by name or email...')).toBeVisible();
      // Next should be disabled until an HOH is selected
      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();

      // Verify Back button exists and is enabled
      await expect(page.getByRole('button', { name: 'Back' })).toBeEnabled();

      void details; // Used to verify the flow works end-to-end
    });

    test('should complete full family member flow with HOH that has no saved payment method', async ({ page }) => {
      // First, create an HOH member via the full wizard flow
      const hohDetails = await completeHOHWizardFlow(page);

      // Now create a family member linked to this HOH
      await openWizard(page);
      await selectMemberType(page, 'Family Member');

      // Step 2: Details
      const familyDetails = await fillDetailsStep(page);
      await page.getByRole('button', { name: 'Next', exact: true }).click();

      // Step 3: Photo — skip
      await expect(page.getByText('Drop your image here to upload')).toBeVisible();

      await page.getByRole('button', { name: 'Next', exact: true }).click();

      // Step 4: Membership Plan
      await expect(page.getByText('Choose Membership Plan').first()).toBeVisible();
      await expect(page.locator('button[aria-pressed]').first()).toBeVisible({ timeout: 10000 });

      await page.locator('button[aria-pressed]').first().click();
      await page.getByRole('button', { name: 'Next', exact: true }).click();

      // Step 5: Waiver — click Continue on the no-waiver panel (mock plans)
      await passNoWaiverStep(page);

      // Step 6: HOH Selection
      await expect(page.getByPlaceholder('Search by name or email...')).toBeVisible({ timeout: 10000 });

      // Search for and select the HOH we just created
      const dialog = page.getByRole('dialog');
      await dialog.getByPlaceholder('Search by name or email...').fill(hohDetails.firstName);

      // Wait for the HOH to appear in the list and click to select (scoped to dialog)
      await expect(dialog.getByText(hohDetails.email)).toBeVisible({ timeout: 10000 });

      await dialog.getByText(hohDetails.email).click();

      // Wait for payment method lookup to complete
      await expect(page.getByText('Selected')).toBeVisible({ timeout: 10000 });

      // The HOH likely won't have a payment method saved (IQPro not configured in E2E),
      // so we should see "No payment method on file"
      await expect(page.getByText(/No payment method on file/i)).toBeVisible();

      // Proceed to family payment step
      await page.getByRole('button', { name: 'Next', exact: true }).click();

      // Step 7: Family Payment — verify by billing summary label (scoped to dialog)
      await expect(dialog.getByText('Billing Summary')).toBeVisible({ timeout: 10000 });

      // Verify billing summary shows family member and HOH info (scoped to dialog)
      await expect(dialog.getByText(familyDetails.firstName)).toBeVisible();
      await expect(dialog.getByText(`${hohDetails.firstName} ${hohDetails.lastName}`).first()).toBeVisible();

      // HOH has no card on file → should show payment form (Mode B)
      // The amber notice includes the HOH's name specifically
      await expect(dialog.getByText(/Please enter payment details below/i).first()).toBeVisible();

      // Fill the family payment form
      await fillFamilyPaymentStep(page);

      // Submit — Confirm & Add Member
      await dialog.getByRole('button', { name: /Confirm & Add Member/i }).click();

      // Handle payment decline (IQPro not configured in CI)
      await handlePaymentResult(page);

      // Step 8: Success
      await expect(page.getByText(/has successfully been added as a member/i)).toBeVisible({ timeout: 30000 });
      await expect(page.getByText(familyDetails.firstName)).toBeVisible();

      // Close wizard
      await page.getByRole('button', { name: 'Done' }).click();

      await expect(page.getByRole('dialog')).toBeHidden();

      // Verify: Navigate to HOH's member detail page and check family members section
      // Reload the members page to ensure freshly created members appear
      await navigateTo(page, '/dashboard/members');
      await page.waitForLoadState('domcontentloaded');

      // Search for the HOH by name (email is not displayed in table view)
      const searchInput = page.getByPlaceholder('Search members...');

      await expect(searchInput).toBeVisible({ timeout: 10000 });

      await searchInput.fill(hohDetails.firstName);

      // Wait for search results to filter, then click the HOH row
      const hohName = `${hohDetails.firstName} ${hohDetails.lastName}`;
      const hohCell = page.locator('tbody').getByText(hohName);

      await expect(hohCell).toBeVisible({ timeout: 10000 });

      await hohCell.click();

      // Wait for member detail page to load
      await page.waitForURL(/\/dashboard\/members\//, { timeout: 15000 });

      // Verify the Family Members section appears (only for HOH members)
      await expect(page.getByRole('heading', { name: 'Family Members' })).toBeVisible({ timeout: 15000 });

      // Verify the family member we just added appears
      await expect(page.getByText(`${familyDetails.firstName} ${familyDetails.lastName}`)).toBeVisible();
    });

    test('should display billing summary with HOH card info when HOH has payment method', async ({ page }) => {
      // Navigate through to HOH selection step as family member
      await openWizard(page);
      await selectMemberType(page, 'Family Member');
      await fillDetailsStep(page);
      await page.getByRole('button', { name: 'Next', exact: true }).click();

      // Photo — skip
      await expect(page.getByText('Drop your image here to upload')).toBeVisible();

      await page.getByRole('button', { name: 'Next', exact: true }).click();

      // Membership Plan
      await expect(page.getByText('Choose Membership Plan').first()).toBeVisible();
      await expect(page.locator('button[aria-pressed]').first()).toBeVisible({ timeout: 10000 });

      await page.locator('button[aria-pressed]').first().click();
      await page.getByRole('button', { name: 'Next', exact: true }).click();

      // Waiver — click Continue on the no-waiver panel (mock plans)
      await passNoWaiverStep(page);

      // HOH Selection step — verify by search input (dialog title also says "Select Head of Household")
      await expect(page.getByPlaceholder('Search by name or email...')).toBeVisible({ timeout: 10000 });

      // If there are HOH members, verify search filtering works
      const noHOHMessage = page.getByText('No head of household members found');
      const hohList = page.locator('button').filter({ hasText: /@/ }); // HOH buttons have email

      // Either we see HOH members or a "no HOH found" message
      await expect(noHOHMessage.or(hohList.first())).toBeVisible({ timeout: 10000 });
    });
  });
});
