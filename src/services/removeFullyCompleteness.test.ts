import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `removeFully` deletes a member and every row that references them.
 *
 * Every FK in the schema is `ON DELETE no action` — nothing cascades — so that
 * delete list is maintained BY HAND, in FK order. Adding a new table with a FK
 * to `member` and forgetting to add it there does not fail any type check or
 * any other test: it fails at runtime, on a real member, with a foreign-key
 * violation, and only once someone tries a full delete.
 *
 * This test derives the expected set from Schema.ts so the omission is caught
 * here instead. It is deliberately source-text based, matching the approach in
 * `checkSchemaSync.ts` and `TenantDataMap.test.ts`: importing Schema.ts pulls
 * in `Env` and validates the whole environment.
 */

const SCHEMA = path.join(process.cwd(), 'src/models/Schema.ts');
const SERVICE = path.join(process.cwd(), 'src/services/MembersService.ts');

/** Drizzle table variable names whose table has a FK to `member`. */
function tablesReferencingMember(source: string): string[] {
  const found: string[] = [];
  // export const xSchema = pgTable( 'name', { ... } ) — brace-scan the body.
  for (const match of source.matchAll(/export const (\w+) = pgTable\(/g)) {
    const varName = match[1]!;
    const braceStart = source.indexOf('{', match.index! + match[0].length);
    if (braceStart === -1) {
      continue;
    }
    let depth = 0;
    let end = braceStart;
    for (let i = braceStart; i < source.length; i++) {
      if (source[i] === '{') {
        depth++;
      } else if (source[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = source.slice(braceStart, end + 1);
    if (/references\(\(\) => memberSchema\.id\)/.test(body)) {
      found.push(varName);
    }
  }
  return found;
}

describe('removeFully deletes every member-referencing table', () => {
  it('has a delete for each table with a foreign key to member', () => {
    const schemaSource = readFileSync(SCHEMA, 'utf8');
    const serviceSource = readFileSync(SERVICE, 'utf8');

    const referencing = tablesReferencingMember(schemaSource)
      .filter(name => name !== 'memberSchema');

    // Guard against a vacuous pass: if the scan matches nothing, the regex
    // broke and every assertion below would trivially succeed.
    expect(referencing.length).toBeGreaterThan(5);

    // Isolate removeFully's body so a delete elsewhere in the file cannot
    // satisfy the assertion.
    const start = serviceSource.indexOf('export async function removeFully');

    expect(start).toBeGreaterThan(-1);

    const body = serviceSource.slice(start);

    const missing = referencing.filter(
      table => !new RegExp(`delete\\(${table}\\)`).test(body),
    );

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
});
