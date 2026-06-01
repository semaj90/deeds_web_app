#!/usr/bin/env node
/**
 * alias-id-migration-preflight.mjs
 *
 * Audit-only: confirms whether alias_id column exists in the live
 * task_semantic_packets table before any job persists alias_id values.
 *
 * Read-only — no DB writes, no migrations.
 *
 * Outputs:
 *   .tmp/alias-id-migration-preflight-report.json
 *   .tmp/alias-id-migration-preflight-report.md
 *
 * Exit codes:
 *   0 — preflight passed (column confirmed OR postgres unavailable — either way safe to inspect)
 *   1 — unexpected error
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const TMP_DIR = resolve(ROOT, '.tmp');
mkdirSync(TMP_DIR, { recursive: true });

console.log('\n🔍 alias_id Migration Preflight');
console.log('════════════════════════════════');

function psql(sql) {
  try {
    const out = execSync(
      `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -A -c "${sql.replace(/"/g, '\\"')}"`,
      { timeout: 8000 },
    ).toString().trim();
    return { ok: true, output: out };
  } catch (err) {
    return { ok: false, error: err.message?.slice(0, 200) ?? 'unknown error' };
  }
}

// ── Probe 1: is Postgres reachable? ──────────────────────────────────────────

const pingResult = psql('SELECT 1');
const postgresUp = pingResult.ok;
console.log(`\nPostgres reachable: ${postgresUp ? '✅ YES' : '❌ NO'}`);
if (!postgresUp) console.log(`  Error: ${pingResult.error}`);

// ── Probe 2: does task_semantic_packets table exist? ─────────────────────────

let tableExists = false;
let tableError = null;
if (postgresUp) {
  const r = psql(
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='task_semantic_packets'"
  );
  if (r.ok) {
    tableExists = parseInt(r.output, 10) === 1;
  } else {
    tableError = r.error;
  }
}
console.log(`\ntask_semantic_packets table: ${tableExists ? '✅ EXISTS' : postgresUp ? '❌ MISSING' : '⚠️  UNKNOWN (postgres down)'}`);

// ── Probe 3: does alias_id column exist? ─────────────────────────────────────

let aliasIdExists = false;
let columnType = null;
let columnNullable = null;
let columnError = null;
let allColumns = [];

if (postgresUp && tableExists) {
  // Get all columns
  const r = psql(
    "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='task_semantic_packets' ORDER BY ordinal_position"
  );
  if (r.ok && r.output) {
    allColumns = r.output.split('\n').filter(Boolean).map(row => {
      const parts = row.split('|');
      return { column: parts[0], type: parts[1], nullable: parts[2] };
    });
    const aliasCol = allColumns.find(c => c.column === 'alias_id');
    if (aliasCol) {
      aliasIdExists = true;
      columnType = aliasCol.type;
      columnNullable = aliasCol.nullable;
    }
  } else {
    columnError = r.error;
  }
}

console.log(`\nalias_id column:`);
if (!postgresUp) {
  console.log('  ⚠️  UNKNOWN — Postgres unreachable');
} else if (!tableExists) {
  console.log('  ❌ TABLE MISSING — cannot check column');
} else if (aliasIdExists) {
  console.log(`  ✅ EXISTS — type: ${columnType}, nullable: ${columnNullable}`);
} else {
  console.log('  ❌ COLUMN MISSING — do not persist alias_id until column migration is applied');
}

// ── Probe 4: row count ────────────────────────────────────────────────────────

let rowCount = null;
if (postgresUp && tableExists) {
  const r = psql('SELECT count(*) FROM task_semantic_packets');
  if (r.ok) rowCount = parseInt(r.output, 10);
}
if (rowCount !== null) console.log(`\nRow count: ${rowCount.toLocaleString()}`);

// ── Decision ──────────────────────────────────────────────────────────────────

const aliasIdBlocker = postgresUp && tableExists && !aliasIdExists;
const verdict = aliasIdExists ? 'UNBLOCKED' : aliasIdBlocker ? 'BLOCKED' : 'UNKNOWN';

console.log(`\n── Verdict: ${verdict === 'UNBLOCKED' ? '✅' : verdict === 'BLOCKED' ? '❌' : '⚠️ '} ${verdict}`);
if (verdict === 'BLOCKED') {
  console.log('   alias_id column missing. Run migration SQL before persisting alias_id:');
  console.log('   ALTER TABLE task_semantic_packets ADD COLUMN IF NOT EXISTS alias_id TEXT;');
  console.log('   Then re-run this preflight.');
} else if (verdict === 'UNKNOWN') {
  console.log('   Cannot determine — check Postgres Docker container status.');
  console.log('   docker ps | grep legal-ai-postgres');
}

// ── Write outputs ─────────────────────────────────────────────────────────────

const jsonReport = {
  generated_at: new Date().toISOString(),
  verdict,
  postgres_reachable: postgresUp,
  table_exists: tableExists,
  alias_id_exists: aliasIdExists,
  column_exists: aliasIdExists,
  column_type: columnType,
  column_nullable: columnNullable,
  row_count: rowCount,
  all_columns: allColumns,
  alias_id_blocker: aliasIdBlocker,
  errors: [tableError, columnError].filter(Boolean),
  notes: aliasIdBlocker
    ? ['alias_id column is missing — do not run apply jobs that persist alias_id until migration is applied']
    : aliasIdExists
    ? ['alias_id column confirmed — apply jobs may use alias_id field']
    : ['Postgres unreachable — treat as unknown, re-run when Docker is up'],
};

writeFileSync(
  resolve(TMP_DIR, 'alias-id-migration-preflight-report.json'),
  JSON.stringify(jsonReport, null, 2) + '\n',
  'utf8',
);

const icon = verdict === 'UNBLOCKED' ? '✅' : verdict === 'BLOCKED' ? '❌' : '⚠️';
const mdLines = [
  '# alias_id Migration Preflight Report',
  '',
  `**Generated:** ${jsonReport.generated_at}`,
  `**Verdict:** ${icon} ${verdict}`,
  '',
  '## Checks',
  '',
  `| Check | Result |`,
  `|-------|--------|`,
  `| Postgres reachable | ${postgresUp ? '✅ YES' : '❌ NO'} |`,
  `| task_semantic_packets table | ${tableExists ? '✅ EXISTS' : '❌ MISSING'} |`,
  `| alias_id column | ${aliasIdExists ? `✅ EXISTS (${columnType}, nullable=${columnNullable})` : '❌ MISSING'} |`,
  `| Row count | ${rowCount !== null ? rowCount.toLocaleString() : 'N/A'} |`,
  '',
];

if (allColumns.length > 0) {
  mdLines.push('## Columns in task_semantic_packets', '', '| Column | Type | Nullable |', '|--------|------|----------|');
  for (const col of allColumns) {
    mdLines.push(`| ${col.column === 'alias_id' ? '**alias_id**' : col.column} | ${col.type} | ${col.nullable} |`);
  }
  mdLines.push('');
}

if (verdict === 'BLOCKED') {
  mdLines.push(
    '## ❌ Migration Required',
    '',
    'Run this SQL before any apply job that writes `alias_id`:',
    '',
    '```sql',
    'ALTER TABLE task_semantic_packets ADD COLUMN IF NOT EXISTS alias_id TEXT;',
    '```',
    '',
    'Then re-run this preflight to confirm.',
    '',
  );
}

writeFileSync(
  resolve(TMP_DIR, 'alias-id-migration-preflight-report.md'),
  mdLines.join('\n') + '\n',
  'utf8',
);

console.log('\nReports:');
console.log('  .tmp/alias-id-migration-preflight-report.json');
console.log('  .tmp/alias-id-migration-preflight-report.md\n');

process.exitCode = 0;
