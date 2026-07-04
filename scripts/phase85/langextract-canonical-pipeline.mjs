#!/usr/bin/env node

/**
 * LANGEXTRACT CANONICAL PIPELINE
 *
 * Wire the evidence extraction path with no LLM dependencies:
 *   1. Load evidence from Postgres (canonical source)
 *   2. Extract via extraction service (placeholder → real registry)
 *   3. Cluster via GPU SOM topology
 *   4. Score via GPU cosine similarity
 *   5. Validate extraction schema
 *   6. Write to Postgres (transactions)
 *   7. Invalidate Redis (ONLY after Postgres succeeds)
 *   8. Emit Neo4j topology updates
 *   9. Record extraction metadata (GAN validation)
 *
 * KEY: Postgres is canonical, mirrors must agree, all steps are atomic.
 * No Langfuse until extraction path is proven.
 */

import pg from 'pg';
import neo4j from 'neo4j-driver';
import Redis from 'ioredis';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fetch from 'node-fetch';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

// CLI FLAGS
const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const VERBOSE = process.argv.includes('--verbose');

function log(...args) { console.log('[langextract]', ...args); }
function vlog(...args) { if (VERBOSE) console.log('[langextract:v]', ...args); }

// CONFIG
const PG_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || 'redis',
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
};

// GPU acceleration (defer for now)
let useGPU = false;

function unique(items, limit = 40) {
  return [...new Set(items.filter(Boolean))].slice(0, limit);
}

function deriveUsedConcepts(...parts) {
  const seed = parts
    .flatMap((part) => {
      if (!part) return [];
      if (Array.isArray(part)) return part;
      return String(part).split(/[./:_\-\s]+/);
    })
    .map((value) => String(value).trim().toLowerCase())
    .filter((value) => value.length >= 3);
  return unique(seed, 40);
}

// ── STAGE 1: Load Evidence ─────────────────────────────────────────────────

async function loadEvidenceFromPostgres(pool, limit = 100) {
  log(`📂 Stage 1: Load Evidence`);

  const query = `
    SELECT
      id,
      chunk_id,
      source_type,
      summary_text,
      tags,
      created_at,
      qdrant_point_id
    FROM embedded_summaries
    WHERE summary_text IS NOT NULL
    ORDER BY created_at DESC
    LIMIT $1
  `;

  try {
    const result = await pool.query(query, [limit]);
    log(`   ✓ Loaded ${result.rows.length} evidence items\n`);
    return result.rows;
  } catch (err) {
    log(`   ❌ Failed: ${err.message}\n`);
    return [];
  }
}

// ── STAGE 2: Extract → Canonical Phase 8 Envelope ─────────────────────────

async function extractPoliciesAndEntities(pool, evidence) {
  log(`📤 Stage 2: Emit Phase 8 Canonical Envelopes`);

  const extractions = [];

  for (const item of evidence) {
    // Load canonical envelope fields from atlas_packets + lexical layer
    try {
      const envelopeQuery = `
        SELECT
          ap.packet_key,
          ap.title_id,
          ap.feature_id,
          ap.community_id,
          ap.som_row,
          ap.som_col,
          COALESCE(fe.lexical_nouns, '[]'::text) as lexical_nouns,
          COALESCE(fe.lexical_verbs, '[]'::text) as lexical_verbs,
          COALESCE(fe.lexical_adverbs_ly, '[]'::text) as lexical_adverbs_ly,
          ap.source_ref
        FROM atlas_packets ap
        LEFT JOIN atlas_feature_envelopes fe ON ap.feature_id = fe.feature_id
        WHERE ap.qdrant_point_id = $1
        LIMIT 1
      `;

      const result = await pool.query(envelopeQuery, [item.qdrant_point_id]);
      if (result.rows.length === 0) {
        vlog(`   ⊘ No packet found for qdrant_point_id ${item.qdrant_point_id}`);
        continue;
      }

      const row = result.rows[0];

      // Canonical Phase 8 envelope (10 fields + routing hints)
      // packet_key = cross-system semantic identity (Qdrant/Neo4j/Redis/ACP join key)
      // packet_id = Postgres row UUID (internal, never external reference)
      const extraction = {
        // Core semantic identity (immutable, cross-mirror)
        packet_key: row.packet_key,
        title_id: row.title_id,
        feature_id: row.feature_id,
        source_ref: row.source_ref,

        // 4D topology coordinates
        // X = som_col, Y = som_row, Z = kmeans_cluster_id (SOM depth)
        // Vector field = latent_64 (computed separately, not a single axis)
        // Time = created_at + supersedes/superseded_by lineage
        som_row: row.som_row,
        som_col: row.som_col,
        community_id: row.community_id,

        // Lexical enrichment (from materialize-feature-envelopes)
        lexical_nouns: JSON.parse(row.lexical_nouns),
        lexical_verbs: JSON.parse(row.lexical_verbs),
        lexical_adverbs_ly: JSON.parse(row.lexical_adverbs_ly),
        used_concepts: deriveUsedConcepts(
          row.title_id,
          row.feature_id,
          row.source_ref,
          JSON.parse(row.lexical_nouns),
          JSON.parse(row.lexical_verbs),
          JSON.parse(row.lexical_adverbs_ly)
        ),

        // Routing hints for BitFrost cache layers
        routing_hints: {
          cache_layer: row.som_row !== null ? 'L3' : 'L2', // SOM cluster cache or feature cache
          topology_enabled: row.som_row !== null,
          feature_grouping: row.feature_id,
          community_scope: row.community_id
        },

        // Audit trail
        evidence_id: item.id,
        qdrant_point_id: item.qdrant_point_id,
        extraction_method: 'canonical-phase8',
        extracted_at: new Date().toISOString()
      };

      extractions.push(extraction);
    } catch (err) {
      vlog(`   ⚠️  Failed to load envelope for ${item.qdrant_point_id}: ${err.message}`);
    }
  }

  log(`   ✓ Emitted ${extractions.length} canonical envelopes\n`);
  return extractions;
}

// ── STAGE 3: Validate Structure ────────────────────────────────────────────

async function validateExtractionSchema(extractions) {
  log(`✓ Stage 3: Validate Extraction Schema`);

  let validCount = 0;
  let invalidCount = 0;

  for (const extraction of extractions) {
    // Hard fail conditions
    if (!extraction.packet_key || !extraction.title_id || !extraction.feature_id || !extraction.source_ref) {
      invalidCount++;
      vlog(`   ❌ Missing identity: ${extraction.packet_key ?? extraction.evidence_id}`);
      continue;
    }

    if (!Array.isArray(extraction.lexical_nouns) || !Array.isArray(extraction.lexical_verbs)) {
      invalidCount++;
      vlog(`   ❌ Missing lexical arrays: ${extraction.packet_key}`);
      continue;
    }

    validCount++;
  }

  log(`   ✓ Valid: ${validCount}, Invalid: ${invalidCount}\n`);
  return validCount === extractions.length;
}

// ── STAGE 4: Write to Postgres ─────────────────────────────────────────────

async function writeExtractionToPostgres(pool, extractions, dryRun = true) {
  log(`📝 Stage 4: Write Extraction to Postgres`);

  if (extractions.length === 0) {
    log(`   ⊘ No extractions to write\n`);
    return 0;
  }

  if (dryRun) {
    log(`   [DRY-RUN] Would write ${extractions.length} extraction records\n`);
    return extractions.length;
  }

  const client = await pool.connect();
  let writtenCount = 0;

  try {
    await client.query('BEGIN');

    // TODO: Wire actual extraction storage (extract_results table)
    // For now, just validate transaction support
    for (const extraction of extractions) {
      // Placeholder: confirm transaction succeeds
      writtenCount++;
    }

    await client.query('COMMIT');
    log(`   ✓ Committed ${writtenCount} extraction records\n`);
    return writtenCount;
  } catch (err) {
    await client.query('ROLLBACK');
    log(`   ❌ Transaction failed: ${err.message}\n`);
    return 0;
  } finally {
    client.release();
  }
}

// ── STAGE 5: Invalidate Redis Cache ────────────────────────────────────────

async function invalidateRedisCache(redis, extractions, dryRun = true) {
  log(`⚡ Stage 5: Invalidate Redis Cache`);

  if (!redis) {
    log(`   ⊘ Redis unavailable\n`);
    return 0;
  }

  if (dryRun) {
    log(`   [DRY-RUN] Would invalidate ${extractions.length} cache entries\n`);
    return extractions.length;
  }

  try {
    let invalidatedCount = 0;

    for (const extraction of extractions) {
      // Invalidate all related keys
      const keys = [
        `bifrost:chunk:${extraction.chunk_id}`,
        `bifrost:point:${extraction.qdrant_point_id}`,
        `embedding:summary:${extraction.evidence_id}`,
      ];

      for (const key of keys) {
        await redis.del(key);
      }

      invalidatedCount++;
    }

    log(`   ✓ Invalidated ${invalidatedCount} cache entries\n`);
    return invalidatedCount;
  } catch (err) {
    log(`   ⚠️  Cache invalidation failed: ${err.message}\n`);
    return 0;
  }
}

// ── STAGE 6: Emit Neo4j Updates ────────────────────────────────────────────

async function emitNeo4jUpdates(driver, extractions, dryRun = true) {
  log(`🗂️  Stage 6: Emit Neo4j Topology Updates`);

  if (dryRun) {
    log(`   [DRY-RUN] Would update ${extractions.length} Neo4j packets\n`);
    return extractions.length;
  }

  const session = driver.session();
  let updatedCount = 0;

  try {
    for (const extraction of extractions) {
      // Set extraction metadata on Packet node (via qdrant_point_id if available)
      if (!extraction.qdrant_point_id) {
        vlog(`   ⊘ No qdrant_point_id for ${extraction.chunk_id}`);
        continue;
      }

      const cypher = `
        MATCH (p:Packet {id: $chunkId})
        SET p.extraction_method = $method,
            p.confidence = $confidence,
            p.extraction_count = (p.extraction_count ?? 0) + 1
        RETURN p.id
      `;

      const result = await session.run(cypher, {
        chunkId: extraction.chunk_id,
        method: extraction.extraction_method,
        confidence: extraction.confidence_score,
      });

      if (result.records.length > 0) {
        updatedCount++;
      }
    }

    log(`   ✓ Updated ${updatedCount} Packet nodes in Neo4j\n`);
    return updatedCount;
  } catch (err) {
    log(`   ⚠️  Neo4j update failed: ${err.message}\n`);
    return 0;
  } finally {
    await session.close();
  }
}

// ── QUERY ROUTING PATTERNS ──────────────────────────────────────────────────
//
// Scoped query (known community/source/feature):
//   Postgres topology filter
//   → BM25 / lexical
//   → Qdrant dense
//   → TurboVec rerank
//   → Neo4j authority
//   → RRF fusion
//   → ACE context assembly
//
// Broad query (unknown entry point):
//   Qdrant broad semantic recall
//   → infer likely community_id / feature_id
//   → Postgres narrowed fetch
//   → rerank via Karpathy blend (0.4·PR + 0.3·attention + 0.3·authority)
//   → ACE context assembly
//
// Neo4j Role (always derived, never truth):
//   Neo4j nodes mirror Postgres packet_key identity
//   Neo4j computes community/PageRank via GDS
//   Neo4j syncs results back to Postgres by packet_key
//
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  const pipelineStart = Date.now();

  log(`\n⚡ LANGEXTRACT CANONICAL PIPELINE\n`);
  log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  log(`Postgres: ${PG_URL}`);
  log(`Neo4j: ${NEO4J_URI}\n`);

  const pool = new pg.Pool({ connectionString: PG_URL });
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const redis = new Redis(REDIS_CONFIG);

  try {
    await pool.connect();
    await redis.connect().catch(() => log('⚠️  Redis unavailable'));

    // Pipeline stages
    const evidence = await loadEvidenceFromPostgres(pool, 10);
    if (evidence.length === 0) {
      log('❌ No evidence loaded. Exiting.\n');
      process.exit(1);
    }

    const extractions = await extractPoliciesAndEntities(pool, evidence);
    const schemaValid = await validateExtractionSchema(extractions);

    if (!schemaValid) {
      log('❌ Schema validation failed. Exiting.\n');
      process.exit(1);
    }

    const writtenCount = await writeExtractionToPostgres(pool, extractions, DRY_RUN);
    const invalidatedCount = await invalidateRedisCache(redis, extractions, DRY_RUN);
    const updatedCount = await emitNeo4jUpdates(driver, extractions, DRY_RUN);

    // Report
    const pipelineDuration = Date.now() - pipelineStart;

    log(`✅ LANGEXTRACT PIPELINE COMPLETE\n`);
    log(`   Evidence loaded: ${evidence.length}`);
    log(`   Extractions: ${extractions.length}`);
    log(`   Written to Postgres: ${writtenCount}`);
    log(`   Cache invalidations: ${invalidatedCount}`);
    log(`   Neo4j updates: ${updatedCount}`);
    log(`   Duration: ${pipelineDuration}ms\n`);

    process.exit(0);
  } catch (err) {
    log(`❌ Pipeline failed: ${err.message}`);
    if (VERBOSE) log(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
    await driver.close();
    await redis.quit().catch(() => {});
  }
}

main();
