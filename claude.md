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
│   ├── Member.ts          # Member CRUD, family linking/unlinking, HOH search, member type conversion, confirmation email, membership lifecycle (cancelMembership, holdMembership, reactivateMembership), `getById` (single member incl. base64 photo — the members LIST omits photoUrl for payload/heap reasons, so the detail page loads the photo via this endpoint)
│   ├── Members.ts         # Members list ops
│   ├── Classes.ts         # Classes list & tags (create/update persist allowWalkIns + schedule instructor clerk ids)
│   ├── Events.ts          # Events list + event registration/enrollment (register, registrations, cancelRegistration)
│   ├── Instructors.ts     # Instructor list (org:instructor + org:academy_owner) + updatePhoto (in-app headshot upload)
│   ├── Tags.ts            # Tags (class, membership, all)
│   ├── Coupons.ts         # Coupons list & active, total savings aggregation
│   ├── Organization.ts    # Per-org location settings (getLocation, updateLocation)
│   ├── Transactions.ts    # Transaction listing with filters
│   ├── Dashboard.ts       # Membership stats, financial stats, chart data
│   ├── Reports.ts         # Report values, chart data, dynamic insights
│   ├── Payment.ts         # Payment processing (one-time + autopay subscriptions) + payment method registration (no charge)
│   ├── SaasSubscription.ts # Org SaaS billing (getCurrentPlan, subscribe, changePlan, cancel, getBillingHistory, getTokenizationConfig)
│   └── Waivers.ts         # Waiver templates, signing, versioning, membership associations (both directions: `setMembershipWaivers` sets a plan's waivers, `setWaiverMemberships` sets a waiver's plans — #267), merge fields
│
├── services/              # Business logic layer
│   ├── BillingService.ts  # Stripe integration
│   ├── CatalogService.ts  # Catalog items, variants, categories, images
│   ├── ClassesService.ts  # Class & schedule queries
│   ├── ClerkRolesService.ts # Clerk Backend API (exports `clerkApiRequest` helper)
│   ├── CouponsService.ts  # Coupon queries + organization-wide total savings aggregation
│   ├── EventsService.ts   # Event queries + event registration (registerMemberForEvent, getEventRegistrations, cancelEventRegistration)
│   ├── InstructorsService.ts # Org instructors from Clerk (org:instructor + org:academy_owner), DB photo overrides (instructor_profile) preferred over Clerk avatar
│   ├── MembersService.ts  # Member operations
│   ├── OrganizationService.ts # Org & Stripe customer storage + per-org location settings (name, address, phone, email, tax rate)
│   ├── TagsService.ts     # Tag queries with usage counts
│   ├── TransactionsService.ts # Transaction listing with member joins
│   ├── DashboardService.ts # Membership stats, financial stats, member average & earnings chart data (chart series use ONE grouped `date_trunc` query for range sums + a fetch-once/JS `countMembersAsOf` for as-of counts — not one query per bucket; exports `fetchMemberAsOfRows`/`countMembersAsOf` reused by ReportsService)
│   ├── ReportsService.ts  # Report current values, chart data, dynamically computed insights (chart builders collapsed from 29–180 per-chart queries to 1–3: `groupedSumByBucket` for range sums, exported pure `countPastDueAsOf`/`countMembersAsOf` for point-in-time counts)
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
│   ├── SuperAdmins.ts     # Super admin username list and helper
│   └── MemberSearch.ts    # Shared member-search relevance ranking (prefix-priority + alphabetical) used by every member-search box
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
| `/dashboard/classes/[classId]` | `classes/[classId]/page.tsx` | Class detail — Edit Basics/Settings/Schedule modals persist via `persistClass` → `client.classes.update` (rebuilds the full payload: level/type/style → tag ids, program slug → programId, scheduleInstances → 24h schedule with instructor clerk ids, allowWalkIns). Instructor names/photos resolved via `useInstructorsCache`. |
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
| `/dashboard/subscription-expired` | `subscription-expired/page.tsx` | Subscription expired — re-subscribe prompt |
| `/dashboard/preferences` | `preferences/page.tsx` | User preferences |
| `/dashboard/security` | `security/page.tsx` | Security settings |
| `/dashboard/location-settings` | `location-settings/page.tsx` | Per-org location settings (name, address, phone, email, tax rate) — backed by `organization.location*` columns. **Also hosts the per-org IQPro merchant-credentials card** (clientId / clientSecret / gatewayId → the encrypted `organization.payment_provider_config_enc` blob). There is NO `/dashboard/payment-settings` route and no `/dashboard/platform-settings` route; `PaymentSettingsForm` (`src/features/payment-settings/`) is rendered only here. Card is viewable by ADMIN + ACADEMY_OWNER, editable by ADMIN only (`PAYMENT_VIEW_ROLES` / `PAYMENT_EDIT_ROLES` in `LocationSettingsPage.tsx`); the `paymentSettings.updateConfig` endpoint enforces ADMIN server-side |

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
- `src/features/waivers/signing/SignatureCanvas.tsx` — Reusable signature capture (react-signature-canvas, supports mouse + touch). Loaded lazily via `next/dynamic` from `WaiverStep` so the canvas lib isn't in the wizard's initial bundle.
- `src/features/members/wizard/memberWizardUtils.ts` — Shared, unit-tested wizard helpers used by all three wizards (Add Member, Add Family Members, Convert): `computeDiscountedPrice` (coupon → recurring price), `calculateAge` (age at waiver signing), `fileToDataUrl` (photo → base64), `buildSignedWaiverPayload` (assembles the `createSignedWaiver` request incl. plan + coupon snapshot). Previously these were copy-pasted across the three modals.
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
- "Actions" dropdown menu (when an active or held membership exists) — opens lifecycle modals: Place on Hold, Reactivate, Cancel Membership
- "Archive Member" / "Restore Member" button (ACADEMY_OWNER+ only, #221) — opens `ArchiveMemberModal`. Archive calls `member.remove` (soft-archive → `status='cancelled'`, preserves all history) and navigates back to the list; Restore calls `member.restore` (→ `status='active'`) when the member is currently archived. Both are academy-owner-gated via `useHasRole(ORG_ROLE.ACADEMY_OWNER)`, mirroring the endpoints' guards.
- Attendance records and notes

### Members list & search UX

The members list (`MembersTable.tsx`) is client-side paginated over the full `client.members.list()` result:
- **Page-size selector (#258):** a "Rows per page" dropdown (10 / 25 / 50 / 100, default 10) drives the slice; changing it resets to page 0.
- **Search relevance (#244):** the search box ranks matches via the shared `@/utils/MemberSearch` helper — name-prefix matches rank above mid-name substrings, above email/phone matches; ties break alphabetically (`lastName, firstName`). When a search query is active, relevance ordering overrides the column sort; with no query the column sort applies. The same `rankMembersByQuery` helper backs the HOH picker (`HOHSelectionStep`), the event `EnrollMemberModal`, and the server-side `member.searchHOH` endpoint, so every member search behaves identically (an empty query returns everyone alphabetically).

### Class-tags picker scroll (#234)

The class wizard's tag picker (`ClassTagsStep.tsx`) caps both the selected-tags and available-tags boxes with `max-h-* overflow-y-auto` (matching the `MembershipStep.tsx` convention) so a large tag list scrolls instead of pushing the wizard footer off-screen.

### Cancel / Hold / Reactivate Membership

The membership lifecycle on the member detail page is implemented as three router endpoints that orchestrate IQPro side effects + DB writes. Mirrors the kiosk's PATCH /api/members/[memberId]/membership behavior so the two apps converge on the same IQPro shape.

**Cancellation:** `member.cancelMembership(memberId, memberMembershipId, waiveFee?)`
1. Fetches the joined member + membership + plan (via `getLifecycleContext`)
2. If `plan.cancellationFee > 0` and `!waiveFee`: charges the fee as a one-time Sale via IQPro using the saved payment method on the existing subscription (`chargeOneTimeFee` in `MemberPaymentService.ts`). On approval, inserts a `transaction` row with `transactionType = 'cancellation_fee'`.
3. Calls IQPro `POST /subscription/{id}/cancel` to cancel the membership subscription immediately.
4. If a recurring hold-fee subscription exists (`providerHoldFeeSubscriptionId`), cancels that too.
5. Sets `member_membership.status='cancelled'`, `endDate=now`, clears the hold-fee sub pointer.
6. Mirrors `member.status='cancelled'` only when this was the member's last active membership (same semantics as the IQPro webhook handler).
7. Audits `MEMBERSHIP_CANCEL` and (when charged) `CANCELLATION_FEE_CHARGE`.

The cancellation fee is best-effort: if the charge fails, the cancellation still proceeds and the failure is surfaced as a partial-success warning in the UI rather than a rollback. Regardless of whether the live IQPro charge runs (it's skipped for synthetic/seed subscriptions and can fail against the sandbox), an owed, non-waived fee is always written to the member's billing history as a `cancellation_fee` transaction — `'paid'` when captured live, `'pending'` when not — so the fee never silently disappears (#239). The **local** DB writes in step 5–6 (pending-fee row + membership status flip + mirrored member-status flip) run inside a single `db.transaction` after the IQPro side effects resolve, so a mid-way failure can't leave a cancelled membership without its fee record.

**Atomicity of multi-write flows:** several money/member flows wrap their related DB writes in `db.transaction` so a partial failure can't leave inconsistent state: `refundTransaction` (the original-status flip is done FIRST, guarded on `status != 'refunded'` so two racing refunds can't both create a refund row — the double-refund guard; coupon reversal runs best-effort AFTER the commit, batched via `inArray` delete + one grouped decrement per coupon), `createMember` (member row + address), and the post-approval writes in `processMemberPayment` (transaction rows + membership activation, so a paid transaction is never recorded without the membership learning its `providerSubscriptionId`). On an autopay initial-charge failure the attempt rows are still recorded and the membership is left unactivated (documented compensating path for an orphan IQPro subscription).

**Hold:** `member.holdMembership(memberId, memberMembershipId)`
0. **Enforce `hold_limit_per_year`** if set on the plan. Counts prior successful `memberMembership.hold` audit events for the same `memberMembershipId` in the trailing 12 months. If the count is at the limit, throws `HoldLimitReachedError` → router maps to a 409 with a clear message. 0 or null = unlimited.
1. Lifecycle context fetch.
2. If the plan has `holdFeeAmount > 0` and `holdFeeFrequency === 'one-time'`: charges a single Sale via the saved PM (same `chargeOneTimeFee` helper). Inserts a `transaction` row with `transactionType = 'hold_fee'`.
3. If `holdFeeFrequency` is recurring (`Weekly` | `Monthly` | `Semi-Annual` | `Annual`): creates a brand-new IQPro subscription with prefix `'HOLD'` and that cadence, then stores the new subscription id on `member_membership.providerHoldFeeSubscriptionId`.
4. Pauses the original membership subscription (`setSubscriptionAutoRenewal(false)` — `PUT` with `isAutoRenewed: false`).
5. Sets `member_membership.status='hold'` and `member.status='hold'`.
6. Audits `MEMBERSHIP_HOLD` (this is what the next limit-check counts) and (when applicable) `HOLD_FEE_CHARGE`.

The kiosk's `PATCH /api/members/[memberId]/membership` mirrors the same precheck against its `audit_event` slice and writes its own audit row on each successful hold/cancel/reactivate so the two apps stay consistent.

**Signup fee enforcement:** `membership_plan.signup_fee` is added to the **first** charge by the Add Member, Add Family Members, and Convert Member flows (`finalPrice = plan_price - coupon_discount + signup_fee`). The coupon discount applies to the recurring price only, not to the signup fee. The fee is bundled into the immediate at-registration charge; for autopay subscriptions, the first-period charge includes both. The `PaymentStep` + `FamilyPaymentStep` summaries display the same combined total so users see the number they'll be billed.

**Reactivate:** `member.reactivateMembership(memberId, memberMembershipId)`
1. Cancels any recurring hold-fee subscription (`providerHoldFeeSubscriptionId`).
2. Resumes the original membership subscription (`setSubscriptionAutoRenewal(true)`).
3. Sets statuses back to `active` on both the membership row and the member, and clears the hold-fee sub pointer.
4. Audits `MEMBERSHIP_REACTIVATE`.

**UI:**
- `src/features/members/lifecycle/CancelMembershipModal.tsx` — confirmation modal showing plan name, cancellation fee, a "waive fee" checkbox, and the saved-card billing summary. Wired into the "Cancel Membership" action.
- `src/features/members/lifecycle/HoldMembershipModal.tsx` — confirmation modal showing plan name, hold-fee amount + cadence (one-time vs recurring), and an explanation that the subscription will be paused.
- "Reactivate" is a one-click action (no modal) — it just calls the endpoint and refreshes the cache.

**Kiosk parity:** `dojo-planner-kiosk/src/app/api/members/[memberId]/membership/route.ts` PATCH handles the same three actions on the kiosk side. The hold-fee one-time charge is mirrored; the recurring hold-fee path is currently planner-only (kiosk member-area flow does short-term holds where one-time fees are the common case — this can be backported later if needed).

### Event Registration / Enrollment

Members are enrolled into events from the **event detail page** (`classes/events/[eventId]/page.tsx`). The page shows an "Enroll Member" button (header + registrants card) and a **Registrants card** listing enrolled members (member, tier, amount paid, with a per-row Cancel action). The `event_registration` table already existed; this feature adds the write/read/cancel paths.

**Flow (`EnrollMemberModal.tsx`):**
1. Loads all org members via `client.members.list()` (searchable).
2. On member select, fetches their saved payment methods (`client.member.listPaymentMethods`) to determine card vs ACH and whether a charge is possible.
3. User picks an optional billing tier (from `event.billing`) and, when the member has a saved card **and** the tier price > 0, may tick "charge saved card".
4. On submit: if charging, calls `client.payment.process` with `paymentMethodSource: 'saved'`, `billingType: 'one-time'`, `isTaxable: true` (events are taxable) — on approval the returned `transactionId` is passed to `client.events.register` so the transaction row is back-linked to the new registration. If not charging (or no saved card / free tier), it registers directly. A decline surfaces in the modal and does NOT create the registration.

**Endpoints (Events router, all `FRONT_DESK`):**
- `events.register` — `registerMemberForEvent` (audit `EVENT_REGISTRATION_CREATE`). Verifies event + member belong to the org (registration rows carry no `organizationId` — org-scoped via the parent event), dedupes on non-cancelled event+member, resolves the tier price, inserts the row, and back-links the optional `transactionId`. Maps `MemberAlreadyRegisteredError` → 409, `EventNotFoundError`/`MemberNotFoundError` → 404.
- `events.registrations` — `getEventRegistrations` (joined member identity + tier name; excludes cancelled). Feeds the Registrants card + the real `currentRegistrations` count (previously hardcoded to 0).
- `events.cancelRegistration` — `cancelEventRegistration` (audit `EVENT_REGISTRATION_CANCEL`; soft-cancel: `status='cancelled'`, `cancelledAt` set). Org-scoped via the parent event.

**Key Files:**
- `src/features/events/details/EnrollMemberModal.tsx` — enroll modal (member search, tier select, charge toggle)
- `src/services/EventsService.ts` — `registerMemberForEvent`, `getEventRegistrations`, `cancelEventRegistration` (+ `MemberAlreadyRegisteredError`/`EventNotFoundError`/`MemberNotFoundError`)
- `src/routers/Events.ts` — `register` / `registrations` / `cancelRegistration`
- `src/validations/EventsValidation.ts` — `RegisterForEventValidation` / `EventRegistrationsValidation` / `CancelEventRegistrationValidation`

**Notes / caveats:** Charging is best-effort and only for members with a saved card (mirrors family-member billing); there's no new-card TokenEx collection in this cut (the "record without charging" path covers no-card members). Locally IQPro is null → the charge is skipped, but the registration + amountPaid still record. Calendar-hover register (part of #257) is deferred — the detail-page enroll + registrants list is the core of #257/#279.

### Payment frequency conventions

Membership plans' `frequency` column is **nullable**. The convention:

- `null` (preferred) or legacy `'None'`: no recurring billing — used for punchcards, free trials, and any one-time purchase plan.
- `'Weekly'`, `'Monthly'`, `'Semi-Annual'`, `'Annual'`: recurring cadences. The seed script writes `null` for the 10-Class Punch Card and the 7-Day Free Trial; the wizard transformer (`membershipPlanTransformers.ts`) writes `null` for punchcard + trial membership types.

UI consumers must handle `null` everywhere it's displayed. The membership detail page's `mapFrequency` (in `src/app/[locale]/(auth)/dashboard/memberships/[membershipId]/page.tsx`) maps `null | 'None'` → `'one-time'`, which downstream cards/edit modals render as "One-time" with no `/mo` suffix on prices.

The IQPro subscription mapping (`src/services/IQProPaymentService.ts` `createSubscription`) handles four cadences:

| Frequency | IQPro `billingPeriodId` | Schedule |
|-----------|-------------------------|----------|
| `Weekly` | 2 | `daysOfWeek: [startDayOfWeek]` (no `daysOfMonth`) |
| `Monthly` | 4 | `daysOfMonth: [startDayOfMonth]` |
| `Semi-Annual` | 6 (yearly) | `daysOfMonth: [startDayOfMonth]`, `monthsOfYear: [startMonth, startMonth+6 wrapped mod 12]` — fires twice a year |
| `Annual` | 6 | `daysOfMonth: [startDayOfMonth]`, `monthsOfYear: [startMonth]` |

Semi-annual is not a native IQPro `billingPeriodId`; we emulate it by using the yearly billing period with two `monthsOfYear` entries 6 months apart. This is the safest approach against the sandbox — verify behavior in the IQPro sandbox console when first deploying semi-annual plans.

`normalizeFrequency(value)` in `MemberPaymentService.ts` is the canonical helper for converting any plan-frequency string (or `null`) into the IQPro `SubscriptionFrequency` enum. Anything that doesn't map to a recurring cadence (null, empty, `'None'`, `'one-time'`, unrecognized) returns `null` → the caller routes through `handleOneTimePayment` instead of `handleAutopay`.

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
ORG_ROLE.INSTRUCTOR       -> org:instructor
ORG_ROLE.MEMBER           -> org:member
ORG_ROLE.INDIVIDUAL_MEMBER -> org:individual_member
```

**Role Hierarchy:**
```
ADMIN > ACADEMY_OWNER > FRONT_DESK > INSTRUCTOR > MEMBER > INDIVIDUAL_MEMBER
```
Higher roles inherit all permissions of lower roles. An admin can access any endpoint that requires `FRONT_DESK` or lower.

**Instructors (`org:instructor`):** a distinct Clerk role for people who teach classes/events but aren't front-desk/admin staff. Created once in the Clerk dashboard (instance-wide role, key `org:instructor`). Assignable instructors on class/event schedules come from `org:instructor` **plus** `org:academy_owner` (owners are masters who run their own classes); admin/front-desk are excluded. The instructor's Clerk user id is stored on `class_schedule_instance.primary_instructor_clerk_id` / `event_session.primary_instructor_clerk_id`. Managed via the existing Staff page (invite with the Instructor role). A freshly-seeded org has no instructors until someone is invited as `org:instructor` (or an academy owner exists) — instructor dropdowns will be empty until then.

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

**Transport:** Direct REST API via `fetch` — **no SDK dependency at runtime**. Every IQPro call logs the full request body and full response body (or error body) via the structured `logger` so vague IQPro 4xx errors can be diagnosed from Better Stack without re-running.

**Purpose:** Processes member-level payments (one-time charges and recurring autopay subscriptions) and organization-level SaaS subscriptions. Stripe remains as a legacy fallback for org-level billing only.

**Per-org configuration (production multi-tenancy):**

IQPro credentials are split across two scopes:

| Field | Scope | Storage |
|-------|-------|---------|
| `clientId`, `clientSecret`, `gatewayId` | **per-org** (customer payments) | One AES-256-GCM encrypted blob in `organization.payment_provider_config_enc`, holding `{ provider, credentials }` (B3 — replaced the three `iqpro_config_*` columns, which do not scale to a column set per provider). Set via the per-org IQPro card on the Location Settings page (viewable by ADMIN + ACADEMY_OWNER, editable by ADMIN). Saving MERGES: the secret is never sent to the browser, so omitting it preserves the stored one. |
| `clientId`, `clientSecret`, `gatewayId` | **platform** (SaaS billing) | Singleton `platform_config` row (`id = 'singleton'` enforced by CHECK constraint). Encrypted. **No admin UI** — the platform-settings page was removed. Set out-of-process via `src/scripts/backfillPlatformIQProConfig.ts`, or leave null and let the `IQPRO_*` env fallback supply them. |
| `scope`, `oauthUrl`, `baseUrl`, `webhookSecret` | **platform-wide** | Env vars (`IQPRO_SCOPE`, `IQPRO_OAUTH_URL`, `IQPRO_BASE_URL`, `IQPRO_WEBHOOK_SECRET`). Same for every dojo. |

Customer-facing flows resolve config via `resolveIQProConfig(orgId)`; SaaS-billing flows use `resolvePlatformIQProConfig()`. Both resolvers fall back to the legacy `IQPRO_CLIENT_ID/IQPRO_CLIENT_SECRET/IQPRO_GATEWAY_ID` env vars per field when the DB column is null, so single-tenant deployments keep working unchanged.

The webhook handler at `src/app/[locale]/webhook/iqpro/route.ts` does only DB writes (no callbacks into IQPro), so it doesn't need per-org config — the global `IQPRO_WEBHOOK_SECRET` validates every webhook and routing to the right org happens via subscription/transaction-ID DB lookup.

**Migrating from env vars to DB-backed config:**

1. Set `IQPRO_CONFIG_ENCRYPTION_KEY` (32 raw bytes, hex-encoded) on the deployment.
2. For each org: ADMIN visits `/dashboard/location-settings` and enters Client ID / Client Secret / Gateway ID in the IQPro card (or run `src/scripts/backfillIQProConfig.ts --orgId=org_xxx` to copy the current env values into one org's DB row).
3. For the platform's own SaaS-billing account: run `src/scripts/backfillPlatformIQProConfig.ts` (there is no admin UI for this).
4. Once every org and the platform have their values in the DB, the `IQPRO_CLIENT_ID` / `IQPRO_CLIENT_SECRET` / `IQPRO_GATEWAY_ID` env vars can be removed (keep `IQPRO_SCOPE` / `IQPRO_OAUTH_URL` / `IQPRO_BASE_URL` / `IQPRO_WEBHOOK_SECRET` — they're platform-wide).

**OAuth token cache:** keyed by `clientId` (since `oauthUrl` and `scope` are global). Two orgs with different `clientId`s get two separate cached tokens — there's no cross-tenant leakage. Cap 100 entries; lazy eviction on access; oldest-by-expiry dropped on overflow.

**Key Files:**
- `src/libs/IQPro.ts` - REST helpers (`iqproPost`, `iqproGet`, `iqproPut`), OAuth token management, tokenization config endpoint, ACH tokenization (`tokenizeAch`), gateway processor lookup (`getGatewayProcessors`), server-authoritative fee calculation (`calculateTransactionFees`)
- `src/services/IQProConfigService.ts` - Per-org + platform IQPro config resolver (DB → env fallback). `resolveIQProConfig(orgId)` for customer-facing payments; `resolvePlatformIQProConfig()` for SaaS billing. Decrypts `client_secret` from AES-GCM at-rest storage. 60s in-memory cache per scope; invalidated on update.
- `src/services/PaymentProviderService.ts` - Provider-agnostic interface + factory; defines `FeeBreakdown`, `TransactionLineItem`, `TransactionBillingAddress` types. Every interface method now takes `config: IQProConfig` as its first arg so the provider hits the right merchant gateway per call.
- `src/services/IQProPaymentService.ts` - IQPro implementation (REST). `createCustomer` returns `{ customerId, billingAddressId }` (the billing-address ID is fetched via `iqproGet` and forwarded into transaction payloads as `paymentMethod.customer.customerBillingAddressId` so the ACH processor can resolve the cardholder name). Card uses InsertCard schema with token + maskedCard BIN format; ACH uses `tokenizeAch` then InsertAch. `processPayment` builds the canonical `Sale` payload with `remit` (tax + paymentAdjustments), `address[]`, and `lineItems[]`. Sandbox certification errors on ACH (`"not a valid transaction for certification"`) are tolerated as `pendingsettlement → approved` so dev flows work.
- `src/services/MemberPaymentService.ts` - Payment orchestration (customer → method → calculate fees → charge/subscription → DB). Tax state for fee calculation comes from `params.memberAddress.state`. For autopay: subscription is created **and** an immediate Sale charge runs for the first period (IQPro subscriptions don't auto-charge on creation). If the initial charge fails after subscription creation, the failure is surfaced and `providerSubscriptionId` is NOT persisted on the membership — the IQPro subscription will exist but the local membership stays unactivated.
- `src/services/SaasSubscriptionService.ts` - Org SaaS subscriptions via REST. Uses `iqproPost`/`iqproGet`/`iqproPut` for customer create, payment method, subscription create/get/update, and cancel.
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
1. Get or create IQPro customer (stored as `providerCustomerId` on member)
2. Register payment method — card uses `InsertCard` schema with `token` + `maskedCard` (BIN format); ACH uses `tokenizeAch` + `InsertAch` schema with `achToken`
3. One-time: process transaction → save to `transaction` table
4. Autopay: create subscription → save `providerSubscriptionId` on membership

**Vaulted-charge flow (`paymentMethodSource: 'saved'`):**

Members with an existing IQPro customer + saved payment method can be charged without re-collecting card data. Used by:
- HOH paying for family member memberships / classes
- The kiosk app charging a known member for events / seminars

Pass `paymentMethodSource: 'saved'` (with `memberId` only — no IQPro IDs cross the wire) on `payment.process`. The server resolves `member.providerCustomerId` and the saved `payment_method` row, fetches BIN/achToken from IQPro for fee preview via `getCustomerPaymentMethod`, and skips create-customer + register-PM. Returns a friendly error if either record is missing.

**Transaction payload shapes (mirrored byte-for-byte from kiosk):**

| Branch | `paymentMethod` block | `address[]` | Notes |
|--------|----------------------|-------------|-------|
| Vaulted (card or ACH) | `{ customer: { customerId, customerPaymentMethodId } }` | omitted | IQPro already has the address linked to the saved PM |
| New card | `{ customer: { customerId, customerPaymentMethodId, customerBillingAddressId } }` | full block | |
| New ACH | `{ ach: { achToken, secCode: 'PPD', routingNumber, accountType, checkNumber: null, accountHolderAuth: { dlState: null, dlNumber: null } } }` | full block | Inline ACH, NOT customer-ref. ACH is vaulted upstream for the customer record but the charge uses the inline sub-object per Basys docs |

**Tax + service fees (`isTaxable` flag):**

- `isTaxable: true` (events / seminars / store): emits a `Tax` paymentAdjustment (`{ type: 'Tax', percentage: null, flatAmount }`), sets `remit.taxAmount: null` + `remit.isTaxExempt: false`, sets `lineItems[].localTaxPercent` to the org-specific tax rate (`organization.location_tax_rate`, default 0). IQPro rejects passing both `remit.taxAmount` and a Tax adjustment.
- `isTaxable: false` (memberships, default): no Tax adjustment, `remit.taxAmount: 0`, `remit.isTaxExempt: true`, line-item tax 0.
- ServiceFee adjustment is always present: `{ type: 'ServiceFee', percentage: SERVICE_FEE_PCT, flatAmount: null }`. IQPro requires ServiceFee be percentage-only — passing `flatAmount` fails validation.

**Receipt email:**

After every approved transaction (one-time or autopay-initial-charge), `sendPaymentReceiptEmail` fires fire-and-forget with line items, subtotal, discount, tax, service fee, total, and transaction ID. The tax row is hidden when `taxAmount === 0`. Never sent on declined or processing.

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

**Responsible academy owner:** Each org's SaaS subscription is tied to a **responsible academy owner** — the Clerk user with the `org:academy_owner` role (academy owners are NOT `member` rows). `getAcademyOwner(orgId)` in `ClerkRolesService.ts` resolves them via Clerk's org-membership API. `subscribeToPlan` requires an academy owner to exist (else 409), bills the IQPro SaaS customer to the owner's email, and stores the owner's Clerk userId in `organization.saasResponsibleClerkUserId`. The subscription page (`getCurrentPlan` → `responsibleOwner`) displays the owner's name/email.

**Key files:**
- `src/utils/SaasPlans.ts` — Plan config (prices, features, IDs)
- `src/utils/SuperAdmins.ts` — Super admin username list
- `src/services/ClerkRolesService.ts` — `getAcademyOwner(orgId)` resolves the responsible academy owner from Clerk
- `src/services/SaasSubscriptionService.ts` — Service layer (subscribe, change, cancel, billing history, super admin auto-grant); `subscribe` persists `responsibleClerkUserId`, `getCurrentSubscription` returns it
- `src/routers/SaasSubscription.ts` — ORPC endpoints (view: `ACADEMY_OWNER`; mutate subscribe/change/cancel/tokenization: `ADMIN`). `subscribeToPlan` requires an academy owner and passes it to `subscribe`
- `src/validations/SaasSubscriptionValidation.ts` — Zod schemas
- `src/utils/Auth.ts` — `requireActiveSubscription(pathname)` server-side owner-aware gate
- `src/hooks/useSubscriptionData.ts` — Client hook for fetching subscription + billing history
- `src/features/billing/SubscriptionDialog.tsx` — Subscription management dialog (opened from UserMenu, and from the subscription-expired page's re-subscribe button). **This is the only user-facing subscription surface** — it shows current plan, plan cards, subscribe/change/cancel, billing history, and the responsible academy owner.
- `src/app/[locale]/(auth)/dashboard/subscription-expired/page.tsx` — Expired subscription page; admins re-subscribe by opening the `SubscriptionDialog` from here

**Access enforcement (owner-aware, server-side):** The dashboard server layout (`src/app/[locale]/(auth)/dashboard/layout.tsx`) calls `requireActiveSubscription(pathname)` BEFORE rendering protected content. An org may access the dashboard only when it has an active (or trial) subscription AND the responsible academy owner still exists in Clerk — a missing owner OR inactive subscription redirects (server-side) to `/dashboard/subscription-expired`. Super admins, exempt orgs, and fresh orgs without a DB row bypass; `/dashboard/subscription-expired` stays reachable (the exempt-segment list still includes `/subscription` defensively). The pathname is read from an `x-pathname` request header stamped by `src/proxy.ts`. The client `useEffect` redirect in `DashboardLayoutClient` remains as a UX fallback, and uses the same `hasActiveSubscription` source of truth as the server gate.

**Expiry backstop (recharge safety):** `hasActiveSubscription` / `getCurrentSubscription` ([SaasSubscriptionService.ts](src/services/SaasSubscriptionService.ts), `isSubscriptionActive` helper) treat a subscription as active only when the status is `active`/`trial` **AND** `saasCurrentPeriodEnd` is within a `SUBSCRIPTION_GRACE_MS` (3-day) window — so a missed/late IQPro renewal webhook can't keep an expired org active indefinitely. A null period end never blocks (defensive). Note: `saasCurrentPeriodEnd` is stored in **milliseconds** everywhere (`subscribe()`, the IQPro webhook, and the seed) — keep it ms.

**Real vs synthetic subscriptions:** A real subscription is created only via the card-collecting subscribe flow (TokenEx → `subscribe()` registers the IQPro payment method, creates the subscription with `isAutoRenewed`/`isAutoCharged`, so renewals + plan changes auto-charge the stored method with no re-collection). The seed does **not** fabricate a paid subscription — it writes an honest `trial` with null IQPro IDs (see seed section). `changePlan`/`cancelSubscription` reject unbacked subscriptions (null or `seed_org_`-prefixed `saasProviderSubscriptionId`) via `isRealSubscriptionId` with a clear "subscribe with a payment method first" error, instead of firing doomed IQPro calls or silently mutating state.

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
- `organization` - Multi-tenant orgs with Stripe IDs + platform SaaS subscription fields (saasProviderCustomerId, saasProviderSubscriptionId, saasProviderPlanId, saasBillingCycle, saasSubscriptionStatus, saasCurrentPeriodEnd, saasProviderPaymentMethodId, `saasResponsibleClerkUserId` — Clerk userId of the academy owner responsible for the SaaS subscription; set at subscribe time, durably links the IQPro SaaS customer to a Clerk identity and is required by the owner-aware access gate) + location settings (locationName, locationAddress, locationPhone, locationEmail — nullable, set via the location-settings page; `locationTaxRate` real defaulting to 0, applied to taxable transactions) + `paymentProvider` (`iqpro` | `square`, CHECK-constrained, selects which processor handles that org's member-facing money) + `paymentProviderConfigEncrypted` (ONE AES-GCM blob of `{ provider, credentials }`; replaced the three `iqpro_config_*` columns in B3). `locationTaxRate` is CHECK-constrained to [0, 100] as of B3 — it feeds money arithmetic and previously had no DB guard
- `platform_config` - Singleton row (`id = 'singleton'` enforced by CHECK constraint) holding the platform's own IQPro credentials used for SaaS billing (saasProviderClientId, saasProviderClientSecretEncrypted, saasProviderGatewayId). Written only by `src/scripts/backfillPlatformIQProConfig.ts`; read by `resolvePlatformIQProConfig()` for SaaS billing. No admin UI.
- `member` - Member records with dateOfBirth, optional `clerkUserId` for kiosk auth, optional `providerCustomerId`
- `membership_plan` - Pricing tiers, including `frequency` (nullable: null = one-time / punchcard / trial; otherwise `Weekly` | `Monthly` | `Semi-Annual` | `Annual`), `cancellationFee` (real, default 0), `holdFeeAmount` (real, default 0), `holdFeeFrequency` (nullable: `one-time` | `Weekly` | `Monthly` | `Semi-Annual` | `Annual`), `holdLimitPerYear` (integer, nullable; null or 0 = unlimited; enforced server-side by `holdMembershipLifecycle` via a 12-month-window audit-log count)
- `member_membership` - Member-plan associations with startDate, endDate, firstPaymentDate, nextPaymentDate, optional `providerSubscriptionId`, optional `providerHoldFeeSubscriptionId` (set when a recurring hold-fee subscription is created at hold time; cleared on reactivate/cancel)
- `program` - Training programs (Adult BJJ, Kids, Competition)
- `class` - Class definitions, including `allow_walk_ins` (text, default `'Yes'`; `'Yes' | 'No'`)
- `class_schedule_instance` - Recurring schedule patterns (`primary_instructor_clerk_id` → a Clerk instructor)
- `class_schedule_exception` - Schedule overrides (cancellations, modifications)
- `instructor_profile` - Per-org in-app instructor photo overrides (`organization_id`, `clerk_user_id`, `photo_url` base64 data URL; unique on the pair). Preferred over the Clerk avatar. Set via the Staff page instructor-photo modal.
- `event` - Special events (seminars, workshops)
- `event_session` - Event time slots (`primary_instructor_clerk_id` → a Clerk instructor)
- `event_billing` - Event pricing tiers
- `tag` - Polymorphic tags for classes/memberships/events
- `coupon` - Discount codes
- `transaction` - Financial transactions (membership payments, signup fees, event registrations, refunds, adjustments), optional `providerTransactionId`. `member_id` is **nullable**: a null member = a guest / non-member sale (e.g. a kiosk store purchase by someone who isn't a member). Member-scoped queries filter on `member_id` so guest rows don't appear on a member's page; the org-wide transactions list/detail (`TransactionsService`) `leftJoin` member (NOT inner — an inner join would drop guest rows) and the UI shows "Non-member" when there's no member name. Guest purchase detail rides in `description`; there is no separate customer-name column.
- `attendance` - Check-in records
- `audit_event` - SOC2 compliance audit logging
- `payment_method` - Saved payment methods (card, bank_transfer, cash, check), optional `providerPaymentMethodId`
- `address` - Member addresses
- `note` - Member notes
- `family_member` - Family relationships
- `catalog_item` - Merchandise and event access products
- `catalog_item_variant` - Product variants with custom name, price, and stock quantity (max 8 per item)
- `catalog_category` - Product categories
- `catalog_item_category` - Item-category associations (M:N)
- `catalog_item_image` - Product images
- `waiver_template` - Waiver templates with placeholders, guardian settings, and immutable versioning (`parentId` for archive rows)
- `signed_waiver` - Signed waiver records with signature data, rendered content, membership plan snapshot (name, price, frequency, contract length, signup fee, trial status), and coupon/discount snapshot (code, type, amount, discounted price). Only a **single** signature is captured per waiver: `signatureDataUrl`/`signedByName` hold the signer. When a minor requires a guardian (`requiresGuardian`), that single signature is the **guardian's** and `signedByRelationship` records the relationship (`parent` | `guardian` | `legal_guardian`); the minor never signs. The waiver PDF labels the line "Guardian signed by" when `signedByRelationship` is set to anything other than `self`, else "Signed by".
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
- 13 classes (BJJ Fundamentals I/II, Intermediate, Advanced, Kids Class, Kids Advanced, Advanced No-Gi, Beginner No-Gi, Women's BJJ, Open Mat, Open Mat - Weeknight, Self-Defense Workshop, Competition Team) with schedule instances
- 8 schedule exceptions (mix of past + future, cancellations + modifications)
- 5 events covering all `eventType` values — seminar, workshop, tournament, camp, and one past workshop with historical attendance. Dates are relative to seed time (e.g., +6 weeks, +10 weeks, +14 weeks, +20 weeks, −12 weeks for the past one)
- 12 coupons (various types and statuses)
- 10 membership plans covering every IQPro frequency branch (Weekly, Monthly, Semi-Annual, Annual, null) and every fee combination — signup, cancellation, hold (one-time + recurring), hold limits per year
- 14 sample members covering every lifecycle state (active, trial, hold, cancelled, past_due) and every memberType (individual, head-of-household, family-member). Each gets a synthetic `providerCustomerId` so vaulted-charge code paths work
- 10 family-member links (5 HOH ↔ family-member pairs, bidirectional rows)
- 14 payment methods (one per member, all with synthetic `providerPaymentMethodId`)
- ~200 transactions covering every `transactionType`: signup_fee, membership_payment, event_registration, refund, adjustment, hold_fee (one-time + recurring), cancellation_fee
- Lifecycle audit events — `member.create` for every member, `memberMembership.hold` / `memberMembership.cancel` / `holdFee.charge` / `cancellationFee.charge` for the matching members. Includes a prior hold row on John (idx 0) so the `holdLimitPerYear: 2` enforcement can be tested by triggering further holds.
- Catalog items with variants, categories, and images
- 3 waiver templates (Standard Adult, Kids Program, Free Trial) with membership associations
- Signed waivers for every member with a membership — each row has the full plan snapshot (price, frequency, signup fee, contract length, isTrial) and 2 members get a coupon snapshot too. Kids members get the Kids waiver; trial member gets the Trial waiver; everyone else gets the standard Adult waiver
- 2 waiver merge fields (academy, academy_owners)
- Rich attendance records — 6-15 per active/trial/hold member spanning the last 8 weeks (2-3 for cancelled/past_due), with `checkOutTime`, `instructorClerkId` (3-instructor rotation), `checkedInByClerkId` for manual check-ins, and a short `notes` string on ~20% of rows
- SaaS subscription on the seeded organization (`--orgId` only) — provisioned by `provisionSaasSubscription()`. When the real-provisioning prerequisites are present in the seed env (`CLERK_SECRET_KEY` + IQPRO platform creds, detected from raw `process.env` so the synthetic path stays free of strict env validation) AND an academy owner exists in Clerk (`getAcademyOwner`), it lazily imports and calls `subscribe()` for REAL provisioning (real IQPro customer + subscription + `saasResponsibleClerkUserId`). Otherwise it writes an **honest synthetic `trial`** — `saasSubscriptionStatus='trial'`, null `saasProviderCustomerId`/`saasProviderSubscriptionId`/`saasProviderPaymentMethodId` (no fake paid sub), `saasBillingCycle`, a synthetic responsible owner, and `saasCurrentPeriodEnd` ~30 days out in **milliseconds**. The trial counts as active in the gate (so freshly seeded local orgs aren't redirected) but cannot be changed/cancelled (unbacked) — a real paid plan requires the in-app subscribe flow. SaaS flags: `--skipSaas`, `--saasPlan`, `--saasCycle`, `--saasEmail`, `--saasOrgName`, `--ownerClerkId`, `--saasCard`, `--saasExpiry` (see the seed-script header).

**Dynamic dates:** every date in the seeded data — event sessions, schedule exceptions, member join dates, transactions, attendance, waiver signings — is computed relative to `seedNow` (the script's run time). Re-seeding 6 months from now produces the same shape of data, just shifted forward — no stale 2025/2026 literals.

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

**Optional (IQPro — platform-wide):**
```bash
# These five are platform-wide (same IQPro environment for every dojo).
IQPRO_SCOPE
IQPRO_OAUTH_URL
IQPRO_BASE_URL
IQPRO_WEBHOOK_SECRET
IQPRO_CONFIG_ENCRYPTION_KEY  # 32 raw bytes, hex-encoded (64 chars). Required when any org has a payment_provider_config_enc blob.

# These three are per-org / per-platform. Read at runtime from the
# organization or platform_config row, with these env vars as a fallback for
# orgs that haven't filled in the IQPro card on Location Settings yet (or for the platform's own
# SaaS-billing IQPro account before backfillPlatformIQProConfig.ts is run).
# Once you've migrated everything into the DB via Location Settings +
# backfillPlatformIQProConfig.ts, these env vars can be removed.
IQPRO_CLIENT_ID
IQPRO_CLIENT_SECRET
IQPRO_GATEWAY_ID

SERVICE_FEE_PCT=3.75     # Service fee % applied to EVERY transaction. Sent to IQPro as a ServiceFee paymentAdjustment (percentage, not flatAmount).
# Note: Sales-tax % is per-organization (see Location Settings page → tax_rate).
# It is stored in `organization.location_tax_rate` (default 0) and applied to TAXABLE
# transactions (events, store) only. Memberships are non-taxable.
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

### Performance conventions

- **Migrations:** the schema is applied via the single hand-authored `migrations/0000_baseline.sql` (there is no `0000_snapshot.json`, so drizzle-kit would regenerate the whole schema — `npm run db:generate` is therefore **disabled** and exits non-zero with an explanation). To add/alter a table or index, edit BOTH `src/models/Schema.ts` (the Drizzle source of truth) AND `0000_baseline.sql` (append the DDL), keeping them in sync by hand, then run the DDL against Neon directly (`CREATE INDEX CONCURRENTLY IF NOT EXISTS …`) since the baseline is already applied there. Local dev picks up baseline changes only on a fresh `rm -rf local.db` + reseed. **Append control-plane / additive DDL at the END of the baseline** — edits to existing tables happen in the sections above, and a merge conflict in this file is silently catastrophic.
- **Proving the schema is in sync:** `npm run db:check-schema` diffs `Schema.ts` + `ControlSchema.ts` against `0000_baseline.sql`, and against the live database when `DATABASE_URL` is set. Because `db:generate` is disabled, the Drizzle definitions and the DDL are maintained by hand with nothing else to catch a slip — **run this after every schema edit.**
- **Editing an already-applied baseline:** drizzle's migrator compares `created_at` timestamps, not file hashes (`pg-core/dialect.js`), so editing `0000_baseline.sql` is safe for fresh databases but is **silently skipped** on any database that already recorded it. Existing databases (preview, production) need the equivalent DDL applied by hand — see the B1 PR for the generated forward and rollback SQL, and prove convergence by building both paths and diffing `information_schema`.
- **Provider-neutral column names:** payment columns are named for the *role*, not the vendor — `provider_*` on member-facing tables (`member`, `member_membership`, `payment_method`, `transaction`) and `saas_*` on `organization`/`platform_config` for the platform's own billing. `organization.payment_provider` (CHECK: `iqpro`|`square`) selects the processor for an org's member payments; keep it in step with `src/types/PaymentProvider.ts`. The token `iqpro` still legitimately names the *vendor* — `libs/IQPro.ts`, `IQPRO_*` env vars, the `/webhook/iqpro` route — so never blanket-rename it.
- **There are still NO numbered migrations — `0000_baseline.sql` remains the only one.** A schema change edits the baseline in place (so a fresh database gets the final shape) and ships **hand-applied DDL** for databases that already recorded 0000, since drizzle compares `created_at` rather than file hashes and silently skips an edited baseline there. See `~/Desktop/b1-ddl/` and `~/Desktop/b3-ddl/` for the pattern: an idempotent `*-forward.sql` and a `*-rollback.sql`, both proven by building a database from the previous baseline, applying the forward DDL, and diffing `information_schema` against a fresh one. `npm run db:check-schema` only proves column NAMES agree — not types, nullability, or CHECK constraints — so verify those by hand.
- **Data migrations that need the encryption key cannot be SQL.** `payment_provider_config_enc` holds AES-GCM ciphertext whose key lives in the app environment, so a backfill has to be a script rather than DDL. B3's `migrateProviderConfigBlob.ts` did that job and has since been deleted: the `iqpro_config_*` columns it read no longer exist in the baseline, so it could not run. Keep the pattern in mind for the next such migration.
- **Applying migrations:** `npm run db:migrate:tenants` (`src/scripts/migrateTenants.ts`) is the deploy-time migrator; it runs in the pipeline **before** the new version serves traffic and exits non-zero on any failure. It replaced a `runMigrations()` call in the root layout that ran during page render, swallowed errors, and raced across serverless instances. Local dev is unaffected — `npm run dev` still runs `db:migrate` via the `db-server:file` script. The migrator builds its own **raw** connection: `@/libs/DB` is a Proxy (see Multi-Tenancy) and drizzle's `migrate()` reaches into internals it does not forward.
- **Index every hot filter/join column:** every table that is filtered or joined on `member_id`, `organization_id`, a status column, or ordered by `created_at` should have a matching (often composite) index. The member-scoped tables (`address`, `note`, `payment_method`) and `transaction (organization_id, created_at)` / `signed_waiver (organization_id, signed_at)` composites were added for exactly this.
- **Don't load rows to count them:** use `count()` + `GROUP BY` (e.g. `getOrganizationWaiverTemplates` counts signed waivers with a grouped aggregate) rather than `db.select()`-ing full rows and counting in JS — signed waivers / catalog images carry base64 blobs.
- **Keep base64 out of list queries:** `member.photoUrl` and catalog image `url`/`thumbnailUrl` are base64 data URLs. The members-LIST query returns `photoUrl: null` and the detail page loads the photo via `member.getById`; large lists are paginated client-side (members, transactions, catalog) so only a page of image-bearing rows is in the DOM.
- **Parallelize independent awaits** with `Promise.all` (reports insights, `getCurrentPlan`'s DB + Clerk calls). **Dedupe per-request work** with React `cache()` (the dashboard subscription gate's org lookup + `hasActiveSubscription`).
- **Code-split heavy client deps:** `recharts` (Dashboard + Reports charts) and `browser-image-compression` are loaded via `next/dynamic` / lazy `await import()` so they're not in initial route bundles. `next.config.ts` sets `experimental.optimizePackageImports` for `lucide-react`/`recharts`/`date-fns`. `reactCompiler: true` auto-memoizes, so manual `useMemo`/`useCallback`/`React.memo` are usually unnecessary.

## Multi-Tenancy (tenant connection seam)

The app is moving to **one Postgres database per Clerk organization**. A1 landed the connection seam, A3 provisioning, A4 the data copy, and A5 the per-org cutover machinery. **No organization has been cut over yet** — every org still resolves to the shared database — but the split is now per-org rather than global.

### An org is cut over when its OWN tenant row says so

There is no global switch. `TENANCY_MODE` has been **retired from the read path** in both apps: an org is split when its `tenant` row holds a real connection string that is not the shared database, and a row still naming the shared database is **served from there**, not refused.

⚠️ **The predicate is the DECRYPTED CONNECTION STRING, never the `region` label.** `registerTenants` writes `region: 'aws-us-east-1'`, so a region check passes rows pointing straight at the shared database — that was a real cross-tenant leak. The region is a cheap secondary filter only.

This is what makes "one org at a time" possible: with a global flag, cutting over one org made every other org 409. Both apps read the same per-row signal, so no coordinated env flip is needed.

### Cutover scripts

| Script | Does |
|--------|------|
| `npm run db:provision-tenant` | Registers a database you created **by hand** (`--connection-string` is REQUIRED), applies the baseline or verifies it is already complete, proves isolation. **Leaves the row non-servable** — serving an org from an empty database blanks its dashboard with no error. It does NOT create databases: Neon refuses `POST /projects` on a Vercel-managed org, and at this scale manual creation is not a bottleneck. |
| `npm run db:copy-tenant` | Freezes the org (`status='migrating'`, which both apps refuse), reads the source in ONE `REPEATABLE READ` snapshot, copies into the destination in one transaction, then restores the prior status on **every** exit path. |
| `npm run db:verify-copy` | Row parity, isolation, and content sampling. Exits non-zero on any mismatch. |
| `npm run db:cutover-tenant` | The orchestrator: copy → verify → activate. **The only place a cut-over org is flipped to `active`**, and only after verification passes. `--activate-only` skips copy+verify for a database that was **seeded into place** rather than copied — it still refuses unless the destination actually holds rows for that org, since activating an empty database serves a blank dashboard with no error. Mutually exclusive with `--dry-run`. ⚠️ With `--activate-only` there are no source rows, so **rollback is not a restore** — the script says so explicitly. |
| `npm run db:rollback-tenant` | Repoints the row at the shared database. Reports what rows live only in the tenant database first, and refuses without `--force` when that number is non-zero. |
| `npm run db:deprovision-tenant` | Stops serving one org: flips its row to `archived` (which `resolveTenant` refuses) and reports the database host + row count so the operator can delete it by hand. **It does NOT delete the database** — Neon refuses deletion on Vercel-managed projects, and `neon_project_id` is no longer recorded since databases are created manually. Claiming otherwise would be worse than not trying. Dry run by default. |
| `npm run db:export-tenant` | `pg_dump` of one org's whole database, for a portability request. Refuses an org still on the SHARED database — a whole-database dump would hand that customer every other org's data. Strips `-pooler` (Neon recommends unpooled for dumps). |
| `npm run db:show-tenants` | Read-only: prints each org's directory row — display name, status, region, and the **host** its connection string resolves to (never credentials). The fastest way to answer "which database does this org actually use?" |
| `npm run db:purge-tenant` | Deletes ONE org's rows from ONE database. **Refuses to delete an org's only copy** — it reads the org's tenant row and requires that the target is NOT the database that org is served from, and that the org's own database holds rows. Override with `--i-know-this-is-the-only-copy`. **Dry run by default**; deleting needs `--confirm` **and** `--yes-delete=<orgId>` repeating the id. Row selection comes from `TenantDataMap` walked in reverse (insert order reversed = FK-safe delete order), in one transaction. `seed.ts --reset` clears *and re-seeds* — this is the clear-only counterpart. |

Rollback stays cheap because the copy **never deletes from the source** — the shared rows are the rollback until a soak passes. Deleting them afterwards is `db:purge-tenant`, which refuses unless the org is genuinely served from elsewhere.

### Adding an organization (the supported path)

Databases are created **by hand** — `provisionTenant` does not mint them. Neon refuses `POST /api/v2/projects` on a Vercel-managed organization, and under ~50 orgs with hands-on onboarding, a few minutes in the console is not a bottleneck.

1. Neon/Vercel console → create the database → copy its **pooled** connection string
2. `npm run db:provision-tenant -- --orgId=<org> --connection-string=<pooled>`
3. `DATABASE_URL=<pooled> CONTROL_DATABASE_URL=<control> npx tsx src/scripts/seed.ts --orgId=<org>`
4. `npm run db:cutover-tenant -- --orgId=<org> --target=<pooled> --activate-only`
5. Verify with `npm run db:show-tenants` and the app's `[Tenancy] resolved { orgId, dbHost }` log line

For an org that already has data in the shared database, replace 3–4 with `db:copy-tenant --dry-run` then `db:cutover-tenant` (copy → verify → activate).

### Migrations fan out

`npm run db:migrate:tenants` migrates the control plane, the shared database, **and every `active` tenant database** read from the directory, recording `schema_version` back onto each row. `npm run db:check-tenants` compares each active tenant's recorded version against the migration journal and fails on drift — a tenant that missed a migration otherwise fails only at runtime, against columns its database does not have. A cut-over org this skipped would silently miss every future migration. DDL runs over a **direct** URI (`directUri` strips Neon's `-pooler` suffix) because multi-statement DDL is unreliable through transaction pooling.

### The two planes

| Plane | Holds | Handle |
|-------|-------|--------|
| **Control** | `tenant`, `tenant_external_ref`, `platform_config`, and `organization`'s SaaS-billing columns | `controlDb` (`src/libs/ControlDb.ts`), `controlOrganizationDb()` (`src/libs/ControlPlaneReads.ts`) |
| **Tenant** | Everything else — members, classes, transactions, waivers, and `organization`'s `location_*` / merchant-credential columns | `db` (`src/libs/DB.ts`) |

The control plane must be readable **before** any tenant database can be opened, which is why the tenant directory cannot live inside a tenant database.

### How `db` resolves

`src/libs/DB.ts` exports a **Proxy**, not a connection. Every property access resolves the current request's tenant database from `AsyncLocalStorage` (`src/libs/TenantContext.ts`). This is what lets the ~20 service modules keep their unchanged `import { db } from '@/libs/DB'`.

**Accessing `db` outside a tenant scope throws.** That is deliberate — a database access with no tenant must be loud, never a silent fall-back to a default connection.

| File | Role |
|------|------|
| `src/libs/TenantContext.ts` | `runWithTenant` / `getTenantScope` / `requireTenantScope` / `enterTenantScope` |
| `src/libs/TenantDb.ts` | Bounded LRU of `pg.Pool`s keyed by orgId (`TENANT_POOL_MAX`, default 12) |
| `src/libs/ControlDb.ts` | Control-plane singleton, typed against `ControlSchema` only |
| `src/libs/ControlPlaneReads.ts` | `organization` reads that must not require a tenant scope (the RSC access gate) |
| `src/libs/WebhookTenantScope.ts` | Bootstrap scope for sessionless webhooks — the one place phase A2 changes |
| `src/services/TenantDirectoryService.ts` | orgId → connection string, 60s TTL cache, typed errors |
| `src/models/ControlSchema.ts` | `tenant` + `tenant_external_ref` |

### Where scope is established

- **RPC** (`rpc/[[...rest]]/route.ts`) — resolves `orgId` once, reuses it for rate limiting, wraps the handler in `runWithTenant`. `TenantNotProvisionedError` → 409, `TenantUnavailableError` → 503. Org-less requests deliberately run **without** a scope so `guardAuth()` returns its JSON 401.
- **Webhooks** — bootstrap scope via `WebhookTenantScope`. IQPro payloads carry no org discriminator, so A2 will add a `tenant_external_ref` lookup that resolves the org *before* opening a connection.
- **RSC** — ⚠️ **ambient scope does NOT work here.** React dispatches child renders from its own scheduling root, a context that never saw a parent's `enterWith()`, so a scope set in a layout or page helper does not reach the component that actually queries. **Server components must resolve their database explicitly with `getDbForOrg(orgId)`** — see `InstructorsService.getInstructorPhotoOverrides`. Control-plane reads (`orgExists`, `hasActiveSubscription`) use `controlOrganizationDb()` and need no scope at all.

### Writing new code

- Services and routers called from **RPC handlers** need no changes — keep importing `db` normally.
- A function that can be called during **server-component render** must take `orgId` and resolve its own handle via `getDbForOrg(orgId)`. Ambient `db` throws there. If a service is called from both RPC and RSC, resolving explicitly is safe in both.
- A new script, cron, or background job **must** wrap its work in a tenant scope, or `db` will throw.
- Never pass `db` to something that reaches into drizzle internals (e.g. `migrate()`); build a raw connection instead.
- `DEFAULT_TENANT_DATABASE_URL` is a **non-production** escape hatch. `TenantDirectoryService` refuses to honour it when `NODE_ENV === 'production'` — without that guard a misconfigured deploy would route every tenant to one database. Covered by an explicit test.

### Observability

Both apps log `{ orgId, dbHost }` once per tenant resolution — **host only, never credentials**. If an org is served from the wrong database the symptom is silent (empty reads, successful-looking writes), so this line is the only runtime detector.

### Env

`CONTROL_DATABASE_URL` (falls back to `DATABASE_URL`), `DEFAULT_TENANT_DATABASE_URL` (dev only), `CONTROL_PLANE_ENCRYPTION_KEY` (falls back to `IQPRO_CONFIG_ENCRYPTION_KEY`; separate because a connection string is a higher trust tier than a gateway id).

`TENANCY_MODE` is **no longer read by either app's routing**. It survives only as an ops guard for destructive scripts, where a global "are we mid-migration" answer is the right question.

🔒 **Local dev is unchanged:** with no `CONTROL_DATABASE_URL` and no keys, `resolveTargets()` returns the one shared database and the tenant fan-out returns empty. `rm -rf local.db && npm run dev` works in both repos with no control plane.

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

**Audit Actions (includes read-access events `TRANSACTION_VIEW` + `PAYMENT_METHOD_VIEW` for SOC2 CC7.2):**
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
AUDIT_ACTION.EVENT_REGISTRATION_CREATE; // member enrolled into an event
AUDIT_ACTION.EVENT_REGISTRATION_CANCEL; // registration soft-cancelled

// Coupon operations
AUDIT_ACTION.COUPON_CREATE;
AUDIT_ACTION.COUPON_REDEEM;

// Attendance operations
AUDIT_ACTION.ATTENDANCE_CHECK_IN;
AUDIT_ACTION.ATTENDANCE_CHECK_OUT;

// Transaction operations
AUDIT_ACTION.TRANSACTION_CREATE;
AUDIT_ACTION.TRANSACTION_REFUND;
AUDIT_ACTION.TRANSACTION_VIEW; // read-access logging (SOC2 CC7.2) — member transaction history

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
AUDIT_ACTION.PAYMENT_METHOD_VIEW; // read-access logging (SOC2 CC7.2) — saved payment methods

// SaaS subscription operations
AUDIT_ACTION.SAAS_SUBSCRIPTION_CREATE;
AUDIT_ACTION.SAAS_SUBSCRIPTION_CHANGE;
AUDIT_ACTION.SAAS_SUBSCRIPTION_CANCEL;

// Organization operations
AUDIT_ACTION.ORGANIZATION_LOCATION_UPDATE;

// IQPro merchant configuration
AUDIT_ACTION.IQPRO_CONFIG_UPDATE; // per-org IQPro card (Location Settings page)
AUDIT_ACTION.PLATFORM_IQPRO_CONFIG_UPDATE; // declared but NOT emitted — its only emitter was the removed platform-settings router

// Instructor operations
AUDIT_ACTION.INSTRUCTOR_PHOTO_UPDATE; // in-app instructor headshot upload/clear

// Family member operations
AUDIT_ACTION.FAMILY_MEMBER_LINK;
AUDIT_ACTION.FAMILY_MEMBER_UNLINK;
AUDIT_ACTION.MEMBER_CONVERT;

// Membership lifecycle operations
AUDIT_ACTION.MEMBERSHIP_CANCEL;
AUDIT_ACTION.MEMBERSHIP_HOLD;
AUDIT_ACTION.MEMBERSHIP_REACTIVATE;
AUDIT_ACTION.CANCELLATION_FEE_CHARGE;
AUDIT_ACTION.HOLD_FEE_CHARGE;

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

### Multi-Tenant Org-Scoping (data isolation)

**`guardRole()` only proves the caller has a role in THEIR OWN org — it does NOT verify that a row referenced by a request ID belongs to that org.** A service function that filters only on a child ID (`where(eq(id, ...))`) lets a caller in org A mutate/read org B's data by supplying B's IDs. Every service function that takes an entity ID from client input MUST verify that entity belongs to `context.orgId` before touching it.

**Pattern:** pass `organizationId` into the service function and verify ownership via a `SELECT ... WHERE id = ? AND organizationId = ?` (or a JOIN up to the org-owning parent), throwing a typed `*NotFoundError` on miss. Routers map that error to **404** (via a `toOrpcError` helper) so a cross-tenant probe is indistinguishable from a genuine miss. Reference implementations:
- `CatalogService.ts` — `assertItemInOrg` / `resolveVariantItemInOrg` / `assertImageInOrg` guard `createCatalogVariant`/`updateCatalogVariant`/`deleteCatalogVariant`/`adjustVariantStock`/`createCatalogImage`/`deleteCatalogImage`; `CatalogNotFoundError` → 404.
- `WaiversService.ts` — `assertPlanInOrg` / `assertTemplateInOrg` guard the membership↔waiver association setters/getters and `getMemberSignedWaivers` (org filter on `signedWaiverSchema.organizationId`, PII protection); `WaiverNotFoundError` → 404.
- `MembersService.ts` — `assertMemberInOrg` / `assertPlanInOrg` guard `addMemberMembership`/`changeMemberMembership` and the family link/unlink/read functions (`linkFamilyMember`/`unlinkFamilyMember`/`getFamilyMembers`/`getHOHForFamilyMember`); `MemberNotFoundError` → 404.
- `ClassesService.deleteScheduleException` — JOIN up to `classSchema.organizationId`.
- `ProgramsService.assertProgramInOrg` / `TagsService.assertTagsInOrg` — guard the client-supplied `programId` and `tagIds` on `createClass`/`updateClass`/`createEvent`/`updateEvent`/`createMembershipPlan`/`updateMembershipPlan`. An FK constraint alone is satisfied by ANY org's row, so these verify org (and, for tags, `entityType`) ownership explicitly; `ProgramNotFoundError` / `TagNotFoundError` → 404 via the shared `toTenancyOrpcError` helper in `src/routers/OrpcErrors.ts`.
- **Coupon revalidation** (`MemberPaymentService.validateCouponForCharge`) — `processMemberPayment` re-fetches the coupon by `id AND organizationId` and rejects (declined) when it's missing/inactive/outside the validity window/over `usageLimit`/`applicableTo`-mismatched, or when the member is over `perUserLimit`. The discount is computed from the DB `discountType`/`discountValue` (+ `maxDiscountAmount` cap), never from the client's `appliedCoupon`. The global limit is enforced atomically at redemption time via a conditional `UPDATE ... WHERE usageCount < usageLimit RETURNING`.

**Transactional multi-write (`db.transaction`):** `createClass`/`updateClass` and `createEvent`/`updateEvent` wrap their parent-row + schedule/session/billing/tag replacement in a single transaction so a mid-way failure can't leave a half-updated schedule (joins the existing `refundTransaction`/`createMember`/`processMemberPayment` atomicity set).

**Audit logging is best-effort:** `audit()` swallows any logger-transport failure internally (logs to `console.error`), so a logging error can never turn a successful mutation into a 500 or mask a rethrown domain error in a router catch block.

**Shared status vocabulary:** member lifecycle statuses live in `src/types/MemberStatus.ts` (`MEMBER_STATUS` / `MEMBER_STATUS_VALUES`); `MemberValidation.status` builds its Zod enum from it. Keep the DB `member.status` comment, filters, reports, and webhook in sync via this constant (root-cause fix for the historical `'past due'` vs `'past_due'` drift). Address shapes are centralized in `src/validations/AddressValidation.ts`.

Note the pre-existing `Member.create` handler already verifies a plan is in-org before `addMemberMembership`; the standalone `addMembership`/`changeMembership` endpoints now do too.

### Security Checklist for New Features

When adding new features, ensure:

1. **Authentication:** Use `guardAuth()` or `guardRole()` for all protected endpoints
2. **Org-scoping:** Verify every client-supplied entity ID belongs to `context.orgId` before reading/mutating it (see Multi-Tenant Org-Scoping above). `guardRole` alone is NOT sufficient.
3. **Audit Logging:** Add `audit()` calls for all mutations (create, update, delete)
4. **Rate Limiting:** Consider if the endpoint needs rate limiting
5. **Input Validation:** Use Zod schemas in `src/validations/`
6. **Error Handling:** Never expose internal errors to clients

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
