import type { Page } from '@playwright/test';
import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { createClerkClient } from '@clerk/backend';
import { clerk } from '@clerk/testing/playwright';
import { faker } from '@faker-js/faker';
import { expect } from '@playwright/test';
import { Pool } from 'pg';
import { encryptConnectionString } from '@/libs/TenantCrypto';

import { readCredentials } from './e2e-credentials';

export const loadSharedCredentials = () => {
  const creds = readCredentials();
  process.env.E2E_CLERK_USER_USERNAME = creds.username;
  process.env.E2E_CLERK_USER_PASSWORD = creds.password;
};

export const cleanupOrphanedE2EUsers = async () => {
  const authClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

  // Search for all users with e2e test email pattern
  const { data: users } = await authClient.users.getUserList({
    query: 'e2e_',
    limit: 100,
  });

  // Filter to only e2e test users (match the exact pattern)
  const e2eUsers = users.filter(user =>
    user.emailAddresses.some(email =>
      /^e2e_[a-z0-9]+\+clerk_test@example\.com$/.test(email.emailAddress),
    ),
  );

  for (const user of e2eUsers) {
    try {
      const { data: orgs } = await authClient.users.getOrganizationMembershipList({
        userId: user.id,
      });
      for (const org of orgs) {
        await authClient.organizations.deleteOrganization(org.organization.id);
      }
      await authClient.users.deleteUser(user.id);
    } catch (error) {
      console.warn(`Failed to cleanup orphaned user ${user.id}:`, error);
    }
  }
};

/**
 * Write the `tenant` directory row for the throwaway E2E organization.
 *
 * E2E creates a fresh Clerk org per run. `resolveTenant` fails closed on an
 * unknown org — deliberately, because an organization is provisioned before
 * anyone can sign in — so without a row every dashboard request 409s.
 *
 * This used to be covered implicitly by auto-registration. Writing the row
 * explicitly is the more faithful test: it exercises the same directory lookup
 * production uses, rather than a dev-only escape hatch that `NODE_ENV`
 * disables in CI anyway (CI runs `next start`).
 */
export const registerTenantForE2E = async (orgId: string): Promise<boolean> => {
  const connectionString = process.env.DATABASE_URL;
  const keyHex = process.env.CONTROL_PLANE_ENCRYPTION_KEY ?? process.env.IQPRO_CONFIG_ENCRYPTION_KEY;

  if (!connectionString || !keyHex) {
    throw new Error(
      'E2E needs DATABASE_URL and an encryption key to register its test tenant.\n'
      + 'Both are set in playwright.config.ts; check that block if this fires.',
    );
  }

  const encrypted = encryptConnectionString(connectionString, Buffer.from(keyHex, 'hex'));

  // ⚠️ pglite-server accepts exactly ONE connection, and once the app under
  // test is serving it holds that connection for the whole run. A write from
  // THIS process therefore succeeds only before the web server starts —
  // `global.setup.ts` — and fails permanently mid-suite. Retrying does not
  // help; there is no window.
  //
  // So: best-effort. The setup-time call (the shared org every other spec
  // uses) succeeds. A mid-suite call cannot, and the caller is told rather
  // than the failure being silently swallowed.
  const pool = new Pool({ connectionString, max: 1 });

  try {
    await pool.query(
      `INSERT INTO tenant (org_id, display_name, connection_string_enc, region, status, schema_version)
       VALUES ($1, $2, $3, 'local', 'active', '0000_baseline')
       ON CONFLICT (org_id) DO UPDATE
         SET connection_string_enc = EXCLUDED.connection_string_enc, status = 'active'`,
      [orgId, 'E2E test tenant', encrypted],
    );
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
};

export const createUserWithOrganization = async () => {
  const slug = faker.string.alphanumeric(10).toLowerCase();
  process.env.E2E_CLERK_USER_USERNAME = `e2e_${slug}+clerk_test@example.com`;
  process.env.E2E_CLERK_USER_PASSWORD = 'password+clerk_test';

  const authClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

  // Clean up any orphaned user from a previous failed run (narrow: only this email)
  const { data: existing } = await authClient.users.getUserList({
    emailAddress: [process.env.E2E_CLERK_USER_USERNAME],
  });
  for (const user of existing) {
    const { data: orgs } = await authClient.users.getOrganizationMembershipList({ userId: user.id });
    for (const org of orgs) {
      await authClient.organizations.deleteOrganization(org.organization.id);
    }
    await authClient.users.deleteUser(user.id);
  }

  // Create user via Backend API (faster and immune to UI changes)
  const user = await authClient.users.createUser({
    emailAddress: [process.env.E2E_CLERK_USER_USERNAME],
    password: process.env.E2E_CLERK_USER_PASSWORD,
    username: `e2e_${slug}`,
    skipPasswordChecks: true,
  });

  // Create organization and add user as admin
  const organization = await authClient.organizations.createOrganization({
    name: faker.company.name(),
    createdBy: user.id,
  });

  // The org must exist in the tenant directory before any dashboard request,
  // or `resolveTenant` fails closed with a 409. Returns false when the app is
  // already holding pglite's single connection — see registerTenantForE2E.
  const registered = await registerTenantForE2E(organization.id);

  return { orgId: organization.id, registered };
};

export const deleteUserWithOrganization = async () => {
  assert(process.env.E2E_CLERK_USER_USERNAME, 'E2E_CLERK_USER_USERNAME is not set');

  const authClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
  const { data } = await authClient.users.getUserList({
    emailAddress: [process.env.E2E_CLERK_USER_USERNAME],
  });

  assert(data[0] !== undefined, 'User not found');

  const { data: orgMemList } = await authClient.users.getOrganizationMembershipList({
    userId: data[0].id,
  });

  for (const orgMem of orgMemList) {
    await authClient.organizations.deleteOrganization(orgMem.organization.id);
  }

  await authClient.users.deleteUser(data[0].id);
};

export const signIn = async (page: Page) => {
  // Try navigating to dashboard first — if storageState has a valid
  // session (from global setup), this will work immediately.
  await page.goto('/dashboard');

  // If we ended up on /sign-in, the session is stale or this test
  // created its own user (e.g. auth.e2e.ts). Sign in programmatically
  // using Clerk's email-based approach (signInTokens + ticket strategy).
  if (page.url().includes('/sign-in')) {
    await clerk.signIn({
      page,
      emailAddress: process.env.E2E_CLERK_USER_USERNAME!,
    });
    try {
      await page.goto('/dashboard');
    } catch {
      // Retry once on NS_BINDING_ABORTED (Firefox frame detach during navigation)
      await page.goto('/dashboard');
    }
  }

  await page.waitForLoadState('domcontentloaded');
};

export const navigateTo = async (page: Page, path: string) => {
  try {
    await page.goto(path);
  } catch {
    // Retry once on net::ERR_ABORTED (transient navigation abort)
    await page.goto(path);
  }
  await page.waitForLoadState('domcontentloaded');
};

export const expectToast = async (page: Page, text: string | RegExp) => {
  await expect(page.getByText(text)).toBeVisible({ timeout: 10000 });
};

export const createProgramViaUI = async (page: Page, name: string, description: string) => {
  await navigateTo(page, '/dashboard/programs');
  await page.getByRole('button', { name: /add new program/i }).click();

  await expect(page.getByRole('heading', { name: /add program/i })).toBeVisible();

  await page.getByLabel(/program name/i).fill(name);
  await page.getByLabel(/description/i).fill(description);
  await page.getByRole('button', { name: /add program/i }).click();
  await page.waitForLoadState('domcontentloaded');
};
