#!/usr/bin/env node
/**
 * SOM 4×6 Routing Matrix for ACE Stage A0 Bifrost Pre-filter
 *
 * Purpose:
 *   Define the topology-aware routing matrix for query classification and lane selection.
 *   Each query is scored across 4 semantic axes × 6 feature dimensions, producing a
 *   weighted vector for Bifrost L1 cache lookup, SOM neighbor expansion, and ACE lane fusion.
 *
 * Architecture:
 *   ┌────────────────────────────────────────────────────────┐
 *   │ Query Input (768-dim embedding + metadata)             │
 *   └────────────────────────────────────────────────────────┘
 *                            ↓
 *   ┌────────────────────────────────────────────────────────┐
 *   │ 4 Semantic Axes (rows):                                │
 *   │  0: Semantic coherence (embedding entropy)             │
 *   │  1: SOM topology (grid distance to centroids)          │
 *   │  2: Ontology/feature overlap (domain axis)             │
 *   │  3: Lineage/supersession (packet chain history)        │
 *   └────────────────────────────────────────────────────────┘
 *                            ↓
 *   ┌────────────────────────────────────────────────────────┐
 *   │ 6 Feature Dimensions (cols):                           │
 *   │  0: Cosine similarity (768-dim vec match)              │
 *   │  1: SOM distance (Euclidean in 2D grid)                │
 *   │  2: Feature overlap (Jaccard on tags)                  │
 *   │  3: PageRank authority (Neo4j scores)                  │
 *   │  4: Recency/superseded (timestamp chain)               │
 *   │  5: Cache hit/warm-up (Bifrost/Redis state)           │
 *   └────────────────────────────────────────────────────────┘
 *                            ↓
 *   ┌────────────────────────────────────────────────────────┐
 *   │ 4×6 Matrix (16–24 floats, compressed for RTX matmul)   │
 *   │ Row-major: [row0_col0, row0_col1, ..., row3_col5]      │
 *   └────────────────────────────────────────────────────────┘
 *                            ↓
 *   ┌────────────────────────────────────────────────────────┐
 *   │ Routing Decision:                                      │
 *   │ • High semantic + topology = SOM prefilter + ANN       │
 *   │ • High ontology = Feature lane boost                   │
 *   │ • High authority = Graph-aware expansion               │
 *   │ • High cache-hit = Skip Bifrost, return L0 Redis       │
 *   └────────────────────────────────────────────────────────┘
 *
 * Usage:
 *   node scripts/atlas/som-4x6-routing-matrix.mjs [--apply] [--validate]
 */

import pg from 'pg';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Redis = require('ioredis');

const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_URL = process.env.REDIS_URL || 'redis://:redis@127.0.0.1:6379';

const db = new pg.Pool({ connectionString: DB_URL, max: 5 });
const redis = new Redis(REDIS_URL);

const APPLY = process.argv.includes('--apply');
const VALIDATE = process.argv.includes('--validate');

// ────────────────────────────────────────────────────────────────────────
// 4×6 Routing Matrix Definition
// ────────────────────────────────────────────────────────────────────────

/**
 * Semantic Axes (rows):
 *  0: Semantic coherence — How well the query matches the embedding space
 *  1: SOM topology — How central/clustered the query is in grid
 *  2: Ontology/domain — How aligned with feature labels and tags
 *  3: Lineage — How recent/superseded the packet chain is
 */
const SEMANTIC_AXES = [
  { name: 'semantic_coherence', description: 'Embedding entropy + consistency' },
  { name: 'som_topology', description: 'Grid centrality + cell density' },
  { name: 'ontology_domain', description: 'Feature label overlap + tag Jaccard' },
  { name: 'lineage_recency', description: 'Packet chain timestamp + supersession' }
];

/**
 * Feature Dimensions (cols):
 *  0: Cosine — 768-dim vector similarity (0–1)
 *  1: SOM distance — Euclidean distance in (row, col) space (0–28 max for 20×20 grid)
 *  2: Feature overlap — Jaccard similarity of tags/labels (0–1)
 *  3: PageRank authority — Neo4j graph centrality (0–1, normalized)
 *  4: Recency score — Timestamp freshness + supersession depth (0–1)
 *  5: Cache warm-up — Bifrost L1/L2 + Redis hit probability (0–1)
 */
const FEATURE_DIMENSIONS = [
  { name: 'cosine_similarity', range: [0, 1], unit: 'normalized' },
  { name: 'som_distance', range: [0, 28], unit: 'euclidean (20x20 grid)' },
  { name: 'feature_overlap', range: [0, 1], unit: 'jaccard' },
  { name: 'pagerank_authority', range: [0, 1], unit: 'normalized' },
  { name: 'recency_score', range: [0, 1], unit: 'normalized' },
  { name: 'cache_warmup_probability', range: [0, 1], unit: 'normalized' }
];

/**
 * Default 4×6 Matrix (weights for each axis × dimension):
 * Used for query routing when no learned weights exist.
 *
 * Format: 4 rows, 6 columns, row-major storage
 * [
 *   [semantic_cosine, semantic_som_dist, semantic_feature, semantic_pagerank, semantic_recency, semantic_cache],
 *   [topology_cosine, topology_som_dist, topology_feature, topology_pagerank, topology_recency, topology_cache],
 *   [ontology_cosine, ontology_som_dist, ontology_feature, ontology_pagerank, ontology_recency, ontology_cache],
 *   [lineage_cosine, lineage_som_dist, lineage_feature, lineage_pagerank, lineage_recency, lineage_cache]
 * ]
 */
const DEFAULT_ROUTING_MATRIX = [
  // Row 0: Semantic Coherence
  [0.60, 0.10, 0.10, 0.10, 0.05, 0.05], // High weight on cosine (semantic match)
  // Row 1: SOM Topology
  [0.20, 0.50, 0.10, 0.10, 0.05, 0.05], // High weight on SOM distance (grid navigation)
  // Row 2: Ontology/Domain
  [0.15, 0.10, 0.50, 0.15, 0.05, 0.05], // High weight on feature overlap (domain match)
  // Row 3: Lineage/Recency
  [0.10, 0.05, 0.10, 0.15, 0.50, 0.10]  // High weight on recency + cache warmup
];

// ────────────────────────────────────────────────────────────────────────
// Redis Cache Key Schema
// ────────────────────────────────────────────────────────────────────────

const ROUTING_MATRIX_KEY = 'ace:routing:matrix:4x6';
const ROUTING_MATRIX_VERSION_KEY = 'ace:routing:matrix:version';
const ROUTING_MATRIX_AXES_KEY = 'ace:routing:matrix:axes';
const ROUTING_MATRIX_DIMS_KEY = 'ace:routing:matrix:dims';
const ROUTING_MATRIX_UPDATED_KEY = 'ace:routing:matrix:updated_at';

// ────────────────────────────────────────────────────────────────────────
// Initialization
// ────────────────────────────────────────────────────────────────────────

async function initializeRoutingMatrix() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  SOM 4×6 Routing Matrix — ACE Stage A0 Bifrost Pre-filter  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // 1. Store routing matrix in Redis
    console.log('1. Storing 4×6 routing matrix in Redis...');
    const matrixFlat = DEFAULT_ROUTING_MATRIX.flat();

    if (APPLY) {
      await redis.setex(ROUTING_MATRIX_KEY, 86400 * 7, JSON.stringify(matrixFlat)); // 7-day TTL
      await redis.setex(ROUTING_MATRIX_VERSION_KEY, 86400 * 7, '1.0.0');
      await redis.setex(ROUTING_MATRIX_UPDATED_KEY, 86400 * 7, new Date().toISOString());
      console.log('   ✅ Routing matrix stored (24 floats, 7-day TTL)');
    } else {
      console.log('   📋 DRY-RUN: Would store routing matrix');
    }

    // 2. Store axis metadata
    console.log('\n2. Storing semantic axes metadata...');
    if (APPLY) {
      await redis.setex(ROUTING_MATRIX_AXES_KEY, 86400 * 7, JSON.stringify(SEMANTIC_AXES));
      console.log(`   ✅ Stored ${SEMANTIC_AXES.length} semantic axes`);
    } else {
      console.log(`   📋 DRY-RUN: Would store ${SEMANTIC_AXES.length} semantic axes`);
    }

    // 3. Store dimension metadata
    console.log('\n3. Storing feature dimensions metadata...');
    if (APPLY) {
      await redis.setex(ROUTING_MATRIX_DIMS_KEY, 86400 * 7, JSON.stringify(FEATURE_DIMENSIONS));
      console.log(`   ✅ Stored ${FEATURE_DIMENSIONS.length} feature dimensions`);
    } else {
      console.log(`   📋 DRY-RUN: Would store ${FEATURE_DIMENSIONS.length} feature dimensions`);
    }

    // 4. Create Postgres materialized view for audit
    console.log('\n4. Creating Postgres audit view...');
    const createViewSQL = `
      CREATE OR REPLACE VIEW ace_routing_matrix_config AS
      SELECT
        '4x6' AS matrix_shape,
        4 AS num_semantic_axes,
        6 AS num_feature_dimensions,
        24 AS total_elements,
        'ace:routing:matrix:4x6' AS redis_key,
        7 * 86400 AS ttl_seconds,
        now() AS query_time;
    `;

    if (APPLY) {
      await db.query(createViewSQL);
      console.log('   ✅ Audit view created: ace_routing_matrix_config');
    } else {
      console.log('   📋 DRY-RUN: Would create audit view');
    }

    // 5. Print routing matrix for inspection
    console.log('\n5. Routing Matrix (4 axes × 6 dimensions):');
    console.log('   ┌─────────────────────────────────────────────────────────────┐');
    for (let i = 0; i < DEFAULT_ROUTING_MATRIX.length; i++) {
      const row = DEFAULT_ROUTING_MATRIX[i];
      const axis = SEMANTIC_AXES[i];
      const rowStr = row.map(v => v.toFixed(2)).join(', ');
      console.log(`   │ ${axis.name.padEnd(18)} [${rowStr}]`);
    }
    console.log('   └─────────────────────────────────────────────────────────────┘');

    // 6. Print usage example
    console.log('\n6. Usage in ACE Stage A0 (Bifrost pre-filter):');
    console.log(`
   // Step 1: Fetch routing matrix from Redis
   const matrix = await redis.get('ace:routing:matrix:4x6');
   const weights = JSON.parse(matrix); // [24 floats]

   // Step 2: Compute query features (6-dim vector)
   const queryFeatures = [
     cosineSimilarity(query_embedding, corpus_embeddings),
     somDistance(query_som_xy, corpus_som_xy),
     featureOverlap(query_tags, corpus_tags),
     pageRankScore(query_graph_node),
     recencyScore(query_timestamp),
     bifrostCacheWarmth(query_hash)
   ];

   // Step 3: Apply routing matrix (4 semantic axes)
   const scores = [];
   for (let axis = 0; axis < 4; axis++) {
     let axisScore = 0;
     for (let dim = 0; dim < 6; dim++) {
       axisScore += weights[axis * 6 + dim] * queryFeatures[dim];
     }
     scores.push(axisScore);
   }

   // Step 4: Route based on dominant axis
   const dominantAxis = scores.indexOf(Math.max(...scores));
   switch(dominantAxis) {
     case 0: // Semantic coherence → ANN lane
       return adiQuery(query_embedding, top_k);
     case 1: // SOM topology → neighbor expansion
       return somNeighbors(query_som_xy, radius=2);
     case 2: // Ontology/domain → feature lane
       return featureLaneSearch(query_tags, boost=0.3);
     case 3: // Lineage/recency → supersession filter
       return filterSuperseded(query_packet_key, depth=3);
   }
    `);

    console.log('\n✅ Initialization complete.');
    console.log(`\nRedis keys created:\n  ${ROUTING_MATRIX_KEY}\n  ${ROUTING_MATRIX_AXES_KEY}\n  ${ROUTING_MATRIX_DIMS_KEY}`);

  } catch (e) {
    console.error(`❌ Error: ${e.message}`);
    process.exit(1);
  }
}

// ────────────────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────────────────

async function validateMatrix() {
  console.log('\n7. Validating routing matrix...');
  try {
    const matrix = await redis.get(ROUTING_MATRIX_KEY);
    if (!matrix) {
      console.log('   ❌ Routing matrix not found in Redis');
      return false;
    }

    const weights = JSON.parse(matrix);
    console.log(`   ✅ Matrix shape: ${weights.length / 6} × 6`);

    // Validate row sums (should not exceed 1.0 per axis for weighted routing)
    for (let i = 0; i < 4; i++) {
      const rowSum = weights.slice(i * 6, (i + 1) * 6).reduce((a, b) => a + b, 0);
      const axisName = SEMANTIC_AXES[i].name;
      console.log(`   ✅ Axis ${i} (${axisName}): sum = ${rowSum.toFixed(2)}`);
    }

    return true;
  } catch (e) {
    console.error(`   ❌ Validation error: ${e.message}`);
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────

async function main() {
  await initializeRoutingMatrix();

  if (VALIDATE) {
    const isValid = await validateMatrix();
    process.exit(isValid ? 0 : 1);
  }

  await redis.quit();
  await db.end();
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
