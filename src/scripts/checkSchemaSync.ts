/**
 * Prove that `src/models/Schema.ts`, `migrations/0000_baseline.sql`, and (when
 * reachable) the live database all describe the same columns.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * `db:generate` is deliberately disabled: there is no `meta/0000_snapshot.json`,
 * so drizzle-kit would regenerate the whole schema and clobber the
 * hand-authored baseline. That means the Drizzle definitions and the DDL are
 * kept in step BY HAND, with nothing mechanical to catch a slip — and a slip is
 * invisible until a query hits the missing column at runtime.
 *
 * This is the mechanical check. Run it after every schema edit.
 *
 * Usage:
 *   npm run db:check-schema                 # Schema.ts vs baseline (no DB needed)
 *   DATABASE_URL=... npm run db:check-schema  # ...and vs the live database
 *
 * Exits non-zero on any asymmetry.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Pool } from 'pg';

const BASELINE = 'migrations/0000_baseline.sql';

/**
 * Every Drizzle schema module. The baseline is one file, but the definitions
 * are split: tenant-plane tables in Schema.ts, control-plane tables
 * (`tenant`, `tenant_external_ref`) in ControlSchema.ts. Both are created by
 * the same baseline, so both must be parsed or the control tables read as
 * "missing from Schema.ts".
 */
const SCHEMA_MODULES = ['src/models/Schema.ts', 'src/models/ControlSchema.ts'];

/** Drizzle column builders whose first string argument is the physical name. */
const COLUMN_BUILDERS = [
  'text',
  'integer',
  'real',
  'boolean',
  'timestamp',
  'numeric',
  'json',
  'jsonb',
  'uuid',
  'serial',
  'varchar',
  'date',
  'bigint',
  'doublePrecision',
];

type TableMap = Map<string, Set<string>>;

/**
 * Physical column TYPES per table: table → column → canonical type name.
 *
 * Column NAMES agreeing proves nothing about the shape of the data. A
 * `real` → `numeric` change — exactly the kind that silently alters money
 * arithmetic — is invisible to a name-only comparison, and there is no other
 * check in either repo that would catch it (`db:generate` is disabled, so
 * drizzle never diffs anything). Hence this parallel map.
 */
type TypeMap = Map<string, Map<string, string>>;

/**
 * Canonical type names, so a Drizzle builder, the baseline DDL, and
 * `information_schema` can be compared to each other.
 *
 * Precision/scale are deliberately part of the canonical form for `numeric`:
 * `numeric(12,2)` and `numeric(5,2)` are different constraints on money, and
 * collapsing them to "numeric" would defeat the reason this map exists.
 */
function canonicalType(raw: string): string {
  const t = raw.trim().toLowerCase();
  // Drizzle builder names and their SQL spellings.
  const aliases: Record<string, string> = {
    'text': 'text',
    'character varying': 'varchar',
    'varchar': 'varchar',
    'integer': 'integer',
    'int': 'integer',
    'int4': 'integer',
    'serial': 'integer',
    'bigint': 'bigint',
    'int8': 'bigint',
    'real': 'real',
    'float4': 'real',
    'double precision': 'doubleprecision',
    'doubleprecision': 'doubleprecision',
    'float8': 'doubleprecision',
    'boolean': 'boolean',
    'bool': 'boolean',
    'json': 'json',
    'jsonb': 'jsonb',
    'uuid': 'uuid',
    'date': 'date',
  };
  // numeric(p,s) / decimal(p,s) — keep the precision and scale.
  const numericMatch = /^(?:numeric|decimal)\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(t);
  if (numericMatch) {
    return `numeric(${numericMatch[1]},${numericMatch[2]})`;
  }
  if (t === 'numeric' || t === 'decimal') {
    return 'numeric';
  }
  // timestamp, with or without time zone / precision.
  if (t.startsWith('timestamp')) {
    return 'timestamp';
  }
  return aliases[t] ?? t;
}

/** Load .env.local then .env; values already in the environment win. */
function loadEnvFiles(): void {
  for (const file of ['.env.local', '.env']) {
    const full = path.join(process.cwd(), file);
    if (!existsSync(full)) {
      continue;
    }
    for (const raw of readFileSync(full, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }
      const eq = line.indexOf('=');
      if (eq === -1 || process.env[line.slice(0, eq).trim()] !== undefined) {
        continue;
      }
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith('\'') && value.endsWith('\''))
      ) {
        value = value.slice(1, -1);
      }
      process.env[line.slice(0, eq).trim()] = value;
    }
  }
}

/** Physical column types per table, parsed out of the baseline DDL. */
function parseBaselineTypes(sql: string): TypeMap {
  const tables: TypeMap = new Map();
  for (const match of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"([a-z0-9_]+)" \(([\s\S]*?)\n\);/g)) {
    const name = match[1]!;
    const cols = new Map<string, string>();
    for (const line of match[2]!.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('CONSTRAINT')) {
        continue;
      }
      // `"col_name" <type…> [DEFAULT …] [NOT NULL] [,]`
      //
      // Split rather than one regex: a lazy `.+?` for the type between two
      // `\s+` runs backtracks super-linearly on a crafted line. Take the
      // quoted name, then cut the remainder at the first modifier keyword.
      const nameMatch = /^"([a-z0-9_]+)"\s/.exec(trimmed);
      if (nameMatch) {
        const rest = trimmed.slice(nameMatch[0].length).trim();
        const cut = rest.search(/\s(?:DEFAULT|NOT NULL|PRIMARY KEY)\b/i);
        const typeText = (cut === -1 ? rest : rest.slice(0, cut)).replace(/,$/, '').trim();
        cols.set(nameMatch[1]!, canonicalType(typeText));
      }
    }
    tables.set(name, cols);
  }
  return tables;
}

/** Physical columns per table, parsed out of the hand-authored baseline DDL. */
function parseBaseline(sql: string): TableMap {
  const tables: TableMap = new Map();
  // `[^]` rather than `.` with the /s flag, which needs an es2018 target.
  for (const match of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"([a-z0-9_]+)" \(([\s\S]*?)\n\);/g)) {
    const name = match[1]!;
    const body = match[2]!;
    // Line-by-line rather than one regex: a lookahead excluding CONSTRAINT
    // lines backtracks super-linearly, and inline CONSTRAINT clauses are the
    // only non-column entries in these bodies.
    const cols = new Set<string>();
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('CONSTRAINT')) {
        continue;
      }
      const column = /^"([a-z0-9_]+)"/.exec(trimmed);
      if (column) {
        cols.add(column[1]!);
      }
    }
    tables.set(name, cols);
  }
  return tables;
}

/**
 * Physical columns per table, parsed out of Schema.ts.
 *
 * Textual rather than importing the module: importing pulls in `Env`, which
 * validates the whole environment and would make this script unusable in the
 * one situation you most want it — a machine with a half-configured .env.
 */
function parseSchemaTs(source: string): TableMap {
  const tables: TableMap = new Map();
  const columnRe = new RegExp(`\\b(?:${COLUMN_BUILDERS.join('|')})\\(\\s*['"]([a-z0-9_]+)['"]`, 'g');

  for (const match of source.matchAll(/pgTable\(\s*['"]([a-z0-9_]+)['"]/g)) {
    const name = match[1]!;
    const braceStart = source.indexOf('{', match.index! + match[0].length - 1);
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
    const cols = tables.get(name) ?? new Set<string>();
    for (const col of body.matchAll(columnRe)) {
      cols.add(col[1]!);
    }
    tables.set(name, cols);
  }
  return tables;
}

/**
 * Physical column types per table, parsed out of Schema.ts.
 *
 * Captures the builder name and, for `numeric`, its `precision`/`scale`
 * config, so `numeric('amount', { precision: 12, scale: 2 })` canonicalizes to
 * the same string as the DDL's `numeric(12, 2)`.
 */
function parseSchemaTsTypes(source: string): TypeMap {
  const tables: TypeMap = new Map();
  // builder('col_name'  [, { …config… } ]
  const columnRe = new RegExp(
    `\\b(${COLUMN_BUILDERS.join('|')})\\(\\s*['"]([a-z0-9_]+)['"]\\s*(?:,\\s*(\\{[^}]*\\}))?`,
    'g',
  );

  for (const match of source.matchAll(/pgTable\(\s*['"]([a-z0-9_]+)['"]/g)) {
    const name = match[1]!;
    const braceStart = source.indexOf('{', match.index! + match[0].length - 1);
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
    const cols = tables.get(name) ?? new Map<string, string>();
    for (const col of body.matchAll(columnRe)) {
      const builder = col[1]!;
      const config = col[3] ?? '';
      let type = builder;
      if (builder === 'numeric' || builder === 'decimal') {
        const precision = /precision\s*:\s*(\d+)/.exec(config)?.[1];
        const scale = /scale\s*:\s*(\d+)/.exec(config)?.[1];
        type = precision !== undefined && scale !== undefined
          ? `numeric(${precision},${scale})`
          : 'numeric';
      }
      cols.set(col[2]!, canonicalType(type));
    }
    tables.set(name, cols);
  }
  return tables;
}

/**
 * Compare two type maps. Only columns present on BOTH sides are compared —
 * missing/extra columns are already reported by the name diff, and repeating
 * them here would double every message.
 */
function diffTypes(left: TypeMap, leftName: string, right: TypeMap, rightName: string): string[] {
  const problems: string[] = [];
  for (const table of [...left.keys()].sort()) {
    const l = left.get(table);
    const r = right.get(table);
    if (!l || !r) {
      continue;
    }
    for (const [column, leftType] of [...l.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const rightType = r.get(column);
      if (rightType !== undefined && rightType !== leftType) {
        problems.push(
          `  ${table}.${column}: ${leftName} says ${leftType}, ${rightName} says ${rightType}`,
        );
      }
    }
  }
  return problems;
}

/** Compare two column maps; returns human-readable problems. */
function diff(left: TableMap, leftName: string, right: TableMap, rightName: string): string[] {
  const problems: string[] = [];
  for (const table of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    const l = left.get(table);
    const r = right.get(table);
    if (!l) {
      problems.push(`  ${table}: present in ${rightName}, missing from ${leftName}`);
      continue;
    }
    if (!r) {
      problems.push(`  ${table}: present in ${leftName}, missing from ${rightName}`);
      continue;
    }
    const onlyLeft = [...l].filter(c => !r.has(c)).sort();
    const onlyRight = [...r].filter(c => !l.has(c)).sort();
    if (onlyLeft.length > 0) {
      problems.push(`  ${table}: only in ${leftName} → ${onlyLeft.join(', ')}`);
    }
    if (onlyRight.length > 0) {
      problems.push(`  ${table}: only in ${rightName} → ${onlyRight.join(', ')}`);
    }
  }
  return problems;
}

async function readLiveDatabase(
  connectionString: string,
): Promise<{ names: TableMap; types: TypeMap } | null> {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const { rows } = await pool.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      numeric_precision: number | null;
      numeric_scale: number | null;
    }>(
      `select table_name, column_name, data_type, numeric_precision, numeric_scale
         from information_schema.columns
       where table_schema = 'public'`,
    );
    const tables: TableMap = new Map();
    const types: TypeMap = new Map();
    for (const row of rows) {
      const cols = tables.get(row.table_name) ?? new Set<string>();
      cols.add(row.column_name);
      tables.set(row.table_name, cols);

      // `information_schema` reports numeric's precision/scale in separate
      // columns; fold them back into the canonical `numeric(p,s)` spelling.
      const raw = row.data_type === 'numeric' && row.numeric_precision !== null && row.numeric_scale !== null
        ? `numeric(${row.numeric_precision},${row.numeric_scale})`
        : row.data_type;
      const colTypes = types.get(row.table_name) ?? new Map<string, string>();
      colTypes.set(row.column_name, canonicalType(raw));
      types.set(row.table_name, colTypes);
    }
    return { names: tables, types };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ECONNREFUSED') {
      console.info('  (no database reachable — skipping the live comparison)\n');
      return null;
    }
    throw error;
  } finally {
    await pool.end().catch(() => {});
  }
}

async function main(): Promise<void> {
  loadEnvFiles();

  const baselineSql = readFileSync(BASELINE, 'utf8');
  const baseline = parseBaseline(baselineSql);
  const baselineTypes = parseBaselineTypes(baselineSql);

  const schema: TableMap = new Map();
  const schemaTypes: TypeMap = new Map();
  for (const modulePath of SCHEMA_MODULES) {
    const source = readFileSync(modulePath, 'utf8');
    for (const [table, cols] of parseSchemaTs(source)) {
      const existing = schema.get(table) ?? new Set<string>();
      for (const col of cols) {
        existing.add(col);
      }
      schema.set(table, existing);
    }
    for (const [table, cols] of parseSchemaTsTypes(source)) {
      const existing = schemaTypes.get(table) ?? new Map<string, string>();
      for (const [col, type] of cols) {
        existing.set(col, type);
      }
      schemaTypes.set(table, existing);
    }
  }

  console.info(`drizzle: ${schema.size} tables · baseline: ${baseline.size} tables\n`);

  // Sanity-check the parsers before trusting a clean result — a regex that
  // matches nothing would otherwise report "no mismatches" and mean nothing.
  if (schema.size === 0 || baseline.size === 0) {
    console.error('A parser matched no tables at all; the check would be vacuous.');
    process.exit(1);
  }

  const problems = diff(schema, 'drizzle', baseline, 'baseline');
  problems.push(...diffTypes(schemaTypes, 'drizzle', baselineTypes, 'baseline'));

  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    const live = await readLiveDatabase(connectionString);
    if (live) {
      // The live database legitimately holds tables the app does not declare
      // (drizzle's own bookkeeping), so compare only what Schema.ts declares.
      const declared: TableMap = new Map(
        [...live.names].filter(([table]) => schema.has(table)),
      );
      problems.push(...diff(schema, 'drizzle', declared, 'live database'));
      const declaredTypes: TypeMap = new Map(
        [...live.types].filter(([table]) => schema.has(table)),
      );
      problems.push(...diffTypes(schemaTypes, 'drizzle', declaredTypes, 'live database'));
    }
  } else {
    console.info('  (DATABASE_URL unset — comparing Schema.ts against the baseline only)\n');
  }

  if (problems.length === 0) {
    console.info('IN SYNC — every declared column matches in name and type.');
    return;
  }

  console.error(`OUT OF SYNC — ${problems.length} problem(s):\n`);
  for (const problem of problems) {
    console.error(problem);
  }
  console.error(
    '\nEdit BOTH src/models/Schema.ts and migrations/0000_baseline.sql by hand.\n'
    + 'Do not run db:generate — it is disabled because it would regenerate the\n'
    + 'entire schema and clobber the hand-authored baseline.',
  );
  process.exit(1);
}

main().catch((error) => {
  console.error('[check-schema] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
