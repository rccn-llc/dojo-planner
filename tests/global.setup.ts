import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { expect, test as setup } from '@playwright/test';

import { CONSENT_STORAGE_KEY, CONSENT_VERSION } from '@/libs/consent/constants';
import { writeCredentials } from './e2e-credentials';
import { cleanupOrphanedE2EUsers, createUserWithOrganization } from './TestUtils';

setup.describe.configure({ mode: 'serial' });

/** One per `auth.e2e.ts` spec that needs its own fresh, registered org. */
const AUTH_SPEC_USER_COUNT = 3;

setup('authenticate with Clerk', async ({ page }) => {
  await clerkSetup();

  // Clean up ALL orphaned e2e users from previous failed/interrupted runs
  // before creating the shared test user. This must run here (not in
  // createUserWithOrganization) because auth.e2e.ts also calls
  // createUserWithOrganization in parallel — a broad cleanup there would
  // delete the shared user that other tests depend on.
  await cleanupOrphanedE2EUsers();

  await createUserWithOrganization();

  const sharedUsername = process.env.E2E_CLERK_USER_USERNAME!;
  const sharedPassword = process.env.E2E_CLERK_USER_PASSWORD!;

  // `auth.e2e.ts` needs FRESH users whose orgs have a `tenant` row. Creating
  // them here is not a convenience — it is the only moment the row can be
  // written: pglite-server accepts ONE connection and the app under test holds
  // it for the rest of the run (idle timeout 5 min), so a mid-suite write has
  // no window at all.
  const authUsers: { username: string; password: string }[] = [];
  for (let i = 0; i < AUTH_SPEC_USER_COUNT; i++) {
    await createUserWithOrganization();
    authUsers.push({
      username: process.env.E2E_CLERK_USER_USERNAME!,
      password: process.env.E2E_CLERK_USER_PASSWORD!,
    });
  }

  // Restore the shared user: the sign-in below, and every other spec, uses it.
  process.env.E2E_CLERK_USER_USERNAME = sharedUsername;
  process.env.E2E_CLERK_USER_PASSWORD = sharedPassword;

  writeCredentials({
    username: sharedUsername,
    password: sharedPassword,
    authUsers,
  });

  // Sign in using email-based approach (uses signInTokens + ticket strategy
  // which is more reliable than password strategy for programmatic sign-in)
  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    emailAddress: process.env.E2E_CLERK_USER_USERNAME!,
  });

  // After sign-in, navigate to dashboard to verify auth works
  await page.goto('/dashboard');
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });

  await expect(page.getByRole('heading', { name: 'Performance' })).toBeVisible();

  // Record a cookie-consent decision so the banner does not render during the
  // suite. It is fixed to the bottom of the viewport, so on a fresh profile it
  // would cover controls at the end of the page and block clicks. The consent
  // UI has its own dedicated coverage in src/features/consent/.
  await page.evaluate(([key, version]) => {
    localStorage.setItem(key as string, JSON.stringify({
      version,
      timestamp: Date.now(),
      method: 'reject_all',
      categories: { necessary: true, functional: false, analytics: false },
    }));
  }, [CONSENT_STORAGE_KEY, CONSENT_VERSION] as const);

  await page.context().storageState({ path: '.playwright/auth.json' });
});
