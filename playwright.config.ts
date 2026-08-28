import type { ChromaticConfig } from '@chromatic-com/playwright';
import { defineConfig, devices } from '@playwright/test';

// Use process.env.PORT by default and fallback to port 3000
const PORT = process.env.PORT || 3000;

// Set webServer.url and use.baseURL with the location of the WebServer respecting the correct set port
const baseURL = `http://localhost:${PORT}`;

/** Fixed AES-256 key for the E2E tenant row. Not a secret — throwaway data. */
const E2E_ENCRYPTION_KEY = 'e2e0'.repeat(16);

// `webServer.env` reaches only the app under test. `global.setup.ts` runs in
// THIS process and encrypts the row, so both sides need the same key.
process.env.CONTROL_PLANE_ENCRYPTION_KEY = E2E_ENCRYPTION_KEY;
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig<ChromaticConfig>({
  testDir: './tests',
  // Look for files with the .spec.js or .e2e.js extension
  testMatch: '*.@(spec|e2e).?(c|m)[jt]s?(x)',
  // Timeout per test, test running locally are slower due to database connections with PGLite
  timeout: process.env.CI ? 45 * 1000 : 60 * 1000,
  // Fail the build on CI if you accidentally left test.only in the source code.
  forbidOnly: !!process.env.CI,
  // Retry failed tests once in CI to handle flaky network calls (Clerk API, etc.)
  retries: process.env.CI ? 1 : 0,
  // Limit parallel workers to avoid Clerk API rate limits (each file creates a user)
  workers: process.env.CI ? 2 : undefined,
  // Reporter to use. See https://playwright.dev/docs/test-reporters
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  expect: {
    // Set timeout for async expect matchers
    timeout: 20 * 1000,
  },

  // Run your local dev server before starting the tests:
  // https://playwright.dev/docs/test-advanced#launching-a-development-web-server-during-the-tests
  webServer: {
    command: process.env.CI ? 'npx run-p db-server:memory start' : 'npx run-p db-server:memory dev:next',
    url: baseURL,
    timeout: 2 * 60 * 1000,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_SENTRY_DISABLED: 'true',
      // E2E creates a throwaway Clerk org per run, and `resolveTenant` fails
      // closed on an unknown org. `global.setup.ts` therefore writes a real
      // `tenant` row for it — the same directory lookup production uses.
      //
      // The row is encrypted, so the app under test needs the SAME key the
      // setup process used. Fixed and obviously fake: E2E runs against a
      // throwaway database, and a random key per run would not survive the
      // process boundary between Playwright and `next start`.
      //
      // NOTE: the dev-only DEFAULT_TENANT_DATABASE_URL hatch cannot serve here
      // — CI runs `next start`, so NODE_ENV is production and
      // `defaultTenantRecord` correctly refuses to honour it.
      CONTROL_PLANE_ENCRYPTION_KEY: E2E_ENCRYPTION_KEY,
    },
  },

  // Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions.
  use: {
    // Use baseURL so to make navigations relative.
    // More information: https://playwright.dev/docs/api/class-testoptions#test-options-base-url
    baseURL,

    // Collect trace only on first retry. See https://playwright.dev/docs/trace-viewer
    trace: 'on-first-retry',

    // Video recording disabled — traces are sufficient for debugging failures.
    video: 'off',

    // Disable automatic screenshots at test completion when using Chromatic test fixture.
    disableAutoSnapshot: true,
  },

  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/, teardown: 'teardown' },
    { name: 'teardown', testMatch: /.*\.teardown\.ts/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Load authenticated session from setup
        storageState: '.playwright/auth.json',
      },
      dependencies: ['setup'],
    },
  ],
});
