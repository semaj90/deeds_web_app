// Read-only diagnostic for parent-atlas-error-research-lane's stated blocker
// ("error_logs not migrated live") and its actual root cause.
//
// Checks two things the lane's tasks.md asserts but never re-verified together:
//   1. Whether the ER0-ER6 lane's five tables exist in the live DB.
//   2. Whether Drizzle's own applied-migrations ledger has any rows at all —
//      which is the real reason those tables are missing (see
//      openspec/changes/manual-migration-reconciliation/tasks.md, which owns
//      that finding: 41 journal entries, 0 live ledger rows, PRE_APPLY_BLOCKED).
//
// Live result 2026-09-05: all 5 tables MISSING, ledger has 0 rows — the lane is
// still blocked, and cannot be unblocked independently of the migration-baseline
// decision owned by manual-migration-reconciliation.
//
// Usage (from sveltekit-frontend/):
//   npx tsx scripts/atlas/audit-error-research-lane-blockers-v1.mts
import 'dotenv/config';
import { db, pgRows } from '../../src/lib/server/db/client.js';
import { sql } from 'drizzle-orm';

const LANE_TABLES = [
  'error_logs',
  'error_research_context',
  'error_fix_plan',
  'fix_attempt',
  'verification_receipt',
];

for (const t of LANE_TABLES) {
  const rows = pgRows<any>(await db.execute(sql`SELECT to_regclass(${'public.' + t}) AS oid`));
  const exists = rows[0]?.oid != null;
  let count: string | null = null;
  if (exists) {
    const c = pgRows<any>(await db.execute(sql.raw(`SELECT count(*)::text AS n FROM public.${t}`)));
    count = c[0]?.n ?? null;
  }
  console.log(`${t}: ${exists ? 'EXISTS' : 'MISSING'}${count !== null ? ` (${count} rows)` : ''}`);
}

const mig = pgRows<any>(await db.execute(sql`
  SELECT to_regclass('drizzle.__drizzle_migrations') AS drizzle_schema,
         to_regclass('public.__drizzle_migrations') AS public_schema
`));
console.log('migrations ledger location:', JSON.stringify(mig[0]));

for (const rel of ['drizzle.__drizzle_migrations', 'public.__drizzle_migrations']) {
  try {
    const rows = pgRows<any>(await db.execute(sql.raw(
      `SELECT count(*)::text AS n, max(created_at)::text AS newest FROM ${rel}`
    )));
    console.log(`${rel}: ${rows[0]?.n} rows, newest created_at=${rows[0]?.newest}`);
  } catch {
    console.log(`${rel}: not queryable`);
  }
}

process.exit(0);
