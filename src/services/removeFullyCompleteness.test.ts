import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `removeFully` deletes a member and every row that references them.
 *
 * Every FK in the schema is `ON DELETE no action` — nothing cascades — so both
 * the delete SET and its ORDER are maintained BY HAND. Neither mistake fails a
 * type check:
 *
 *   - a MISSING delete fails at runtime with a foreign-key violation, on a
 *     real member, only once someone tries a full delete;
 *   - a MIS-ORDERED delete fails the same way. `transaction` references
 *     `member_membership` AND `event_registration`, so moving it after either
 *     one violates the constraint while every "does this delete exist" check
 *     still passes.
 *
 * Both expectations are derived from Schema.ts rather than restated here, so a
 * new table or a new FK is covered without editing this file.
 *
 * Source-text based, matching `checkSchemaSync.ts` and `TenantDataMap.test.ts`:
 * importing Schema.ts pulls in `Env` and validates the whole environment.
 */

const SCHEMA = path.join(process.cwd(), 'src/models/Schema.ts');
const SERVICE = path.join(process.cwd(), 'src/services/MembersService.ts');

/**
 * The `{ … }` block starting at or after `from`, found by brace matching.
 * Returns null when there is no balanced block — callers must treat that as a
 * parse failure rather than silently scanning to end-of-file.
 */
function balancedBlock(source: string, from: number): string | null {
  const braceStart = source.indexOf('{', from);
  if (braceStart === -1) {
    return null;
  }
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') {
      depth++;
    } else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(braceStart, i + 1);
      }
    }
  }
  return null;
}

/** Every `export const xSchema = pgTable(...)` with its declaration body. */
function tableBodies(source: string): Map<string, string> {
  const bodies = new Map<string, string>();
  for (const match of source.matchAll(/export const (\w+) = pgTable\(/g)) {
    const body = balancedBlock(source, match.index! + match[0].length);
    if (body !== null) {
      bodies.set(match[1]!, body);
    }
  }
  return bodies;
}

/** Drizzle table variable names whose table has a FK to `member`. */
function tablesReferencingMember(bodies: Map<string, string>): string[] {
  return [...bodies.entries()]
    .filter(([, body]) => /references\(\(\) => memberSchema\.id\)/.test(body))
    .map(([name]) => name)
    .filter(name => name !== 'memberSchema');
}

/**
 * Ordering constraints among the member-referencing tables, read off the
 * schema: `[child, parent]` means child's rows must be deleted FIRST, because
 * child holds a FK to parent.
 *
 * Only pairs where BOTH sides reference member matter here — a FK to something
 * outside that set (a plan, a class) is unaffected by deleting one member.
 */
function deleteOrderConstraints(bodies: Map<string, string>): Array<[string, string]> {
  const members = new Set(tablesReferencingMember(bodies));
  const constraints: Array<[string, string]> = [];
  for (const child of members) {
    const body = bodies.get(child)!;
    for (const ref of body.matchAll(/references\(\(\) => (\w+)\.id\)/g)) {
      const parent = ref[1]!;
      if (parent !== child && members.has(parent)) {
        constraints.push([child, parent]);
      }
    }
  }
  return constraints;
}

describe('removeFully deletes every member-referencing table', () => {
  const schemaSource = readFileSync(SCHEMA, 'utf8');
  const serviceSource = readFileSync(SERVICE, 'utf8');
  const bodies = tableBodies(schemaSource);
  const referencing = tablesReferencingMember(bodies);

  /**
   * ONLY `removeFully`'s body. Scanning to end-of-file would let a delete in
   * any later function satisfy these assertions — `removeFully` happens to be
   * last in the file today, which makes that mistake invisible rather than
   * harmless.
   */
  const body = (() => {
    const start = serviceSource.indexOf('export async function removeFully');
    if (start === -1) {
      return null;
    }
    // Skip the parameter list so the brace scan starts at the function body.
    const parenEnd = serviceSource.indexOf('): Promise', start);
    return balancedBlock(serviceSource, parenEnd === -1 ? start : parenEnd);
  })();

  const deletePosition = (table: string): number =>
    body === null ? -1 : body.search(new RegExp(`delete\\(${table}\\)`));

  it('locates removeFully and the member-referencing tables', () => {
    // Vacuity guard: if either scan fails, every assertion below is trivially
    // satisfied and the suite would report a false green.
    expect(body, 'could not isolate removeFully\'s body').not.toBeNull();
    expect(referencing.length).toBeGreaterThan(5);
  });

  it('has a delete for each table with a foreign key to member', () => {
    const missing = referencing.filter(table => deletePosition(table) === -1);

    expect(
      missing,
      missing.length === 0
        ? ''
        : `removeFully does not delete from: ${missing.join(', ')}.\n`
          + 'These tables have a foreign key to member and every FK is ON DELETE\n'
          + 'no action, so deleting a member with rows in them fails at runtime\n'
          + 'with a foreign-key violation. Add a delete in FK order.',
    ).toEqual([]);
  });

  it('deletes children before the rows they reference (FK-safe order)', () => {
    const constraints = deleteOrderConstraints(bodies);

    // e.g. transaction → member_membership, transaction → event_registration,
    // signed_waiver → member_membership.
    expect(constraints.length).toBeGreaterThan(0);

    const violations = constraints
      .filter(([child, parent]) => {
        const c = deletePosition(child);
        const p = deletePosition(parent);
        return c !== -1 && p !== -1 && c > p;
      })
      .map(([child, parent]) => `${child} is deleted AFTER ${parent}`);

    expect(
      violations,
      violations.length === 0
        ? ''
        : `removeFully deletes in an FK-unsafe order:\n  ${violations.join('\n  ')}\n`
          + 'The first table holds a foreign key to the second, and every FK is\n'
          + 'ON DELETE no action, so the parent cannot go first — the delete\n'
          + 'fails at runtime with a foreign-key violation.',
    ).toEqual([]);
  });
});
