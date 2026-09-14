# Privacy & Cookie Consent

How Dojo Planner asks for, records, and honours cookie consent — and, just as
importantly, the judgement calls behind it, so they are not silently reversed
later.

## Posture

**GDPR-strict opt-in, applied globally.** No geo-detection: every visitor gets
the same banner and the same defaults, whether they are in Berlin or Boise.
Non-essential vendors do not run until the visitor actively opts in.

**Reject is exactly as easy as Accept** — one click, same button variant, same
size, same row. This is an EDPB/CNIL requirement, not a style preference, and
there are tests in `src/features/consent/` asserting the two buttons keep
identical classes so a future redesign cannot quietly demote "Reject all".

**Consent is withdrawable at any time** (GDPR Art. 7(3)) from the public footer
and from the dashboard sidebar.

## Categories

| Category | Toggleable | Covers |
|---|---|---|
| **Strictly necessary** | No — shown disabled for transparency | Clerk session cookies (`__session`, `__client_uat`, `__clerk_*`), TokenEx/Square payment SDKs, `NEXT_LOCALE`, the consent record itself |
| **Functional** | Yes, default off | `sidebar_state`, next-themes `localStorage['theme']` |
| **Analytics** | Yes, default off | Sentry in full (errors, tracing, session replay, `sendDefaultPii`), Better Stack browser-side log shipping. Future PostHog/GA/Vercel |

### Cookie and storage inventory

| Name | Type | Vendor | Purpose | Category |
|---|---|---|---|---|
| `__session`, `__client_uat`, `__clerk_*` | Cookie | Clerk | Authentication and session | Necessary |
| `NEXT_LOCALE` | Cookie | next-intl | Serve the requested language | Necessary (see below) |
| `dojo-planner.consent.v1` | localStorage | First party | Remember this consent decision | Necessary |
| `sidebar_state` | Cookie | First party | Sidebar collapsed/expanded | Functional |
| `theme` | localStorage | next-themes | Light/dark preference | Functional (see below) |
| Sentry replay/tracing state | In-memory + network | Sentry | Error and performance monitoring | Analytics |

## Documented judgement calls

These are deliberate positions, each with the counter-argument stated. Revisit
them knowingly; do not "fix" them by accident.

### `NEXT_LOCALE` is treated as strictly necessary

next-intl's middleware sets it on every request, including on marketing pages
before any consent exists. Art. 29 WP194 and EDPB 05/2020 list language and
user-interface customisation cookies as exempt when they result from the user's
own choice.

*Counter-argument:* next-intl also sets it from `Accept-Language` negotiation,
not purely from an explicit pick, which weakens the exemption slightly.

*Why we accept it:* gating it would require reading a consent cookie inside
`src/proxy.ts` and would destabilise the locale/RPC routing that is already
delicate (see the `MALFORMED_ORPC_ERROR_RESPONSE` comments there). The cost to
every user outweighs the marginal legal benefit.

### next-themes writes `localStorage['theme']` before any consent check

It is classified functional but is **not** gated.

*Why:* gating it means giving up next-themes' flash-prevention script, so every
visitor — including consenting ones — would see a theme flash on each load, to
protect a self-set UI preference with no third party involved and nothing
transmitted anywhere. Disclosed here and in the preference centre instead.

### The `functional` toggle currently gates nothing

Both items in that category are exempt under the reasoning above, so turning it
off changes no behaviour today. The category exists for disclosure and so that
the next functional vendor is gated by default rather than retro-fitted.

*This is worth revisiting* if a genuinely optional functional vendor is added —
a toggle that claims to control something it does not is its own dark pattern.

### Server-side Sentry (`src/instrumentation.ts`) is ungated

Server-side error monitoring runs on our own infrastructure. It is not storage
on the visitor's terminal equipment and is therefore outside ePrivacy scope; it
is processed under legitimate interest (Art. 6(1)(f)). It also means server
errors, RPC failures, and webhook failures still report at 100%, which is the
safety net for the client-side telemetry we give up.

### Better Stack is gated in the browser only

`src/libs/Logger.ts` is imported by ~24 server modules and by two client
components. The guard lives inside `betterStackSink` and is scoped with
`typeof window !== 'undefined'`, so **server logging and the SOC2 audit trail
are never affected by a visitor's browser choice**. The check must stay inside
the sink (evaluated per record) rather than in the `remoteSinks` array, which is
evaluated once at module load before any decision can exist.

## What happens when consent is rejected

**Everything the user came for keeps working.** Auth, payments, locale routing,
theme, and every dashboard feature are unaffected.

**What stops:** Sentry never initialises — no error reports, no session replay,
no tracing, no `sendDefaultPii` — and browser-side Better Stack shipping is
suppressed.

**Operational consequence:** client-side Sentry volume will drop materially
(plausibly 40–80%, depending on accept rate). **This is expected, not an
outage.** Server-side Sentry is unaffected.

**Remembering the refusal.** Storing a record of a refusal is itself exempt
under ePrivacy Art. 5(3) — it is strictly necessary to honour the refusal
without re-asking on every page load. The record holds no identifier, no user
id, and nothing linkable: just `{version, timestamp, categories, method}`.

**If the browser blocks all storage.** Every read and write is individually
wrapped in `try/catch`, covering three distinct failure modes: Safari private
mode (`setItem` throws), Chrome "block all cookies" (reading `localStorage`
*itself* throws, which optional chaining does not catch), and Node/SSR (no
`localStorage` at all). The store degrades to an in-memory record, so the
choice holds for that page session and the banner returns on the next load.
Nothing throws and nothing white-screens.

**No nagging.** Once a decision is recorded the banner never returns, except on
a `CONSENT_VERSION` bump, on expiry, if the record is corrupt, or if the visitor
opens the preferences dialog themselves. There is deliberately no
"ask again in N days" path.

## Expiry and re-prompting

Decisions expire after ~6 months (`CONSENT_MAX_AGE_MS`), applying to refusals as
well as grants — that is the required re-solicitation cadence, not nagging.

**To re-prompt everyone** (e.g. after adding a vendor), bump `CONSENT_VERSION`
in `src/libs/consent/constants.ts`. That is the only supported way.

## Adding a new client-side vendor

1. Map it to a category (usually `analytics`) or add a new one in
   `src/libs/consent/types.ts`.
2. Gate its initialisation behind `hasConsent(...)` and subscribe to
   `subscribeToConsent` so it starts and stops without a reload. **Never call a
   vendor SDK's init at module scope.**
3. Bump `CONSENT_VERSION`.
4. Update the `CookieConsent` namespace in **all three** locale files, this
   document's inventory, and the privacy policy.

## Known limitation: Sentry teardown is partial

On withdrawal we stop Replay, flush what was captured while consent was valid,
then `Sentry.close()` the client. That stops **all transmission**, which is the
compliance-relevant behaviour.

Sentry v10 has no true teardown, though: the `fetch`/XHR/history patches its
integrations installed stay in place until the page is reloaded. They call into
a disabled client, so nothing leaves the browser. We deliberately do **not**
force a reload — it would destroy unsaved dashboard work for no privacy gain.

## Known pre-existing bug (out of scope)

`src/components/ui/sidebar/sidebar.tsx` writes the cookie `sidebar_state`, while
`src/utils/AppConfig.ts` declares `sidebarCookieName: 'sidebar:state'`. The
names do not match, so the server-side read never finds it and sidebar state
does not actually persist. The cookie **is** set, so it is disclosed above under
its real name. Fixing it is a behaviour change unrelated to consent and belongs
in its own commit. The cookie is also written with no `SameSite`/`Secure`
attribute — a separate hardening ticket.
