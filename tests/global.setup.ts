import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { expect, test as setup } from '@playwright/test';

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

  await page.context().storageState({ path: '.playwright/auth.json' });
});
