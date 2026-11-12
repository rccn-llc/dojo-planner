/**
 * Running `org:create` with nobody at the terminal — the GitHub Actions job
 * started by a confirmed public sign-up.
 *
 * Two rules shape this module:
 *  1. A question the flags cannot answer is a FAILURE, never a default. The
 *     interactive defaults (e.g. "use these shell values? N") are safety stops;
 *     silently answering them would turn a stop into an approval.
 *  2. ⚠️ The repository is PUBLIC, so its Actions logs are too. In `--ci` every
 *     customer value is registered with GitHub's `::add-mask::` before it can
 *     be printed, child-script output is captured rather than streamed, and
 *     failure detail goes to the sign-up row in the control database — never
 *     to the log.
 */

import type { createPrompter } from './prompt';
import process from 'node:process';

export type Prompter = ReturnType<typeof createPrompter>;

export type OnboardFlags = {
  target?: 'production' | 'preview';
  slug?: string;
  name?: string;
  ownerEmail?: string;
  ownerName?: string;
  provider?: 'iqpro' | 'square' | 'skip';
  operator?: string;
  fromRequest?: string;
  attempt: number;
  connectionString?: string;
  dryRun: boolean;
  /** Fail instead of prompting. Implied by `--ci`. */
  nonInteractive: boolean;
  /** Configuration deliberately comes from the shell (CI secrets). Implied by `--ci`. */
  envFromShell: boolean;
  /** Public-log mode: mask, capture, and keep failure detail out of the log. */
  ci: boolean;
};

function valueOf(argv: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = argv.find(arg => arg.startsWith(prefix));
  return found === undefined ? undefined : found.slice(prefix.length);
}

export function parseOnboardFlags(argv: readonly string[] = process.argv): OnboardFlags {
  const has = (name: string) => argv.includes(`--${name}`);
  const target = valueOf(argv, 'target');
  if (target !== undefined && target !== 'production' && target !== 'preview') {
    throw new Error(`--target must be production or preview, not "${target}".`);
  }
  const provider = valueOf(argv, 'provider');
  if (provider !== undefined && provider !== 'iqpro' && provider !== 'square' && provider !== 'skip') {
    throw new Error(`--provider must be iqpro, square or skip, not "${provider}".`);
  }
  const attemptRaw = valueOf(argv, 'attempt');
  const attempt = attemptRaw === undefined ? 1 : Number(attemptRaw);
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error(`--attempt must be a positive integer, not "${attemptRaw}".`);
  }

  const ci = has('ci');
  return {
    target,
    slug: valueOf(argv, 'slug'),
    name: valueOf(argv, 'name'),
    ownerEmail: valueOf(argv, 'ownerEmail'),
    ownerName: valueOf(argv, 'ownerName'),
    provider,
    operator: valueOf(argv, 'operator'),
    fromRequest: valueOf(argv, 'fromRequest'),
    attempt,
    connectionString: valueOf(argv, 'connection-string'),
    dryRun: has('dry-run'),
    nonInteractive: ci || has('nonInteractive'),
    envFromShell: ci || has('envFromShell'),
    ci,
  };
}

export class MissingInputError extends Error {
  constructor(label: string) {
    super(`Missing input: ${label}. Pass it as a flag, set it in the environment, or run interactively.`);
    this.name = 'MissingInputError';
  }
}

/** A prompter for unattended runs: every question it is asked is an error. */
export function createFailingPrompter(): Prompter {
  const missing = (label: string): never => {
    throw new MissingInputError(label);
  };
  return {
    ask: async (question: string) => missing(question),
    askValid: async (question: string) => missing(question),
    confirm: async (question: string) => missing(question.trim()),
    choose: async (question: string) => missing(question),
    askSecret: async (question: string) => missing(question),
  } as Prompter;
}

/**
 * Register values with GitHub Actions so they print as `***` from here on,
 * including in child processes. Each non-empty value is masked as given and,
 * for a connection string, its user, password and host separately — a child
 * that prints only the host would otherwise leak it.
 */
export function maskForCi(
  enabled: boolean,
  values: ReadonlyArray<string | null | undefined>,
  write: (line: string) => void = line => process.stdout.write(line),
): void {
  if (!enabled) {
    return;
  }
  const seen = new Set<string>();
  const add = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    // Masking a one- or two-character value would blank out unrelated output.
    // A line break would end the command early (and could start another), so
    // such a value is skipped; `%` is escaped because GitHub decodes `%25`,
    // `%0D`, `%0A` in command values, and the mask must match the literal text.
    if (trimmed && trimmed.length >= 3 && !/[\r\n]/.test(trimmed) && !seen.has(trimmed)) {
      seen.add(trimmed);
      write(`::add-mask::${trimmed.replaceAll('%', '%25')}\n`);
    }
  };
  for (const value of values) {
    add(value);
    if (value && /^postgres(?:ql)?:\/\//.test(value)) {
      try {
        const url = new URL(value);
        add(decodeURIComponent(url.username));
        add(decodeURIComponent(url.password));
        add(url.hostname);
      } catch {
        // Not parseable — the whole value is already masked.
      }
    }
  }
}

/** `Jordan Rivera` → first `Jordan`, last `Rivera`; one word → first only. */
export function splitOwnerName(name: string): { firstName: string; lastName?: string } {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const space = trimmed.indexOf(' ');
  if (space === -1) {
    return { firstName: trimmed };
  }
  return { firstName: trimmed.slice(0, space), lastName: trimmed.slice(space + 1) };
}

/** Link to this GitHub Actions run, when running in one. */
export function githubRunUrl(env: Record<string, string | undefined> = process.env): string | null {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = env;
  return GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
    ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
    : null;
}
