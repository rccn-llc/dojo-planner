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
    // Cap concurrency in CI. Browser-mode files each hold a Chromium page, and
    // with ~180 of them an unbounded worker pool sizes itself against the
    // HOST's core count while sharing the container's much smaller memory
    // budget — which is what silently kills the run.
    //
    // Set at the ROOT, not per project: vitest refuses projects that share a
    // `sequence.groupOrder` but differ in `maxWorkers`. Local dev is left
    // unbounded so the suite stays fast.
    ...(process.env.CI ? { maxWorkers: 2, minWorkers: 1 } : {}),
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
                // default 64MB /dev/shm is not enough for Chromium across this
                // many test files: it dies partway through with no output.
                // Writing shared memory to /tmp instead avoids the limit.
                //
                // ⚠️ The symptom is silent: vitest prints `RUN` and the
                // coverage banner, then the step fails with NO test output and
                // no summary. If you see that, it is the browser being killed,
                // not a failing assertion.
                args: [
                  '--disable-dev-shm-usage',
                  // Chromium otherwise sizes its heap against the HOST's
                  // memory, ignoring the container's smaller cgroup limit, and
                  // is OOM-killed once enough test files have accumulated.
                  '--js-flags=--max-old-space-size=2048',
                  // Trim per-tab overhead; these suites never need GPU,
                  // extensions or the sandbox (already unprivileged in CI).
                  '--disable-gpu',
                  '--disable-extensions',
                  '--no-sandbox',
                ],
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
