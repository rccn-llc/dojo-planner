import type { ChromaticConfig } from '@chromatic-com/playwright';
import { defineConfig, devices } from '@playwright/test';

// Use process.env.PORT by default and fallback to port 3000
const PORT = process.env.PORT || 3000;

// Set webServer.url and use.baseURL with the location of the WebServer respecting the correct set port
const baseURL = `http://localhost:${PORT}`;

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
      // E2E creates a throwaway Clerk org per run and never writes a `tenant`
      // row for it. Auto-registration used to cover that implicitly; now that
      // an unprovisioned org fails closed, the tests need the local escape
      // hatch to resolve explicitly. `defaultTenantRecord` refuses to honour
      // this when NODE_ENV is production, so it cannot leak into real routing.
      DEFAULT_TENANT_DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
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
