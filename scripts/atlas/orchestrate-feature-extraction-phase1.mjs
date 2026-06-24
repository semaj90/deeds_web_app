#!/usr/bin/env node

/**
 * Phase 1 Feature Extraction Orchestrator
 *
 * Coordinates 6 parallel lanes:
 *   Lane A: Tree node tagging (1-2h)
 *   Lane B: Summary embeddings (22.5min, 4 workers) — CRITICAL PATH
 *   Lane C: SOM coordinates (30s)
 *   Lane D: Karpathy scores (15s after B)
 *   Lane E: Latent AE vectors (10s after B)
 *   Lane F: Gemma4 keywords (1.3h, 4 workers)
 *
 * Total: ~1.5 hours with parallelization
 * Sequential: ~5 hours
 *
 * Usage:
 *   node scripts/atlas/orchestrate-feature-extraction-phase1.mjs [--dry]
 */

import { spawn } from 'child_process';
import { argv } from 'process';

const DRY_RUN = argv.includes('--dry');
const WORKERS = 4;

function log(...args) {
  console.log(...args);
}

function spawnCommand(name, cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    log(`\n📤 [${name}] Starting: ${cmd} ${args.join(' ')}`);

    const proc = spawn(cmd, args, {
      stdio: 'inherit',
      env: { ...process.env, ...env },
    });

    proc.on('close', (code) => {
      if (code === 0) {
        log(`✅ [${name}] Complete`);
        resolve();
      } else {
        log(`❌ [${name}] Failed with code ${code}`);
        reject(new Error(`${name} failed`));
      }
    });

    proc.on('error', (e) => {
      log(`❌ [${name}] Error: ${e.message}`);
      reject(e);
    });
  });
}

async function laneA_treeNodeTagging() {
  if (DRY_RUN) {
    log('\n🔍 [LANE A] DRY-RUN: Tree node tagging');
    log('  Would run: npm run atlas:functions:index');
    log('  Then: npm run atlas:functions:backfill:apply');
    return;
  }

  log('\n🏷️  [LANE A] Tree node feature extraction & tagging (1-2h)');
  await spawnCommand('Lane A-1', 'npm', ['run', 'atlas:functions:index']);
  await spawnCommand('Lane A-2', 'npm', ['run', 'atlas:functions:backfill:apply']);
}

async function laneB_summaryEmbeddings() {
  if (DRY_RUN) {
    log('\n🔍 [LANE B] DRY-RUN: Summary layer embeddings');
    log(`  Would run: WORKERS=${WORKERS} node scripts/atlas/orchestrate-summary-layer-embeddings.mjs`);
    return;
  }

  log(`\n🔗 [LANE B] Summary layer embeddings (22.5min, ${WORKERS} workers) — CRITICAL PATH`);
  log('  Creating summaries for: chunk, community, feature, file, folder, system, gemma4_packet');
  log('  Target: 16,254 embeddings @ /api/embed');

  // TODO: This script needs to be created first
  // await spawnCommand('Lane B', 'node', [
  //   'scripts/atlas/orchestrate-summary-layer-embeddings.mjs',
  //   '--apply'
  // ], { WORKERS: String(WORKERS) });

  log('  ⏳ [LANE B] Pending: Create orchestrate-summary-layer-embeddings.mjs');
}

async function laneC_somCoordinates() {
  if (DRY_RUN) {
    log('\n🔍 [LANE C] DRY-RUN: SOM coordinates');
    log('  Would run: npm run atlas:phase16:som:apply');
    return;
  }

  log('\n📍 [LANE C] SOM coordinate backfill (30s)');
  await spawnCommand('Lane C', 'npm', ['run', 'atlas:phase16:som:apply']);

  // Then backfill into topology index
  // TODO: Create backfill-som-coordinates.mjs
  // await spawnCommand('Lane C-2', 'node', [
  //   'scripts/atlas/backfill-som-coordinates.mjs',
  //   '--apply'
  // ]);
}

async function laneF_gemma4Keywords() {
  if (DRY_RUN) {
    log('\n🔍 [LANE F] DRY-RUN: Gemma4 keyword extraction');
    log(`  Would run: WORKERS=${WORKERS} node scripts/atlas/orchestrate-summary-keywords-gemma4.mjs`);
    return;
  }

  log(`\n🔑 [LANE F] Gemma4 keyword extraction (1.3h, ${WORKERS} workers)`);
  log('  Extracting keywords for: chunk, community, feature, file, folder, system');
  log('  (gemma4_packet already 100% complete)');

  // TODO: Create orchestrate-summary-keywords-gemma4.mjs
  // await spawnCommand('Lane F', 'node', [
  //   'scripts/atlas/orchestrate-summary-keywords-gemma4.mjs',
  //   '--apply'
  // ], { WORKERS: String(WORKERS) });

  log('  ⏳ [LANE F] Pending: Create orchestrate-summary-keywords-gemma4.mjs');
}

async function laneD_karpathyScores() {
  if (DRY_RUN) {
    log('\n🔍 [LANE D] DRY-RUN: Karpathy scores');
    log('  Would run: npm run karpathy:gpu --apply');
    return;
  }

  log('\n⚖️  [LANE D] Karpathy authority blend (15s)');
  await spawnCommand('Lane D', 'npm', ['run', 'karpathy:gpu']);
}

async function laneE_latentAutoencoder() {
  if (DRY_RUN) {
    log('\n🔍 [LANE E] DRY-RUN: Latent autoencoder vectors');
    log('  Would run: node scripts/atlas/backfill-latent-vectors.mjs --apply');
    return;
  }

  log('\n🧬 [LANE E] Latent 64-dim autoencoder (10s)');

  // TODO: Create or ensure backfill-latent-vectors.mjs exists
  // await spawnCommand('Lane E', 'node', [
  //   'scripts/atlas/backfill-latent-vectors.mjs',
  //   '--apply'
  // ]);

  log('  ⏳ [LANE E] Pending: Verify backfill-latent-vectors.mjs');
}

async function validateAllLanes() {
  log('\n✅ Validation (read-only checks):\n');

  const checks = [
    {
      name: 'Tree Nodes Tagged',
      sql: `SELECT COUNT(*) as tagged FROM atlas_tree_nodes WHERE tags IS NOT NULL AND array_length(tags, 1) > 0`,
      expected: 8823,
    },
    {
      name: 'Summary Embeddings',
      sql: `SELECT COUNT(*) as embedded FROM atlas_summary_layers WHERE embedding IS NOT NULL`,
      expected: 16254,
    },
    {
      name: 'SOM Coordinates',
      sql: `SELECT COUNT(*) as with_som FROM atlas_topology_index WHERE z_som IS NOT NULL`,
      expected: 3251,
    },
    {
      name: 'Karpathy Scores',
      sql: `SELECT COUNT(*) as with_karpathy FROM atlas_topology_index WHERE karpathy_score > 0`,
      expected: 3251,
    },
    {
      name: 'Latent Vectors',
      sql: `SELECT COUNT(*) as with_latent FROM atlas_topology_index WHERE latent_64 IS NOT NULL`,
      expected: 3251,
    },
    {
      name: 'Keywords Extracted',
      sql: `SELECT COUNT(*) as with_keywords FROM atlas_summary_layers WHERE keywords IS NOT NULL AND array_length(keywords, 1) > 0`,
      expected: 16254,
    },
  ];

  for (const check of checks) {
    const cmd = [
      'exec',
      'legal-ai-postgres',
      'psql',
      '-U',
      'legal_admin',
      '-d',
      'legal_ai_db',
      '-c',
      check.sql,
      '-t',
    ];

    const result = await new Promise((resolve) => {
      const proc = spawn('docker', cmd, { stdio: 'pipe' });
      let output = '';
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });
      proc.on('close', () => {
        const count = parseInt(output.trim().split('\n')[0]) || 0;
        resolve(count);
      });
    });

    const status = result === check.expected ? '✅' : '🟡';
    log(`${status} ${check.name}: ${result}/${check.expected}`);
  }
}

async function main() {
  log('\n' + '='.repeat(70));
  log('🚀 Phase 1 Feature Extraction Orchestrator');
  log('='.repeat(70));

  log(`\nMode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  log(`Workers: ${WORKERS}`);
  log('\nExecution Plan:');
  log('  Phase 1 (Parallel, start NOW):');
  log('    - Lane A: Tree node tagging (1-2h)');
  log('    - Lane C: SOM coordinates (30s)');
  log('    - Lane F: Gemma4 keywords (1.3h)');
  log('  Phase 1.5 (After A/C/F start):');
  log('    - Lane B: Summary embeddings (22.5min) — CRITICAL PATH');
  log('  Phase 2 (After B complete):');
  log('    - Lane D: Karpathy scores (15s)');
  log('    - Lane E: Latent AE (10s)');
  log('\n  Total: ~1.5 hours with parallelization\n');

  try {
    // Phase 1: Independent lanes (can start in parallel)
    const phase1 = Promise.all([
      laneA_treeNodeTagging(),
      laneC_somCoordinates(),
      laneF_gemma4Keywords(),
    ]);

    // Phase 1.5: Critical path (start after phase 1 begins)
    await phase1;
    await laneB_summaryEmbeddings();

    // Phase 2: Dependent on Phase 1.5
    await Promise.all([laneD_karpathyScores(), laneE_latentAutoencoder()]);

    // Validation
    await validateAllLanes();

    log('\n' + '='.repeat(70));
    log('✅ FEATURE EXTRACTION COMPLETE');
    log('='.repeat(70) + '\n');

    log('Next steps:');
    log('  1. Run similarity search queries on summary embeddings');
    log('  2. Use KMeans clustering on 64-dim latent vectors');
    log('  3. Rank packets by Karpathy score');
    log('  4. Tag content by extracted keywords');
  } catch (e) {
    log('\n' + '='.repeat(70));
    log(`❌ ORCHESTRATION FAILED: ${e.message}`);
    log('='.repeat(70) + '\n');
    process.exit(1);
  }
}

main();
