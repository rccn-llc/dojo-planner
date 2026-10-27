/**
 * Run an existing ops script as a child process with an EXPLICIT environment.
 *
 * The child does not inherit the operator's shell wholesale. The scripts call
 * `loadEnvFiles()`, which fills any variable NOT already set from `.env.local`
 * and `.env` — where the dev encryption key and a localhost `DATABASE_URL`
 * live. Passing every variable that matters, and nothing incidental, means a
 * production run can never quietly pick up a development value. It also keeps
 * stray `IQPRO_*` platform credentials away from `seed.ts`, whose presence
 * would otherwise make it attempt a REAL SaaS subscription.
 */

import type { Buffer } from 'node:buffer';
import type { SpawnSyncReturns } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

/** Process plumbing the child needs to run at all — never configuration. */
const PASSTHROUGH = ['PATH', 'HOME', 'USER', 'SHELL', 'TMPDIR', 'TERM', 'LANG', 'NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS'];

export type ChildEnv = Record<string, string>;

export function buildChildEnv(
  vars: Record<string, string | undefined>,
  base: Record<string, string | undefined> = process.env,
): ChildEnv {
  const env: ChildEnv = {};
  for (const key of PASSTHROUGH) {
    const value = base[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
}

type Spawn = (command: string, args: string[], options: { stdio: 'inherit'; env: ChildEnv }) => Pick<SpawnSyncReturns<Buffer>, 'status'>;

const defaultSpawn: Spawn = (command, args, options) =>
  spawnSync(command, args, { ...options, env: options.env as NodeJS.ProcessEnv });

export function runScript(
  label: string,
  script: string,
  args: string[],
  env: ChildEnv,
  spawn: Spawn = defaultSpawn,
): void {
  console.info(`\n──── ${label} ────`);
  const result = spawn('npx', ['tsx', script, ...args], { stdio: 'inherit', env });
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status ?? 'signal'}).`);
  }
}
