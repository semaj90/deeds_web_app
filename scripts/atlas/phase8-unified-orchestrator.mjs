#!/usr/bin/env node
/**
 * Phase 8: Unified Orchestrator
 *
 * Executes the complete Phase 8 pipeline using canonical packet_key identity:
 *
 *   Phase 7 (complete) → Summaries in Postgres
 *           ↓
 *   Step 1: Autoencoder backfill (768 → 64 latent vectors)
 *           ↓
 *   Step 2: SOM training (20×20 grid, BMU assignment)
 *           ↓
 *   Step 3: Create Neo4j SIMILAR_TOPOLOGY edges (Moore neighborhood)
 *           ↓
 *   Step 4: Neo4j GDS PageRank (centrality scoring)
 *           ↓
 *   Step 5: Compute SOM centroids (per-cluster embeddings)
 *           ↓
 *   Step 6: K-Means clustering on latent-64 (find top clusters)
 *           ↓
 *   Step 7: Qdrant payload enrichment (tags + metadata)
 *           ↓
 *   Step 8: BitFrost cache warming (5-layer hierarchy)
 *
 * Canonical Identity Contract:
 *   packet_key = sha256(source_ref | line_start | line_end | content_hash)
 *   All packet_keys verified consistent across Postgres, Qdrant, Redis, Neo4j
 *
 * Usage:
 *   node scripts/atlas/phase8-unified-orchestrator.mjs --dry-run
 *   node scripts/atlas/phase8-unified-orchestrator.mjs --audit (verify prerequisites)
 *   node scripts/atlas/phase8-unified-orchestrator.mjs --execute (run full pipeline)
 *   node scripts/atlas/phase8-unified-orchestrator.mjs --step=1 --apply (run only autoencoder)
 *   node scripts/atlas/phase8-unified-orchestrator.mjs --step=4 --apply (run only PageRank)
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import pg from 'pg';

const { Pool } = pg;

const APPLY = process.argv.includes('--apply') || process.argv.includes('--execute');
const AUDIT_ONLY = process.argv.includes('--audit');
const STEP_ARG = process.argv.find(a => a.startsWith('--step='));
const TARGET_STEP = STEP_ARG ? parseInt(STEP_ARG.split('=')[1], 10) : null;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pgPool = new Pool({ connectionString: DATABASE_URL });

const STEPS = [
  {
    id: 1,
    name: 'Autoencoder Backfill (768 → 64)',
    script: 'scripts/atlas/backfill-latent-vectors.mjs',
    args: APPLY ? ['--apply'] : ['--dry-run'],
    timeout: 3600000, // 1 hour
  },
  {
    id: 2,
    name: 'SOM Training (20×20 grid)',
    script: 'scripts/atlas/train-som-20x20.mjs',
    args: APPLY ? ['--apply'] : ['--dry-run'],
    timeout: 1800000, // 30 min
  },
  {
    id: 3,
    name: 'Create Neo4j SIMILAR_TOPOLOGY Edges (Moore)',
    script: 'scripts/atlas/create-som-topology-edges.mjs',
    args: APPLY ? ['--apply'] : ['--dry-run'],
    timeout: 600000, // 10 min
  },
  {
    id: 4,
    name: 'Neo4j GDS PageRank (legacy materializer disabled)',
    disabledReason: 'Parent Atlas V2 requires a validated PostgreSQL snapshot and persisted NetworkX/GDS parity before authority promotion.',
  },
  {
    id: 5,
    name: 'Compute SOM Centroids (per-cluster)',
    script: 'scripts/atlas/compute-som-centroids.mjs',
    args: APPLY ? ['--apply'] : ['--dry-run'],
    timeout: 600000, // 10 min
  },
  {
    id: 6,
    name: 'K-Means Clustering (latent-64)',
    script: 'scripts/atlas/train-turbovec-kmeans.mjs',
    args: APPLY ? ['--apply'] : ['--dry-run'],
    timeout: 1200000, // 20 min
  },
  {
    id: 7,
    name: 'Qdrant Payload Enrichment (tags)',
    script: 'scripts/atlas/backfill-gds-som-topology.mjs',
    args: APPLY ? ['--apply'] : ['--dry-run'],
    timeout: 600000, // 10 min
  },
  {
    id: 8,
    name: 'BitFrost Cache Warming (5-layer)',
    script: 'scripts/atlas/phase8-bitfrost-multilayer-warm.mjs',
    args: APPLY ? ['--apply'] : [],
    timeout: 600000, // 10 min
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUDIT: Verify Phase 8 prerequisites
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function auditPrerequisites() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 8: Prerequisite Audit                                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // 1. Phase 7 completion
    const phase7Result = await pgPool.query(`
      SELECT COUNT(*) as total_chunks,
             COUNT(*) FILTER (WHERE summary IS NOT NULL AND LENGTH(summary) > 10) as summarized,
             ROUND(100.0 * COUNT(*) FILTER (WHERE summary IS NOT NULL AND LENGTH(summary) > 10) / COUNT(*), 1) as completion_percent
      FROM codebase_chunk_index
    `);
    const { total_chunks, summarized, completion_percent } = phase7Result.rows[0];
    console.log(`  ✅ Phase 7 (Summarization):`);
    console.log(`     ${summarized} / ${total_chunks} summaries (${completion_percent}%)\n`);

    // 2. Canonical packet_key consistency
    const pkResult = await pgPool.query(`
      SELECT COUNT(*) as total,
             COUNT(DISTINCT packet_key) as unique_keys,
             COUNT(CASE WHEN packet_key IS NULL THEN 1 END) as null_keys
      FROM atlas_packets
    `);
    const { total, unique_keys, null_keys } = pkResult.rows[0];
    console.log(`  ✅ Canonical packet_key (Postgres):`);
    console.log(`     ${total} packets, ${unique_keys} unique, ${null_keys} NULL\n`);

    // 3. Check Phase 8 target columns
    const columnsResult = await pgPool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'atlas_packets'
      AND column_name IN ('latent_64', 'som_row', 'som_col', 'page_rank_score', 'kmeans_cluster_id')
      ORDER BY column_name
    `);
    const existingColumns = columnsResult.rows.map(r => r.column_name);
    const phaseStatus = {
      latent_64: existingColumns.includes('latent_64') ? '✅' : '⏳',
      som_row: existingColumns.includes('som_row') ? '✅' : '⏳',
      som_col: existingColumns.includes('som_col') ? '✅' : '⏳',
      page_rank_score: existingColumns.includes('page_rank_score') ? '✅' : '⏳',
      kmeans_cluster_id: existingColumns.includes('kmeans_cluster_id') ? '✅' : '⏳',
    };
    console.log(`  📋 Phase 8 Column Status:`);
    for (const [col, status] of Object.entries(phaseStatus)) {
      console.log(`     ${status} ${col}`);
    }

    console.log();
    const readyToExecute = parseFloat(completion_percent) >= 90 && (null_keys === '0' || null_keys === 0);
    console.log(`  ${readyToExecute ? '✅' : '⏳'} Ready to execute Phase 8: ${readyToExecute ? 'YES' : 'Need ≥90% summaries'}\n`);

  } catch (err) {
    console.error(`❌ Audit error:`, err.message);
    process.exit(1);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXECUTION: Run Phase 8 steps in order
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function runScript(script, args, timeout) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [script, ...args], {
      stdio: 'inherit',
      timeout,
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Script timed out after ${timeout}ms`));
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function executePhase8() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log(`║  Phase 8: Unified Orchestrator (${APPLY ? 'APPLY' : 'DRY-RUN'})                    ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const stepsToRun = TARGET_STEP ? STEPS.filter(s => s.id === TARGET_STEP) : STEPS;

  for (const step of stepsToRun) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Step ${step.id}: ${step.name}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    if (step.disabledReason) {
      console.log(`⏸️  Step ${step.id} blocked: ${step.disabledReason}\n`);
      continue;
    }

    try {
      await runScript(step.script, step.args, step.timeout);
      console.log(`\n✅ Step ${step.id} complete\n`);
    } catch (err) {
      console.error(`\n❌ Step ${step.id} failed: ${err.message}\n`);
      if (APPLY) {
        console.log(`⚠️  Stopping Phase 8 execution due to error\n`);
        process.exit(1);
      } else {
        console.log(`ℹ️  Continuing (DRY-RUN mode)\n`);
      }
    }
  }

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 8: Complete                                             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function main() {
  if (AUDIT_ONLY) {
    await auditPrerequisites();
  } else {
    await auditPrerequisites();
    await executePhase8();
  }
  await pgPool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
