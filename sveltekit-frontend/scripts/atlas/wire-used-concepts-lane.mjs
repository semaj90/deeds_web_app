#!/usr/bin/env node

/**
 * Card 1B: Wire used_concepts Lane → 80%+
 *
 * Purpose:
 *   Populate atlas_packets.used_concepts from lexical extraction output
 *   Currently 0.1% populated (60/58,365), target 80%+ (46,692+)
 *
 * Strategy:
 *   1. Read lexical extraction results (keywords, ngrams, trigrams, engrams)
 *   2. Extract high-confidence terms as used_concepts
 *   3. Populate atlas_packets.used_concepts (TEXT array)
 *   4. Create GIN index for fast filtering
 *   5. Validate coverage: used_concepts NOT NULL in 80%+ rows
 *
 * Sources:
 *   - lexical_features table (if populated by lexical-feature-extraction.mjs)
 *   - keywords, ngrams from packet summaries (fallback)
 *
 * Usage:
 *   node scripts/atlas/wire-used-concepts-lane.mjs [--dry-run] [--verbose]
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });

const { Pool } = pg;
const POSTGRES_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:password@127.0.0.1:5434/legal_ai_db';
const pgPool = new Pool({ connectionString: POSTGRES_URL });

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const BATCH_SIZE = 500;

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Card 1B: Wire used_concepts Lane → 80%+                      ║');
console.log('║  Populate semantic concepts from lexical extraction           ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function getUsedConceptsCoverage() {
  const result = await pgPool.query(`
    SELECT COUNT(*) total,
           COUNT(CASE WHEN used_concepts IS NOT NULL AND array_length(used_concepts, 1) > 0 THEN 1 END) populated,
           COUNT(CASE WHEN used_concepts IS NULL OR array_length(used_concepts, 1) = 0 THEN 1 END) missing
    FROM atlas_packets
  `);

  const { total, populated, missing } = result.rows[0];
  return {
    total: parseInt(total),
    populated: parseInt(populated),
    missing: parseInt(missing)
  };
}

async function extractConceptsFromLexical(packetKey) {
  /**
   * Extract high-confidence concepts from lexical features
   *
   * Priority order:
   * 1. Entities (e.g., 'ConnectivityError', 'db.pool')
   * 2. Nouns + adjectives from summary
   * 3. Keywords + engrams
   * 4. Fallback: bigrams from summary
   */

  try {
    // Try to read from lexical_features table first
    const lexRes = await pgPool.query(`
      SELECT keywords, ngrams, trigrams, engrams, entities
      FROM lexical_features
      WHERE packet_key = $1
      LIMIT 1
    `, [packetKey]);

    if (lexRes.rows.length > 0) {
      const lex = lexRes.rows[0];
      const concepts = new Set();

      // Add keywords (high confidence)
      if (Array.isArray(lex.keywords)) {
        lex.keywords.slice(0, 10).forEach(k => concepts.add(k));
      }

      // Add engrams (domain-specific terms)
      if (Array.isArray(lex.engrams)) {
        lex.engrams.slice(0, 5).forEach(e => concepts.add(e));
      }

      // Add high-quality ngrams
      if (Array.isArray(lex.ngrams)) {
        lex.ngrams.slice(0, 5).forEach(n => concepts.add(n));
      }

      return Array.from(concepts);
    }

    // Fallback: extract from summary + feature_id
    const fallbackRes = await pgPool.query(`
      SELECT COALESCE(feature_id, '') feature_id,
             COALESCE(summary, '') summary
      FROM atlas_packets
      WHERE packet_key = $1
      LIMIT 1
    `, [packetKey]);

    if (fallbackRes.rows.length > 0) {
      const { feature_id, summary } = fallbackRes.rows[0];
      const concepts = [];

      // Add feature_id components
      if (feature_id) {
        feature_id.split('.').forEach(part => {
          if (part.length > 2) concepts.push(part);
        });
      }

      // Extract keywords from summary (simple heuristic)
      if (summary && summary.length > 0) {
        const words = summary
          .toLowerCase()
          .split(/\W+/)
          .filter(w => w.length > 3 && !['the', 'this', 'that', 'from', 'with'].includes(w))
          .slice(0, 10);
        concepts.push(...words);
      }

      return [...new Set(concepts)];
    }

    return [];
  } catch (err) {
    if (VERBOSE) console.log(`    ⚠️  Error extracting concepts for ${packetKey}: ${err.message}`);
    return [];
  }
}

async function wireUsedConcepts(packets) {
  if (packets.length === 0) {
    console.log('✅ No packets need used_concepts backfill\n');
    return { updated: 0, failed: 0 };
  }

  let updated = 0;
  let failed = 0;

  console.log(`📝 Extracting used_concepts for ${packets.length} packets...\n`);

  for (const packet of packets) {
    try {
      const concepts = await extractConceptsFromLexical(packet.packet_key);

      if (concepts.length === 0) {
        if (VERBOSE) {
          console.log(`  [SKIP] ${packet.packet_key} (no concepts found)`);
        }
        continue;
      }

      if (DRY_RUN) {
        if (VERBOSE) {
          console.log(`  [DRY] ${packet.packet_key} → used_concepts: [${concepts.slice(0, 3).join(', ')}...]`);
        }
      } else {
        await pgPool.query(`
          UPDATE atlas_packets
          SET used_concepts = $1::TEXT[], updated_at = NOW()
          WHERE packet_key = $2
        `, [concepts, packet.packet_key]);
      }

      updated++;
    } catch (err) {
      console.error(`  ❌ Failed to wire ${packet.packet_key}: ${err.message}`);
      failed++;
    }
  }

  return { updated, failed };
}

async function createGINIndex() {
  /**
   * Create GIN index for used_concepts to enable fast filtering
   * Example: WHERE used_concepts @> ARRAY['ConnectivityError']
   */

  if (DRY_RUN) {
    console.log('\n  [DRY] Would create GIN index on atlas_packets.used_concepts');
    return;
  }

  try {
    console.log('\n  Creating GIN index on used_concepts...');
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS idx_packets_used_concepts_gin
      ON atlas_packets USING GIN (used_concepts)
    `);
    console.log('  ✅ GIN index created\n');
  } catch (err) {
    console.log(`  ⚠️  GIN index creation warning: ${err.message}\n`);
  }
}

async function validateUsedConceptsCoverage() {
  console.log('🔍 Validating used_concepts coverage...\n');

  const result = await pgPool.query(`
    SELECT COUNT(*) total,
           COUNT(CASE WHEN used_concepts IS NOT NULL AND array_length(used_concepts, 1) > 0 THEN 1 END) populated,
           AVG(array_length(used_concepts, 1)) avg_concepts_per_packet
    FROM atlas_packets
  `);

  const metrics = result.rows[0];
  const percentage = (metrics.populated / metrics.total * 100).toFixed(2);

  console.log('📊 Coverage Report:\n');
  console.log(`  Total packets: ${metrics.total}`);
  console.log(`  used_concepts populated: ${metrics.populated} (${percentage}%)`);
  console.log(`  Missing: ${metrics.total - metrics.populated}`);
  console.log(`  Avg concepts per packet: ${(metrics.avg_concepts_per_packet || 0).toFixed(1)}\n`);

  const pass = percentage >= 80;
  console.log(`  Acceptance Gate (≥80%): ${pass ? '✅ PASS' : '❌ FAIL'}\n`);

  return pass;
}

async function fetchPacketsNeedingConcepts() {
  const result = await pgPool.query(`
    SELECT packet_key
    FROM atlas_packets
    WHERE used_concepts IS NULL OR array_length(used_concepts, 1) = 0
    ORDER BY packet_key
    LIMIT $1
  `, [BATCH_SIZE]);

  return result.rows.map(r => ({ packet_key: r.packet_key }));
}

async function main() {
  try {
    // 1. Check current state
    console.log('📊 Current state:\n');
    const before = await getUsedConceptsCoverage();
    console.log(`  Total packets: ${before.total}`);
    console.log(`  used_concepts populated: ${before.populated} (${(before.populated / before.total * 100).toFixed(2)}%)`);
    console.log(`  Missing: ${before.missing}\n`);

    // 2. Wire concepts in batches
    console.log(`🔄 Backfill Strategy: Process in batches of ${BATCH_SIZE}\n`);

    let totalUpdated = 0;
    let totalFailed = 0;
    let batchNum = 1;

    while (true) {
      const packets = await fetchPacketsNeedingConcepts();

      if (packets.length === 0) break;

      console.log(`\n📦 Batch ${batchNum}: ${packets.length} packets`);
      const { updated, failed } = await wireUsedConcepts(packets);

      totalUpdated += updated;
      totalFailed += failed;

      console.log(`  Wired: ${updated}, Failed: ${failed}`);

      if (packets.length < BATCH_SIZE) break;
      batchNum++;
    }

    // 3. Create GIN index
    await createGINIndex();

    // 4. Report results
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  SUMMARY                                                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (DRY_RUN) {
      console.log(`⚠️  DRY-RUN MODE: No changes committed\n`);
      console.log(`  Would wire: ${totalUpdated} packets`);
      console.log(`  Would fail: ${totalFailed} packets\n`);
      console.log('  To apply changes, run without --dry-run\n');
    } else {
      console.log(`✅ Wired: ${totalUpdated} packets`);
      console.log(`❌ Failed: ${totalFailed} packets\n`);
    }

    // 5. Validate coverage
    const passedValidation = await validateUsedConceptsCoverage();

    // 6. Final status
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  ACCEPTANCE GATE                                               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (passedValidation) {
      console.log('✅ Card 1B COMPLETE: used_concepts coverage ≥80%\n');
      console.log('🎯 Unblocks: HMM Gate 2 (feature coverage 0%→15%+)\n');
      process.exit(0);
    } else {
      console.log('⚠️  Card 1B PARTIAL: used_concepts coverage still <80%\n');
      console.log('📝 Next: Run lexical-feature-extraction.mjs for full coverage\n');
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
