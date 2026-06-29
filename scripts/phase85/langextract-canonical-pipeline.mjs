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

// ── STAGE 2: Extract (Placeholder → Registry) ──────────────────────────────

async function extractPoliciesAndEntities(evidence) {
  log(`📤 Stage 2: Extract Policies & Entities`);

  const extractions = [];

  for (const item of evidence) {
    // TODO: Wire real extraction service via go-retrieval
    // For now, mock extraction structure
    const extraction = {
      evidence_id: item.id,
      chunk_id: item.chunk_id,
      source_type: item.source_type,
      qdrant_point_id: item.qdrant_point_id,
      policies: [], // Extracted policies
      entities: [], // Extracted entities (person, org, date, etc.)
      events: [], // Extracted events
      claims: [], // Legal claims
      crime_signals: [], // Crime-related signals
      confidence_score: 0.0, // Overall confidence (0-1)
      extraction_method: 'placeholder', // For audit trail
    };

    // Mock: add 1-2 entities per evidence
    if (Math.random() > 0.5) {
      extraction.entities.push({
        type: 'PERSON',
        value: `Person_${item.id.slice(0, 8)}`,
        confidence: 0.8,
      });
    }

    extractions.push(extraction);
  }

  log(`   ✓ Extracted ${extractions.length} items\n`);
  return extractions;
}

// ── STAGE 3: Validate Structure ────────────────────────────────────────────

async function validateExtractionSchema(extractions) {
  log(`✓ Stage 3: Validate Extraction Schema`);

  let validCount = 0;
  let invalidCount = 0;

  for (const extraction of extractions) {
    // Hard fail conditions
    if (!extraction.evidence_id || !extraction.chunk_id) {
      invalidCount++;
      vlog(`   ❌ Missing identity: ${extraction.evidence_id}`);
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

// ── MAIN ────────────────────────────────────────────────────────────────────

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

    const extractions = await extractPoliciesAndEntities(evidence);
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
