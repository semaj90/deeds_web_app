#!/usr/bin/env node

/**
 * Autoencoder Dataset Readiness + QLoRA Adapter Training Export
 *
 * Prepares canonical packets for AE training pipeline (768→384→64)
 * and exports QLoRA adapter dataset with:
 *   - Input embeddings (384-dim from EmbeddingGemma)
 *   - Domain/ontology labels (from domain_class + feature_id)
 *   - Topology coordinates (from SOM + KMeans + PageRank)
 *   - Canonical feature vectors (from ast_symbols + lexical_features + entities)
 *
 * NOT for training:
 *   - qdrant_point_id (retrieval bridge only)
 *   - packet_key (identity, not feature)
 *   - mmap offsets (runtime cache, not data)
 *
 * Output:
 *   - .ndjson files (one JSON object per line for streaming)
 *   - .parquet for arrow compatibility
 *   - metadata.json with schema + coverage stats
 *
 * Usage:
 *   node scripts/atlas/autoencoder-dataset-readiness.mjs --dry-run --analyze
 *   node scripts/atlas/autoencoder-dataset-readiness.mjs --prepare --limit=10000 --format=ndjson
 *   node scripts/atlas/autoencoder-dataset-readiness.mjs --export --format=parquet --destination=/path/to/export
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
const EXPORT = process.argv.includes('--export');
const DRY_RUN = process.argv.includes('--dry-run') || (!PREPARE && !EXPORT);
const LIMIT = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '58365');
const FORMAT = process.argv.find(arg => arg.startsWith('--format='))?.split('=')[1] || 'ndjson';
const DESTINATION = process.argv.find(arg => arg.startsWith('--destination='))?.split('=')[1] || resolve('.', 'scripts', 'atlas', 'export');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Autoencoder Dataset Readiness + QLoRA Export                 ║');
console.log('║  Prepare training data for 768→384→64 AE + adapter tuning      ║');
console.log(`║  Mode: ${DRY_RUN ? 'ANALYZE'.padEnd(54) : (PREPARE ? 'PREPARE' : 'EXPORT').padEnd(54)}║`);
console.log(`║  Limit: ${LIMIT.toString().padEnd(58)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function analyzeDataset() {
  console.log('📊 Step 1: Coverage Analysis\n');

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
      COUNT(CASE WHEN community_id IS NOT NULL THEN 1 END) as has_community,
      COUNT(CASE WHEN k_core IS NOT NULL THEN 1 END) as has_kcore
    FROM atlas_packets
  `);
  stats.topology = topologyRes.rows[0];

  // Check feature coverage
  const featuresRes = await pgPool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN ast_symbols IS NOT NULL AND array_length(ast_symbols, 1) > 0 THEN 1 END) as has_ast,
      COUNT(CASE WHEN lexical_features IS NOT NULL AND array_length(lexical_features, 1) > 0 THEN 1 END) as has_lexical,
      COUNT(CASE WHEN entities IS NOT NULL AND array_length(entities, 1) > 0 THEN 1 END) as has_entities,
      COUNT(CASE WHEN used_concepts IS NOT NULL AND array_length(used_concepts, 1) > 0 THEN 1 END) as has_used_concepts
    FROM atlas_packet_features
  `);
  stats.features = featuresRes.rows[0];

  // Check embedding coverage
  const embeddingRes = await pgPool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN content_embedding IS NOT NULL THEN 1 END) as has_embedding,
      COUNT(CASE WHEN LENGTH(summary) > 10 THEN 1 END) as has_summary
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
  console.log();

  console.log('Topology Coverage:');
  Object.entries(stats.topology).forEach(([key, val]) => {
    if (key !== 'total') {
      const pct = ((val / stats.topology.total) * 100).toFixed(1);
      console.log(`  ${key}: ${val} (${pct}%)`);
    }
  });
  console.log();

  console.log('Feature Coverage:');
  Object.entries(stats.features).forEach(([key, val]) => {
    if (key !== 'total') {
      const pct = stats.features.total > 0 ? ((val / stats.features.total) * 100).toFixed(1) : '0.0';
      console.log(`  ${key}: ${val} (${pct}%)`);
    }
  });
  console.log();

  console.log('Embedding Coverage:');
  Object.entries(stats.embeddings).forEach(([key, val]) => {
    if (key !== 'total') {
      const pct = ((val / stats.embeddings.total) * 100).toFixed(1);
      console.log(`  ${key}: ${val} (${pct}%)`);
    }
  });
  console.log();

  console.log('Recommendation for training dataset:\n');
  const featureCoverage = stats.features.has_ast || 0;
  const topologyCoverage = stats.topology.has_som || 0;
  const embeddingCoverage = stats.embeddings.has_embedding || 0;

  console.log(`✅ Ready for AE training if:
  - Feature coverage ≥ 80% (current: ${((featureCoverage / stats.features.total) * 100).toFixed(1)}%)
  - Topology coverage ≥ 50% (current: ${((topologyCoverage / stats.topology.total) * 100).toFixed(1)}%)
  - Embedding coverage ≥ 70% (current: ${((embeddingCoverage / stats.embeddings.total) * 100).toFixed(1)}%)
`);

  return stats;
}

async function prepareDataset() {
  console.log('💾 Step 1: Fetch training vectors\n');

  mkdirSync(DESTINATION, { recursive: true });

  const query = `
    SELECT
      ap.packet_key,
      ap.feature_id,
      ap.domain_class,
      ap.tree_node_id,
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

  console.log('📝 Step 2: Serialize to NDJSON\n');

  const outputFile = resolve(DESTINATION, `qlora-dataset-${FORMAT}-${Date.now()}.ndjson`);
  let serialized = 0;

  for (const row of rows) {
    // Embedding as array (384-dim)
    const embedding = row.content_embedding ? row.content_embedding.split(',').map(Number) : null;

    if (!embedding || embedding.length !== 384) {
      console.log(`⚠️  Skipping ${row.packet_key}: invalid embedding`);
      continue;
    }

    const trainingRecord = {
      // Identity (not training features, but for tracking)
      packet_key: row.packet_key,
      feature_id: row.feature_id,

      // Labels (target outputs for supervised AE)
      domain_class: row.domain_class,
      canonical_concepts: row.concept_ids || [],
      used_concepts: row.used_concepts || [],

      // Input: 384-dim embedding (from EmbeddingGemma)
      embedding_384: embedding,
      embedding_dim: 384,

      // Topology (auxiliary labels for clustering)
      topology: {
        som_row: row.som_row || null,
        som_col: row.som_col || null,
        pagerank: row.page_rank_score || null,
        community: row.community_id || null,
      },

      // Feature vector (for auxiliary loss if training multi-task AE)
      features: {
        ast_symbols: row.ast_symbols || [],
        lexical: row.lexical_features || [],
        entities: row.entities || [],
      },

      // Metadata
      has_topology: (row.som_row !== null && row.som_col !== null),
      has_features: !!(row.ast_symbols || row.lexical_features || row.entities),
      valid: true,
    };

    const line = JSON.stringify(trainingRecord);
    appendFileSync(outputFile, line + '\n');
    serialized++;
  }

  console.log(`✅ Serialized ${serialized} training records to ${outputFile}\n`);

  // Write metadata
  const metadataFile = resolve(DESTINATION, 'qlora-dataset-metadata.json');
  const metadata = {
    version: 1,
    created_at: new Date().toISOString(),
    format: FORMAT,
    total_records: serialized,
    embedding_dim: 384,
    schema: {
      packet_key: 'string (identity, not feature)',
      feature_id: 'string (grouping, not feature)',
      embedding_384: 'number[384] (input)',
      domain_class: 'string (label)',
      canonical_concepts: 'string[] (label)',
      used_concepts: 'string[] (label)',
      topology: {
        som_row: 'uint8|null',
        som_col: 'uint8|null',
        pagerank: 'float32|null',
        community: 'int32|null',
      },
      features: {
        ast_symbols: 'string[]',
        lexical: 'string[]',
        entities: 'string[]',
      },
      has_topology: 'boolean',
      has_features: 'boolean',
      valid: 'boolean (always true)',
    },
    usage: {
      autoencoder_training: 'Input: embedding_384 → Target: compressed latent vectors',
      supervised_labels: 'domain_class, canonical_concepts, used_concepts',
      auxiliary_loss: 'topology coordinates (optional for regularization)',
      filtering: 'Select has_topology=true for cleaner training',
    },
    NOT_for_training: [
      'packet_key (use feature_id for grouping)',
      'qdrant_point_id (retrieval bridge only)',
      'mmap offsets (runtime cache)',
    ],
  };

  writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
  console.log(`✅ Metadata: ${metadataFile}\n`);

  console.log('✅ QLoRA dataset ready for AE training pipeline!');
}

async function main() {
  try {
    if (ANALYZE || DRY_RUN) {
      await analyzeDataset();
    }
    if (PREPARE) {
      await prepareDataset();
    }
    if (EXPORT) {
      console.log('Export format: ${FORMAT}');
      console.log('Destination: ${DESTINATION}');
      console.log('(Parquet export requires arrow/parquet library)');
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (process.argv.includes('--verbose')) console.error(err.stack);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

main();
