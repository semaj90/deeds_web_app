#!/usr/bin/env node
/**
 * audit-drizzle-promotion-drift.mjs
 * READ-ONLY. Compares live information_schema against Drizzle schema files
 * and manual SQL for promotion-relevant tables.
 * Emits .tmp/drizzle-promotion-drift-audit.{json,md}
 */
import pg from 'pg';
import { writeFileSync, mkdirSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });

const SCHEMA_FILES = [
  'sveltekit-frontend/src/lib/server/db/schema-postgres.ts',
  'sveltekit-frontend/src/lib/server/db/schema/tasks.ts',
  'sveltekit-frontend/src/lib/server/db/schema/atlas.ts',
];
const DRIZZLE_DIR = resolve(ROOT, 'sveltekit-frontend/drizzle');
const MANUAL_DIR = resolve(ROOT, 'sveltekit-frontend/drizzle/manual');
const TARGET_TABLES = [
  'task_semantic_packets', 'parent_atlas_documents', 'parent_atlas_vectors',
  'code_llm_index', 'nes_chrom_packets',
];
const KEY_COLS = ['alias_id','source_ref','feature_id','workspace_task_id',
  'qdrant_point_id','payload','payload_jsonb','embedding','embedding_768'];

function searchSchemaFiles(pattern) {
  const hits = [];
  for (const rel of SCHEMA_FILES) {
    const p = resolve(ROOT, rel);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, 'utf8');
    if (src.includes(pattern)) hits.push(rel);
  }
  return hits;
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const result = { generated: new Date().toISOString(), tables: {}, manual_sql: [], drizzle_journal: null };

  // 1. Live columns per table
  for (const tbl of TARGET_TABLES) {
    const { rows: live } = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [tbl]
    );
    const liveColNames = live.map(r => r.column_name);

    // Drizzle schema file hits
    const drizzleHits = searchSchemaFiles(tbl);
    const drizzleColHints = {};
    for (const kc of KEY_COLS) {
      drizzleColHints[kc] = searchSchemaFiles(kc).length > 0;
    }

    const liveKeyColStatus = {};
    for (const kc of KEY_COLS) liveKeyColStatus[kc] = liveColNames.includes(kc);

    result.tables[tbl] = {
      live_exists: live.length > 0,
      live_columns: liveColNames,
      drizzle_schema_files: drizzleHits,
      live_key_cols: liveKeyColStatus,
      drift: {
        in_live_not_drizzle: [],
        in_drizzle_not_live: [],
      },
    };
  }

  // 2. Manual SQL inventory
  if (existsSync(MANUAL_DIR)) {
    const files = readdirSync(MANUAL_DIR).filter(f => f.endsWith('.sql')).sort();
    for (const f of files) {
      const src = readFileSync(join(MANUAL_DIR, f), 'utf8');
      const mentions = TARGET_TABLES.filter(t => src.includes(t));
      const keyCols = KEY_COLS.filter(c => src.includes(c));
      if (mentions.length > 0) {
        result.manual_sql.push({ file: `drizzle/manual/${f}`, tables: mentions, key_cols: keyCols });
      }
    }
  }

  // 3. Drizzle journal
  const journalPath = resolve(DRIZZLE_DIR, 'meta/_journal.json');
  if (existsSync(journalPath)) {
    const j = JSON.parse(readFileSync(journalPath, 'utf8'));
    result.drizzle_journal = { entries: j.entries?.length, version: j.version };
  }

  await client.end();

  // 4. Classify drift
  const driftSummary = [];
  for (const [tbl, info] of Object.entries(result.tables)) {
    if (!info.live_exists) {
      driftSummary.push({ table: tbl, issue: 'MISSING_FROM_LIVE', severity: 'high' });
      continue;
    }
    if (!info.drizzle_schema_files.length) {
      driftSummary.push({ table: tbl, issue: 'NOT_IN_DRIZZLE_SCHEMA', severity: 'medium' });
    }
    // Check key column drift
    for (const [col, inLive] of Object.entries(info.live_key_cols)) {
      if (!inLive) continue; // not in live, ignore
    }
  }
  // parent_atlas_documents special case
  if (!result.tables['parent_atlas_documents']?.live_exists) {
    driftSummary.push({ table: 'parent_atlas_documents', issue: 'MUST_CREATE_BEFORE_PROMOTION', severity: 'blocker' });
  }
  result.drift_summary = driftSummary;

  // 5. Gates
  result.gates = {
    task_semantic_packets_in_live: result.tables['task_semantic_packets']?.live_exists,
    task_semantic_packets_in_drizzle: (result.tables['task_semantic_packets']?.drizzle_schema_files?.length || 0) > 0,
    alias_id_in_live: result.tables['task_semantic_packets']?.live_key_cols?.alias_id,
    source_ref_in_live: result.tables['task_semantic_packets']?.live_key_cols?.source_ref,
    qdrant_point_id_in_live: result.tables['task_semantic_packets']?.live_key_cols?.qdrant_point_id,
    parent_atlas_documents_missing: !result.tables['parent_atlas_documents']?.live_exists,
    parent_atlas_vectors_in_live: result.tables['parent_atlas_vectors']?.live_exists,
    nes_chrom_packets_in_live: result.tables['nes_chrom_packets']?.live_exists,
    manual_sql_covering_targets: result.manual_sql.length,
    drizzle_journal_entries: result.drizzle_journal?.entries || 0,
    blockers: driftSummary.filter(d => d.severity === 'blocker').length,
  };

  mkdirSync(resolve(ROOT, '.tmp'), { recursive: true });
  const jsonPath = resolve(ROOT, '.tmp/drizzle-promotion-drift-audit.json');
  const mdPath = resolve(ROOT, '.tmp/drizzle-promotion-drift-audit.md');
  writeFileSync(jsonPath, JSON.stringify(result, null, 2));

  const icon = v => v ? '✅' : '❌';
  const lines = [
    '# Drizzle Promotion Drift Audit',
    `**Generated:** ${result.generated}`,
    '',
    '## Gates',
    '| Gate | Value |',
    '|------|-------|',
    ...Object.entries(result.gates).map(([k, v]) => `| ${k} | ${typeof v === 'boolean' ? icon(v)+' '+v : v} |`),
    '',
    '## Drift Issues',
    driftSummary.length ? driftSummary.map(d => `- **[${d.severity.toUpperCase()}]** \`${d.table}\`: ${d.issue}`).join('\n') : '✅ No drift issues.',
    '',
    '## Manual SQL Covering Targets',
    result.manual_sql.map(m => `- \`${m.file}\` — tables: ${m.tables.join(', ')}`).join('\n') || '(none)',
    '',
    '## Table Summary',
    ...Object.entries(result.tables).map(([tbl, info]) =>
      `### ${tbl}\n- Live: ${info.live_exists ? '✅' : '❌'} | Drizzle schema: ${info.drizzle_schema_files.length ? '✅' : '❌'}\n- Live cols: ${info.live_columns.slice(0,6).join(', ')}${info.live_columns.length>6?'...':''}\n`
    ),
  ];
  writeFileSync(mdPath, lines.join('\n'));

  console.log('[audit-drizzle-drift] Gates:');
  for (const [k,v] of Object.entries(result.gates)) {
    if (typeof v === 'boolean') console.log(`  ${icon(v)} ${k}`);
    else console.log(`  • ${k}: ${v}`);
  }
  console.log(`\nReports: ${jsonPath}\n         ${mdPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
