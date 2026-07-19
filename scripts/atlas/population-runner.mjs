#!/usr/bin/env node
/**
 * population-runner.mjs
 *
 * Consolidated ordered population pipeline. Runs all backfill stages in the
 * correct dependency order so you never have to drive scripts one by one.
 *
 * Stage order (dependency-driven):
 *   1. dense        — content_embedding_384 via embeddinggemma (embeds raw text → Postgres)
 *   2. sparse       — BM25 keyword index rebuild (needs text from stage 1 backfill)
 *   3. latent       — autoencoder 768→64 latent_64 (needs Qdrant embeddings from stage 1)
 *   4. som          — SOM 20×20 training (needs latent_64 index from stage 3)
 *   5. topology     — page_rank_score, community_id, kmeans_cluster authority columns
 *   6. validate     — graphify startup gate (7-service health check)
 *
 * Usage:
 *   node scripts/atlas/population-runner.mjs [--dry-run] [--from=<stage>] [--to=<stage>] [--stages=1,3,5]
 *
 *   --dry-run         pass --dry-run to every stage script (no writes)
 *   --from=<n>        start at stage n (1-6), skip earlier stages
 *   --to=<n>          stop after stage n (1-6), skip later stages
 *   --stages=1,3      run only the listed stages (comma-separated)
 *   --skip=2,4        skip listed stages
 *   --no-validate     skip stage 6 graphify validate even if otherwise in range
 *   --verbose         extra output per stage
 *
 * Exit codes:
 *   0   all selected stages passed
 *   1   a stage failed (subsequent stages skipped unless --continue-on-fail)
 */

import { execSync, spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir  = dirname(fileURLToPath(import.meta.url));
const ROOT   = resolve(__dir, '..', '..');
const SVELTE = resolve(ROOT, 'sveltekit-frontend');

// ── Arg parsing ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const DRY_RUN       = argv.includes('--dry-run');
const VERBOSE       = argv.includes('--verbose');
const NO_VALIDATE   = argv.includes('--no-validate');
const CONTINUE_FAIL = argv.includes('--continue-on-fail');

const fromArg    = argv.find(a => a.startsWith('--from='));
const toArg      = argv.find(a => a.startsWith('--to='));
const stagesArg  = argv.find(a => a.startsWith('--stages='));
const skipArg    = argv.find(a => a.startsWith('--skip='));

const fromStage  = fromArg  ? parseInt(fromArg.split('=')[1],  10) : 1;
const toStage    = toArg    ? parseInt(toArg.split('=')[1],    10) : 6;
const onlySet    = stagesArg ? new Set(stagesArg.split('=')[1].split(',').map(Number)) : null;
const skipSet    = skipArg   ? new Set(skipArg.split('=')[1].split(',').map(Number))   : new Set();

// ── Stage definitions ─────────────────────────────────────────────────────────

/**
 * Each stage: { id, name, cmd(dryRun), cwd, description }
 * cmd() returns the argv array for node (or npm run).
 */
const STAGES = [
  {
    id: 1,
    name: 'dense',
    description: 'content_embedding_384 backfill via embeddinggemma → Postgres + Qdrant',
    type: 'node',
    script: resolve(__dir, 'backfill-embedding-lane.mjs'),
    extraArgs: (dry) => dry ? ['--dry-run', '--limit=100'] : ['--max-packets=10000', '--batch-size=32'],
    cwd: SVELTE,
  },
  {
    id: 2,
    name: 'sparse',
    description: 'BM25 / keyword index rebuild from atlas_packets text',
    type: 'node',
    script: resolve(__dir, 'graphify-langgraph-pipeline.mjs'),
    extraArgs: (dry) => dry ? ['--dry-run', '--stage', 'index_bm25'] : ['--apply', '--stage', 'index_bm25'],
    cwd: SVELTE,
  },
  {
    id: 3,
    name: 'latent',
    description: 'autoencoder 768→64 latent_64 backfill (requires Qdrant codebase_chunks_768 + AE weights)',
    type: 'node',
    script: resolve(__dir, 'backfill-latent-vectors.mjs'),
    extraArgs: (dry) => dry ? ['--dry-run', '--limit=500'] : ['--apply'],
    cwd: ROOT,
    prerequisiteCheck: checkLatentPrereqs,
  },
  {
    id: 4,
    name: 'som',
    description: 'SOM 20×20 training on latent_64 corpus (requires stage 3 latent index)',
    type: 'node',
    script: resolve(__dir, 'train-som-20x20.mjs'),
    extraArgs: (dry) => dry ? ['--dry-run'] : ['--apply'],
    cwd: ROOT,
    prerequisiteCheck: checkSomPrereqs,
  },
  {
    id: 5,
    name: 'topology',
    description: 'topology authority columns: page_rank_score, community_id, kmeans_cluster',
    type: 'node',
    script: resolve(__dir, 'backfill-topology-lane.mjs'),
    extraArgs: (dry) => dry ? ['--dry-run', '--check-prerequisites'] : ['--apply'],
    cwd: ROOT,
  },
  {
    id: 6,
    name: 'validate',
    description: 'graphify startup gates (7-service health: Ollama, Gemma4, Qdrant, TurboVec, Postgres, Redis)',
    type: 'node',
    script: resolve(ROOT, 'scripts', 'validate-graphify-startup.mjs'),
    extraArgs: () => [],
    cwd: ROOT,
    skip: NO_VALIDATE,
  },
];

// ── Prerequisite checks ───────────────────────────────────────────────────────

import { existsSync } from 'fs';

function checkLatentPrereqs() {
  const weightsDir = resolve(ROOT, 'models', 'autoencoder');
  const addonPath  = resolve(ROOT, 'simd-bridge', 'cpp', 'build', 'Release', 'tensorrt_bridge.node');
  const issues = [];
  if (!existsSync(weightsDir)) issues.push(`AE weights dir missing: ${weightsDir}`);
  if (!existsSync(addonPath))  issues.push(`LibTorch N-API addon missing: ${addonPath}`);
  return issues;
}

function checkSomPrereqs() {
  const latentIndex = resolve(ROOT, 'models', 'autoencoder', 'autoencoder_latent_index.json');
  if (!existsSync(latentIndex)) return [`latent index missing: ${latentIndex} — run stage 3 first`];
  return [];
}

// ── Runner ────────────────────────────────────────────────────────────────────

function log(msg)  { console.log(`[population-runner] ${msg}`); }
function warn(msg) { console.warn(`[population-runner] ⚠  ${msg}`); }
function ok(msg)   { console.log(`[population-runner] ✓  ${msg}`); }
function fail(msg) { console.error(`[population-runner] ✗  ${msg}`); }

function runStage(stage) {
  if (stage.type === 'node') {
    const args = [stage.script, ...stage.extraArgs(DRY_RUN)];
    log(`node ${args.join(' ')}`);
    return spawnStage('node', args, stage.cwd);
  } else if (stage.type === 'npm') {
    const script = stage.npmScript(DRY_RUN);
    log(`npm run ${script}`);
    return spawnStage('npm', ['run', ...script.split(' ')], stage.cwd);
  }
  throw new Error(`Unknown stage type: ${stage.type}`);
}

function spawnStage(cmd, args, cwd) {
  return new Promise((res) => {
    const proc = spawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    proc.on('close', (code) => res(code ?? 0));
    proc.on('error', (err)  => { fail(`spawn error: ${err.message}`); res(1); });
  });
}

async function main() {
  const banner = DRY_RUN ? ' (DRY RUN — no writes)' : '';
  log(`=== Atlas Population Runner${banner} ===`);
  log(`Stages ${fromStage}–${toStage}, skip=[${[...skipSet].join(',')}]`);
  if (onlySet) log(`Only stages: ${[...onlySet].join(',')}`);

  const selected = STAGES.filter(s => {
    if (s.skip) return false;
    if (onlySet && !onlySet.has(s.id)) return false;
    if (s.id < fromStage || s.id > toStage) return false;
    if (skipSet.has(s.id)) return false;
    return true;
  });

  if (selected.length === 0) {
    warn('No stages selected — check --from/--to/--stages/--skip arguments');
    process.exit(0);
  }

  log(`Running ${selected.length} stage(s): ${selected.map(s => `${s.id}:${s.name}`).join(' → ')}`);
  console.log();

  let failed = 0;

  for (const stage of selected) {
    const label = `Stage ${stage.id}: ${stage.name}`;
    log(`─── ${label} ─── ${stage.description}`);

    // Prerequisite check
    if (stage.prerequisiteCheck) {
      const issues = stage.prerequisiteCheck();
      if (issues.length > 0) {
        warn(`${label}: prerequisites not met:`);
        for (const issue of issues) warn(`  • ${issue}`);
        if (!DRY_RUN) {
          fail(`${label}: skipping due to prerequisite failures`);
          failed++;
          if (!CONTINUE_FAIL) break;
          continue;
        } else {
          warn(`${label}: --dry-run, continuing anyway`);
        }
      }
    }

    const t0   = Date.now();
    const code = await runStage(stage);
    const dt   = ((Date.now() - t0) / 1000).toFixed(1);

    if (code === 0) {
      ok(`${label} completed in ${dt}s`);
    } else {
      fail(`${label} exited with code ${code} (${dt}s)`);
      failed++;
      if (!CONTINUE_FAIL) {
        fail('Stopping pipeline. Use --continue-on-fail to ignore stage failures.');
        break;
      }
    }
    console.log();
  }

  if (failed === 0) {
    ok('All stages completed successfully.');
    process.exit(0);
  } else {
    fail(`${failed} stage(s) failed.`);
    process.exit(1);
  }
}

main().catch(err => {
  fail(`Unexpected error: ${err.message}`);
  process.exit(1);
});
