import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * Load `.env.local` then `.env` into `process.env` for ops scripts.
 *
 * ── Why scripts do not use `@/libs/Env` ─────────────────────────────────────
 *
 * `Env` validates the WHOLE application environment at import time — Clerk,
 * Stripe, BILLING_PLAN_ENV, the public keys. An operator pointing a script at a
 * remote database has no reason to hold any of that, and requiring it turns a
 * two-variable job into a full app config. This was a real failure: the B3
 * backfill script could not run against production for exactly that reason.
 *
 * ── Precedence ──────────────────────────────────────────────────────────────
 *
 * A real environment variable ALWAYS wins over a file. That is what lets
 * `DATABASE_URL=... npx tsx script.ts` target a different database than
 * `.env.local` names, which is how these scripts are normally run against
 * preview and production.
 */
export function loadEnvFiles(): void {
  for (const file of ['.env.local', '.env']) {
    const full = path.join(process.cwd(), file);
    if (!existsSync(full)) {
      continue;
    }
    for (const rawLine of readFileSync(full, 'utf8').split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) {
        continue;
      }
      const key = line.slice(0, eqIdx).trim();
      // Environment wins — see the precedence note above.
      if (process.env[key] !== undefined) {
        continue;
      }
      let value = line.slice(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

/**
 * Read a `--name=value` CLI argument.
 *
 * ⚠️ Do NOT reimplement this as `.split('=')[1]`. A connection string carries
 * query parameters — `?sslmode=require&channel_binding=require` — so splitting
 * on the FIRST `=` truncates it to `postgres://…?sslmode`, silently dropping
 * SSL. Against Neon that surfaces as a confusing `connection is insecure`
 * error pointing at the wrong thing; against a permissive server it would
 * connect UNENCRYPTED instead.
 */
export function argValue(name: string): string | undefined {
  return process.argv.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

/**
 * Host of a connection string, for logging. NEVER the credentials.
 *
 * Lived in three ops scripts as identical private copies. Which database a
 * command is about to touch is the single most important thing it prints, so
 * it should not be three implementations one edit away from disagreeing.
 */
export function hostOf(connectionString: string): string {
  try {
    return new URL(connectionString).host;
  } catch {
    return '(unparseable connection string)';
  }
}
