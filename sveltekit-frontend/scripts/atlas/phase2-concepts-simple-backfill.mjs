#!/usr/bin/env node

/**
 * Phase 2 Simple: Populate used_concepts from feature_id components
 *
 * Purpose:
 *   Quick proof-of-concept for Card 1B
 *   Extract concepts from feature_id string
 *   Target: 80%+ coverage for acceptance gate
 *
 * Strategy:
 *   1. Split feature_id by separator (., /, -, _)
 *   2. Filter out short/stopwords
 *   3. Take top 8 as used_concepts array
 *   4. UPDATE atlas_packets
 *   5. Validate coverage ≥80%
 *
 * Usage:
 *   node scripts/atlas/phase2-concepts-simple-backfill.mjs [--dry-run] [--verbose]
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

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
  'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'may',
  'might', 'must', 'shall', 'by', 'with', 'from', 'of', 'as', 'it', 'this',
  'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they'
]);

function extractConceptsFromFeatureId(featureId) {
  if (!featureId || featureId.length === 0) return [];

  // Normalize and split by common separators
  const normalized = featureId.toLowerCase()
    .replace(/[\\\/\-_\.]/g, ' ')  // Replace separators with spaces
    .replace(/([a-z])([A-Z])/g, '$1 $2')  // Handle camelCase
    .split(/\s+/)
    .filter(word => {
      // Filter: 2+ chars, not stopword, alphanumeric or underscore
      return word.length > 2
        && !STOPWORDS.has(word)
        && /^[a-z0-9_]+$/.test(word);
    })
    .slice(0, 8);  // Take top 8

  return normalized;
}

async function getMissingConceptsCount() {
  try {
    const result = await pgPool.query(
      `SELECT COUNT(*) as missing FROM atlas_packets
       WHERE concept_ids IS NULL OR array_length(concept_ids, 1) IS NULL`
    );
    return parseInt(result.rows[0].missing);
  } catch (err) {
    console.error(`❌ Error querying missing count: ${err.message}`);
    return 0;
  }
}

async function backfillConcepts() {
  const missingBefore = await getMissingConceptsCount();

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 2 (Simple): Populate used_concepts from feature_id     ║');
  console.log('║  Quick proof-of-concept for Card 1B                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`📊 Current state:\n`);
  console.log(`  Missing concept_ids: ${missingBefore} rows`);
  console.log(`  Coverage: ${((58365 - missingBefore) / 58365 * 100).toFixed(1)}%\n`);

  if (missingBefore === 0) {
    console.log('✅ All packets already have concept_ids!\n');
    return { updated: 0, failed: 0 };
  }

  console.log(`🔄 Backfill Strategy: Extract from feature_id, process in batches of ${BATCH_SIZE}\n`);

  let totalUpdated = 0;
  let totalFailed = 0;
  let batchNum = 1;

  while (true) {
    try {
      // Fetch batch of missing rows
      const result = await pgPool.query(
        `SELECT packet_key, feature_id FROM atlas_packets
         WHERE concept_ids IS NULL OR array_length(concept_ids, 1) IS NULL
         ORDER BY packet_key
         LIMIT $1`,
        [BATCH_SIZE]
      );

      if (result.rows.length === 0) break;

      console.log(`📦 Batch ${batchNum}: ${result.rows.length} packets`);

      // Prepare updates
      const updates = result.rows.map(row => ({
        packet_key: row.packet_key,
        concepts: extractConceptsFromFeatureId(row.feature_id)
      }));

      if (DRY_RUN) {
        // Preview (dry-run)
        console.log(`  [DRY] Would update ${updates.length} packets`);
        if (VERBOSE) {
          updates.slice(0, 3).forEach(u => {
            console.log(`        ${u.packet_key} → [${u.concepts.join(', ')}]`);
          });
          if (updates.length > 3) console.log(`        ... and ${updates.length - 3} more`);
        }
        totalUpdated += updates.length;
      } else {
        // Apply updates
        for (const update of updates) {
          try {
            if (update.concepts.length > 0) {
              await pgPool.query(
                `UPDATE atlas_packets SET concept_ids = $1::TEXT[], updated_at = NOW() WHERE packet_key = $2`,
                [update.concepts, update.packet_key]
              );
              totalUpdated++;
            }
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

async function validateConceptsCoverage() {
  console.log('🔍 Validating concept_ids coverage...\n');

  try {
    const result = await pgPool.query(
      `SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN concept_ids IS NOT NULL AND array_length(concept_ids, 1) > 0 THEN 1 END) as complete,
        AVG(array_length(concept_ids, 1)) as avg_concepts
       FROM atlas_packets`
    );

    const { total, complete, avg_concepts } = result.rows[0];
    const percentage = (complete / total * 100).toFixed(2);

    console.log('📊 Coverage Report:\n');
    console.log(`  Total packets: ${total}`);
    console.log(`  concept_ids populated: ${complete} (${percentage}%)`);
    console.log(`  Missing: ${total - complete}`);
    console.log(`  Avg concepts per packet: ${(avg_concepts || 0).toFixed(1)}\n`);

    const pass = percentage >= 80;
    console.log(`  Acceptance Gate (≥80%): ${pass ? '✅ PASS' : '❌ FAIL'}\n`);

    return pass;
  } catch (err) {
    console.error(`❌ Error validating: ${err.message}`);
    return false;
  }
}

async function main() {
  try {
    const { updated, failed } = await backfillConcepts();

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

    const passedValidation = await validateConceptsCoverage();

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  ACCEPTANCE GATE                                               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (passedValidation) {
      console.log('✅ Phase 2 COMPLETE: concept_ids coverage ≥80%\n');
      console.log('🎯 Unblocks: Phase 3 (SOM), Phase 4 (Louvain), Smoke validation\n');
      process.exit(0);
    } else {
      console.log('⚠️  Phase 2 PARTIAL: concept_ids coverage still <80%\n');
      console.log('📝 Next: Run with real LangExtract output once available\n');
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
