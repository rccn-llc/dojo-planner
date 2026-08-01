import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { loadEnv } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  optimizeDeps: {
    include: ['next-intl', '@radix-ui/react-tabs', 'recharts', 'next/link'],
  },
  test: {
    silent: true,
    reporters: process.env.CI ? ['dot'] : ['default'],
    coverage: {
      include: ['src/**/*'],
      exclude: ['src/**/*.stories.{js,jsx,ts,tsx}'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.{js,ts}'],
          exclude: ['src/hooks/**/*.test.ts'],
          environment: 'node',
          // Tests that `vi.mock('@/libs/DB')` without a factory resolve to
          // src/libs/__mocks__/DB.ts, which boots a real PGlite instance and
          // runs migrations in a top-level await. That import can exceed the
          // 5s default under CI contention — more so since pglite 0.5, which
          // ships a newer (slower to start) Postgres build.
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          include: ['**/*.test.tsx', 'src/hooks/**/*.test.ts'],
          setupFiles: ['./vitest.browser.setup.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: {
                // CI runs this suite inside the Playwright docker image via the
                // `docker://` action form, which cannot set --shm-size. Docker's
                // default 64MB /dev/shm is not enough for Chromium across 265
                // test files: it dies partway through with no output. Writing
                // shared memory to /tmp instead avoids the limit.
                args: ['--disable-dev-shm-usage'],
              },
            }),
            screenshotDirectory: 'vitest-test-results',
            instances: [
              { browser: 'chromium' },
            ],
          },
        },
      },
    ],
    env: {
      ...loadEnv('', process.cwd(), ''),
      BILLING_PLAN_ENV: 'test',
    },
  },
});
