import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as controlSchema from '@/models/ControlSchema';

// `vi.mock('@/libs/ControlDb')` resolves here: a real PGlite with the baseline
// applied, so guarded UPDATEs and partial unique indexes behave as in Postgres.
// `controlPglite` is the raw client — it satisfies the CLI's `Queryable`, so
// the CLI-side helpers can be tested against the same database.
export const controlPglite = new PGlite();

const controlDb = drizzle(controlPglite, { schema: controlSchema });

await migrate(controlDb, {
  migrationsFolder: path.join(process.cwd(), 'migrations'),
});

export { controlDb };
