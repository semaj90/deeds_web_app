#!/usr/bin/env node
/**
 * run-full-atlas-pipeline.mjs
 *
 * Master orchestrator for the full Atlas codebase intelligence pipeline:
 *
 *   Stage 0: ingest-opencode-cards     — index .opencode/cards/ → Redis + Qdrant
 *   Stage 1: build-codebase-feature-map — semantic feature extraction (7,499 files → 117 areas)
 *   Stage 2: dependency-context-mapper  — $lib alias resolution + import graph NDJSON
 *   Stage 3: append-dir-agents-llms    — temporal AGENTS.md/LLMS.md append to every dir
 *   Stage 4: ingest-codebase-tasker    — Kanban task generator (Gemma4)
 *   Stage 5: codebase-error-fixer      — error cluster + fix proposals (Gemma4)
 *
 * Each stage writes to .tmp/ and can be skipped with flags.
 *
 * Usage:
 *   node scripts/atlas/run-full-atlas-pipeline.mjs
 *   node scripts/atlas/run-full-atlas-pipeline.mjs --dry-run
 *   node scripts/atlas/run-full-atlas-pipeline.mjs --no-llm          # skip Gemma4 calls
 *   node scripts/atlas/run-full-atlas-pipeline.mjs --resume          # skip Stage 1 if map exists
 *   node scripts/atlas/run-full-atlas-pipeline.mjs --no-cards        # skip Stage 0
 *   node scripts/atlas/run-full-atlas-pipeline.mjs --no-deps         # skip Stage 2
 *   node scripts/atlas/run-full-atlas-pipeline.mjs --no-agents-llms  # skip Stage 3
 *   node scripts/atlas/run-full-atlas-pipeline.mjs --skip-errors     # skip Stage 5
 *   node scripts/atlas/run-full-atlas-pipeline.mjs --limit 100
 *   node scripts/atlas/run-full-atlas-pipeline.mjs --only-map        # Stage 1 only
 *   node scripts/atlas/run-full-atlas-pipeline.mjs --from 3          # start from stage N
 *   node scripts/atlas/run-full-atlas-pipeline.mjs --verbose
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRepoPath } from './_atlas-utils.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const argv  = process.argv.slice(2);

const DRY_RUN        = argv.includes('--dry-run');
const NO_LLM         = argv.includes('--no-llm');
const VERBOSE        = argv.includes('--verbose');
const RESUME         = argv.includes('--resume');
const SKIP_ERRORS    = argv.includes('--skip-errors');
const ONLY_MAP       = argv.includes('--only-map');
const NO_CARDS       = argv.includes('--no-cards');
const NO_DEPS        = argv.includes('--no-deps');
const NO_AGENTS_LLMS = argv.includes('--no-agents-llms');
const LIMIT_I        = argv.indexOf('--limit');
const LIMIT          = LIMIT_I >= 0 ? argv[LIMIT_I + 1] : null;
const FROM_I         = argv.indexOf('--from');
const FROM_STAGE     = FROM_I >= 0 ? parseInt(argv[FROM_I + 1], 10) : 0;

// ── Output paths ──────────────────────────────────────────────────────────────
const FEATURE_MAP_PATH  = resolveRepoPath('.tmp/codebase-feature-map.json');
const DEP_GRAPH_PATH    = resolveRepoPath('.tmp/dependency-graph.ndjson');
const KANBAN_PATH       = resolveRepoPath('.tmp/kanban-board.json');
const ERROR_PROPS_PATH  = resolveRepoPath('.tmp/error-fix-proposals.jsonl');
const CARDS_STATE_PATH  = resolveRepoPath('.tmp/opencode-cards-ingest-state.json');

// ── Stage runner ──────────────────────────────────────────────────────────────
function runStage(stageNum, label, scriptPath, extraArgs = []) {
  if (stageNum < FROM_STAGE) {
    console.log(`\n[pipeline] ⏩ Stage ${stageNum} skipped (--from ${FROM_STAGE})`);
    return true;
  }

  const start = Date.now();
  const bar = '═'.repeat(70);
  console.log(`\n${bar}`);
  console.log(`[pipeline] ▶  Stage ${stageNum}: ${label}`);
  console.log('─'.repeat(70));

  const baseArgs = [];
  if (DRY_RUN) baseArgs.push('--dry-run');
  if (NO_LLM)  baseArgs.push('--no-llm');
  if (VERBOSE)  baseArgs.push('--verbose');
  if (LIMIT)    baseArgs.push('--limit', LIMIT);

  const args = [...baseArgs, ...extraArgs];
  const result = spawnSync('node', [scriptPath, ...args], {
    stdio: 'inherit',
    encoding: 'utf8',
    cwd: resolveRepoPath('.'),
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  if (result.status !== 0) {
    console.error(`\n[pipeline] ✗ Stage ${stageNum} failed (exit ${result.status}) in ${elapsed}s`);
    return false;
  }
  console.log(`\n[pipeline] ✓ Stage ${stageNum}: ${label} — completed in ${elapsed}s`);
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const pipelineStart = Date.now();
const BAR = '═'.repeat(70);

console.log(`\n${BAR}`);
console.log(`[pipeline] Atlas Full Codebase Intelligence Pipeline`);
console.log(`[pipeline] ${new Date().toISOString()}`);
console.log(`[pipeline] dry=${DRY_RUN}  llm=${!NO_LLM}  resume=${RESUME}  limit=${LIMIT ?? 'all'}`);
console.log(BAR);

const results = {};

// ── Stage 0: OpenCode Cards Ingestion ─────────────────────────────────────────
if (!NO_CARDS) {
  results[0] = runStage(
    0, 'OpenCode Cards → Redis + Qdrant',
    path.join(__dir, 'ingest-opencode-cards.mjs'),
    ['--no-embed'] // skip embeddings by default to keep pipeline fast; use standalone for full embed
  );
  if (!results[0]) console.warn('[pipeline] Stage 0 failed — continuing (non-blocking)');
} else {
  console.log('\n[pipeline] ⏩ Stage 0 skipped (--no-cards)');
  results[0] = true;
}

// ── Stage 1: Codebase Feature Map ─────────────────────────────────────────────
if (RESUME && fs.existsSync(FEATURE_MAP_PATH)) {
  console.log(`\n[pipeline] ⏩ Stage 1 skipped (--resume, feature map exists)`);
  results[1] = true;
} else {
  results[1] = runStage(
    1, 'Codebase Feature Map',
    path.join(__dir, 'build-codebase-feature-map.mjs')
  );
}

if (!results[1]) {
  console.error('[pipeline] Stage 1 failed — aborting pipeline');
  process.exit(1);
}

if (ONLY_MAP) {
  console.log('\n[pipeline] --only-map — stopping after Stage 1');
  printSummary();
  process.exit(0);
}

// ── Stage 2: Dependency Context Mapper ────────────────────────────────────────
if (!NO_DEPS) {
  results[2] = runStage(
    2, 'Dependency Context Mapper ($lib alias resolution)',
    path.join(__dir, 'dependency-context-mapper.mjs')
  );
  if (!results[2]) console.warn('[pipeline] Stage 2 failed — continuing');
} else {
  console.log('\n[pipeline] ⏩ Stage 2 skipped (--no-deps)');
  results[2] = true;
}

// ── Stage 3: Dir AGENTS.md / LLMS.md Temporal Append ─────────────────────────
if (!NO_AGENTS_LLMS) {
  results[3] = runStage(
    3, 'Temporal AGENTS.md/LLMS.md Append',
    path.join(__dir, 'append-dir-agents-llms.mjs')
  );
  if (!results[3]) console.warn('[pipeline] Stage 3 failed — continuing');
} else {
  console.log('\n[pipeline] ⏩ Stage 3 skipped (--no-agents-llms)');
  results[3] = true;
}

// ── Stage 4: Kanban Tasker (Gemma4) ───────────────────────────────────────────
results[4] = runStage(
  4, 'Kanban Task Generator (Gemma4)',
  path.join(__dir, 'ingest-codebase-tasker.mjs')
);
if (!results[4]) console.warn('[pipeline] Stage 4 failed — continuing');

// ── Stage 5: Error Fixer (Gemma4) ─────────────────────────────────────────────
if (!SKIP_ERRORS) {
  results[5] = runStage(
    5, 'Error Fixer + Fix Proposals (Gemma4)',
    path.join(__dir, 'codebase-error-fixer.mjs')
  );
  if (!results[5]) console.warn('[pipeline] Stage 5 failed — non-blocking');
} else {
  console.log('\n[pipeline] ⏩ Stage 5 skipped (--skip-errors)');
  results[5] = true;
}

// ── Summary ───────────────────────────────────────────────────────────────────
function printSummary() {
  const elapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);
  console.log(`\n${BAR}`);
  console.log(`[pipeline] Full Pipeline Complete — ${elapsed}s`);
  console.log(BAR);

  const stageNames = {
    0: 'Cards Ingest  ',
    1: 'Feature Map   ',
    2: 'Dep Mapper    ',
    3: 'Dir AGENTS/LLM',
    4: 'Kanban Tasker ',
    5: 'Error Fixer   ',
  };
  for (const [n, name] of Object.entries(stageNames)) {
    const r = results[n];
    console.log(`  Stage ${n} (${name}): ${r === undefined ? '⏩ skipped' : r ? '✓' : '✗'}`);
  }

  console.log('\n[pipeline] Outputs:');
  if (fs.existsSync(FEATURE_MAP_PATH)) {
    try {
      const d = JSON.parse(fs.readFileSync(FEATURE_MAP_PATH, 'utf8'));
      console.log(`  Feature Map    : .tmp/codebase-feature-map.json (${d.totalFeatureAreas} areas, ${d.totalFiles} files)`);
    } catch { console.log(`  Feature Map    : .tmp/codebase-feature-map.json`); }
  }
  if (fs.existsSync(DEP_GRAPH_PATH)) {
    const lines = fs.readFileSync(DEP_GRAPH_PATH, 'utf8').trim().split('\n').length;
    console.log(`  Dep Graph      : .tmp/dependency-graph.ndjson (${lines} edges)`);
  }
  if (fs.existsSync(KANBAN_PATH)) {
    try {
      const b = JSON.parse(fs.readFileSync(KANBAN_PATH, 'utf8'));
      const cols = Object.entries(b.columns ?? {}).map(([k, v]) => `${k}:${v.tasks?.length ?? 0}`).join('  ');
      console.log(`  Kanban Board   : .tmp/kanban-board.json  ${cols}`);
    } catch { console.log(`  Kanban Board   : .tmp/kanban-board.json`); }
  }
  if (fs.existsSync(ERROR_PROPS_PATH)) {
    const lines = fs.readFileSync(ERROR_PROPS_PATH, 'utf8').trim().split('\n').filter(Boolean).length;
    console.log(`  Error Proposals: .tmp/error-fix-proposals.jsonl (${lines} proposals)`);
  }
  if (fs.existsSync(CARDS_STATE_PATH)) {
    try {
      const s = JSON.parse(fs.readFileSync(CARDS_STATE_PATH, 'utf8'));
      console.log(`  Cards State    : .tmp/opencode-cards-ingest-state.json (total: ${s.totalProcessed})`);
    } catch {}
  }

  console.log('\n[pipeline] Quick commands:');
  console.log('  Fast re-run    : node scripts/atlas/run-full-atlas-pipeline.mjs --resume --no-llm --no-agents-llms');
  console.log('  Cards only     : node scripts/atlas/ingest-opencode-cards.mjs --limit 500');
  console.log('  Cards + embed  : node scripts/atlas/ingest-opencode-cards.mjs');
  console.log('  View kanban    : cat .tmp/kanban-board.md');
  console.log('  View fixes     : cat .tmp/error-fix-report.md');
  console.log('  Neo4j sync     : node scripts/atlas/project-feature-matrix-neo4j.mjs --input .tmp/chunks/feature-chunks.ndjson');
}

printSummary();

const allOK = Object.values(results).every(Boolean);
process.exit(allOK ? 0 : 1);
