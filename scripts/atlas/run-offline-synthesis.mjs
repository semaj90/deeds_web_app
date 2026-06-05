#!/usr/bin/env node
/**
 * run-offline-synthesis.mjs
 *
 * Offline synthesis entrypoint for the current-corpus batch lane.
 *
 * Flow:
 *   1. batch-offline-ingest (bounded slice of the repo)
 *   2. summarize_cards_gemma4 (compact summary artifacts)
 *   3. mapreduce-consolidated-index (current corpus metadata join)
 *   4. offline-synthesis-mapreduce-duckdb (materialize DuckDB mirror)
 *   5. hidden-packet-pathmap-duckdb (materialize hidden packet join surface)
 *   6. duckdb:feature-cards:refresh (validate offline mirror)
 *   7. phase-19c-knowledge-consolidation (prepare consolidation payloads)
 *   8. phase-19c-qdrant-index (prepare vector payloads)
 *   9. phase-19c-neo4j-sync (prepare graph payloads)
 *   10. atlas-parent-indexing (apply parent atlas exports)
 *   11. validate-parent-atlas + audit-parent-atlas-consistency
 *
 * Usage:
 *   node scripts/atlas/run-offline-synthesis.mjs
 *   node scripts/atlas/run-offline-synthesis.mjs --dry-run
 *   node scripts/atlas/run-offline-synthesis.mjs --apply
 *   node scripts/atlas/run-offline-synthesis.mjs --apply --limit 1000
 *
 * Env overrides:
 *   OFFLINE_SYNTHESIS_LIMIT=1000
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const APPLY = args.includes('--apply');
const LIMIT_I = args.indexOf('--limit');
const OFFSET_I = args.indexOf('--offset');
const bareLimitArg = args.find((arg) => /^\d+$/.test(arg));
const envOffsetRaw = process.env.OFFLINE_SYNTHESIS_OFFSET ?? process.env.OFFSET ?? '';
const envLimitRaw = process.env.OFFLINE_SYNTHESIS_LIMIT ?? process.env.LIMIT ?? '';
const LIMIT = LIMIT_I >= 0
  ? Number(args[LIMIT_I + 1])
  : bareLimitArg
    ? Number(bareLimitArg)
  : envLimitRaw
    ? Number(envLimitRaw)
    : 1000;
const OFFSET = OFFSET_I >= 0
  ? Number(args[OFFSET_I + 1])
  : envOffsetRaw
    ? Number(envOffsetRaw)
    : 0;

const REPORT_JSON = path.join(ROOT, '.tmp', 'offline-synthesis-report.json');
const REPORT_MD = path.join(ROOT, '.tmp', 'offline-synthesis-report.md');

function run(label, command, commandArgs, extraEnv = {}) {
  console.log(`\n══ ${label} ══════════════════════════════════════════════`);
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit ${result.status ?? 1}`);
  }
}

function runNodeScript(relPath, extraArgs = []) {
  run(path.basename(relPath), process.execPath, [path.join(ROOT, relPath), ...extraArgs]);
}

function runNpmScript(scriptName, extraArgs = [], cwd = ROOT) {
  console.log(`\n══ npm run ${scriptName} ══════════════════════════════════════════════`);
  const npmArgs = ['--prefix', cwd, 'run', scriptName];
  if (extraArgs.length > 0) {
    npmArgs.push('--', ...extraArgs);
  }
  const result = spawnSync('npm', npmArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, npm_config_loglevel: 'warn' },
  });
  if (result.status !== 0) {
    throw new Error(`npm run ${scriptName} failed with exit ${result.status ?? 1}`);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  dryRun: DRY_RUN,
  apply: APPLY,
  limit: LIMIT,
  offset: OFFSET,
  steps: [],
};

function mark(step, status, details = {}) {
  report.steps.push({ step, status, ...details });
}

  console.log(`\nOffline Synthesis [APPLY=${APPLY}] [LIMIT=${LIMIT}] [OFFSET=${OFFSET}]`);
if (DRY_RUN || !APPLY) {
  console.log('  (dry-run / bounded preview — pass --apply to write batch outputs and downstream mirrors)\n');
}

try {
  // 1. Bounded batch ingest is the source of truth for the current corpus slice.
  const batchArgs = [];
  if (DRY_RUN || !APPLY) {
    batchArgs.push('--limit', String(LIMIT));
  } else {
    batchArgs.push('--apply', '--limit', String(LIMIT));
  }
  if (OFFSET > 0) {
    batchArgs.push('--offset', String(OFFSET));
  }
  runNodeScript('scripts/atlas/batch-offline-ingest.mjs', batchArgs);
  mark('batch-offline-ingest', 'ok', { limit: LIMIT, apply: APPLY && !DRY_RUN });

  // 2. Gemma4 summarization produces compact artifacts for parent atlas and token swaps.
  if (APPLY && !DRY_RUN) {
    runNodeScript('scripts/opencode/summarize_cards_gemma4.mjs', ['--top', '1']);
    mark('summarize-cards-gemma4', 'ok');
  } else {
    mark('summarize-cards-gemma4', 'skipped', { reason: 'dry-run' });
  }

  // 3. Validate the offline mirror in DuckDB.
  const mapreduceOutput = path.join(ROOT, '.tmp', 'offline-synthesis', 'consolidated-index.ndjson');
  const mapreduceArgs = ['--limit', String(LIMIT), '--output=' + mapreduceOutput];
  runNodeScript('scripts/atlas/mapreduce-consolidated-index.mjs', mapreduceArgs);
  mark('mapreduce-consolidated-index', 'ok', { limit: LIMIT, output: mapreduceOutput, apply: APPLY && !DRY_RUN });

  if (APPLY && !DRY_RUN) {
    runNodeScript('scripts/atlas/materialize-mapreduce-duckdb.mjs', ['--write']);
    mark('offline-synthesis-mapreduce-duckdb', 'ok');
  } else {
    runNodeScript('scripts/atlas/materialize-mapreduce-duckdb.mjs', ['--dry-run']);
    mark('offline-synthesis-mapreduce-duckdb', 'skipped', { reason: 'dry-run' });
  }

  // 5. Materialize the hidden packet pathmap join surface in DuckDB.
  if (APPLY && !DRY_RUN) {
    runNodeScript('scripts/atlas/materialize-hidden-packet-pathmap-duckdb.mjs', ['--write']);
    mark('hidden-packet-pathmap-duckdb', 'ok');
  } else {
    runNodeScript('scripts/atlas/materialize-hidden-packet-pathmap-duckdb.mjs', ['--dry-run']);
    mark('hidden-packet-pathmap-duckdb', 'skipped', { reason: 'dry-run' });
  }

  // 6. Validate the offline mirror in DuckDB.
  if (APPLY && !DRY_RUN) {
    runNpmScript('duckdb:feature-cards:refresh', [], path.join(ROOT, 'sveltekit-frontend'));
    mark('duckdb-feature-cards-refresh', 'ok');
  } else {
    mark('duckdb-feature-cards-refresh', 'skipped', { reason: 'dry-run' });
  }

  // 7. Prepare the phase-19c payloads.
  runNodeScript('scripts/atlas/phase-19c-knowledge-consolidation.mjs', DRY_RUN || !APPLY ? ['--dry-run'] : []);
  mark('phase-19c-knowledge-consolidation', 'ok');

  runNodeScript('scripts/atlas/phase-19c-qdrant-index.mjs', DRY_RUN || !APPLY ? ['--dry-run'] : []);
  mark('phase-19c-qdrant-index', 'ok');

  runNodeScript('scripts/atlas/phase-19c-neo4j-sync.mjs', DRY_RUN || !APPLY ? ['--dry-run'] : []);
  mark('phase-19c-neo4j-sync', 'ok');

  // 8. Promote the parent atlas export and validate it.
  runNodeScript('scripts/atlas-parent-indexing.mjs', [DRY_RUN || !APPLY ? '--dry-run' : '--apply']);
  mark('atlas-parent-indexing', 'ok', { apply: APPLY && !DRY_RUN });

  runNodeScript('scripts/atlas/validate-parent-atlas.mjs', []);
  mark('validate-parent-atlas', 'ok');

  runNodeScript('scripts/atlas/audit-parent-atlas-consistency.mjs', []);
  mark('audit-parent-atlas-consistency', 'ok');

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');

  const md = [
    '# Offline Synthesis Run',
    '',
    `Generated: ${report.generatedAt}`,
    `Mode: ${APPLY && !DRY_RUN ? 'APPLY' : 'DRY-RUN / BOUNDED'}`,
    `Limit: ${LIMIT}`,
    `Offset: ${OFFSET}`,
    '',
    '## Steps',
    ...report.steps.map((s) => `- [${s.status === 'ok' ? 'x' : ' '}] ${s.step}${s.limit ? ` (limit ${s.limit})` : ''}${s.apply ? ' [APPLY]' : ''}${s.reason ? ` [${s.reason}]` : ''}`),
    '',
    '## Retrieval order',
    '1. Redis exact cache and hot keys',
    '2. Qdrant semantic collections',
    '3. Postgres durable tables',
    '4. Neo4j / SOM topology lanes',
    '',
  '## Primary outputs',
  '- `.tmp/ingest/lanes/codebase_features.ndjson`',
  '- `.tmp/ingest/edges/codebase_features_edges.ndjson`',
  '- `docs/reports/hidden-packet-pathmap-duckdb-report.md`',
  '- `docs/reports/hidden-packet-pathmap-duckdb-report.json`',
  '- `memory/exports/parent-atlas/parent_atlas_index.csv`',
  '- `memory/exports/parent-atlas/parent_atlas_index.json`',
  '- `memory/exports/parent-atlas-report.json`',
  '- `docs/phase100/feature-recommendations.json`',
  '- `docs/phase100/feature-recommendations.md`',
    '',
  '## Downstream stores',
  '- Postgres: `task_semantic_packets`, `parent_atlas_records`, `parent_atlas_vectors`, `glyph_records`',
  '- Qdrant: `feature_maps`, `codebase_chunks_768`',
  '- Redis: `ace:ctx:*`, `ace:packet:latest`, centroid and SOM caches',
  '- Canonical hidden-packet join surface: `docs/reports/hidden-packet-pathmap-duckdb-report.md` for `sourceRef + feature_id + stable_id` replay',
  '',
].join('\n');

  fs.writeFileSync(REPORT_MD, md, 'utf8');

  console.log(`\n✓ Wrote ${REPORT_JSON}`);
  console.log(`✓ Wrote ${REPORT_MD}`);
  console.log('\nOffline synthesis complete.');
} catch (err) {
  report.error = err?.message ?? String(err);
  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  console.error(`\n✗ Offline synthesis failed: ${report.error}`);
  process.exit(1);
}
