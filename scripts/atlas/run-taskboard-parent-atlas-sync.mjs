#!/usr/bin/env node
/**
 * run-taskboard-parent-atlas-sync.mjs
 *
 * Unified pipeline: taskboard → kanban → codebase semantic map → graphify →
 * Karpathy GPU blend → Qdrant payload patch → Redis ACE hot cache →
 * Bifrost-aligned parent atlas indexing → validation.
 *
 * All downstream stores (Qdrant, Redis, Bifrost) are written when --write is
 * passed. Without --write the pipeline runs in dry-run mode (safe to run any
 * time, no DB mutations).
 *
 * Order:
 *   1. consolidate-master-todo-to-kanban.mjs
 *   2. rank-kanban-and-npm-inventory.mjs
 *   3. [--with-turbovec] kanban TurboVec consolidation / mass task ingestion
 *   4. [--with-codebase] codebase feature map + feature graph
 *   5. [--with-graphify] graphify-batch-karpathy-analysis (GDS + Karpathy + summaries)
 *   6. [--with-kmeans]   graphify:feature-labels + domain-topology (KMeans Neo4j sync)
 *   7. [--with-feature-gap] atlas:feature-gap (isolated / under-linked node report)
 *   8. [--with-rg-dumps] organize raw rg transcripts into Parent Atlas packets
 *   9. [--with-source-ref-first] sourceRef-first hot-join -> parent atlas refresh
 *  10. atlas-parent-indexing
 *  11. validate-parent-atlas + audit-parent-atlas-consistency
 *
 * Usage:
 *   node scripts/atlas/run-taskboard-parent-atlas-sync.mjs
 *   node scripts/atlas/run-taskboard-parent-atlas-sync.mjs --with-graphify
 *   node scripts/atlas/run-taskboard-parent-atlas-sync.mjs --with-turbovec
 *   node scripts/atlas/run-taskboard-parent-atlas-sync.mjs --with-codebase --with-graphify --limit 50
 *   node scripts/atlas/run-taskboard-parent-atlas-sync.mjs --with-codebase --with-graphify --write
 *   node scripts/atlas/run-taskboard-parent-atlas-sync.mjs --with-codebase --with-graphify --with-kmeans --with-feature-gap --write
 *
 * Env overrides:
 *   ATLAS_SYNC_LIMIT=50   equivalent to --limit 50
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const args = process.argv.slice(2);
const WITH_CODEBASE   = args.includes('--with-codebase');
const WITH_GRAPHIFY   = args.includes('--with-graphify');
const WITH_KMEANS     = args.includes('--with-kmeans');
const WITH_FEATURE_GAP = args.includes('--with-feature-gap');
const WITH_TURBOVEC   = args.includes('--with-turbovec');
const WITH_RG_DUMPS   = args.includes('--with-rg-dumps');
const WITH_SOURCE_REF_FIRST = args.includes('--with-source-ref-first') || args.includes('--with-sourceRef-first');
const SOURCE_REF_FIRST_ONLY = args.includes('--source-ref-first-only') || args.includes('--sourceRef-first-only');
const WRITE           = args.includes('--write');
const LIMIT_I = args.indexOf('--limit');
const envLimitRaw = process.env.ATLAS_SYNC_LIMIT ?? process.env.LIMIT ?? '';
const LIMIT = LIMIT_I >= 0
  ? Number(args[LIMIT_I + 1])
  : envLimitRaw
    ? Number(envLimitRaw)
    : null;

const REPORT_JSON = path.join(ROOT, '.tmp', 'taskboard-parent-atlas-sync.json');
const REPORT_MD   = path.join(ROOT, '.tmp', 'taskboard-parent-atlas-sync.md');
const DEFAULT_SOURCE_REF_DB = 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';

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

// npm run <script> — used only for sveltekit-frontend scripts that need the
// sveltekit-frontend package context (e.g. feature-gap:registry:report).
function runNpmScript(scriptName, extraArgs = []) {
  run(`npm run ${scriptName}`, 'npm', ['run', scriptName, '--', ...extraArgs]);
}

const report = {
  generatedAt: new Date().toISOString(),
  withCodebase:   WITH_CODEBASE,
  withGraphify:   WITH_GRAPHIFY,
  withKmeans:     WITH_KMEANS,
  withFeatureGap: WITH_FEATURE_GAP,
  withTurboVec:   WITH_TURBOVEC,
  withRgDumps:    WITH_RG_DUMPS,
  withSourceRefFirst: WITH_SOURCE_REF_FIRST,
  sourceRefFirstOnly: SOURCE_REF_FIRST_ONLY,
  write:          WRITE,
  limit:          LIMIT,
  steps: [],
};

function mark(step, status, details = {}) {
  report.steps.push({ step, status, ...details });
}

console.log(`\nUnified Atlas Sync [WRITE=${WRITE}] [LIMIT=${LIMIT ?? 'all'}]`);
  if (!WRITE) console.log('  (dry-run — pass --write to push to Qdrant/Redis/Bitfrost)\n');

try {
  if (SOURCE_REF_FIRST_ONLY) {
    // Lean lane: sourceRef-first refresh only, no full codebase graphify pass.
    const refreshArgs = WRITE ? ['--apply'] : ['--dry-run'];
    runNodeScript('scripts/atlas/sourceRef-first-parent-atlas-refresh.mjs', refreshArgs);
    mark('sourceRef-first-parent-atlas-refresh', WRITE ? 'ok' : 'dry-run', { write: WRITE });

    run('generate_parent_atlas_packets.mjs', process.execPath, [path.join(ROOT, 'scripts', 'atlas', 'generate_parent_atlas_packets.mjs'), '--only-sourceRef-first'], {
      DATABASE_URL: DEFAULT_SOURCE_REF_DB,
    });
    mark('generate-parent-atlas-packets-sourceRef-first', 'ok');

    const env = {
      PACKETS_DIR: '.\\.tmp\\parent_atlas_packets\\sourceRef-first',
      DATABASE_URL: DEFAULT_SOURCE_REF_DB,
    };
    run('enqueue_parent_atlas_jobs', process.execPath, [path.join(ROOT, 'scripts', 'atlas', 'enqueue_parent_atlas_jobs.mjs')], env);
    mark('enqueue-parent-atlas-jobs-sourceRef-first', 'ok');

    runNodeScript('scripts/atlas/validate-parent-atlas.mjs', []);
    mark('validate-parent-atlas', 'ok');

    runNodeScript('scripts/atlas/audit-parent-atlas-consistency.mjs', []);
    mark('audit-parent-atlas-consistency', 'ok');
  } else {
  // ── Step 1: master todo → kanban ────────────────────────────────────────
  runNodeScript('scripts/atlas/consolidate-master-todo-to-kanban.mjs', ['--apply', '--merge']);
  mark('consolidate-master-todo-to-kanban', 'ok');

  // ── Step 2: kanban ranking + npm inventory ───────────────────────────────
  runNodeScript('scripts/atlas/rank-kanban-and-npm-inventory.mjs', ['--apply']);
  mark('rank-kanban-and-npm-inventory', 'ok');

  // ── Step 3: TurboVec kanban consolidation ────────────────────────────────
  if (WITH_TURBOVEC) {
    runNpmScript('atlas:kanban:turbovec-consolidation', []);
    mark('kanban-turbovec-consolidation', 'ok');
  }

  // ── Step 4: codebase semantic map + feature graph ────────────────────────
  if (WITH_CODEBASE) {
    const mapArgs = [];
    if (LIMIT) mapArgs.push('--limit', String(LIMIT));
    runNodeScript('scripts/atlas/build-codebase-feature-map.mjs', mapArgs);
    mark('build-codebase-feature-map', 'ok', { limit: LIMIT });

    runNodeScript('scripts/atlas/build-feature-graph.mjs', []);
    mark('build-feature-graph', 'ok');
  }

  // ── Step 5: graphify → GDS → Karpathy GPU blend → Qdrant → Redis ────────
  if (WITH_GRAPHIFY) {
    const graphifyArgs = [];
    if (LIMIT) graphifyArgs.push(`--limit=${LIMIT}`);
    // --write propagates to neo4j-graph-enrich (Qdrant payload patch + Redis
    // ace:authority:top) and to karpathy-gpu-enrich (gpu:karpathy:scores hash).
    if (WRITE) graphifyArgs.push('--write');
    runNodeScript('scripts/graphify/graphify-batch-karpathy-analysis.mjs', graphifyArgs);
    mark('graphify-karpathy-batch', 'ok', { limit: LIMIT, write: WRITE });
  }

  // ── Step 6: KMeans feature labels + domain topology → Neo4j sync ─────────
  if (WITH_KMEANS) {
    runNodeScript('scripts/graphify/feature-labeling.mjs', []);
    mark('graphify-feature-labels', 'ok');

    runNodeScript('scripts/graphify/domain-topology.mjs', []);
    mark('graphify-domain-topology', 'ok');
  }

  // ── Step 7: feature-gap recommendations (isolated / under-linked nodes) ──
  if (WITH_FEATURE_GAP) {
    // atlas:feature-gap delegates to sveltekit-frontend npm context
    runNpmScript('atlas:feature-gap', []);
    mark('atlas-feature-gap', 'ok');
  }

  // ── Step 8: raw rg transcript organization ───────────────────────────────
  if (WITH_RG_DUMPS) {
    runNodeScript('scripts/atlas/organize-rg-search-transcripts.mjs', []);
    mark('organize-rg-search-transcripts', 'ok');

    const rgProjectionArgs = WRITE
      ? ['--write-postgres', '--write-qdrant', '--write-cypher']
      : ['--dry-run'];
    runNodeScript('scripts/atlas/project-parent-atlas-rg-dump-packets.mjs', rgProjectionArgs);
    mark('project-parent-atlas-rg-dump-packets', WRITE ? 'ok' : 'dry-run', { write: WRITE });
  }

  // ── Step 9: sourceRef-first hot-join -> parent atlas refresh ─────────────
  if (WITH_SOURCE_REF_FIRST) {
    const refreshArgs = WRITE ? ['--apply'] : ['--dry-run'];
    runNodeScript('scripts/atlas/sourceRef-first-parent-atlas-refresh.mjs', refreshArgs);
    mark('sourceRef-first-parent-atlas-refresh', WRITE ? 'ok' : 'dry-run', { write: WRITE });
  }

  // ── Step 10: parent atlas indexing ───────────────────────────────────────
  runNodeScript('scripts/atlas/atlas-parent-indexing.mjs', ['--apply']);
  mark('atlas-parent-indexing', 'ok');

  // ── Step 11: validation + consistency audit ──────────────────────────────
  runNodeScript('scripts/atlas/validate-parent-atlas.mjs', []);
  mark('validate-parent-atlas', 'ok');

  runNodeScript('scripts/atlas/audit-parent-atlas-consistency.mjs', []);
  mark('audit-parent-atlas-consistency', 'ok');
  }

  // ── Report ────────────────────────────────────────────────────────────────
  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');

  const modeLabel = WRITE ? 'WRITE (live)' : 'DRY-RUN';
  const md = [
    '# Taskboard / Parent Atlas Sync',
    '',
    `Generated: ${report.generatedAt}`,
    `Mode: ${modeLabel}`,
    `Codebase refresh: ${WITH_CODEBASE ? 'enabled' : 'skipped'}`,
    `Graphify/Karpathy: ${WITH_GRAPHIFY ? 'enabled' : 'skipped'}`,
    `KMeans/Neo4j sync: ${WITH_KMEANS ? 'enabled' : 'skipped'}`,
    `Feature-gap report: ${WITH_FEATURE_GAP ? 'enabled' : 'skipped'}`,
    `RG transcript organization: ${WITH_RG_DUMPS ? 'enabled' : 'skipped'}`,
    `SourceRef-first refresh: ${WITH_SOURCE_REF_FIRST ? 'enabled' : 'skipped'}`,
    `Limit: ${LIMIT ?? 'all'}`,
    '',
    '## Steps',
    ...report.steps.map((s) => `- [${s.status === 'ok' ? 'x' : ' '}] ${s.step}${s.limit ? ` (limit ${s.limit})` : ''}${s.write ? ' [WRITE]' : ''}`),
    '',
    '## Pipeline',
    '```',
    'master-todo → kanban → ranking',
    WITH_TURBOVEC   ? '  → TurboVec kanban consolidation / mass ingestion' : '  (turbovec: skipped)',
    WITH_CODEBASE   ? '  → codebase feature map → feature graph' : '  (codebase: skipped)',
    WITH_GRAPHIFY   ? `  → GDS PageRank+Louvain → Karpathy GPU blend → Qdrant patch → Redis ace:authority:top [${modeLabel}]` : '  (graphify: skipped)',
    WITH_KMEANS     ? '  → KMeans feature labels → domain topology → Neo4j sync' : '  (kmeans: skipped)',
    WITH_FEATURE_GAP ? '  → feature-gap report (isolated / under-linked nodes)' : '  (feature-gap: skipped)',
    WITH_RG_DUMPS   ? '  → raw rg transcript organizer → rg packet projection → Parent Atlas packets' : '  (rg transcripts: skipped)',
    WITH_SOURCE_REF_FIRST ? `  → sourceRef-first hot-join → parent atlas refresh [${modeLabel}]` : '  (sourceRef-first refresh: skipped)',
    '  → parent atlas indexing → validation → consistency audit',
    '```',
    '',
    '## Downstream stores',
    '- **Qdrant** `codebase_chunks_768` — cluster/authority payload (written when --write)',
    '- **Redis** `ace:authority:top` hash — top-200 Karpathy blend scores (written when --write)',
    '- **Redis** `gpu:karpathy:scores` hash — per-file blend scores (written when --write)',
    '- **Bitfrost** — reads from Redis ace:authority:top; no direct write needed',
    '- **Neo4j** — BELONGS_TO_CLUSTER, SIMILAR_TOPOLOGY edges (always written by GDS step)',
    '- **PostgreSQL** — parent atlas + task_semantic_packets (always written)',
    '',
  ].join('\n');

  fs.writeFileSync(REPORT_MD, md, 'utf8');
  console.log(`\n✓ Wrote ${REPORT_JSON}`);
  console.log(`✓ Wrote ${REPORT_MD}`);
  console.log(`\nTaskboard / parent atlas sync complete. [${modeLabel}]`);
} catch (err) {
  report.error = err?.message ?? String(err);
  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  console.error(`\n✗ Sync failed: ${report.error}`);
  process.exit(1);
}
