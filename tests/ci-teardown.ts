import { cleanupCredentials, readCredentials } from './e2e-credentials';
import { cleanupOrphanedE2EUsers, deleteUserWithOrganization } from './TestUtils';

async function main() {
  try {
    const creds = readCredentials();
    process.env.E2E_CLERK_USER_USERNAME = creds.username;
    await deleteUserWithOrganization();
  } catch (error) {
    console.warn('Primary cleanup failed:', error);
  }

  try {
    await cleanupOrphanedE2EUsers();
  } catch (error) {
    console.warn('Orphan cleanup failed:', error);
  }

  cleanupCredentials();
}

main();
