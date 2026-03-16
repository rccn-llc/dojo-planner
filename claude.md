# Dojo Planner - Claude Context

## Project Overview

**Dojo Planner** is a full-stack SaaS application for managing martial arts dojos - handling classes, members, billing, and business operations.

**Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS + Drizzle ORM + PostgreSQL + Clerk Auth + Stripe

## Directory Structure

```
src/
├── app/                    # Next.js App Router
│   ├── [locale]/          # i18n routing (next-intl)
│   │   ├── (auth)/        # Protected routes (ClerkProvider)
│   │   │   ├── (center)/  # Centered layouts (sign-in/sign-up)
│   │   │   └── dashboard/ # Main app routes
│   │   ├── (marketing)/   # Public landing page
│   │   ├── api/           # REST API endpoints
│   │   ├── rpc/           # ORPC endpoint
│   │   └── webhook/       # Stripe webhooks
│   ├── global-error.tsx   # Sentry error boundary
│   ├── robots.ts          # SEO robots.txt
│   └── sitemap.ts         # SEO sitemap
│
├── features/              # Feature modules (domain logic + UI)
│   ├── auth/              # Authentication
│   ├── billing/           # Stripe subscriptions
│   ├── catalog/           # Product catalog (merchandise, event access)
│   ├── classes/           # Class scheduling
│   ├── dashboard/         # Analytics views
│   ├── finances/          # Transaction tracking
│   ├── marketing/         # Coupons/promos
│   ├── members/           # Member management (wizard, conversion, details)
│   ├── memberships/       # Membership plans
│   ├── programs/          # Training programs
│   ├── reports/           # Analytics/reporting
│   ├── roles/             # RBAC
│   ├── settings/          # Org settings
│   ├── staff/             # Staff management
│   └── waivers/           # Waiver templates & signing
│
├── routers/               # ORPC API handlers
│   ├── AuthGuards.ts      # Auth middleware with role hierarchy
│   ├── Catalog.ts         # Catalog items, variants, categories, images
│   ├── Member.ts          # Member CRUD, family linking/unlinking, HOH search, member type conversion, confirmation email
│   ├── Members.ts         # Members list ops
│   ├── Classes.ts         # Classes list & tags
│   ├── Events.ts          # Events list
│   ├── Tags.ts            # Tags (class, membership, all)
│   ├── Coupons.ts         # Coupons list & active
│   ├── Transactions.ts    # Transaction listing with filters
│   ├── Dashboard.ts       # Membership stats, financial stats, chart data
│   ├── Reports.ts         # Report values, chart data, dynamic insights
│   ├── Payment.ts         # Payment processing (one-time + autopay subscriptions) + payment method registration (no charge)
│   ├── SaasSubscription.ts # Org SaaS billing (getCurrentPlan, subscribe, changePlan, cancel, getBillingHistory, getTokenizationConfig)
│   └── Waivers.ts         # Waiver templates, signing, versioning, membership associations, merge fields
│
├── services/              # Business logic layer
│   ├── BillingService.ts  # Stripe integration
│   ├── CatalogService.ts  # Catalog items, variants, categories, images
│   ├── ClassesService.ts  # Class & schedule queries
│   ├── ClerkRolesService.ts # Clerk Backend API
│   ├── CouponsService.ts  # Coupon queries
│   ├── EventsService.ts   # Event queries
│   ├── MembersService.ts  # Member operations
│   ├── OrganizationService.ts # Org & Stripe customer storage
│   ├── TagsService.ts     # Tag queries with usage counts
│   ├── TransactionsService.ts # Transaction listing with member joins
│   ├── DashboardService.ts # Membership stats, financial stats, member average & earnings chart data
│   ├── ReportsService.ts  # Report current values, chart data, dynamically computed insights
│   ├── WaiversService.ts  # Waiver template CRUD, versioning, signed waivers, merge fields, placeholder resolution
│   ├── WaiverPdfService.ts # On-demand PDF generation for signed waivers (client Blob + server Buffer)
│   ├── EmailService.ts    # Resend email integration with PDF attachment support
│   ├── PaymentProviderService.ts # Payment provider abstraction (interface + factory)
│   ├── IQProPaymentService.ts # IQPro implementation of payment provider
│   ├── MemberPaymentService.ts # Member payment orchestration (customer → method → charge/subscription) + registerPaymentMethod (no charge)
│   └── SaasSubscriptionService.ts # Org-level SaaS billing via IQPro (subscribe, change plan, cancel, billing history, super admin auto-grant)
│
├── models/
│   └── Schema.ts          # Drizzle ORM tables (25+ tables)
│
├── components/ui/         # Shadcn UI components (37+)
├── templates/             # Page templates & cards (34)
├── hooks/                 # React hooks (22+)
├── libs/                  # Core utilities
│   ├── DB.ts              # Database client
│   ├── Env.ts             # Environment validation (t3-oss)
│   ├── I18n.ts            # i18n configuration
│   ├── I18nRouting.ts     # Locale routing
│   ├── Logger.ts          # Better Stack logging
│   ├── Orpc.ts            # RPC client setup
│   ├── Stripe.ts          # Stripe client
│   └── IQPro.ts           # IQPro payment client singleton + gateway processor lookup
├── utils/                 # Helper functions
│   ├── AppConfig.ts       # Pricing plans, Clerk locales
│   ├── Auth.ts            # Page-level auth helpers
│   ├── SaasPlans.ts       # SaaS plan configuration (Basic/Growth/Enterprise pricing, features)
│   └── SuperAdmins.ts     # Super admin username list and helper
├── validations/           # Zod schemas
├── types/                 # TypeScript types
│   └── Auth.ts            # Role definitions (ORG_ROLE)
├── locales/               # i18n translations
└── constants/             # App constants

tests/                     # E2E tests (Playwright)
├── e2e/                   # E2E spec files (*.e2e.ts)
├── fixtures.ts            # Test fixtures
├── global.setup.ts        # Clerk auth setup
├── global.teardown.ts     # Cleanup
└── TestUtils.ts           # Test helpers

migrations/                # Drizzle migrations
docs/                      # Documentation
.storybook/                # Storybook config
```

## Routing (Next.js App Router)

### Route Groups

| Group | Purpose |
|-------|---------|
| `(auth)` | Protected routes with ClerkProvider |
| `(center)` | Centered layout for auth pages |
| `(marketing)` | Public landing page |

### Dashboard Routes

| Route | File | Purpose |
|-------|------|---------|
| `/dashboard` | `dashboard/page.tsx` | Main dashboard |
| `/dashboard/members` | `members/page.tsx` | Members list |
| `/dashboard/members/[memberId]` | `members/[memberId]/page.tsx` | Member detail |
| `/dashboard/members/[memberId]/edit` | `members/[memberId]/edit/page.tsx` | Edit member — contact info, membership details (actual dates), signed waivers with version, billing |
| `/dashboard/classes` | `classes/page.tsx` | Classes list |
| `/dashboard/classes/[classId]` | `classes/[classId]/page.tsx` | Class detail |
| `/dashboard/programs` | `programs/page.tsx` | Programs list |
| `/dashboard/memberships` | `memberships/page.tsx` | Memberships list |
| `/dashboard/memberships/[membershipId]` | `memberships/[membershipId]/page.tsx` | Membership detail |
| `/dashboard/staff` | `staff/page.tsx` | Staff list |
| `/dashboard/roles` | `roles/page.tsx` | Role management |
| `/dashboard/billing` | `billing/page.tsx` | Billing overview |
| `/dashboard/billing/portal` | `billing/portal/route.ts` | Stripe portal redirect |
| `/dashboard/billing/checkout/[planId]` | `billing/checkout/[planId]/route.ts` | Stripe checkout |
| `/dashboard/transactions` | `transactions/page.tsx` | Finances |
| `/dashboard/reports` | `reports/page.tsx` | Reports |
| `/dashboard/marketing` | `marketing/page.tsx` | Marketing tools |
| `/dashboard/catalog` | `catalog/page.tsx` | Product catalog |
| `/dashboard/waivers` | `waivers/page.tsx` | Waiver templates list |
| `/dashboard/user-profile` | `user-profile/[[...user-profile]]/page.tsx` | Clerk UserProfile |
| `/dashboard/organization-profile` | `organization-profile/[[...organization-profile]]/page.tsx` | Clerk OrgProfile |
| `/dashboard/subscription` | `subscription/page.tsx` | SaaS subscription management |
| `/dashboard/subscription-expired` | `subscription-expired/page.tsx` | Subscription expired — re-subscribe prompt |
| `/dashboard/preferences` | `preferences/page.tsx` | User preferences |
| `/dashboard/security` | `security/page.tsx` | Security settings |

### Auth Routes

| Route | Purpose |
|-------|---------|
| `/sign-in/[[...sign-in]]` | Clerk SignIn component |
| `/sign-up/[[...sign-up]]` | Clerk SignUp component |
| `/onboarding/organization-selection` | Organization picker |

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/rpc/[[...rest]]` | ALL | ORPC handler |
| `/webhook/billing` | POST | Stripe webhooks |
| `/webhook/iqpro` | POST | IQPro payment webhooks |
| `/api/organization/[orgId]/subscription` | GET | Subscription details |

### Layout Hierarchy

```
RootLayout (theme, i18n, migrations)
└── AuthLayout (ClerkProvider)
    ├── CenterLayout (sign-in/sign-up)
    └── DashboardLayout (sidebar, nav)
```

## Key Workflows

### Add Member Wizard

The Add Member flow is a multi-step modal wizard (`AddMemberModal.tsx`) using the `useAddMemberWizard` hook for state management. The wizard supports three member types with conditional step routing.

**Steps (Individual / Head of Household):**
1. **Member Type** — Select member type (individual, family-member, head-of-household)
2. **Details** — Name, email, phone, date of birth (required), address
3. **Photo** — Optional member photo upload
4. **Subscription** — Choose membership plan (HOH only: optional — "Skip for now" button available)
5. **Waiver** — Sign applicable waiver(s) for the selected membership plan (auto-skipped if none required or if HOH skipped membership)
6. **Payment** — Payment information (HOH sees a notice about future family member billing). If HOH skipped membership: "capture only" mode — saves card on file with no charge, shows info alert about future use
7. **Success** — Confirmation + email sent

**HOH Skip Membership Flow:** When a HOH clicks "Skip for now" on the subscription step, `membershipSkipped` is set to `true`, all membership fields are cleared, the waiver step auto-skips (no plan = no waivers), and the payment step enters "capture only" mode. This calls `payment.registerPaymentMethod` instead of `payment.process` — it creates/finds the IQPro customer and saves the payment method without processing a charge. The saved card can be used later for family member billing or when the HOH adds a membership.

**Steps (Family Member):**
1. **Member Type** — Select family-member
2. **Details** — Name, email, phone, date of birth, address
3. **Photo** — Optional member photo upload
4. **Subscription** — Choose membership plan
5. **Waiver** — Sign applicable waiver(s)
6. **HOH Selection** — Search and select a Head of Household (fetches their payment methods)
7. **Family Payment** — Uses HOH's card on file or collects new payment details as fallback
8. **Success** — Confirmation + email sent

**After member creation:** A confirmation email is sent via Resend with the signed waiver PDF attached (fire-and-forget, doesn't block wizard).

**Key Files:**
- `src/features/members/wizard/AddMemberModal.tsx` — Wizard orchestrator, handles member + signed waiver creation, family member linking, email sending, HOH capture-only payment
- `src/features/members/wizard/HOHSelectionStep.tsx` — Search/select HOH, fetch payment methods
- `src/features/members/wizard/FamilyPaymentStep.tsx` — HOH card confirmation or fallback payment form
- `src/features/members/wizard/MemberPaymentStep.tsx` — Payment form with HOH billing notice + `captureOnly` mode for HOH skip membership
- `src/features/members/wizard/MemberMembershipStep.tsx` — Membership plan selection with "Skip for now" button for HOH
- `src/features/members/wizard/MemberWaiverStep.tsx` — Fetches waivers for membership, resolves merge field placeholders, captures signature
- `src/features/waivers/signing/SignatureCanvas.tsx` — Reusable signature capture (react-signature-canvas, supports mouse + touch)
- `src/hooks/useAddMemberWizard.ts` — Wizard state management hook with `getStepsForMemberType()` for conditional routing + HOH data fields + `membershipSkipped` flag
- `src/services/WaiverPdfService.ts` — PDF generation: client-side Blob (`generateWaiverPdf`) + server-side Buffer (`generateWaiverPdfBuffer`)
- `src/services/EmailService.ts` — Resend integration for confirmation emails with waiver PDF attachment

### Add Family Members from Detail Page

The HOH member detail page has an "Add Family Member" button that opens a modal wizard (`AddFamilyMembersModal.tsx`) for adding multiple family members sequentially. Each member goes through all steps before the user can add another or finish.

**Steps (per family member):**
1. **Details** — Name, email, phone, date of birth, address (no member-type step; always family-member)
2. **Photo** — Optional member photo upload
3. **Subscription** — Choose membership plan
4. **Waiver** — Sign applicable waiver(s) (auto-skipped if none required)
5. **Family Payment** — Uses HOH's card on file or collects new payment details
6. **Member Success** — Shows confirmation, completed members count, "Add Another Family Member" or "Done"

**Flow Details:**
- HOH data (id, name, email, payment method) is pre-filled from the detail page — no HOH selection step needed
- After each member: create member → signed waiver → link to HOH → process payment → send email → track completed
- "Add Another" resets per-member fields but preserves HOH context and completed members list
- `paymentStepKey` increments on each "Add Another" to force TokenEx iframe re-initialization
- After first member's payment, re-checks HOH payment methods (first member may have registered a new card)
- On modal close: re-fetches family members list to update the detail page

**Key Files:**
- `src/features/members/wizard/AddFamilyMembersModal.tsx` — Modal orchestrator for multi-family-member add
- `src/features/members/wizard/FamilyMemberSuccessStep.tsx` — Success step with "Add Another" / "Done" buttons and completed members list
- `src/hooks/useFamilyMemberWizard.ts` — Wizard state management with fixed family-member steps, `completedMembers` tracking, `resetForNextMember()`, `updateHOHPaymentInfo()`

### Convert Member Type

The Convert Member feature (`ConvertMemberModal.tsx`) is a guided wizard for safely converting members between types, enforcing business rules and handling membership/payment transitions.

**Conversion Flows:**

| Conversion | Preconditions | Steps |
|------------|--------------|-------|
| HOH → Individual | No linked family members | Confirm → (Subscription if no membership) → (Waiver if needed) → (Payment if no method) → Success |
| Individual → HOH | None | Confirm → Success |
| Family Member → Individual | None | Confirm → Subscription → Waiver → Payment → Success |

**UI Integration:** The member detail page shows a read-only type badge + "Convert" dropdown menu with available conversions. HOH → Individual is disabled with tooltip when family members exist.

**Business Rules:**
- HOH → Individual: Unlinks from family structure; requires active membership and payment method (wizard collects if missing)
- Individual → HOH: Simple type change; can add family members afterward from detail page
- Family Member → Individual: Unlinks from HOH, old membership not carried over, must select fresh plan + own payment method

**Key Files:**
- `src/features/members/conversion/ConvertMemberModal.tsx` — Wizard orchestrator modal, reuses existing step components via adapter pattern
- `src/features/members/conversion/ConvertConfirmStep.tsx` — Type transition preview with conversion-specific messaging
- `src/features/members/conversion/ConvertSuccessStep.tsx` — Success confirmation with optional membership info
- `src/hooks/useConvertMemberWizard.ts` — Wizard state management with `getStepsForConversion()` dynamic step routing
- `src/validations/MemberValidation.ts` — `UnlinkFamilyMemberValidation`, `GetHOHForMemberValidation`

**API Endpoints (Member router):**
- `member.unlinkFamilyMember` — Unlinks a family member from HOH (ADMIN role, audit: `FAMILY_MEMBER_UNLINK`)
- `member.getHOHForMember` — Gets HOH data for a family member (FRONT_DESK role)

### Member Detail Page

The member detail/edit page (`members/[memberId]/edit/page.tsx`) displays:
- Contact information (name, email, phone, date of birth, address)
- Membership details with actual dates from DB (registration, start, next payment)
- Signed waivers with template name and version, with PDF download
- Payment method and billing history
- Family members (displayed only when member is Head of Household, fetched via `listFamilyMembers` endpoint)
- "Add Family Member" button (HOH only) — opens `AddFamilyMembersModal` for adding multiple family members
- "Convert" dropdown menu — opens `ConvertMemberModal` for type conversion with business rule enforcement
- Attendance records and notes

## Vendor Integrations

### Clerk (Authentication)

**Package:** `@clerk/nextjs` v6.36.5

**Key Files:**
- `src/app/[locale]/(auth)/layout.tsx` - ClerkProvider wrapper
- `src/routers/AuthGuards.ts` - API guards (`guardAuth`, `guardRole`)
- `src/utils/Auth.ts` - Page auth (`requireOrganization`)
- `src/services/ClerkRolesService.ts` - Clerk Backend API
- `src/types/Auth.ts` - Role definitions

**Roles:**
```
ORG_ROLE.ADMIN            -> org:admin
ORG_ROLE.ACADEMY_OWNER    -> org:academy_owner
ORG_ROLE.FRONT_DESK       -> org:front_desk
ORG_ROLE.MEMBER           -> org:member
ORG_ROLE.INDIVIDUAL_MEMBER -> org:individual_member
```

**Role Hierarchy:**
```
ADMIN > ACADEMY_OWNER > FRONT_DESK > MEMBER > INDIVIDUAL_MEMBER
```
Higher roles inherit all permissions of lower roles. An admin can access any endpoint that requires `FRONT_DESK` or lower.

**Auth Patterns:**
```
// API route protection (uses role hierarchy)
const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK)
// Admin, Academy Owner, and Front Desk can all access

// Page protection
const { orgId, has } = await requireOrganization()
if (!has({ role: ORG_ROLE.ADMIN })) redirect('/dashboard')
```

**Test Email:** `user+clerk_test@example.com` (code: `424242`)

### Stripe (Billing)

**Package:** `stripe` v18.5.0

**Key Files:**
- `src/libs/Stripe.ts` - Client setup
- `src/services/BillingService.ts` - Billing logic
- `src/services/OrganizationService.ts` - Customer storage
- `src/app/[locale]/webhook/billing/route.ts` - Webhook handler
- `src/utils/AppConfig.ts` - Pricing plans

**Pricing Plans:**
```
PLAN_ID.FREE        -> Free tier
PLAN_ID.FREE_TRIAL  -> Trial period
PLAN_ID.MONTHLY     -> $79/month
PLAN_ID.ANNUAL      -> $790/year
```

**Webhook Events Handled:**
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `checkout.session.completed`

**Commands:**
```bash
npm run stripe:listen    # Forward webhooks locally
npm run stripe:setup-price # Create test prices
```

### IQPro (Member Payments)

**Package:** `@dojo-planner/iqpro-client` (GitHub)

**Purpose:** Processes member-level payments (one-time charges and recurring autopay subscriptions). Organization-level SaaS billing continues through Stripe.

**Key Files:**
- `src/libs/IQPro.ts` - Client singleton, OAuth token management, tokenization config endpoint, ACH tokenization (`tokenizeAch`), gateway processor lookup (`getGatewayProcessors`)
- `src/services/PaymentProviderService.ts` - Provider-agnostic interface + factory
- `src/services/IQProPaymentService.ts` - IQPro implementation (InsertCard schema with token + maskedCard BIN format; ACH tokenization via `tokenizeAch` before InsertAch)
- `src/services/MemberPaymentService.ts` - Payment orchestration (customer → method → charge/subscription → DB)
- `src/routers/Payment.ts` - ORPC `payment.process` + `payment.getTokenizationConfig` endpoints
- `src/validations/PaymentValidation.ts` - Zod input schema
- `src/app/[locale]/webhook/iqpro/route.ts` - Webhook handler
- `src/hooks/useTokenExIframe.ts` - TokenEx hosted iframe lifecycle hook (PCI-compliant card tokenization)

**Card Tokenization (PCI Compliance):**

Raw card numbers must never touch our servers. Card data is tokenized via a TokenEx hosted iframe:

1. Server fetches iframe config from IQPro Tokenization API (`payment.getTokenizationConfig`)
2. Client loads TokenEx iframe script + initializes iframe with config (`useTokenExIframe` hook)
3. User types card number into the iframe (hosted by TokenEx, not our app)
4. On submit: `iframe.tokenize()` → returns `{ token, firstSix, lastFour }`
5. Token + BIN data sent to server → used with `InsertCard` schema: `card: { token, expirationDate, maskedCard }` where `maskedCard` = `BIN(6)******last4(4)` (e.g., `424242******4242`)
6. When IQPro is not configured, falls back to plain card number input (local dev only)

**CSP domains for TokenEx:** `sandbox.api.basyspro.com`, `api.basyspro.com`, `*.tokenex.com` (configured in `next.config.ts`)

**ACH Tokenization (Server-Side):**

Unlike card tokenization (client-side iframe), ACH tokenization is a server-side API call:

1. User enters routing number, account number, and account type (Checking/Savings) into standard HTML inputs
2. On submit, server calls `tokenizeAch()` → `POST {IQPRO_BASE_URL}/vault/api/v1/Tokenize/Ach` with OAuth bearer token
3. Request body: `{ accountNumber, routingNumber, secCode: 'WEB', achAccountType: 'Checking' | 'Savings' }`
4. Response returns `achToken` (checked in `json.achToken`, `json.data?.achToken`, `json.token`)
5. `achToken` is used in payment method creation: `{ achToken, secCode, routingNumber, accountType, checkNumber: null, accountHolderAuth: { dlState: null, dlNumber: null } }`
6. Falls back to raw account number if tokenization fails (for local dev without vault access)

**Payment Flow:**
1. Get or create IQPro customer (stored as `iqproCustomerId` on member)
2. Register payment method — card uses `InsertCard` schema with `token` + `maskedCard` (BIN format); ACH uses `tokenizeAch` + `InsertAch` schema with `achToken`
3. One-time: process transaction → save to `transaction` table
4. Autopay: create subscription → save `iqproSubscriptionId` on membership

**Subscription API Requirements (IQPro InsertSubscription):**

The IQPro subscription API has strict requirements validated against the sandbox:

- `prefix` (required, max 10 chars) — set to `"MBR"` for membership subscriptions
- `billingPeriodId` — 4 (Monthly) or 6 (Yearly)
- Schedule for monthly: `{ minutes: [0], hours: [0], daysOfMonth: [day] }` — must NOT include `monthsOfYear`
- Schedule for annual: `{ minutes: [0], hours: [0], daysOfMonth: [day], monthsOfYear: [month] }`
- Two separate addresses required: one billing (must include `country`, `state`, `email`), one remittance (cannot be same as billing)
- `cardProcessorId` / `achProcessorId` required on payment method — fetched via `getGatewayProcessors()` from gateway config
- `trialLengthInDays` (required, min 0) and `invoiceLengthInDays` (required, min 1)
- Line items: `unitPrice` in dollars (not cents), `discount` field is required (use `0`)
- `unitOfMeasureId`: 3 = Month, 4 = Year

**Webhook Events Handled:**
- `payment.completed` - Update transaction status
- `payment.failed` - Mark member past_due
- `subscription.payment_succeeded` - Update next payment date (checks org SaaS subscription first, falls back to member membership)
- `subscription.payment_failed` - Mark membership/org past_due (checks org first, falls back to member)
- `subscription.cancelled` - Update membership/org status (checks org first, falls back to member)

**Configuration:** All env vars are optional — app starts without IQPro, payment features disabled.

**SaaS Organization Billing (via IQPro):**

Organization-level SaaS subscriptions use IQPro (same SDK as member payments). Access is gated at the org level — the admin subscribes, all staff in that Clerk org get access automatically.

**Plans:** Basic ($49/mo, $29/mo annual), Growth ($125/mo, $99/mo annual), Enterprise (contact us)

**Super admins:** `aguilanegra`, `richardhoppes`, `nhaloski`, `rtoupin` — auto-granted Basic plan for free (no IQPro API call, written directly to DB).

**Key files:**
- `src/utils/SaasPlans.ts` — Plan config (prices, features, IDs)
- `src/utils/SuperAdmins.ts` — Super admin username list
- `src/services/SaasSubscriptionService.ts` — Service layer (subscribe, change, cancel, billing history, super admin auto-grant)
- `src/routers/SaasSubscription.ts` — ORPC endpoints (all require `ORG_ROLE.ADMIN`)
- `src/validations/SaasSubscriptionValidation.ts` — Zod schemas
- `src/hooks/useSubscriptionData.ts` — Client hook for fetching subscription + billing history
- `src/features/billing/SubscriptionDialog.tsx` — Subscription management dialog (from UserMenu)
- `src/app/[locale]/(auth)/dashboard/subscription/page.tsx` — Full subscription page
- `src/app/[locale]/(auth)/dashboard/subscription-expired/page.tsx` — Expired subscription page

**Access enforcement:** Dashboard layout checks org subscription status. If no active subscription (and not super admin), redirects to `/dashboard/subscription-expired`. Subscription and subscription-expired pages are exempt from this check.

**Cancel flow:** Cancels at end of billing period. All org members lose dashboard access. Admins can re-subscribe from the subscription-expired page.

### Sentry (Error Monitoring)

**Package:** `@sentry/nextjs` v10.32.1

**Key Files:**
- `src/instrumentation.ts` - Server-side init
- `src/instrumentation-client.ts` - Client-side init
- `src/app/global-error.tsx` - Error boundary
- `next.config.ts` - Sentry webpack config

**Features:**
- Error tracking with source maps
- Session replay (10% normal, 100% errors)
- Performance tracing
- Spotlight (dev mode debugging)
- Tunnel route: `/monitoring` (bypasses ad-blockers)

**Disable:** Set `NEXT_PUBLIC_SENTRY_DISABLED=true`

### Checkly (Synthetic Monitoring)

**Package:** `checkly` v6.9.7

**Config:** `checkly.config.ts`

**Features:**
- Runs E2E tests as synthetic checks
- Locations: `us-east-1`, `eu-west-1`
- Frequency: Every 24 hours
- Email alerts on failure/recovery
- Test pattern: `**/tests/e2e/**/*.e2e.ts`

### Better Stack (Logging)

**Package:** `@logtape/logtape` v1.3.5

**Config:** `src/libs/Logger.ts`

**Features:**
- JSON Lines format
- Console + remote ingestion
- Conditional based on env vars

### MCP Servers (Claude Code Integration)

**Config:** `.mcp.json`

MCP (Model Context Protocol) servers extend Claude Code's capabilities for this project.

**Available Servers:**

| Server | Package | Purpose |
|--------|---------|---------|
| `postgres` | `@modelcontextprotocol/server-postgres` | Query database, inspect schemas, debug data |
| `github` | `@modelcontextprotocol/server-github` | PRs, issues, CI status, code search |
| `fetch` | `@modelcontextprotocol/server-fetch` | Enhanced web requests, API testing |
| `puppeteer` | `@modelcontextprotocol/server-puppeteer` | Browser automation, screenshots, E2E test development |

**Environment Variables (shell environment, not `.env.local`):**

MCP servers read from your shell environment. Add to `~/.zshenv` (required for GUI apps on macOS):
```bash
# Required for postgres server
export DATABASE_URL=postgresql://...

# Required for github server
export GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxxxxxxxxxxx
```

After editing, fully quit and reopen VSCode (Cmd+Q, then relaunch).

**Usage Examples:**
- "Query the members table" → Uses postgres server
- "List open PRs" → Uses github server
- "Navigate to localhost:3000/dashboard and take a screenshot" → Uses puppeteer server

**Puppeteer + Playwright Workflow:**
The puppeteer server helps with E2E test development:
1. Navigate to pages and take screenshots to see current state
2. Discover selectors interactively before writing Playwright tests
3. Validate user flows manually before codifying them

## Storybook

**Framework:** `@storybook/nextjs-vite` v10.1.11

**Config:** `.storybook/`
- `main.ts` - Framework and addons
- `preview.tsx` - Global decorators (I18nWrapper)
- `vitest.config.mts` - Component testing

**Addons:**
- `@storybook/addon-docs` - Auto documentation
- `@storybook/addon-a11y` - Accessibility testing

**Story Organization:**
```
Design System/       # Color palette, typography
UI/Primitives/       # Button, Input, Checkbox, etc.
UI/Display/          # Badge, Alert, Skeleton, etc.
UI/Containers/       # Dialog, Sheet, Card, etc.
Templates/           # MemberCard, ClassCard, etc.
Features/            # AppSidebarNav
```

**Patterns:**
```
// Dark mode story
export const DarkMode: Story = {
  decorators: [Story => (
    <div className="dark bg-background p-4 text-foreground">
      <Story />
    </div>
  )],
}
```

**Commands:**
```bash
npm run storybook       # Dev server (port 6006)
npm run storybook:test  # Run story tests
```

## Testing

### Unit/UI Tests (Vitest)

**Config:** `vitest.config.mts`

**Projects:**
- `unit` - Node environment (`*.test.ts`)
- `ui` - Browser environment (`*.test.tsx`, hooks)

**Run:** `npm run test`

### E2E Tests (Playwright)

**Config:** `playwright.config.ts`

**Key Files:**
- `tests/global.setup.ts` - Clerk auth setup
- `tests/TestUtils.ts` - Test helpers

**Helpers:**
```typescript
await setupClerkTestingToken({ page });
await createUserWithOrganization(page);
await signIn(page);
await deleteUserWithOrganization();
```

**Run:** `npm run test:e2e`

## Database

**ORM:** Drizzle with PostgreSQL

**Schema:** `src/models/Schema.ts`

**Key Tables:**
- `organization` - Multi-tenant orgs with Stripe IDs + IQPro SaaS subscription fields (iqproCustomerId, iqproSubscriptionId, iqproSubscriptionPlanId, iqproBillingCycle, iqproSubscriptionStatus, iqproCurrentPeriodEnd, iqproPaymentMethodId)
- `member` - Member records with dateOfBirth, optional `clerkUserId` for kiosk auth, optional `iqproCustomerId`
- `membership_plan` - Pricing tiers
- `member_membership` - Member-plan associations with startDate, endDate, firstPaymentDate, nextPaymentDate, optional `iqproSubscriptionId`
- `program` - Training programs (Adult BJJ, Kids, Competition)
- `class` - Class definitions
- `class_schedule_instance` - Recurring schedule patterns
- `class_schedule_exception` - Schedule overrides (cancellations, modifications)
- `event` - Special events (seminars, workshops)
- `event_session` - Event time slots
- `event_billing` - Event pricing tiers
- `tag` - Polymorphic tags for classes/memberships/events
- `coupon` - Discount codes
- `transaction` - Financial transactions (membership payments, signup fees, event registrations, refunds, adjustments), optional `iqproTransactionId`
- `attendance` - Check-in records
- `audit_event` - SOC2 compliance audit logging
- `payment_method` - Saved payment methods (card, bank_transfer, cash, check), optional `iqproPaymentMethodId`
- `address` - Member addresses
- `note` - Member notes
- `family_member` - Family relationships
- `catalog_item` - Merchandise and event access products
- `catalog_item_variant` - Product variants with custom name, price, and stock quantity (max 8 per item)
- `catalog_category` - Product categories
- `catalog_item_category` - Item-category associations (M:N)
- `catalog_item_image` - Product images
- `waiver_template` - Waiver templates with placeholders, guardian settings, and immutable versioning (`parentId` for archive rows)
- `signed_waiver` - Signed waiver records with signature data, rendered content, membership plan snapshot (name, price, frequency, contract length, signup fee, trial status), and coupon/discount snapshot (code, type, amount, discounted price)
- `membership_waiver` - Junction table linking memberships to required waivers
- `waiver_merge_field` - Configurable placeholder fields for waiver templates

**Commands:**
```bash
npm run db:generate  # Generate migrations
npm run db:migrate   # Run migrations
npm run db:studio    # Open Drizzle Studio
```

### Drizzle Migrations

**Location:** `migrations/` directory

**Workflow:**
1. Modify schema in `src/models/Schema.ts`
2. Generate migration: `npm run db:generate`
3. Review generated SQL in `migrations/XXXX_migration_name/`
4. Apply migration: `npm run db:migrate`

**Migration Files:**
- `migrations/meta/_journal.json` - Migration history tracking
- `migrations/XXXX_*/` - Individual migration folders with SQL

**Best Practices:**
- Always review generated migrations before applying
- Test migrations on a copy of production data when possible
- Migrations are applied automatically in development via `npm run dev`
- For breaking changes, consider data migration scripts

**Rollback:** Drizzle doesn't support automatic rollbacks. For rollbacks:
1. Create a new migration that reverses the changes
2. Or restore from database backup

### Neon Database Branching

**Provider:** Neon Postgres (serverless)

**Branch Topology:**
```
main (production) → preview (persistent branch for Vercel preview deployments)
```

**How it works:**
- Production deployments use the `main` Neon branch
- Preview deployments use the `preview` Neon branch (a copy-on-write clone of production)
- Each branch has its own `DATABASE_URL`, configured in Vercel env vars scoped by environment
- Local development uses PGLite (not Neon)

**Migrations on preview:** Run automatically on first request via `runMigrations()` in the root layout. No manual action needed — any new migrations in a PR branch are applied when the preview deployment starts.

**Resetting the preview branch:**
1. Delete the `preview` branch in Neon Console
2. Re-create it from `main` (gets a fresh snapshot of production data + schema)
3. Update the Vercel `DATABASE_URL` for Preview if the connection string changed
4. Re-seed if needed (see seed script section below)

**Connection strings:** Always use the **pooled** connection string (hostname contains `-pooler`) for Vercel deployments. The app uses `max: 1` in the pg Pool, so connection pooling is important for serverless.

**Auto-suspend:** Neon branches auto-suspend after ~5 minutes of inactivity. First request after suspension has ~500ms cold start — acceptable for preview environments.

**Setup Guide (one-time):**

**Step 1 — Create the Neon preview branch:**
1. Go to [Neon Console](https://console.neon.tech) and open the dojo-planner project
2. Click **Branches** in the left sidebar
3. Click **Create Branch**
4. Set **Name** to `preview`, **Parent branch** to `main`, **Include data** to Yes
5. Click **Create Branch**
6. Once created, go to the branch's **Connection Details**
7. Toggle the connection type to **Pooled** (the hostname should contain `-pooler`)
8. Copy the full connection string — it looks like:
   ```
   postgresql://neondb_owner:<password>@ep-xxx-xxx-pooler.<region>.aws.neon.tech/neondb?sslmode=require
   ```

**Step 2 — Configure Vercel environment variables:**
1. Go to [Vercel Dashboard](https://vercel.com) → dojo-planner project → **Settings** → **Environment Variables**
2. Find the existing `DATABASE_URL` variable
3. Click the three-dot menu → **Edit**
4. Under **Environments**, uncheck **Preview** and **Development** — leave only **Production** checked
5. Save
6. Click **Add New** to create a second `DATABASE_URL`:
   - **Key:** `DATABASE_URL`
   - **Value:** The pooled connection string from Step 1
   - **Environments:** Check **Preview** only (not Production, not Development)
7. Save
8. Verify: you should now see two `DATABASE_URL` entries — one for Production, one for Preview

**Step 3 — Seed the preview branch:**
1. Create a `.env.preview` file in the project root (already gitignored):
   ```bash
   # .env.preview
   DATABASE_URL=postgresql://neondb_owner:<password>@ep-xxx-xxx-pooler.<region>.aws.neon.tech/neondb?sslmode=require
   ```
2. Find your Clerk Organization ID:
   - Go to [Clerk Dashboard](https://dashboard.clerk.com) → Organizations
   - Click on the organization you want to use for preview testing
   - Copy the Organization ID (starts with `org_`)
3. Run the seed script from your local terminal:
   ```bash
   source .env.preview && npx tsx src/scripts/seed.ts --orgId=org_xxxxx
   ```
4. To reset and re-seed later:
   ```bash
   source .env.preview && npx tsx src/scripts/seed.ts --orgId=org_xxxxx --reset
   ```

**Step 4 — Verify the preview environment:**
1. Push a branch to GitHub or open a PR to trigger a Vercel preview deployment
2. Wait for the deployment to complete (check Vercel dashboard or GitHub PR checks)
3. Visit the preview URL (shown in the Vercel dashboard or as a PR comment)
4. Sign in and verify you see seeded data (not production data)
5. **Data isolation check:** Create or modify a record in the preview app, then verify it does NOT appear in production:
   - Open [Neon Console](https://console.neon.tech) → switch to the `main` branch → SQL Editor
   - Query the relevant table to confirm the record is absent
6. If anything is wrong, check:
   - Vercel build logs for migration errors
   - That the Preview `DATABASE_URL` env var is set correctly (Vercel → Settings → Environment Variables)
   - That other env vars (Clerk, IQPro, Stripe) for Preview point to test/staging instances, not production

### Database Seed Script

The seed script (`src/scripts/seed.ts`) populates the database with sample data for development and testing. It seeds programs, classes, events, coupons, membership plans, tags, sample members, payment methods, and transactions.

**Usage:**

The seed script requires a running PGLite server. Use two terminal windows:

```bash
# Terminal 1: Start the PGLite database server
npm run db-server:file

# Terminal 2: Run the seed script (while db-server is running)
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/postgres" npx tsx src/scripts/seed.ts --orgId=org_xxxxx
```

**Re-seeding from scratch (reset local database):**
```bash
# 1. Stop the db-server if running (Ctrl+C in Terminal 1)

# 2. Delete the local database
rm -rf local.db

# 3. Start the db-server (this runs migrations automatically)
npm run db-server:file

# 4. In another terminal, seed the organization
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/postgres" npx tsx src/scripts/seed.ts --orgId=org_xxxxx
```

**Alternative: Seed with reset flag (keeps database, clears org data):**
```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/postgres" npx tsx src/scripts/seed.ts --orgId=org_xxxxx --reset
```

**Finding your Organization ID:**
1. Go to [Clerk Dashboard](https://dashboard.clerk.com) → Organizations
2. Click on an organization
3. Copy the Organization ID (starts with `org_`)

**What gets seeded:**
- 4 programs (Adult BJJ, Kids Program, Competition Team, Special Programs)
- 14 tags (9 class tags + 5 membership tags)
- 9 classes with schedule instances
- 4 schedule exceptions (cancellations, time changes)
- 2 events with sessions and billing tiers
- 12 coupons (various types and statuses)
- 6 membership plans
- 8 sample members with memberships (with realistic startDate, firstPaymentDate, nextPaymentDate)
- ~7 payment methods (one per active/trial/past_due member)
- ~200 transactions spanning Jan 2024 – present (membership payments, signup fees, event registrations, refunds, adjustments)
- Catalog items with variants, categories, and images
- 3 waiver templates (Standard Adult, Kids Program, Free Trial) with membership associations
- 2 waiver merge fields (academy, academy_owners)

**Note:** The seed script creates the organization record in the local database if it doesn't exist. Staff/instructor assignments require creating users in the Clerk dashboard first.

**Seeding the preview branch (Neon):**

The seed script can target the Neon preview branch directly from your local machine:
```bash
DATABASE_URL="postgresql://...preview-branch-pooled-connection-string..." npx tsx src/scripts/seed.ts --orgId=org_xxxxx
```

For convenience, store the connection string in `.env.preview` (gitignored):
```bash
# .env.preview
DATABASE_URL=postgresql://...preview-branch-pooled-connection-string...
```
Then:
```bash
source .env.preview && npx tsx src/scripts/seed.ts --orgId=org_xxxxx
```

## Environment Variables

**Validation:** `src/libs/Env.ts` (t3-oss/env-nextjs)

**Required Server:**
```bash
CLERK_SECRET_KEY
DATABASE_URL              # Scoped per Vercel environment (see below)
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
BILLING_PLAN_ENV          # dev | test | prod
```

**DATABASE_URL per environment (Vercel):**
| Environment | Target |
|-------------|--------|
| Production | Neon `main` branch (production data) |
| Preview | Neon `preview` branch (test data, seeded separately) |
| Local dev | PGLite (`postgresql://postgres:postgres@127.0.0.1:5432/postgres`) |

**Required Client:**
```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
```

**Optional:**
```bash
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SENTRY_DSN
NEXT_PUBLIC_SENTRY_DISABLED
NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN
NEXT_PUBLIC_BETTER_STACK_INGESTING_HOST
```

**Optional (IQPro Member Payments):**
```bash
IQPRO_CLIENT_ID
IQPRO_CLIENT_SECRET
IQPRO_SCOPE
IQPRO_OAUTH_URL
IQPRO_BASE_URL
IQPRO_GATEWAY_ID
IQPRO_WEBHOOK_SECRET
```

**Optional (Email — Resend):**
```bash
RESEND_API_KEY           # Resend API key for sending confirmation emails
RESEND_FROM_EMAIL        # From address (default: noreply@dojoplanner.com)
```

## Scripts

```bash
npm run dev           # Dev server with PGLite DB + Sentry Spotlight
npm run build         # Production build
npm run test          # Vitest (unit + UI)
npm run test -- --coverage  # Run tests with coverage report
npm run test:e2e      # Playwright E2E
npm run lint          # ESLint
npm run check:types   # TypeScript check
npm run check:deps    # Unused deps (knip)
npm run check:i18n    # Validate i18n keys (source: en)
npm run storybook     # Component docs
npm run stripe:listen # Forward Stripe webhooks
npm run commit        # Interactive commit helper
```

## Conventions

- **Feature modules:** Each feature in `src/features/` contains its own components, hooks, and logic
- **Path alias:** `@/*` maps to `src/*`
- **Tests:** Co-located with source files
- **Validation:** Zod schemas in `src/validations/`
- **i18n:** Translation keys in `src/locales/[lang].json`
- **Locales:** English (en), French (fr)
- **Lint:** Never use eslint-ignore comments; fix the underlying issue instead

## CI/CD

- **CI:** GitHub Actions (`.github/workflows/CI.yml`)
  - Build matrix: Node 22.x, 24.x
  - Lint, types, deps check
  - Unit tests, Storybook tests, E2E tests
  - Security audit (`npm audit --audit-level=critical`)
  - CodeQL SAST scanning (`.github/workflows/codeql.yml`)
- **Release:** Semantic release on main branch (uses `RELEASE_PAT` for branch protection bypass)
- **Monitoring:** Checkly synthetic monitoring

## Security & Compliance (SOC2)

This codebase implements security controls for SOC2 Type 1 compliance (Security Trust Service Criteria).

### Audit Logging

**Purpose:** Track WHO did WHAT to WHICH entity WHEN (CC7.2)

**Key Files:**
- `src/types/Audit.ts` - Audit event types and constants
- `src/services/AuditService.ts` - Audit logging service
- `src/libs/Logger.ts` - Dual logger (app + audit categories)

**Usage Pattern:**
```typescript
import { audit } from '@/services/AuditService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';

// In router handlers after guardRole/guardAuth
const context = await guardRole(ORG_ROLE.ADMIN);

try {
  const result = await someOperation();
  await audit(context, AUDIT_ACTION.MEMBER_CREATE, AUDIT_ENTITY_TYPE.MEMBER, {
    entityId: result.id,
    status: 'success',
  });
  return result;
} catch (error) {
  await audit(context, AUDIT_ACTION.MEMBER_CREATE, AUDIT_ENTITY_TYPE.MEMBER, {
    status: 'failure',
    error: error instanceof Error ? error.message : 'Unknown error',
  });
  throw error;
}
```

**Audit Actions (71 total):**
```typescript
// Member operations
AUDIT_ACTION.MEMBER_CREATE;
AUDIT_ACTION.MEMBER_UPDATE;
AUDIT_ACTION.MEMBER_REMOVE;
AUDIT_ACTION.MEMBER_RESTORE;

// Class operations
AUDIT_ACTION.CLASS_CREATE;
AUDIT_ACTION.CLASS_UPDATE;
AUDIT_ACTION.CLASS_DELETE;
AUDIT_ACTION.CLASS_SCHEDULE_CREATE;
AUDIT_ACTION.CLASS_SCHEDULE_EXCEPTION_CREATE;

// Event operations
AUDIT_ACTION.EVENT_CREATE;
AUDIT_ACTION.EVENT_SESSION_CREATE;
AUDIT_ACTION.EVENT_SESSION_CANCEL;

// Coupon operations
AUDIT_ACTION.COUPON_CREATE;
AUDIT_ACTION.COUPON_REDEEM;

// Attendance operations
AUDIT_ACTION.ATTENDANCE_CHECK_IN;
AUDIT_ACTION.ATTENDANCE_CHECK_OUT;

// Transaction operations
AUDIT_ACTION.TRANSACTION_CREATE;
AUDIT_ACTION.TRANSACTION_REFUND;

// Waiver operations
AUDIT_ACTION.WAIVER_TEMPLATE_CREATE;
AUDIT_ACTION.WAIVER_TEMPLATE_UPDATE;
AUDIT_ACTION.WAIVER_TEMPLATE_DELETE;
AUDIT_ACTION.WAIVER_TEMPLATE_VERSION_CREATE;
AUDIT_ACTION.WAIVER_SIGNED;
AUDIT_ACTION.MEMBERSHIP_WAIVER_SET;
AUDIT_ACTION.MEMBERSHIP_WAIVER_ADD;
AUDIT_ACTION.MEMBERSHIP_WAIVER_REMOVE;
AUDIT_ACTION.MERGE_FIELD_CREATE;
AUDIT_ACTION.MERGE_FIELD_UPDATE;
AUDIT_ACTION.MERGE_FIELD_DELETE;

// Payment operations
AUDIT_ACTION.PAYMENT_PROCESS;
AUDIT_ACTION.PAYMENT_METHOD_REGISTER;

// SaaS subscription operations
AUDIT_ACTION.SAAS_SUBSCRIPTION_CREATE;
AUDIT_ACTION.SAAS_SUBSCRIPTION_CHANGE;
AUDIT_ACTION.SAAS_SUBSCRIPTION_CANCEL;

// Family member operations
AUDIT_ACTION.FAMILY_MEMBER_LINK;
AUDIT_ACTION.FAMILY_MEMBER_UNLINK;
AUDIT_ACTION.MEMBER_CONVERT;

// See src/types/Audit.ts for full list
```

**Adding New Audit Events:**
1. Add action constant to `AUDIT_ACTION` in `src/types/Audit.ts`
2. Add entity type to `AUDIT_ENTITY_TYPE` if needed
3. Call `audit()` in the router handler with proper context

### Rate Limiting

**Purpose:** Prevent abuse and DoS attacks (CC6.1)

**Key Files:**
- `src/libs/RateLimit.ts` - Upstash Redis rate limiters
- `src/libs/Env.ts` - Environment variables for Upstash
- `src/routers/RateLimitGuard.ts` - ORPC rate limit guard
- `src/app/[locale]/rpc/[[...rest]]/route.ts` - RPC rate limiting
- `src/app/[locale]/webhook/billing/route.ts` - Webhook rate limiting

**Rate Limits:**
| Endpoint | Limit | Window | Identifier |
|----------|-------|--------|------------|
| `/rpc/*` (authenticated) | 100 req | 1 min | orgId |
| `/rpc/*` (unauthenticated) | 10 req | 1 min | IP |
| `/webhook/billing` | 100 req | 1 min | IP |

**Environment Variables:**
```bash
# Optional - rate limiting disabled if not set
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
```

**Adding Rate Limiting to New Endpoints:**
```typescript
import { getClientIP, isRateLimitingEnabled, rpcRateLimiter } from '@/libs/RateLimit';

async function handleRequest(request: Request) {
  if (isRateLimitingEnabled()) {
    const ip = getClientIP(request);
    const result = await rpcRateLimiter.limit(ip);
    if (!result.success) {
      return new Response('Too Many Requests', { status: 429 });
    }
  }
  // ... handle request
}
```

### Security Headers

HTTP security headers are configured in `next.config.ts`:
- `Strict-Transport-Security` (HSTS)
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (camera, microphone, geolocation disabled)
- `Content-Security-Policy` (CSP)

### Content Security Policy (CSP)

**Purpose:** Protect against XSS attacks by controlling which resources can be loaded (CC6.6)

**Configuration:** `next.config.ts` - `contentSecurityPolicy` constant

**Required `'unsafe-inline'` Directives:**
- `script-src 'unsafe-inline'` - Required for Next.js theme script and RSC hydration data
- `style-src 'unsafe-inline'` - Required for Tailwind CSS and Clerk inline styles

**Self-Hosted Fonts:**

The Inter font is self-hosted via `next/font` to eliminate external dependencies and enable a strict CSP (`font-src 'self'`).

| File | Purpose |
|------|---------|
| `src/app/[locale]/layout.tsx` | Configures Inter via `next/font/google` with `variable: '--font-inter'` |
| `src/styles/global.css` | Uses `var(--font-inter)` in `--font-family-inter` CSS variable |

This approach:
- Eliminates external font requests (previously `rsms.me`)
- Enables strict `font-src 'self'` in CSP
- Improves performance via automatic font optimization
- Prevents layout shift with `display: 'swap'`

**Whitelisted Domains by Vendor:**

| Vendor | Domains | Directives |
|--------|---------|------------|
| **Clerk** | `api.clerk.com`, `cdn.clerk.com`, `*.clerk.com`, `*.clerk.accounts.dev` | script-src, style-src, connect-src, frame-src, form-action |
| **Sentry** | `*.ingest.sentry.io`, `o-*.ingest.sentry.io`, `sentry.io`, `www.sentry-cdn.com` | connect-src, script-src |
| **Better Stack** | `*.betterstack.com`, `logs.betterstack.com` | connect-src |
| **Upstash** | `*.upstash.io` | connect-src |
| **TokenEx/BasysPro** | `sandbox.api.basyspro.com`, `api.basyspro.com`, `*.tokenex.com` | script-src, frame-src, connect-src |

**Adding New Third-Party Services:**

When integrating a new service, update the CSP in `next.config.ts`:

1. Identify which directives the service needs:
   - `script-src` - External JavaScript files
   - `style-src` - External stylesheets
   - `connect-src` - API calls (fetch, XHR, WebSocket)
   - `frame-src` - Embedded iframes
   - `form-action` - Form submission targets (OAuth redirects)
   - `img-src` - Images
   - `font-src` - Web fonts

2. Add the domain(s) to the appropriate directive(s) in `contentSecurityPolicy`

3. Test all flows that use the service

**Example - Adding a new analytics service:**
```text
// In next.config.ts contentSecurityPolicy array
'script-src \'self\' https://cdn.clerk.com https://www.sentry-cdn.com https://cdn.analytics.com',
'connect-src \'self\' https://api.clerk.com https://api.analytics.com',
```

**OAuth/Social Login:**

The `form-action` directive includes Clerk domains to allow OAuth redirects for social login (Google, Facebook, GitHub, etc.). Without this, browsers block the redirect to OAuth providers, causing CORS-like errors during social authentication.

**Dev Mode CSP:**
- `upgrade-insecure-requests` is conditionally excluded in development (`NODE_ENV=development`) because it breaks TokenEx iframe postMessage on `http://localhost`
- In production, `upgrade-insecure-requests` is always included

**Testing CSP:**
- Use `Content-Security-Policy-Report-Only` header during testing
- Check browser console for CSP violations
- Test: sign-in, sign-up, **social login (OAuth)**, organization switching, error reporting

### Auth Guards (Enhanced for Audit)

Guards now return full audit context:

```typescript
// guardAuth returns userId for audit logging
const { userId, orgId, has } = await guardAuth();

// guardRole returns AuditContext with role
const context = await guardRole(ORG_ROLE.ADMIN);
// context = { userId, orgId, role: 'org:admin' }
```

### Security Checklist for New Features

When adding new features, ensure:

1. **Authentication:** Use `guardAuth()` or `guardRole()` for all protected endpoints
2. **Audit Logging:** Add `audit()` calls for all mutations (create, update, delete)
3. **Rate Limiting:** Consider if the endpoint needs rate limiting
4. **Input Validation:** Use Zod schemas in `src/validations/`
5. **Error Handling:** Never expose internal errors to clients

## Post-Implementation Checklist

After completing any code changes, always run the following verification steps:

### 1. Create/Update Unit Tests (MANDATORY — DO THIS FIRST)

**CRITICAL:** Unit tests MUST be written BEFORE running lint/type checks. This is NOT optional. Every new or modified file requires corresponding tests.

- **New service functions** → Add tests in co-located `*.test.ts` (e.g., `WaiversService.test.ts`)
- **New/modified router handlers** → Add tests in co-located `*.test.ts` (e.g., `Waivers.test.ts`)
- **New validation schemas** → Add tests in co-located `*.test.ts` (e.g., `WaiverValidation.test.ts`)
- **New UI components** → Add tests in co-located `*.test.tsx` (e.g., `ViewVersionModal.test.tsx`)
- **Modified UI components** → Update existing tests to cover new behavior
- Ensure mocks are properly configured
- Do NOT skip this step and jump to running checks

### 2. Run All Checks
```bash
# Run all checks in sequence
npm run lint          # ESLint - fix issues, never use eslint-ignore
npm run check:types   # TypeScript type checking
npm run check:deps    # Unused dependencies (knip)
npm run check:i18n    # i18n key validation
npm run test          # Unit tests
npm run test -- --coverage  # Verify coverage
```

### 3. Code Coverage Target
- Aim for as close to 100% coverage as possible on new/modified code
- Review uncovered lines and add tests for edge cases
- Focus on branch coverage for conditional logic

### 4. Git Guardian Compliance
When using test credentials or example values in tests:
```typescript
// Use clearly fake/test values that won't trigger secret scanning
const testUserId = 'test-user-123'; // Clearly a test value
const testOrgId = 'test-org-456'; // Clearly a test value

// For API keys in tests, use obvious placeholder patterns
const mockApiKey = 'test_api_key_not_real'; // nosecret
```

### 5. Final Verification
```bash
# Full verification before commit
npm run lint && npm run check:types && npm run check:deps && npm run check:i18n && npm run test -- --coverage
```

All checks must pass without errors or warnings before committing.

### 6. Documentation Updates (REQUIRED)

**CRITICAL:** This file (CLAUDE.md) and README.md must be updated whenever changes are made that affect:

- **Database schema changes** - Update the Schema tables section and migration documentation
- **New services** - Add to the services section with file path and description
- **New routers** - Add to the routers section with endpoints and auth levels
- **New features** - Add to the features section with directory and purpose
- **New dashboard routes** - Add to the routing section
- **New environment variables** - Add to the Environment Variables section
- **New audit actions** - Add to the Audit Actions section

This documentation must evolve with the codebase to remain accurate and useful.
