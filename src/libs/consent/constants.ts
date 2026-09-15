/**
 * Storage key for the visitor's consent decision.
 *
 * Namespaced so it can't collide with next-themes' bare `theme` key, and
 * version-suffixed so a future envelope schema can coexist during a rollout.
 * The `version` FIELD on the record tracks the policy version; this suffix
 * tracks the shape of the envelope itself.
 */
export const CONSENT_STORAGE_KEY = 'dojo-planner.consent.v1';

/**
 * Policy version. Bump this to invalidate every stored decision and re-prompt
 * the entire user base — this is the ONLY supported way to re-ask (e.g. when
 * adding a new vendor or category). See docs/PRIVACY-CONSENT.md.
 */
export const CONSENT_VERSION = 1;

/**
 * How long a decision stays valid before we must re-solicit.
 *
 * ~6 months. CNIL recommends re-soliciting at "appropriate intervals"; 6 months
 * is the commonly cited safe floor (13 months being the outer bound). Note this
 * applies to REFUSALS as well as grants — a refusal expiring and the banner
 * returning is the required re-solicitation cadence, not nagging.
 */
export const CONSENT_MAX_AGE_MS = 182 * 24 * 60 * 60 * 1000;

/**
 * Same-tab change notification.
 *
 * The native `storage` event fires ONLY in other tabs, by spec. This synthetic
 * window event covers the writing tab. It lives on `window` rather than in a
 * module-scope Set alone so that independent importers of the store (the Sentry
 * gate at module load vs. the React tree) stay in sync even if the bundler
 * splits them into separate chunks.
 */
export const CONSENT_EVENT = 'dojo-planner:consent-change';

/** Request to open the cookie-preferences dialog from anywhere in the app. */
export const CONSENT_OPEN_PREFS_EVENT = 'dojo-planner:open-cookie-preferences';

/**
 * How far ahead of "now" a stored timestamp may sit and still be honoured.
 *
 * A record dated in the future is not a valid decision: it is either a
 * malformed/tampered value or the residue of a device whose clock was wrong
 * when the visitor chose. Left unchecked it stays valid until
 * `timestamp + CONSENT_MAX_AGE_MS`, which after a clock correction can suppress
 * the banner for FAR longer than the six months the policy allows — a
 * compliance failure, since the re-solicitation cadence is the whole point of
 * the expiry.
 *
 * A small tolerance is still allowed rather than rejecting `timestamp > now`
 * outright: a couple of minutes of ordinary clock drift between the write and a
 * later read must not discard a decision the visitor genuinely made.
 */
export const CONSENT_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
