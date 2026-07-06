#!/usr/bin/env node

/**
 * Phase 1: Domain Class Backfill → 100%
 *
 * Purpose:
 *   Fill 21,021 missing domain_class values (64% → 100% coverage)
 *   Use feature_id taxonomy mapping to infer domain_class
 *
 * Strategy:
 *   1. Read all packets with NULL domain_class
 *   2. Extract feature_id prefix (auth, api, db, ui, etc.)
 *   3. Map prefix to canonical domain_class value
 *   4. UPDATE atlas_packets.domain_class
 *   5. Verify coverage ≥95%
 *
 * Feature ID Taxonomy:
 *   auth.* → Authentication
 *   db.* → Database
 *   api.* → API
 *   ui.* → UI
 *   util.* → Utility
 *   test.* → Test
 *   config.* → Configuration
 *   lib.* → Library
 *   worker.* → Worker
 *   cache.* → Cache
 *   queue.* → Queue
 *   graph.* → Graph
 *   search.* → Search
 *   ml.* → MachineLearning
 *   embedding.* → Embedding
 *   other → Other
 *
 * Usage:
 *   node scripts/atlas/phase1-domain-class-backfill.mjs [--dry-run] [--verbose]
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });

const { Pool } = pg;
const POSTGRES_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:password@127.0.0.1:5434/legal_ai_db';
const pgPool = new Pool({
  connectionString: POSTGRES_URL,
  statement_timeout: 30000,
  query_timeout: 30000,
  idle_in_transaction_session_timeout: 30000
});

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const BATCH_SIZE = 1000;

// Domain class taxonomy mapping (expanded for actual feature_id patterns)
const featureIdToDomainClass = {
  // Code semantics
  'auth': 'Authentication',
  'db': 'Database',
  'api': 'API',
  'ui': 'UI',
  'util': 'Utility',
  'test': 'Test',
  'config': 'Configuration',
  'lib': 'Library',
  'worker': 'Worker',
  'cache': 'Cache',
  'queue': 'Queue',
  'graph': 'Graph',
  'search': 'Search',
  'ml': 'MachineLearning',
  'embedding': 'Embedding',
  'rag': 'RAG',
  'qdrant': 'Search',
  'neo4j': 'Graph',
  'redis': 'Cache',
  'rabbitmq': 'Queue',

  // Repository/module names (from actual feature_ids in database)
  'neschrom97': 'Graph',                        // Agent/CHR97 system
  'sveltekit-frontend': 'UI',                   // Frontend codebase
  'llama-cpp-turboquant-gemma4': 'MachineLearning', // LLM inference
  'turbovec': 'MachineLearning',                // Vector processing
  'logs': 'Utility',                            // Logging
  'claude-mem': 'Library',                      // Claude memory system
  'memory': 'Library',                          // Memory module
  'storage': 'Database',                        // Storage module
  'packages': 'Library',                        // Packages
  'lawpdfs': 'Database',                        // PDF storage
  'minio-data': 'Database',                     // Object storage
  'proto': 'API',                               // Protocol buffers
  'scratch': 'Utility',                         // Scratch/temp
  'tmp': 'Utility',                             // Temp files
  'vscode-extension': 'UI',                     // IDE extension
  'archive': 'Utility',                         // Archive/storage
  'granite-docling-258M': 'MachineLearning',   // Document processing
  'tools': 'Utility',                           // Tools
  'ai': 'MachineLearning'                       // AI/ML
};

function inferDomainClass(featureId) {
  if (!featureId) return 'Other';

  // Extract first segment (handles both 'auth.sessions' and 'neschrom97/path/to/file')
  const normalized = featureId.toLowerCase().replace(/\\/g, '/');
  const firstSegment = normalized.split(/[\.\/\-]/)[0].trim();

  if (featureIdToDomainClass[firstSegment]) {
    return featureIdToDomainClass[firstSegment];
  }

  // Fallback: heuristic based on keywords in the full feature_id
  if (normalized.includes('auth')) return 'Authentication';
  if (normalized.includes('db') || normalized.includes('postgres') || normalized.includes('drizzle')) return 'Database';
  if (normalized.includes('api') || normalized.includes('route') || normalized.includes('endpoint')) return 'API';
  if (normalized.includes('component') || normalized.includes('svelte') || normalized.includes('button')) return 'UI';
  if (normalized.includes('test') || normalized.includes('spec')) return 'Test';
  if (normalized.includes('embedding') || normalized.includes('vector') || normalized.includes('qdrant')) return 'Embedding';
  if (normalized.includes('llm') || normalized.includes('model') || normalized.includes('gemma') || normalized.includes('inference')) return 'MachineLearning';
  if (normalized.includes('cache') || normalized.includes('redis')) return 'Cache';
  if (normalized.includes('queue') || normalized.includes('rabbitmq')) return 'Queue';
  if (normalized.includes('graph') || normalized.includes('neo4j')) return 'Graph';
  if (normalized.includes('search') || normalized.includes('retrieval')) return 'Search';

  return 'Other';
}

async function getMissingDomainClassCount() {
  try {
    const result = await pgPool.query(
      `SELECT COUNT(*) as missing FROM atlas_packets WHERE domain_class IS NULL OR domain_class = ''`
    );
    return parseInt(result.rows[0].missing);
  } catch (err) {
    console.error(`❌ Error querying missing count: ${err.message}`);
    return 0;
  }
}

async function backfillDomainClass() {
  const missingBefore = await getMissingDomainClassCount();

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 1: Domain Class Backfill → 100%                        ║');
  console.log('║  Fill missing domain_class from feature_id taxonomy           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`📊 Current state:\n`);
  console.log(`  Missing domain_class: ${missingBefore} rows`);
  console.log(`  Coverage: ${((58365 - missingBefore) / 58365 * 100).toFixed(1)}%\n`);

  if (missingBefore === 0) {
    console.log('✅ No missing values — already complete!\n');
    return { updated: 0, failed: 0 };
  }

  console.log(`🔄 Backfill Strategy: Process in batches of ${BATCH_SIZE}\n`);

  let totalUpdated = 0;
  let totalFailed = 0;
  let batchNum = 1;

  while (true) {
    try {
      // Fetch batch of missing rows
      const result = await pgPool.query(
        `SELECT packet_key, feature_id FROM atlas_packets
         WHERE domain_class IS NULL OR domain_class = ''
         ORDER BY packet_key
         LIMIT $1`,
        [BATCH_SIZE]
      );

      if (result.rows.length === 0) break;

      console.log(`📦 Batch ${batchNum}: ${result.rows.length} packets`);

      // Prepare updates
      const updates = result.rows.map(row => ({
        packet_key: row.packet_key,
        inferred_class: inferDomainClass(row.feature_id)
      }));

      if (DRY_RUN) {
        // Preview (dry-run)
        console.log(`  [DRY] Would update ${updates.length} packets`);
        if (VERBOSE) {
          updates.slice(0, 3).forEach(u => {
            console.log(`        ${u.packet_key} → ${u.inferred_class}`);
          });
          if (updates.length > 3) console.log(`        ... and ${updates.length - 3} more`);
        }
        totalUpdated += updates.length;
      } else {
        // Apply updates
        for (const update of updates) {
          try {
            await pgPool.query(
              `UPDATE atlas_packets SET domain_class = $1, updated_at = NOW() WHERE packet_key = $2`,
              [update.inferred_class, update.packet_key]
            );
            totalUpdated++;
          } catch (err) {
            console.error(`  ❌ Failed ${update.packet_key}: ${err.message}`);
            totalFailed++;
          }
        }
      }

      console.log(`  Updated: ${totalUpdated}, Failed: ${totalFailed}\n`);

      if (result.rows.length < BATCH_SIZE) break;
      batchNum++;

    } catch (err) {
      console.error(`❌ Batch error: ${err.message}`);
      totalFailed++;
      break;
    }
  }

  return { updated: totalUpdated, failed: totalFailed };
}

async function validateDomainClassCoverage() {
  console.log('🔍 Validating domain_class coverage...\n');

  try {
    const result = await pgPool.query(
      `SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN domain_class IS NOT NULL AND domain_class != '' THEN 1 END) as complete,
        COUNT(DISTINCT domain_class) as unique_classes
       FROM atlas_packets`
    );

    const { total, complete, unique_classes } = result.rows[0];
    const percentage = (complete / total * 100).toFixed(1);

    console.log('📊 Coverage Report:\n');
    console.log(`  Total packets: ${total}`);
    console.log(`  domain_class populated: ${complete} (${percentage}%)`);
    console.log(`  Missing: ${total - complete}`);
    console.log(`  Unique classes: ${unique_classes}\n`);

    const pass = percentage >= 95;
    console.log(`  Acceptance Gate (≥95%): ${pass ? '✅ PASS' : '❌ FAIL'}\n`);

    return pass;
  } catch (err) {
    console.error(`❌ Error validating: ${err.message}`);
    return false;
  }
}

async function main() {
  try {
    const { updated, failed } = await backfillDomainClass();

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  SUMMARY                                                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (DRY_RUN) {
      console.log(`⚠️  DRY-RUN MODE: No changes committed\n`);
      console.log(`  Would update: ${updated} packets`);
      console.log(`  Would fail: ${failed} packets\n`);
      console.log('  To apply changes, run without --dry-run\n');
    } else {
      console.log(`✅ Updated: ${updated} packets`);
      console.log(`❌ Failed: ${failed} packets\n`);
    }

    const passedValidation = await validateDomainClassCoverage();

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  ACCEPTANCE GATE                                               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (passedValidation) {
      console.log('✅ Phase 1 COMPLETE: domain_class coverage ≥95%\n');
      console.log('🎯 Unblocks: Phase 2 (LangExtract), Phase 3 (SOM), Phase 4 (Louvain)\n');
      process.exit(0);
    } else {
      console.log('⚠️  Phase 1 PARTIAL: domain_class coverage still <95%\n');
      console.log('📝 Next: Re-run with broader feature_id analysis\n');
      process.exit(1);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (VERBOSE) console.error(err.stack);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

main();
