#!/usr/bin/env node
/**
 * run-codebase-pipeline.mjs
 *
 * Orchestrator for the unified codebase analysis pipeline:
 *
 *   Stage 1: build-codebase-feature-map.mjs  — semantic feature extraction
 *   Stage 2: ingest-codebase-tasker.mjs       — Kanban task generation (Gemma4)
 *   Stage 3: codebase-error-fixer.mjs         — error clustering + fix proposals (Gemma4)
 *
 * Usage:
 *   node scripts/atlas/run-codebase-pipeline.mjs
 *   node scripts/atlas/run-codebase-pipeline.mjs --dry-run
 *   node scripts/atlas/run-codebase-pipeline.mjs --no-llm
 *   node scripts/atlas/run-codebase-pipeline.mjs --skip-errors     # skip Stage 3
 *   node scripts/atlas/run-codebase-pipeline.mjs --only-map        # Stage 1 only
 *   node scripts/atlas/run-codebase-pipeline.mjs --resume          # skip Stage 1 if map exists
 *   node scripts/atlas/run-codebase-pipeline.mjs --limit 100       # limit files/tasks
 *
 * All stages inherit flags: --dry-run, --no-llm, --limit, --verbose
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRepoPath } from './_atlas-utils.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const argv  = process.argv.slice(2);

const DRY_RUN     = argv.includes('--dry-run');
const NO_LLM      = argv.includes('--no-llm');
const VERBOSE     = argv.includes('--verbose');
const SKIP_ERRORS = argv.includes('--skip-errors');
const ONLY_MAP    = argv.includes('--only-map');
const RESUME      = argv.includes('--resume');
const LIMIT_I     = argv.indexOf('--limit');
const LIMIT       = LIMIT_I >= 0 ? argv[LIMIT_I + 1] : null;

const FEATURE_MAP_PATH = resolveRepoPath('.tmp/codebase-feature-map.json');
const KANBAN_BOARD_PATH = resolveRepoPath('.tmp/kanban-board.json');
const ERROR_PROPOSALS_PATH = resolveRepoPath('.tmp/error-fix-proposals.jsonl');

// ── Runner ────────────────────────────────────────────────────────────────────

function runStage(label, scriptPath, extraArgs = []) {
  const start = Date.now();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[pipeline] ▶  ${label}`);
  console.log(`${'─'.repeat(60)}`);

  const baseArgs = [];
  if (DRY_RUN) baseArgs.push('--dry-run');
  if (NO_LLM)  baseArgs.push('--no-llm');
  if (VERBOSE) baseArgs.push('--verbose');
  if (LIMIT)   baseArgs.push('--limit', LIMIT);

  const args = [...baseArgs, ...extraArgs];
  const result = spawnSync('node', [scriptPath, ...args], {
    stdio: 'inherit',
    encoding: 'utf8',
    cwd: resolveRepoPath('.'),
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  if (result.status !== 0) {
    console.error(`\n[pipeline] ✗ ${label} failed (exit ${result.status}) in ${elapsed}s`);
    return false;
  }
  console.log(`\n[pipeline] ✓ ${label} completed in ${elapsed}s`);
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const pipelineStart = Date.now();
console.log(`\n${'═'.repeat(60)}`);
console.log(`[pipeline] Codebase Analysis Pipeline`);
console.log(`[pipeline] dry=${DRY_RUN}  llm=${!NO_LLM}  limit=${LIMIT ?? 'all'}  resume=${RESUME}`);
console.log(`${'═'.repeat(60)}`);

let stage1OK = true;
let stage2OK = true;
let stage3OK = true;

// Stage 1: Feature Map
const mapExists = fs.existsSync(FEATURE_MAP_PATH);
if (RESUME && mapExists) {
  console.log(`\n[pipeline] ⏩ Stage 1 skipped (--resume, map exists at ${FEATURE_MAP_PATH})`);
} else {
  stage1OK = runStage(
    'Stage 1: Codebase Feature Map',
    path.join(__dir, 'build-codebase-feature-map.mjs')
  );
}

if (!stage1OK) {
  console.error('[pipeline] Stage 1 failed — aborting pipeline');
  process.exit(1);
}

if (ONLY_MAP) {
  console.log('\n[pipeline] --only-map flag set — stopping after Stage 1');
} else {
  // Stage 2: Kanban Tasker
  stage2OK = runStage(
    'Stage 2: Kanban Task Generator',
    path.join(__dir, 'ingest-codebase-tasker.mjs')
  );

  if (!stage2OK) {
    console.warn('[pipeline] Stage 2 failed — continuing to Stage 3 if applicable');
  }

  // Stage 3: Error Fixer
  if (!SKIP_ERRORS) {
    stage3OK = runStage(
      'Stage 3: Error Fixer (Gemma4)',
      path.join(__dir, 'codebase-error-fixer.mjs')
    );
  } else {
    console.log('\n[pipeline] ⏩ Stage 3 skipped (--skip-errors)');
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

const elapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);

console.log(`\n${'═'.repeat(60)}`);
console.log(`[pipeline] Pipeline complete in ${elapsed}s`);
console.log(`${'═'.repeat(60)}`);
console.log(`  Stage 1 (Feature Map):  ${stage1OK ? '✓' : '✗'}`);
if (!ONLY_MAP) {
  console.log(`  Stage 2 (Kanban Board): ${stage2OK ? '✓' : '✗'}`);
  if (!SKIP_ERRORS) {
    console.log(`  Stage 3 (Error Fixer):  ${stage3OK ? '✓' : '✗'}`);
  }
}

if (!DRY_RUN) {
  console.log(`\nOutputs:`);
  if (fs.existsSync(FEATURE_MAP_PATH)) {
    const data = JSON.parse(fs.readFileSync(FEATURE_MAP_PATH, 'utf8'));
    console.log(`  Feature Map:  ${FEATURE_MAP_PATH}`);
    console.log(`                ${data.totalFeatureAreas} features, ${data.totalFiles} files`);
  }
  if (fs.existsSync(KANBAN_BOARD_PATH) && !ONLY_MAP) {
    const board = JSON.parse(fs.readFileSync(KANBAN_BOARD_PATH, 'utf8'));
    console.log(`  Kanban Board: ${KANBAN_BOARD_PATH}`);
    const cols = Object.entries(board.columns ?? {}).map(([k, v]) => `${k}:${v.tasks?.length ?? 0}`).join('  ');
    console.log(`                ${cols}`);
  }
  if (fs.existsSync(ERROR_PROPOSALS_PATH) && !SKIP_ERRORS && !ONLY_MAP) {
    const lines = fs.readFileSync(ERROR_PROPOSALS_PATH, 'utf8').trim().split('\n').filter(Boolean);
    console.log(`  Error Fixes:  ${ERROR_PROPOSALS_PATH}`);
    console.log(`                ${lines.length} proposals`);
  }
}

console.log(`\nNext commands:`);
console.log(`  View board:  cat .tmp/kanban-board.md`);
console.log(`  View fixes:  cat .tmp/error-fix-report.md`);
console.log(`  Re-run fast: node scripts/atlas/run-codebase-pipeline.mjs --resume --no-llm`);
console.log(`  Neo4j sync:  node scripts/atlas/project-feature-matrix-neo4j.mjs --input .tmp/chunks/feature-chunks.ndjson`);

process.exit(stage1OK && stage2OK && stage3OK ? 0 : 1);
