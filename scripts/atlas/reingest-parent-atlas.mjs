#!/usr/bin/env node
/**
 * scripts/atlas/reingest-parent-atlas.mjs
 *
 * Orchestrates the full safe reingest order after feature_id / source_id normalization.
 * Keeps all lanes separate — does NOT conflate feature:* buckets with file paths.
 *
 * Safe reingest order:
 *   Step 1  — export current state (counts from Postgres + .tmp report)
 *   Step 2  — validate source-file truth (parent_atlas_documents, no feature:* rows)
 *   Step 3  — CouchDB MapReduce reingest (wiki:dir:*, cluster:*, feature:*, source:*)
 *   Step 4  — DuckDB offline join materialization
 *   Step 5  — Qdrant source_ref/feature_id backfill (sync-atlas-feature-map-from-qdrant)
 *   Step 6  — atlas_feature_map_synthesized rebuild (build-synthesized-map)
 *   Step 7  — profile card JSON generation (build-file-profile-cards)
 *
 * Usage:
 *   node scripts/atlas/reingest-parent-atlas.mjs             # dry-run (safe, no writes)
 *   node scripts/atlas/reingest-parent-atlas.mjs --apply     # apply all steps
 *   node scripts/atlas/reingest-parent-atlas.mjs --step 3    # run only step N
 *   node scripts/atlas/reingest-parent-atlas.mjs --from 3    # run step N onward
 *   node scripts/atlas/reingest-parent-atlas.mjs --report    # print last dry-run reports
 *
 * Lane rules enforced:
 *   parent_atlas_documents  = real file/document truth (source_ref NOT LIKE 'feature:%')
 *   atlas_feature_map       = source_ref → feature_id → cluster/qdrant lineage
 *   atlas_feature_synthesis = feature-level aggregation
 *   task_semantic_packets   = packet/runtime/task memory (join by feature_id)
 *   feature:* source_ref    = feature bucket — NOT a file path
 *   CouchDB wiki_cards      = directory/feature/cluster rollups (MapReduce)
 *   DuckDB                  = offline analytical joins across NDJSON/Parquet/Postgres
 */

import fs from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SCRIPTS = path.join(ROOT, 'scripts');
const TMP = path.join(ROOT, '.tmp');

const dotenv = await import('dotenv').catch(() => null);
dotenv?.config({ path: path.join(ROOT, 'sveltekit-frontend', '.env') });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const rawArgs = process.argv.slice(2);
const APPLY = rawArgs.includes('--apply');
const REPORT_ONLY = rawArgs.includes('--report');
const STEP_ONLY = rawArgs.includes('--step') ? parseInt(rawArgs[rawArgs.indexOf('--step') + 1], 10) : null;
const FROM_STEP = rawArgs.includes('--from') ? parseInt(rawArgs[rawArgs.indexOf('--from') + 1], 10) : 1;

mkdirSync(TMP, { recursive: true });

const RUN_ID = `reingest_${Date.now()}`;
const REPORT_PATH = path.join(TMP, 'parent-atlas-reingest-report.json');

// ── utilities ──────────────────────────────────────────────────────────────────

function log(msg) { process.stdout.write(`${msg}\n`); }
function step(n, label) { log(`\n${'─'.repeat(60)}\n  Step ${n}: ${label}\n${'─'.repeat(60)}`); }
function ok(msg) { log(`  ✓ ${msg}`); }
function warn(msg) { log(`  ⚠  ${msg}`); }
function skip(msg) { log(`  ↷  ${msg}`); }

function run(script, extraArgs = []) {
  const result = spawnSync('node', [script, ...extraArgs], {
    cwd: path.join(ROOT, 'sveltekit-frontend'),
    encoding: 'utf8',
    env: { ...process.env },
    stdio: 'pipe',
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}

function extractLine(output, pattern) {
  return output.split('\n').find(l => l.includes(pattern)) ?? '';
}

// ── report-only mode ───────────────────────────────────────────────────────────

if (REPORT_ONLY) {
  const paths = [
    ['.tmp/parent-atlas-reingest-report.json', 'Parent Atlas'],
    ['.tmp/couchdb-mapreduce-reingest-report.json', 'CouchDB MapReduce'],
    ['.tmp/duckdb-mapreduce-join-report.json', 'DuckDB Offline Join'],
  ];
  for (const [rel, label] of paths) {
    const p = path.join(ROOT, rel);
    if (existsSync(p)) {
      const d = JSON.parse(await fs.readFile(p, 'utf8'));
      const { sample: _, ...rest } = d;
      log(`\n[${label}]`);
      log(JSON.stringify(rest, null, 2));
    } else {
      warn(`${label} report not found at ${rel}`);
    }
  }
  process.exit(0);
}

// ── main report accumulator ────────────────────────────────────────────────────

const report = {
  runId: RUN_ID,
  mode: APPLY ? 'apply' : 'dry-run',
  generatedAt: new Date().toISOString(),
  steps: {},
};

function shouldRun(n) {
  if (STEP_ONLY !== null) return n === STEP_ONLY;
  return n >= FROM_STEP;
}

// ══════════════════════════════════════════════════════════════════════════════
// Step 1 — Export current state
// ══════════════════════════════════════════════════════════════════════════════

if (shouldRun(1)) {
  step(1, 'Export current Parent Atlas / Postgres state');
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    const [padR, afmR, afmsR, tspR, featBuckets] = await Promise.all([
      pool.query(`SELECT count(*) AS n FROM parent_atlas_documents`),
      pool.query(`SELECT count(*) AS n FROM atlas_feature_map`),
      pool.query(`SELECT count(*) AS n FROM atlas_feature_map_synthesized`),
      pool.query(`SELECT count(*) AS n FROM task_semantic_packets`),
      pool.query(`SELECT count(*) AS n FROM parent_atlas_documents WHERE source_ref LIKE 'feature:%'`),
    ]);

    const state = {
      parent_atlas_documents: Number(padR.rows[0].n),
      atlas_feature_map: Number(afmR.rows[0].n),
      atlas_feature_map_synthesized: Number(afmsR.rows[0].n),
      task_semantic_packets: Number(tspR.rows[0].n),
      feature_bucket_rows_in_pad: Number(featBuckets.rows[0].n),
    };

    ok(`parent_atlas_documents      : ${state.parent_atlas_documents}`);
    ok(`atlas_feature_map           : ${state.atlas_feature_map}`);
    ok(`atlas_feature_map_synthesized: ${state.atlas_feature_map_synthesized}`);
    ok(`task_semantic_packets       : ${state.task_semantic_packets}`);

    if (state.feature_bucket_rows_in_pad > 0) {
      warn(`${state.feature_bucket_rows_in_pad} feature:* rows found in parent_atlas_documents — these will be filtered in profile card generation`);
    } else {
      ok('No feature:* rows in parent_atlas_documents — lane separation clean');
    }

    report.steps[1] = { status: 'ok', state };
    await fs.writeFile(path.join(TMP, 'parent-atlas-state-export.json'), JSON.stringify(state, null, 2));
  } catch (err) {
    warn(`Step 1 Postgres query failed: ${err.message}`);
    report.steps[1] = { status: 'error', error: err.message };
  } finally {
    await pool.end();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Step 2 — Validate source-file truth
// ══════════════════════════════════════════════════════════════════════════════

if (shouldRun(2)) {
  step(2, 'Validate source-file truth (feature:* separation)');
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    const { rows } = await pool.query(`
      SELECT
        count(*) FILTER (WHERE source_ref NOT LIKE 'feature:%' AND source_ref NOT LIKE '%.venv/%' AND source_ref NOT LIKE '%/node_modules/%') AS real_files,
        count(*) FILTER (WHERE source_ref LIKE 'feature:%') AS feature_buckets,
        count(*) FILTER (WHERE source_ref IS NULL) AS null_refs,
        count(*) FILTER (WHERE feature_id IS NULL) AS null_feature_ids,
        count(*) FILTER (WHERE feature_id IS NOT NULL) AS has_feature_id,
        count(DISTINCT feature_id) AS distinct_feature_ids
      FROM parent_atlas_documents
    `);
    const r = rows[0];
    ok(`Real source files            : ${r.real_files}`);
    ok(`feature:* bucket rows        : ${r.feature_buckets}`);
    ok(`Rows with feature_id         : ${r.has_feature_id} (${r.distinct_feature_ids} distinct)`);
    if (Number(r.null_refs) > 0) warn(`Null source_refs: ${r.null_refs}`);
    if (Number(r.null_feature_ids) > 0) warn(`Null feature_ids: ${r.null_feature_ids} — these will not join to task_semantic_packets`);

    report.steps[2] = { status: 'ok', validation: Object.fromEntries(Object.entries(r).map(([k,v]) => [k, Number(v)])) };
  } catch (err) {
    warn(`Step 2 failed: ${err.message}`);
    report.steps[2] = { status: 'error', error: err.message };
  } finally {
    await pool.end();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Step 3 — CouchDB MapReduce reingest
// ══════════════════════════════════════════════════════════════════════════════

if (shouldRun(3)) {
  step(3, 'CouchDB MapReduce reingest (wiki:dir:*, cluster:*, feature:*, source:*)');
  const script = path.join(SCRIPTS, 'atlas', 'ingest-couchdb-mapreduce.mjs');
  const extraArgs = APPLY ? ['--write', `--runId=${RUN_ID}`] : [];

  log(`  Running: node ${path.relative(ROOT, script)} ${extraArgs.join(' ') || '(dry-run)'}`);
  const res = run(script, extraArgs);

  if (res.ok) {
    const docLine = extractLine(res.stdout, 'documents to CouchDB') || extractLine(res.stdout, 'Loaded ');
    ok(docLine.trim() || 'CouchDB ingest completed');
    const docsLine = extractLine(res.stdout, 'routeCount');
    log(res.stdout.split('\n').filter(l => l.trim() && !l.includes('injected env')).join('\n  ').slice(0, 800));
  } else {
    warn(`CouchDB ingest exited ${res.status}`);
    log(`  stderr: ${res.stderr.slice(0, 400)}`);
  }

  // Copy report to canonical .tmp paths
  const couchReport = path.join(TMP, 'couchdb-mapreduce-reingest-report.json');
  if (existsSync(couchReport)) {
    const d = JSON.parse(await fs.readFile(couchReport, 'utf8'));
    const { sample: _, ...rest } = d;
    report.steps[3] = { status: res.ok ? 'ok' : 'error', counts: rest.docCounts, docs: rest.docs };
  } else {
    report.steps[3] = { status: res.ok ? 'ok' : 'error' };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Step 4 — DuckDB offline join materialization
// ══════════════════════════════════════════════════════════════════════════════

if (shouldRun(4)) {
  step(4, 'DuckDB offline join materialization');
  const script = path.join(SCRIPTS, 'atlas', 'materialize-feature-map-duckdb.mjs');
  const extraArgs = APPLY ? ['--write'] : ['--dry-run'];

  log(`  Running: node ${path.relative(ROOT, script)} ${extraArgs.join(' ')}`);
  const res = run(script, extraArgs);

  if (res.ok) {
    log(res.stdout.split('\n').filter(l => l.trim() && !l.includes('injected env')).slice(0, 12).join('\n  '));
  } else {
    warn(`DuckDB materialization exited ${res.status}: ${res.stderr.slice(0, 300)}`);
  }

  const duckReport = path.join(TMP, 'duckdb-mapreduce-join-report.json');
  if (existsSync(duckReport)) {
    const d = JSON.parse(await fs.readFile(duckReport, 'utf8'));
    report.steps[4] = { status: res.ok ? 'ok' : 'error', summary: d.summary };
  } else {
    report.steps[4] = { status: res.ok ? 'ok' : 'error' };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Step 5 — Qdrant source_ref/feature_id backfill
// ══════════════════════════════════════════════════════════════════════════════

if (shouldRun(5)) {
  step(5, 'Qdrant source_ref/feature_id backfill (sync-atlas-feature-map-from-qdrant)');
  const script = path.join(SCRIPTS, 'atlas', 'sync-atlas-feature-map-from-qdrant.mjs');
  const extraArgs = APPLY ? [] : ['--dry-run'];

  log(`  Running: node ${path.relative(ROOT, script)} ${extraArgs.join(' ') || '(apply)'}`);
  const res = run(script, extraArgs);

  if (res.ok) {
    const lines = res.stdout.split('\n').filter(l => l.trim() && !l.includes('injected env')).slice(0, 15);
    log(lines.join('\n  '));
    ok('Qdrant sync completed');
  } else {
    warn(`Qdrant sync exited ${res.status}`);
    if (res.stderr) log(`  stderr: ${res.stderr.slice(0, 300)}`);
  }

  report.steps[5] = {
    status: res.ok ? 'ok' : 'error',
    output: res.stdout.split('\n').filter(l => l.includes('Upserted') || l.includes('upserted') || l.includes('rows')).join(' '),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Step 6 — atlas_feature_map_synthesized rebuild
// ══════════════════════════════════════════════════════════════════════════════

if (shouldRun(6)) {
  step(6, 'atlas_feature_map_synthesized rebuild');
  const script = path.join(SCRIPTS, 'atlas', 'build-synthesized-map.mjs');
  const extraArgs = APPLY ? [] : ['--dry-run'];

  log(`  Running: node ${path.relative(ROOT, script)} ${extraArgs.join(' ') || '(apply)'}`);
  const res = run(script, extraArgs);

  if (res.ok) {
    const relevant = res.stdout.split('\n').filter(l =>
      l.trim() && !l.includes('injected env') && (
        l.includes('Upsert') || l.includes('upsert') || l.includes('rows') ||
        l.includes('atlas') || l.includes('packet') || l.includes('som') ||
        l.includes('✓') || l.includes('Built')
      )
    ).slice(0, 12);
    log(relevant.join('\n  '));
    ok('Synthesis rebuild completed');
  } else {
    warn(`Synthesis rebuild exited ${res.status}`);
    if (res.stderr) log(`  stderr: ${res.stderr.slice(0, 300)}`);
  }

  report.steps[6] = { status: res.ok ? 'ok' : 'error' };
}

// ══════════════════════════════════════════════════════════════════════════════
// Step 7 — Profile card JSON generation
// ══════════════════════════════════════════════════════════════════════════════

if (shouldRun(7)) {
  step(7, 'Profile card JSON generation (build-file-profile-cards)');
  const script = path.join(SCRIPTS, 'docs', 'build-file-profile-cards.mjs');
  const extraArgs = APPLY ? ['--apply', '--no-png'] : [];

  log(`  Running: node ${path.relative(ROOT, script)} ${extraArgs.join(' ') || '(dry-run, limit 5)'}`);
  const res = run(script, extraArgs);

  if (res.ok) {
    const relevant = res.stdout.split('\n').filter(l =>
      l.trim() && !l.includes('injected env') && !l.includes('[DRY-RUN] Schema')
    ).slice(0, 20);
    log(relevant.join('\n  '));
    ok('Profile cards completed');
  } else {
    warn(`Profile cards exited ${res.status}`);
    if (res.stderr) log(`  stderr: ${res.stderr.slice(0, 300)}`);
  }

  const cardsOutput = res.stdout.split('\n')
    .filter(l => l.includes('Processing file:'))
    .map(l => l.replace('Processing file:', '').trim());

  report.steps[7] = {
    status: res.ok ? 'ok' : 'error',
    filesProcessed: cardsOutput.length,
    files: cardsOutput,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Final report
// ══════════════════════════════════════════════════════════════════════════════

log(`\n${'═'.repeat(60)}`);
log(`  Parent Atlas Reingest — ${APPLY ? 'APPLY' : 'DRY-RUN'} complete`);
log(`  Run ID: ${RUN_ID}`);
log(`  Steps completed: ${Object.keys(report.steps).filter(k => report.steps[k].status === 'ok').join(', ')}`);
const failed = Object.keys(report.steps).filter(k => report.steps[k].status === 'error');
if (failed.length > 0) log(`  Steps failed:    ${failed.join(', ')}`);
log(`${'═'.repeat(60)}\n`);

if (!APPLY) {
  log(`  Dry-run complete. Inspect the .tmp/ reports, then run:`);
  log(`    node scripts/atlas/reingest-parent-atlas.mjs --apply`);
  log(`  Or apply individual steps:`);
  log(`    node scripts/atlas/reingest-parent-atlas.mjs --apply --step 3`);
}

await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
log(`  Report → .tmp/parent-atlas-reingest-report.json`);

process.exit(failed.length > 0 ? 1 : 0);
