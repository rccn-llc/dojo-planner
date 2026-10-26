import type { Page } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

import { E2E_FAILED_PAYMENT, loadSharedCredentials, navigateTo, signIn } from '../TestUtils';

/**
 * Failed recurring payments: what the webhooks record is visible in the
 * transactions list and on member detail, and the retry modal opens with the
 * charge to confirm.
 *
 * The rows are seeded by `global.setup.ts` (`seedFailedPaymentForE2E`) as the
 * webhooks would record them. CI runs a production build with no payment
 * provider, so these specs stop at the modal's confirm step; the approve /
 * decline outcomes are covered by RetryPaymentModal.test.tsx and
 * PaymentRetryService.test.ts, and locally by the seed-simulated members.
 */

const { pending, overdue, cardUpdated } = E2E_FAILED_PAYMENT;

async function openMember(page: Page, lastName: string) {
  await navigateTo(page, '/dashboard/members');
  await page.getByPlaceholder(/search members/i).fill(lastName);
  await page.getByText(lastName).first().click();
  await page.waitForURL(/\/dashboard\/members\/[^/]+\/edit/);
}

test.describe('Failed recurring payments', () => {
  test.beforeEach(async ({ page }) => {
    loadSharedCredentials();
    await setupClerkTestingToken({ page });
    await signIn(page);
  });

  test('transactions list labels a failed recurring charge with its IQPro attempt', async ({ page }) => {
    await navigateTo(page, '/dashboard/transactions');
    await page.getByPlaceholder(/search/i).fill(pending.lastName);

    await expect(page.getByText('Recurring · attempt 1/3').first()).toBeVisible();
    await expect(page.getByText('Declined').first()).toBeVisible();
  });

  test('the "Failed payments" filter shows unresolved declines', async ({ page }) => {
    await navigateTo(page, '/dashboard/transactions');
    await page.getByTestId('finances-status-filter').click();
    await page.getByRole('option', { name: 'Failed payments' }).click();

    await expect(page.getByText(`${overdue.firstName} ${overdue.lastName}`).first()).toBeVisible();
  });

  test('transaction detail shows the decline reason and opens the retry modal', async ({ page }) => {
    await navigateTo(page, '/dashboard/transactions');
    await page.getByPlaceholder(/search/i).fill(pending.lastName);
    await page.getByText(`${pending.firstName} ${pending.lastName}`).first().click();

    const detail = page.getByRole('dialog');

    await expect(detail.getByTestId('failure-reason')).toContainText(pending.reason);

    await detail.getByTestId('retry-payment-button').click();

    const retry = page.getByRole('dialog', { name: 'Retry payment' });

    await expect(retry).toBeVisible();
    // The confirm step: what will be charged, for whom, and why it failed.
    await expect(retry.getByText(/Total to charge/)).toBeVisible();
    await expect(retry.getByText('$103.75').first()).toBeVisible();
    await expect(retry.getByText(`Reason: ${pending.reason}`)).toBeVisible();

    await retry.getByRole('button', { name: 'Cancel' }).click();

    await expect(retry).toBeHidden();
  });

  test('member detail shows the overdue banner, the billing status, and a Retry action', async ({ page }) => {
    await openMember(page, overdue.lastName);

    const banner = page.getByTestId('past-due-banner');

    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Overdue — 3 declined attempts');
    await expect(banner.getByRole('button', { name: 'Retry payment' })).toBeVisible();
    await expect(page.getByText('Status', { exact: true })).toBeVisible();
    await expect(page.getByText('Declined').first()).toBeVisible();
  });

  test('member detail tells staff the member updated their card after the failure', async ({ page }) => {
    await openMember(page, cardUpdated.lastName);

    await expect(page.getByTestId('past-due-banner')).toContainText('Member updated their card on');
    await expect(page.getByTestId('payment-method-updated')).toContainText('at the payment provider (by member)');
  });
});
