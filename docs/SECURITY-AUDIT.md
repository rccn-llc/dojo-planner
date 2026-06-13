# Security Audit — Accepted `npm audit` Advisories

This document records the `npm audit` advisories that are **knowingly deferred**,
with the rationale for each. It exists so the recurring audit output on `npm install`
is a reviewed decision, not ignored noise.

**Review cadence:** re-check this file on each monthly Dependabot cycle. When an
upstream release makes a deferred advisory fixable without a downgrade, take the fix
and remove it from this list.

_Last reviewed: 2026-06-12 (after `npm audit fix` + targeted dev-tool bumps)._

## Summary

| Scope | Critical | High | Moderate | Status |
|-------|----------|------|----------|--------|
| **Production runtime** (`npm audit --omit=dev`) | 0 | 0 | 2 | All criticals/highs cleared ✅ |
| All (incl. dev/build tooling) | 4 | 17 | 4 | Residual = dev-only, deferred (below) |

The production runtime tree was fully remediated via in-range bumps
(`npm audit fix`, no `--force`): `@clerk/nextjs` → 6.39.5, `@orpc/*` → 1.14.6,
`drizzle-orm` → 0.45.2, `next` → 16.2.9, `jspdf` → 4.2.1. See git history.

## Deferred advisories and why

### 1. `esbuild` dev-server chain (the majority of residual high/critical)

**Packages:** `esbuild`, `@esbuild-kit/*`, `vite`, `@vitejs/plugin-react`,
`@vitest/*`, `vitest`, `storybook` + all `@storybook/*`, `eslint-plugin-storybook`,
`@chromatic-com/playwright`, `drizzle-kit`.

**Advisories:** GHSA-67mh-4wv8-2f99 (dev server accepts arbitrary requests),
GHSA-gv7w-rqvm-qjhr (Deno-module RCE via `NPM_CONFIG_REGISTRY`),
GHSA-g7r4-m6w7-qqqr (Windows dev-server file read), and the Vitest browser-mode
otelCarrier / UI-server advisories.

**Why deferred — not exploitable in our usage:**
- Every one of these is a **development-server / build-time** issue. `esbuild` is a
  build tool; it is **not** part of the production runtime bundle shipped to users.
- The vulnerable dev servers (Storybook, the Vitest UI, drizzle-kit) are run **locally
  by developers** or in **ephemeral CI containers** — never exposed to untrusted
  networks in production.
- **No non-downgrade fix exists.** `npm audit fix --force` proposes:
  - Storybook `10.x` → **8.6.18** (a two-major **downgrade** / regression),
  - `@chromatic-com/playwright` → **0.12.8** (reverting our deliberate 0.14.8 bump),
  - `drizzle-kit` → **0.19.1** (older than the installed latest **0.31.10**).
  We are already on the **latest stable** of Storybook (10.x), vitest (4.x), and
  drizzle-kit (0.31.10). The upstream toolchains have not yet shipped patched
  transitive `esbuild`/`vite` versions on those lines.

**Action when fixable:** when Storybook / vitest / drizzle-kit publish releases that
pull a patched `esbuild` (≥ the fixed line) on their current major, `npm audit fix`
(no force) will clear these — apply then.

### 2. `next` → `postcss` (2 production moderates)

**Advisory:** PostCSS XSS via unescaped `</style>` in CSS stringify output
(transitive under `next`).

**Why deferred:** the only `fixAvailable` is a **downgrade of `next` to 9.3.3** — a
catastrophic major regression off Next.js 16. The vector (CSS stringify XSS) is not
reachable through our usage (we author CSS via Tailwind, not by stringifying
untrusted PostCSS ASTs). Wait for a Next.js patch that bumps the bundled PostCSS.

## What was fixed (for the record)

- **All production-runtime criticals/highs** — via in-range `npm audit fix`.
- **`@lingual/i18n-check`** 0.8.19 → 0.9.5 (clears its `i18next-parser`/esbuild chain).
- **`@chromatic-com/playwright`** 0.12.8 → 0.14.8 (drops a nested Storybook-8 addon tree).
- **`vitest` / `@vitest/*`** bumped in-range by `npm audit fix`.

## CI policy

The CI audit step (`.github/workflows/CI.yml`) intentionally runs
`npm audit --audit-level=critical || true` (non-blocking). The deferred items above
are the reason it does not fail the pipeline. This file is the auditable record of
*why* each residual advisory is accepted, in lieu of a blocking gate.
