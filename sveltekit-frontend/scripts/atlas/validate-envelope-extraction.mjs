#!/usr/bin/env node

/**
 * Card 1C: Envelope Extraction Validation
 *
 * Validates that all canonical identity fields are stable and complete
 * across atlas_packets, atlas_summary_layers, and related tables
 *
 * Checks:
 *   1. packet_key: 100% non-null, unique
 *   2. source_ref: 100% non-null (file path anchor)
 *   3. feature_id: 100% non-null (semantic domain)
 *   4. title_id: 100% non-null (semantic label)
 *   5. domain_class: 100% non-null (classification)
 *   6. tree_node_id: ≥95% non-null (Neo4j topology link)
 *   7. used_concepts: ≥80% non-null (semantic enrichment)
 *   8. qdrant_point_id: ≥95% non-null (vector DB link)
 *
 * Usage:
 *   node scripts/atlas/validate-envelope-extraction.mjs [--verbose]
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });

const { Pool } = pg;
const POSTGRES_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:password@127.0.0.1:5434/legal_ai_db';
const pgPool = new Pool({ connectionString: POSTGRES_URL });

const VERBOSE = process.argv.includes('--verbose');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Card 1C: Envelope Extraction Validation                      ║');
console.log('║  Verify canonical identity fields are stable and complete    ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const GATES = {
  packet_key: { min: 100, description: 'Packet identity (primary key)' },
  source_ref: { min: 100, description: 'Source file reference' },
  feature_id: { min: 100, description: 'Semantic feature domain' },
  title_id: { min: 100, description: 'Semantic title label' },
  domain_class: { min: 100, description: 'Classification domain' },
  tree_node_id: { min: 95, description: 'Neo4j topology link' },
  used_concepts: { min: 80, description: 'Semantic concept enrichment' },
  qdrant_point_id: { min: 95, description: 'Vector DB point link' }
};

async function validateField(fieldName, gate) {
  const result = await pgPool.query(`
    SELECT COUNT(*) total,
           COUNT(CASE WHEN "${fieldName}" IS NOT NULL THEN 1 END) populated
    FROM atlas_packets
  `);

  const { total, populated } = result.rows[0];
  const percentage = total > 0 ? (populated / total) * 100 : 0;
  const pass = percentage >= gate.min;

  return {
    fieldName,
    total: parseInt(total),
    populated: parseInt(populated),
    missing: parseInt(total) - parseInt(populated),
    percentage: percentage.toFixed(2),
    gate: gate.min,
    pass,
    description: gate.description
  };
}

async function validateAllFields() {
  console.log('🔍 VALIDATION GATES\n');

  const results = [];
  for (const [fieldName, gate] of Object.entries(GATES)) {
    try {
      const result = await validateField(fieldName, gate);
      results.push(result);

      const status = result.pass ? '✅' : '❌';
      console.log(`${status} ${result.fieldName.padEnd(18)} ${result.percentage}% (${result.populated}/${result.total})`);
      console.log(`   Expected: ≥${result.gate}% | ${result.description}`);
      if (!result.pass) {
        console.log(`   Missing: ${result.missing} rows`);
      }
      console.log();
    } catch (err) {
      console.error(`❌ Error validating ${fieldName}: ${err.message}\n`);
      results.push({
        fieldName,
        pass: false,
        error: err.message
      });
    }
  }

  return results;
}

async function validateUniqueness() {
  console.log('🔍 UNIQUENESS CHECKS\n');

  const result = await pgPool.query(`
    SELECT
      COUNT(*) total,
      COUNT(DISTINCT packet_key) unique_keys,
      COUNT(DISTINCT source_ref) unique_sources
    FROM atlas_packets
  `);

  const { total, unique_keys, unique_sources } = result.rows[0];
  const keysUnique = unique_keys == total;
  const sourcesAllPresent = unique_sources > 0;

  console.log(`  packet_key uniqueness: ${unique_keys}/${total} ${keysUnique ? '✅' : '❌'}`);
  console.log(`  source_ref diversity: ${unique_sources} unique sources ${sourcesAllPresent ? '✅' : '❌'}\n`);

  return keysUnique && sourcesAllPresent;
}

async function validateCrossTable() {
  console.log('🔍 CROSS-TABLE CONSISTENCY\n');

  const columnRes = await pgPool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'atlas_summary_layers'
  `);
  const columns = new Set(columnRes.rows.map((row) => row.column_name));
  const checks = [];

  if (columns.has('tree_node_id')) {
    const summaryRes = await pgPool.query(`
      SELECT
        COUNT(*) total,
        COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) tree_node_synced
      FROM atlas_summary_layers
    `);
    const summary = summaryRes.rows[0];
    const pct = summary.total > 0 ? (summary.tree_node_synced / summary.total) * 100 : 0;
    const pass = pct >= 95;
    console.log(`  atlas_summary_layers.tree_node_id: ${pct.toFixed(2)}% ${pass ? '✅' : '❌'}`);
    checks.push(pass);
  } else {
    console.log('  atlas_summary_layers.tree_node_id: skipped (column not present)');
  }

  if (columns.has('used_concepts')) {
    const summaryRes = await pgPool.query(`
      SELECT
        COUNT(*) total,
        COUNT(CASE WHEN used_concepts IS NOT NULL THEN 1 END) concepts_synced
      FROM atlas_summary_layers
    `);
    const summary = summaryRes.rows[0];
    const pct = summary.total > 0 ? (summary.concepts_synced / summary.total) * 100 : 0;
    const pass = pct >= 80;
    console.log(`  atlas_summary_layers.used_concepts: ${pct.toFixed(2)}% ${pass ? '✅' : '❌'}\n`);
    checks.push(pass);
  } else {
    console.log('  atlas_summary_layers.used_concepts: skipped (column not present)\n');
  }

  return checks.length === 0 ? true : checks.every(Boolean);
}

async function validateSummaryEmbeddingMirror() {
  console.log('🔍 SUMMARY EMBEDDING MIRROR\n');

  const summaryEmbeddingRes = await pgPool.query(`
    SELECT
      COUNT(*) total,
      COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) summary_embedding_rows
    FROM atlas_summary_layers
  `);

  const packetEmbeddingRes = await pgPool.query(`
    SELECT
      COUNT(*) total,
      COUNT(CASE WHEN metadata->'feature_envelope'->'summary_embedding' IS NOT NULL THEN 1 END) packet_envelope_embedding_rows
    FROM atlas_packets
  `);

  const summaryEmbedding = summaryEmbeddingRes.rows[0];
  const packetEmbedding = packetEmbeddingRes.rows[0];
  const summaryPct = summaryEmbedding.total > 0 ? (summaryEmbedding.summary_embedding_rows / summaryEmbedding.total) * 100 : 0;
  const packetPct = packetEmbedding.total > 0 ? (packetEmbedding.packet_envelope_embedding_rows / packetEmbedding.total) * 100 : 0;

  console.log(`  atlas_summary_layers.embedding: ${summaryPct.toFixed(2)}% (${summaryEmbedding.summary_embedding_rows}/${summaryEmbedding.total})`);
  console.log(`  atlas_packets.metadata.feature_envelope.summary_embedding: ${packetPct.toFixed(2)}% (${packetEmbedding.packet_envelope_embedding_rows}/${packetEmbedding.total})\n`);

  return true;
}

async function main() {
  try {
    // 1. Validate all canonical fields
    const fieldResults = await validateAllFields();
    const fieldPass = fieldResults.every(r => r.pass);

    // 2. Validate uniqueness
    const uniquePass = await validateUniqueness();

    // 3. Validate cross-table consistency
    const crossTablePass = await validateCrossTable();

    // 4. Report summary embedding mirror coverage
    const summaryEmbeddingPass = await validateSummaryEmbeddingMirror();

    // 5. Summary
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  SUMMARY                                                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const allPass = fieldPass && uniquePass && crossTablePass && summaryEmbeddingPass;

    if (allPass) {
      console.log('✅ CARD 1 COMPLETE: Envelope Extraction Validated\n');
      console.log('📋 All canonical identity fields are stable and complete:\n');
      console.log('  ✅ packet_key: 100% (primary identity)');
      console.log('  ✅ source_ref: 100% (file anchor)');
      console.log('  ✅ feature_id: 100% (semantic domain)');
      console.log('  ✅ title_id: 100% (semantic label)');
      console.log('  ✅ domain_class: 100% (classification)');
      console.log('  ✅ tree_node_id: ≥95% (Neo4j link)');
      console.log('  ✅ used_concepts: ≥80% (enrichment)');
      console.log('  ✅ qdrant_point_id: ≥95% (vector link)\n');
      console.log('🎯 Ready for Card 2: Qdrant Bridge\n');
      process.exit(0);
    } else {
      console.log('⚠️  CARD 1 PARTIAL: Some fields need attention\n');
      fieldResults.filter(r => !r.pass).forEach(r => {
        console.log(`  ❌ ${r.fieldName}: ${r.percentage}% (need ≥${r.gate}%)`);
      });
      console.log();
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
