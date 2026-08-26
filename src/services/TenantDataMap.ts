/**
 * The authoritative map of which rows belong to one organization.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * `seed.ts`'s `clearSeededData` already encoded a debugged, FK-correct
 * org-scoped row selection for most tables — including the awkward two-hop
 * `class_schedule_exception → class_schedule_instance → class` join. A4 needs
 * exactly the same selection to MEASURE, COPY, and VERIFY, so it lives here
 * once rather than being re-derived three more times and drifting.
 *
 * ── Order ───────────────────────────────────────────────────────────────────
 *
 * `TABLES` is in INSERT order: a parent always precedes anything referencing
 * it. Reverse it for deletes. Every FK in the schema is `ON DELETE no action`,
 * so nothing cascades and the order is load-bearing in both directions.
 *
 * ── Deliberate exclusions ───────────────────────────────────────────────────
 *
 * `tenant` and `tenant_external_ref` are control-plane, but the baseline
 * creates them (empty, inert) inside EVERY tenant database. A "copy every
 * table" loop would therefore fill a tenant's inert copy with control-plane
 * routing data. `platform_config` is worse: it holds the platform's own
 * merchant credentials, so replicating it into a customer database would be a
 * real credential leak. None of the three appear below, and that is why.
 *
 * `organization` is also absent: it straddles the planes, so only its
 * tenant-plane columns may be copied. That is handled explicitly by the copy
 * rather than as a whole-row move — see `ORGANIZATION_TENANT_COLUMNS`.
 */

export type TenantTable = {
  /** Physical table name. */
  readonly table: string;
  /**
   * How rows are attributed to an organization.
   *
   * `direct` — the table carries `organization_id` itself (17 tables).
   * `via`    — reachable only through a parent; the SQL fragment is the
   *            subquery that selects this table's rows for one org.
   */
  readonly scope: 'direct' | 'via';
  /** Column holding the parent id, for `via` tables. */
  readonly parentColumn?: string;
  /** Subquery yielding the permitted parent ids, for `via` tables. */
  readonly parentSelect?: string;
};

/**
 * All 38 copyable tables, in INSERT order.
 *
 * NOTE: `image` and `instructor_profile` are org-scoped but are NOT cleared by
 * `seed.ts`'s teardown — it covers 36 of 40. Copying only what the seed clears
 * would silently drop both. They are included here.
 */
export const TENANT_TABLES: readonly TenantTable[] = [
  // ── L1: no dependencies beyond organization ──
  { table: 'program', scope: 'direct' },
  { table: 'tag', scope: 'direct' },
  { table: 'image', scope: 'direct' },
  { table: 'instructor_profile', scope: 'direct' },
  { table: 'audit_event', scope: 'direct' },
  { table: 'waiver_merge_field', scope: 'direct' },
  { table: 'catalog_category', scope: 'direct' },
  { table: 'coupon', scope: 'direct' },
  { table: 'waiver_template', scope: 'direct' },

  // ── L2: reference L1 ──
  { table: 'member', scope: 'direct' },
  { table: 'membership_plan', scope: 'direct' },
  { table: 'class', scope: 'direct' },
  { table: 'event', scope: 'direct' },
  // catalog_item.event_id → event.id, so it must follow event.
  { table: 'catalog_item', scope: 'direct' },

  // ── L3: reference L2 ──
  { table: 'member_membership', scope: 'via', parentColumn: 'member_id', parentSelect: 'SELECT id FROM member WHERE organization_id = $1' },
  { table: 'address', scope: 'via', parentColumn: 'member_id', parentSelect: 'SELECT id FROM member WHERE organization_id = $1' },
  { table: 'note', scope: 'via', parentColumn: 'member_id', parentSelect: 'SELECT id FROM member WHERE organization_id = $1' },
  { table: 'payment_method', scope: 'via', parentColumn: 'member_id', parentSelect: 'SELECT id FROM member WHERE organization_id = $1' },
  // Both member_id and related_member_id point at member; all members exist by now.
  { table: 'family_member', scope: 'via', parentColumn: 'member_id', parentSelect: 'SELECT id FROM member WHERE organization_id = $1' },
  { table: 'coupon_usage', scope: 'via', parentColumn: 'member_id', parentSelect: 'SELECT id FROM member WHERE organization_id = $1' },
  { table: 'class_schedule_instance', scope: 'via', parentColumn: 'class_id', parentSelect: 'SELECT id FROM class WHERE organization_id = $1' },
  { table: 'class_instructor', scope: 'via', parentColumn: 'class_id', parentSelect: 'SELECT id FROM class WHERE organization_id = $1' },
  { table: 'class_tag', scope: 'via', parentColumn: 'class_id', parentSelect: 'SELECT id FROM class WHERE organization_id = $1' },
  { table: 'class_enrollment', scope: 'via', parentColumn: 'class_id', parentSelect: 'SELECT id FROM class WHERE organization_id = $1' },
  { table: 'event_session', scope: 'via', parentColumn: 'event_id', parentSelect: 'SELECT id FROM event WHERE organization_id = $1' },
  { table: 'event_billing', scope: 'via', parentColumn: 'event_id', parentSelect: 'SELECT id FROM event WHERE organization_id = $1' },
  { table: 'event_instructor', scope: 'via', parentColumn: 'event_id', parentSelect: 'SELECT id FROM event WHERE organization_id = $1' },
  { table: 'event_tag', scope: 'via', parentColumn: 'event_id', parentSelect: 'SELECT id FROM event WHERE organization_id = $1' },
  { table: 'membership_tag', scope: 'via', parentColumn: 'membership_plan_id', parentSelect: 'SELECT id FROM membership_plan WHERE organization_id = $1' },
  { table: 'membership_waiver', scope: 'via', parentColumn: 'waiver_template_id', parentSelect: 'SELECT id FROM waiver_template WHERE organization_id = $1' },
  { table: 'catalog_item_variant', scope: 'via', parentColumn: 'catalog_item_id', parentSelect: 'SELECT id FROM catalog_item WHERE organization_id = $1' },
  { table: 'catalog_item_image', scope: 'via', parentColumn: 'catalog_item_id', parentSelect: 'SELECT id FROM catalog_item WHERE organization_id = $1' },
  { table: 'catalog_item_category', scope: 'via', parentColumn: 'catalog_item_id', parentSelect: 'SELECT id FROM catalog_item WHERE organization_id = $1' },

  // ── L4: two hops from an org-scoped root ──
  {
    table: 'class_schedule_exception',
    scope: 'via',
    parentColumn: 'class_schedule_instance_id',
    parentSelect: 'SELECT csi.id FROM class_schedule_instance csi JOIN class c ON csi.class_id = c.id WHERE c.organization_id = $1',
  },
  { table: 'event_registration', scope: 'via', parentColumn: 'event_id', parentSelect: 'SELECT id FROM event WHERE organization_id = $1' },
  { table: 'signed_waiver', scope: 'direct' },
  { table: 'attendance', scope: 'direct' },

  // ── L5: references member_membership AND event_registration ──
  { table: 'transaction', scope: 'direct' },
] as const;

/**
 * `organization`'s tenant-plane columns — the only ones a copy may write into a
 * tenant database.
 *
 * The 13 `stripe_*` / `saas_*` columns are control-plane: the subscription gate
 * reads them during RSC render and they must keep working when a tenant's own
 * database is unreachable. All are nullable, so omitting them is safe.
 *
 * ⚠️ `location_tax_rate` (NOT NULL DEFAULT 0) and `payment_provider` (NOT NULL
 * DEFAULT 'iqpro') must be carried EXPLICITLY. Omit them and the tenant
 * silently reverts to 0% tax and IQPro — wrong money, wrong processor, no error.
 */
export const ORGANIZATION_TENANT_COLUMNS = [
  'id',
  'location_address',
  'location_phone',
  'location_email',
  'location_tax_rate',
  'payment_provider',
  'payment_provider_config_enc',
  'created_at',
  'updated_at',
] as const;

/** Tables that must NEVER be copied into a tenant database. See the header. */
export const EXCLUDED_TABLES = ['tenant', 'tenant_external_ref', 'platform_config'] as const;

/** The WHERE clause selecting one org's rows from `table`. `$1` is the orgId. */
export function orgScopePredicate(entry: TenantTable): string {
  if (entry.scope === 'direct') {
    return 'organization_id = $1';
  }
  return `${entry.parentColumn} IN (${entry.parentSelect})`;
}
