import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { bucketExpr, truncField } from './ReportsService';

// Regression guard for the dashboard/reports chart 500s: `date_trunc`'s first
// argument (the period "field") must be emitted as a SQL *literal*, never a bound
// parameter. Postgres/PGlite reject `date_trunc($1, ...)`, which previously
// surfaced as a 500 on every chart endpoint (earningsChart, reports charts, etc.).
const dialect = new PgDialect();

describe('date_trunc period is inlined as a literal (not a bound parameter)', () => {
  it('truncField emits the quoted period inline with no params', () => {
    for (const period of ['month', 'year', 'day'] as const) {
      const { sql: text, params } = dialect.sqlToQuery(truncField(period));

      expect(text).toBe(`'${period}'`);
      expect(params).toHaveLength(0);
    }
  });

  it('bucketExpr renders date_trunc with a literal field, not $1', () => {
    const { sql: text, params } = dialect.sqlToQuery(bucketExpr('month'));

    expect(text).toContain(`date_trunc('month'`);
    // The only thing that must NOT be parameterized is the period field. There
    // are no other bound values in this fragment.
    expect(params).toHaveLength(0);
    expect(text).not.toContain('date_trunc($');
  });

  it('rejects an unknown period instead of emitting unsafe SQL', () => {
    // @ts-expect-error - exercising the runtime allowlist guard
    expect(() => truncField('week')).toThrow(/Unsupported trunc period/);
  });
});
