# Public sign-up API (www.dojoplanner.com → app.dojoplanner.com)

A visitor fills in four fields on www.dojoplanner.com. The owner confirms by email, and a new organization is created automatically with no payment provider. The owner connects a payment provider on Location Settings after signing in.

A working sample form: [`signup-form-example.html`](./signup-form-example.html).

```
form ──POST /api/signup──► 202 { requestId, statusToken, statusUrl }   (confirmation email sent)
form ──GET statusUrl (poll)──► awaiting_confirmation → provisioning (step) → ready | failed | expired
owner clicks the emailed link → /signup/confirm → Confirm → GitHub job runs `org:create --fromRequest`
```

## 1. Submit — `POST https://app.dojoplanner.com/api/signup`

The visitor's browser sends this directly. Required headers:

| Header | Value |
|---|---|
| `Content-Type` | `application/json` (otherwise 415) |
| `Origin` | Set by the browser. Must be `https://www.dojoplanner.com` or `https://dojoplanner.com`; preview also accepts `http://localhost:3000` and `http://localhost:8080` |

The JSON body must be at most 4 KB:

```json
{
  "academyName": "Riverside Jiu-Jitsu",
  "ownerName": "Jordan Rivera",
  "ownerEmail": "jordan@example.com",
  "ownerPhone": "+1 (555) 010-0199",
  "website": ""
}
```

| Field | Rules (after trimming) |
|---|---|
| `academyName` | 2–120 characters, and must produce a usable web address (letters or digits). No links or markup (see below) |
| `ownerName` | 1–120 characters. Split at the first space into first and last name for the sign-in invitation. No links or markup (see below) |
| `ownerEmail` | A valid email address, at most 254 characters. Lowercased |
| `ownerPhone` | At most 40 characters, made of digits, spaces and `+ - ( ) .`, with 7–15 digits. Stored as typed |
| `website` | **Honeypot.** Render it hidden from people and always send it empty. Anything in it is treated as a bot: the response looks normal, but nothing is stored |

Every field must be a string. Unknown fields are ignored; their names (not their values) are logged, so a field-name mismatch shows up in the logs.

Both names are put into the confirmation email, which goes to whatever address was typed in. So they are refused (`invalid`) when they contain a link (`://`, `www.`, or a word shaped like a domain, such as `evil.com`), `<`, `>` or `@`, or invisible or direction-changing characters. Ordinary names such as `St. Louis BJJ` or `B.J.J. Club` are accepted.

The browser sends a CORS preflight (`OPTIONS`) first, because the body is JSON. It is answered with `204`.

### Responses

Every response is JSON and carries the CORS headers, errors included.

| Status | Body | What the form should do |
|---|---|---|
| 202 | `{ "requestId", "statusToken", "statusUrl" }` | Show "Check your email" and start polling `statusUrl` |
| 400 | `{ "error": "invalid_request", "fields": { "<field>": "required" \| "invalid" \| "too_long" } }` | Show the error under each named field |
| 400 | `{ "error": "invalid_json" }` | A bug in the form |
| 403 | `{ "error": "origin_not_allowed" }` | A bug, or the page is on a domain that isn't allowed |
| 413 / 415 | `payload_too_large` / `unsupported_media_type` | A bug in the form |
| 429 | `{ "error": "rate_limited" }` with a `Retry-After` header in seconds (exposed to the page) | "Too many attempts, try again in N minutes" |
| 503 | `{ "error": "unavailable" }` or `{ "error": "email_failed" }` | "Sign-up is temporarily unavailable" |

Limits:
- at most 5 submissions per IP address per 15 minutes;
- at most 3 requests, and 3 confirmation emails, per email address per 24 hours;
- at most 20 new sign-ups a day across everyone.

Resubmitting an email that hasn't confirmed yet updates that request and sends a fresh link. Earlier links stop working.

## 2. Status — `GET https://app.dojoplanner.com/api/signup/status?id=…&token=…`

Use `statusUrl` from the 202 response as-is. Poll every 4 seconds while the page is visible, slow down to every 15 seconds after 5 minutes, and stop after 30 minutes or at a final state. More than 30 polls a minute from one IP gets a 429.

```json
{ "state": "provisioning", "step": "database", "message": "Preparing your database" }
```

| `state` | `step` | Meaning |
|---|---|---|
| `awaiting_confirmation` | — | The owner hasn't clicked the email link yet |
| `provisioning` | `queued` → `organization` → `database` → `starter_data` → `invitation` | Setup is running. It usually takes a few minutes |
| `ready` | — | Done. The owner has an invitation email. `signInUrl` is included |
| `failed` | — | Setup failed, even after one automatic retry. The team has been alerted |
| `expired` | — | The confirmation link wasn't used within 48 hours. Submit the form again |

`message` is fixed, public wording that can be shown as-is (as text, never as HTML). It never contains the owner's email or the academy name: the status URL carries its token in the query string, which can end up in browser history and logs. An unknown id, a wrong token, and anything not shaped like an id and token the API issued all answer `404`.

Only follow `statusUrl` and `signInUrl` when they point at the app's own origin. The sample form checks this (`isAppUrl`).

## 3. Confirmation

The email links to `https://app.dojoplanner.com/signup/confirm?id=…&token=…`. That page shows a **Confirm** button. Opening the page does nothing on its own, because email scanners open links before the person does. Clicking Confirm starts the GitHub job, and the page then shows the same live status as the form.

The page moves the token out of the address bar into `sessionStorage` (this tab only) as soon as it loads, and sends no `Referer`. `POST /api/signup/confirm` is for that page only:
- it accepts `application/json` only, so another site cannot send it a "simple" cross-site POST that skips the CORS check;
- it refuses requests the browser marks as cross-site (`Sec-Fetch-Site`);
- it caps the body at 1 KB and allows 10 attempts per IP per minute;
- it accepts only a confirm token (`sc_…`); a status token cannot confirm.

## 4. Trying it with curl

```bash
# Preflight
curl -i -X OPTIONS https://<host>/api/signup -H 'Origin: https://www.dojoplanner.com' \
  -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type'

# Submit
curl -i -X POST https://<host>/api/signup -H 'Origin: https://www.dojoplanner.com' \
  -H 'Content-Type: application/json' \
  --data '{"academyName":"Riverside Jiu-Jitsu","ownerName":"Jordan Rivera","ownerEmail":"jordan@example.com","ownerPhone":"+1 555 010 0199","website":""}'

# Poll (statusUrl from the response)
curl -i '<statusUrl>' -H 'Origin: https://www.dojoplanner.com'
```

## 5. Operations

**Where it runs.** `POST /api/signup/confirm` dispatches the `.github/workflows/onboard-org.yml` job with **only the request id**, because `rccn-llc/dojo-planner` is a public repo and job inputs and logs are public. The job runs `npm run org:create -- --fromRequest=<id> --ci`. If that fails, it retries once (`--attempt=2`, which resumes where the first attempt stopped). If both fail, `markSignupFailed.ts` marks the request failed.

**Workflow hardening.**
- The workflow has no permissions by default, and the job has only `contents: read`.
- Secrets are given only to the steps that use them, so checkout, Node setup and `npm ci` (which runs dependency install scripts) never see them; the failure step gets only `CONTROL_DATABASE_URL`.
- Actions are pinned to commit SHAs, and Dependabot keeps the pins current.
- There is no dependency cache, because a cache entry is shared with other workflows.
- Both inputs are validated before anything runs.

`zizmor --persona=pedantic` reports no findings on this workflow.

**Public logs.** In `--ci` mode, every customer value is masked with `::add-mask::` before it can be printed. Child-script output is captured rather than printed, `showTenants` is skipped, and the detail of any failure goes only to `org_signup_request.last_error` in the control database.

**Configuration:**

| Where | Name | Notes |
|---|---|---|
| Vercel (Production, and optionally Preview) | `GITHUB_DISPATCH_TOKEN` | **The only new secret.** A fine-grained token with **Actions: Read and write** on `rccn-llc/dojo-planner` only. ⚠️ It expires (at most yearly). An expired or revoked token fails confirmations with "GitHub dispatch token rejected — renew GITHUB_DISPATCH_TOKEN" in the alert. Renew: create a new token, paste it into Vercel, redeploy. **Expiry date:** _record it here when created._ |
| Vercel | `CRON_SECRET`, `RESEND_API_KEY`, `CLERK_SECRET_KEY`, `CONTROL_DATABASE_URL` | Already set |
| GitHub environment `Production` (and `Preview`) | `CLERK_SECRET_KEY`, `CONTROL_DATABASE_URL`, `IQPRO_CONFIG_ENCRYPTION_KEY`, `VERCEL_TOKEN` | Existing values, copied from `.env.onboard.<target>` |
| GitHub environment | `NEON_API_KEY` | Existing value, copied from `.env.local` |
| GitHub environment **variable** (not a secret) | `ONBOARD_OPERATOR_USERNAME` | A dedicated Clerk service-account user that creates the org and is removed from it afterwards. Not a super admin |

Restrict the GitHub `Production` environment to deployments from `main`. Turn off Clerk's "Allow users to create organizations", so the only ways to create an org are this endpoint and the CLI.

**When a sign-up fails.** The app sends one Sentry event, `Sign-up failed: <academy>`, tagged `area: signup` and `signup_request_id: <id>`. The event carries the academy name, the error (`last_error`, with email addresses redacted) and the GitHub run link. It never carries the owner's email or phone; look those up in `org_signup_request` by the request id. Each failed request is its own Sentry issue.

To be notified, create an alert rule once in Sentry: **Alerts → Create Alert → Issues**, condition "A new issue is created", filter "The event's tags match `area` equals `signup`", action email or Slack. No key or variable is needed in the app. GitHub also emails the dispatch token's owner when a job fails, and Better Stack receives the `[Signup] Request failed` log line.

To recover, fix the cause, then choose **Re-run all jobs** on that GitHub run. The request goes back to `provisioning`, and the owner's form moves on to "Ready" by itself.

**Each failure is reported exactly once:**
- from a status poll that sees the failure;
- from the confirm endpoint (dispatch refused, no free slug);
- or from the daily sweep at `/api/cron/signup-alerts` (`vercel.json`; move it to hourly on a Vercel Pro plan), which also retries a report Sentry did not accept.

A request with no heartbeat for 15 minutes is marked failed.

**Database.** The `org_signup_request` table is in the control plane. Existing databases need `~/Desktop/signup-request-ddl/signup-request-forward.sql`, applied to the control database and every active tenant database (where it is an inert copy).
