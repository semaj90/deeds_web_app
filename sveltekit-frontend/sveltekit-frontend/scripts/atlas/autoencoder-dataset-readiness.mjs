#!/usr/bin/env node

/**
 * Autoencoder Dataset Readiness + QLoRA Adapter Training Export
 *
 * Prepares canonical packets for AE training pipeline (768→384→64)
 * and exports QLoRA adapter dataset
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

config({ path: resolve('.', '.env') });

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);
const pgPool = new pg.Pool({ connectionString: POSTGRES_URL });

const ANALYZE = process.argv.includes('--analyze');
const PREPARE = process.argv.includes('--prepare');
const DRY_RUN = process.argv.includes('--dry-run') || (!PREPARE);
const LIMIT = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '58365');
const DESTINATION = process.argv.find(arg => arg.startsWith('--destination='))?.split('=')[1] || resolve('.', 'scripts', 'atlas', 'export');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Autoencoder Dataset Readiness + QLoRA Export                 ║');
console.log('║  Prepare training data for 768→384→64 AE + adapter tuning      ║');
console.log(`║  Mode: ${DRY_RUN ? 'ANALYZE'.padEnd(54) : 'PREPARE'.padEnd(54)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function analyzeDataset() {
  console.log('📊 Coverage Analysis\n');

  const stats = {};

  // Check canonical identity coverage
  const identityRes = await pgPool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END) as has_packet_key,
      COUNT(CASE WHEN feature_id IS NOT NULL THEN 1 END) as has_feature_id,
      COUNT(CASE WHEN domain_class IS NOT NULL THEN 1 END) as has_domain_class,
      COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) as has_tree_node,
      COUNT(CASE WHEN concept_ids IS NOT NULL AND array_length(concept_ids, 1) > 0 THEN 1 END) as has_concepts
    FROM atlas_packets
  `);
  stats.identity = identityRes.rows[0];

  // Check topology coverage
  const topologyRes = await pgPool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN som_row IS NOT NULL THEN 1 END) as has_som,
      COUNT(CASE WHEN page_rank_score IS NOT NULL THEN 1 END) as has_pagerank,
      COUNT(CASE WHEN community_id IS NOT NULL THEN 1 END) as has_community
    FROM atlas_packets
  `);
  stats.topology = topologyRes.rows[0];

  // Check feature coverage
  const featuresRes = await pgPool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN ast_symbols IS NOT NULL AND array_length(ast_symbols, 1) > 0 THEN 1 END) as has_ast,
      COUNT(CASE WHEN lexical_features IS NOT NULL AND array_length(lexical_features, 1) > 0 THEN 1 END) as has_lexical,
      COUNT(CASE WHEN entities IS NOT NULL AND array_length(entities, 1) > 0 THEN 1 END) as has_entities
    FROM atlas_packet_features
  `);
  stats.features = featuresRes.rows[0];

  // Check embedding coverage
  const embeddingRes = await pgPool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN content_embedding IS NOT NULL THEN 1 END) as has_embedding
    FROM codebase_chunk_index
  `);
  stats.embeddings = embeddingRes.rows[0];

  console.log('Identity Coverage:');
  Object.entries(stats.identity).forEach(([key, val]) => {
    if (key !== 'total') {
      const pct = ((val / stats.identity.total) * 100).toFixed(1);
      console.log(`  ${key}: ${val} (${pct}%)`);
    }
  });

  console.log('\nTopology Coverage:');
  Object.entries(stats.topology).forEach(([key, val]) => {
    if (key !== 'total') {
      const pct = ((val / stats.topology.total) * 100).toFixed(1);
      console.log(`  ${key}: ${val} (${pct}%)`);
    }
  });

  console.log('\nFeature Coverage:');
  Object.entries(stats.features).forEach(([key, val]) => {
    if (key !== 'total') {
      const pct = stats.features.total > 0 ? ((val / stats.features.total) * 100).toFixed(1) : '0.0';
      console.log(`  ${key}: ${val} (${pct}%)`);
    }
  });

  console.log('\nEmbedding Coverage:');
  Object.entries(stats.embeddings).forEach(([key, val]) => {
    if (key !== 'total') {
      const pct = ((val / stats.embeddings.total) * 100).toFixed(1);
      console.log(`  ${key}: ${val} (${pct}%)`);
    }
  });

  const featureCoverage = stats.features.has_ast || 0;
  const topologyCoverage = stats.topology.has_som || 0;
  const embeddingCoverage = stats.embeddings.has_embedding || 0;

  console.log(`\n✅ Ready for AE training if:
  - Feature coverage ≥ 80% (current: ${((featureCoverage / stats.features.total) * 100).toFixed(1)}%)
  - Topology coverage ≥ 50% (current: ${((topologyCoverage / stats.topology.total) * 100).toFixed(1)}%)
  - Embedding coverage ≥ 70% (current: ${((embeddingCoverage / stats.embeddings.total) * 100).toFixed(1)}%)
`);

  return stats;
}

async function prepareDataset() {
  console.log('💾 Prepare QLoRA Dataset\n');

  mkdirSync(DESTINATION, { recursive: true });

  const query = `
    SELECT
      ap.packet_key,
      ap.feature_id,
      ap.domain_class,
      ap.concept_ids,
      ap.som_row,
      ap.som_col,
      ap.page_rank_score,
      ap.community_id,
      cci.content_embedding,
      apf.ast_symbols,
      apf.lexical_features,
      apf.entities,
      apf.used_concepts
    FROM atlas_packets ap
    LEFT JOIN codebase_chunk_index cci ON ap.source_ref = cci.source_ref
    LEFT JOIN atlas_packet_features apf ON ap.packet_key = apf.packet_key
    WHERE cci.content_embedding IS NOT NULL
    ORDER BY ap.packet_key
    LIMIT $1
  `;

  const result = await pgPool.query(query, [LIMIT]);
  const rows = result.rows;

  console.log(`Fetched ${rows.length} training samples\n`);

  const outputFile = resolve(DESTINATION, `qlora-dataset-${Date.now()}.ndjson`);
  let serialized = 0;

  for (const row of rows) {
    const embedding = row.content_embedding ? row.content_embedding.split(',').map(Number) : null;

    if (!embedding || embedding.length !== 384) continue;

    const trainingRecord = {
      packet_key: row.packet_key,
      feature_id: row.feature_id,
      domain_class: row.domain_class,
      embedding_384: embedding,
      topology: {
        som_row: row.som_row || null,
        som_col: row.som_col || null,
        pagerank: row.page_rank_score || null,
      },
      features: {
        ast_symbols: row.ast_symbols || [],
        lexical: row.lexical_features || [],
        entities: row.entities || [],
      },
      valid: true,
    };

    appendFileSync(outputFile, JSON.stringify(trainingRecord) + '\n');
    serialized++;
  }

  console.log(`✅ Serialized ${serialized} records to ${outputFile}\n`);
  console.log('✅ QLoRA dataset ready for AE training!');
}

async function main() {
  try {
    if (ANALYZE || DRY_RUN) {
      await analyzeDataset();
    }
    if (PREPARE) {
      await prepareDataset();
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

main();
