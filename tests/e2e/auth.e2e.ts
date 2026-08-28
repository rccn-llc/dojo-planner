import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { faker } from '@faker-js/faker';
import { expect, test } from '@playwright/test';

import { readCredentials } from '../e2e-credentials';
import { deleteUserWithOrganization, signIn } from '../TestUtils';

/**
 * Users created at SETUP time, each with its own registered organization.
 *
 * These specs cannot create their own: a `tenant` row is only writable before
 * the app under test starts, because pglite-server accepts ONE connection and
 * the app holds it for the whole run.
 */
function authUser(index: number): { username: string; password: string } {
  const users = readCredentials().authUsers ?? [];
  const user = users[index];
  if (!user) {
    throw new Error(
      `global.setup.ts did not pre-create auth user ${index}. `
      + 'Raise AUTH_SPEC_USER_COUNT if a spec was added.',
    );
  }
  return user;
}

/** Point the Clerk helpers at one of the pre-created users. */
function selectAuthUser(index: number): void {
  const { username, password } = authUser(index);
  process.env.E2E_CLERK_USER_USERNAME = username;
  process.env.E2E_CLERK_USER_PASSWORD = password;
}

// Auth tests create their own users — clear the global storageState
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication', () => {
  test.describe('Sign Up Flow', () => {
    test.afterEach(async () => {
      await deleteUserWithOrganization();
    });

    test('should create user and organization via API and access dashboard', async ({ page }) => {
      selectAuthUser(0);

      await setupClerkTestingToken({ page });
      await signIn(page);

      await expect(page.getByRole('heading', { name: 'Performance' })).toBeVisible();

      await expect(page).toHaveURL(/\/dashboard/);
    });
  });

  test.describe('Sign In Flow', () => {
    test.beforeAll(() => {
      selectAuthUser(1);
    });

    test.afterAll(async () => {
      await deleteUserWithOrganization();
    });

    test('should sign in with valid credentials', async ({ page }) => {
      await setupClerkTestingToken({ page });
      await signIn(page);

      await expect(page).toHaveURL(/\/dashboard/);

      await expect(page.getByRole('heading', { name: 'Performance' })).toBeVisible();
    });
  });

  test.describe('Organization Switching', () => {
    let secondOrgName: string;

    test.beforeAll(async () => {
      selectAuthUser(2);

      // Create a second org via API so the switcher has multiple options
      const { createClerkClient } = await import('@clerk/backend');
      const authClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
      const { data: users } = await authClient.users.getUserList({
        emailAddress: [process.env.E2E_CLERK_USER_USERNAME!],
      });
      secondOrgName = faker.company.name();
      await authClient.organizations.createOrganization({
        name: secondOrgName,
        createdBy: users[0]!.id,
      });
    });

    test.afterAll(async () => {
      await deleteUserWithOrganization();
    });

    test('should switch to a different organization', async ({ page }) => {
      await setupClerkTestingToken({ page });
      await signIn(page);

      // Open the custom org selector
      const orgSwitcher = page.getByLabel('Open organization switcher');

      await expect(orgSwitcher).toBeVisible();

      await orgSwitcher.click();

      // Select the second organization
      await page.getByRole('option', { name: secondOrgName }).click();

      // Verify the switcher now shows the second org name
      await expect(orgSwitcher).toContainText(secondOrgName, { timeout: 10000 });
    });
  });
});
