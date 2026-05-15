#!/usr/bin/env node
/**
 * agents-db-verify.mjs
 *
 * Read-only check that the AGENTS.md Postgres mirror tables exist and report
 * row counts. Companion to drizzle/manual/agents_md_relations.sql which is a
 * deliberate operator-applied migration (NOT auto-run on folder open).
 *
 * Tables checked:
 *   - public.agent_context_files       (parsed envelope per AGENTS.md)
 *   - public.directory_context_bindings (walk-up resolution map)
 *   - public.ace_context_sources       (ACE retrieval audit trail)
 *
 * Exit code 0 if all three tables exist, 1 if any missing. Non-destructive.
 *
 * Usage:
 *   npm run agents:db:verify
 */

import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

const REQUIRED_TABLES = [
  'agent_context_files',
  'directory_context_bindings',
  'ace_context_sources',
];

const client = new pg.Client({ connectionString: DB_URL, connectionTimeoutMillis: 5000 });

let exitCode = 0;
try {
  await client.connect();

  console.log(`\n🔍 AGENTS.md Postgres mirror verification`);
  console.log(`   ${DB_URL.replace(/:[^:@]+@/, ':***@')}\n`);

  for (const tbl of REQUIRED_TABLES) {
    const reg = await client.query(`SELECT to_regclass('public.${tbl}') AS r`);
    const exists = reg.rows[0]?.r != null;
    if (!exists) {
      console.log(`   ❌ ${tbl} — MISSING`);
      exitCode = 1;
      continue;
    }
    const cnt = await client.query(`SELECT COUNT(*)::bigint AS n FROM ${tbl}`).catch(() => ({ rows: [{ n: '?' }] }));
    console.log(`   ✓ ${tbl}  (${cnt.rows[0].n} rows)`);
  }

  if (exitCode !== 0) {
    console.log(`\n   Apply the migration manually:`);
    console.log(`   docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db \\`);
    console.log(`     < drizzle/manual/agents_md_relations.sql\n`);
  } else {
    console.log(`\n✅ AGENTS.md Postgres mirror is provisioned`);
  }
} catch (err) {
  console.error(`❌ Verify failed: ${err.message}`);
  exitCode = 1;
} finally {
  await client.end().catch(() => {});
  process.exit(exitCode);
}
