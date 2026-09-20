import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXCLUDED_TABLES, orgScopePredicate, TENANT_TABLES } from './TenantDataMap';

/**
 * Physical table names declared in Schema.ts.
 *
 * The character class MUST include digits. With `[a-z_]+` a table whose name
 * contains one (`member_2fa`, say) matches nothing, so it is silently absent
 * from `declared` and the drift guard below passes while that table is never
 * copied — a cutover would drop its data and `db:verify-copy` would still
 * report parity, because the omission and the verification share this source.
 * `checkSchemaSync.ts` and the kiosk's parity test both use `[a-z0-9_]`.
 */
function declaredTables(): string[] {
  const src = readFileSync(path.join(process.cwd(), 'src/models/Schema.ts'), 'utf8');
  return [...src.matchAll(/pgTable\(\s*'([a-z0-9_]+)'/g)].map(m => m[1]!);
}

describe('tenantDataMap', () => {
  it('accounts for EVERY table in Schema.ts — copied, excluded, or organization itself', () => {
    // The drift guard. A table added to Schema.ts but not here would simply
    // never be copied, and the omission would surface as missing customer data
    // after a cutover rather than as a failure.
    const declared = new Set(declaredTables());
    const copied = new Set(TENANT_TABLES.map(t => t.table));
    const excluded = new Set<string>([...EXCLUDED_TABLES, 'organization']);

    const unaccounted = [...declared].filter(t => !copied.has(t) && !excluded.has(t));

    expect(unaccounted).toEqual([]);
  });

  it('never copies a control-plane table into a tenant database', () => {
    // `tenant` and `tenant_external_ref` exist empty and inert in every tenant
    // database, and `platform_config` holds the PLATFORM's own merchant
    // credentials — copying it would replicate them to every customer.
    const copied = TENANT_TABLES.map(t => t.table);

    for (const forbidden of EXCLUDED_TABLES) {
      expect(copied).not.toContain(forbidden);
    }
  });

  it('lists parents before the tables that reference them', () => {
    // Every FK is ON DELETE no action, so insert order is load-bearing.
    const position = new Map(TENANT_TABLES.map((t, i) => [t.table, i]));
    const mustFollow: Array<[string, string]> = [
      ['catalog_item', 'event'], // catalog_item.event_id → event.id
      ['member_membership', 'member'],
      ['class_schedule_instance', 'class'],
      ['class_schedule_exception', 'class_schedule_instance'],
      ['event_registration', 'event'],
      ['transaction', 'member_membership'],
      ['transaction', 'event_registration'],
      ['signed_waiver', 'waiver_template'],
      ['membership_plan', 'program'],
    ];

    for (const [child, parent] of mustFollow) {
      expect(position.get(child)).toBeGreaterThan(position.get(parent)!);
    }
  });

  it('includes the org-scoped table the seed teardown misses', () => {
    // `clearSeededData` does not clear `instructor_profile`. Building the copy
    // from the seed's teardown directly would silently drop it.
    const copied = TENANT_TABLES.map(t => t.table);

    expect(copied).toContain('instructor_profile');
  });

  it('builds a parent subquery for every indirectly-scoped table', () => {
    for (const entry of TENANT_TABLES.filter(t => t.scope === 'via')) {
      expect(entry.parentColumn, `${entry.table} needs a parentColumn`).toBeTruthy();
      expect(entry.parentSelect, `${entry.table} needs a parentSelect`).toBeTruthy();
      expect(orgScopePredicate(entry)).toContain('$1');
    }
  });

  it('scopes every direct table on organization_id', () => {
    for (const entry of TENANT_TABLES.filter(t => t.scope === 'direct')) {
      expect(orgScopePredicate(entry)).toBe('organization_id = $1');
    }
  });
});
