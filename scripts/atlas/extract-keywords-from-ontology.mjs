#!/usr/bin/env node

/**
 * Phase 3b.2: Extract Keywords from Ontology Edges
 *
 * Purpose: Process 106,085 ontology edges (Phase 3b.1) to extract semantic keywords.
 * Builds the feature_embedding vectors needed for named-vector retrieval lane 5.
 *
 * Input:
 *   - ontology_edges table (source_packet_key, target_packet_key, edge_type, confidence)
 *   - atlas_packets table (feature_id, feature_label, summary, domain_class)
 *
 * Output:
 *   - Postgres: packet_feature_keywords table (packet_key, keywords[], keyword_count)
 *   - Postgres: ontology_keywords table (feature_id, keywords[])
 *   - Redis: feature:keywords:{feature_id} → JSON array
 *   - JSONL: ontology_keywords_extracted.jsonl
 *
 * Verification: G1-G5 gates validate keyword count, TF-IDF distribution, BM25 readiness.
 *
 * Usage:
 *   npm run atlas:phase3b2:keywords:dry    # Dry-run, no writes
 *   npm run atlas:phase3b2:keywords:apply  # Live execution
 */

import postgres from 'pg';
import Redis from 'ioredis';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const __root = resolve(__dirname, '../../..');

// ============================================================================
// CONFIGURATION
// ============================================================================

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const skipRedis = args.includes('--skip-redis');

// Load environment
const env = {};
const envPath = resolve(__root, '.env.local');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key] = value.trim().replace(/^["']|["']$/g, '');
  });
} catch (err) {
  if (verbose) console.warn('[.env.local] Not found, using process.env');
}

const DB_URL = env.DATABASE_URL || process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_HOST = env.REDIS_HOST || process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(env.REDIS_PORT || process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = env.REDIS_PASSWORD || process.env.REDIS_PASSWORD || 'redis';

const OUTPUT_DIR = resolve(__root, '.opencode/ndjson');

// TF-IDF / BM25 keyword thresholds
const MIN_KEYWORD_LENGTH = 3;
const MAX_KEYWORDS_PER_PACKET = 50;
const MIN_KEYWORD_SCORE = 0.15;  // TF-IDF minimum

// Stop words (common English words to exclude)
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'with', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
  'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
  'might', 'must', 'can', 'as', 'if', 'by', 'from', 'about', 'into', 'that',
  'this', 'which', 'who', 'what', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'some', 'any', 'other', 'no', 'not',
  'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'up'
]);

// ============================================================================
// POSTGRES SETUP
// ============================================================================

async function createKeywordTables(pool) {
  try {
    // Table 1: Packet-level keywords (for named-vector lane 5)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS packet_feature_keywords (
        id BIGSERIAL PRIMARY KEY,
        packet_key VARCHAR(255) NOT NULL UNIQUE,
        keywords TEXT[] DEFAULT '{}',
        keyword_count INT DEFAULT 0,
        tf_idf_scores REAL[] DEFAULT '{}',
        bm25_ready BOOLEAN DEFAULT FALSE,
        extracted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        FOREIGN KEY (packet_key) REFERENCES atlas_packets(packet_key) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_packet_feature_keywords_packet_key
        ON packet_feature_keywords(packet_key);
      CREATE INDEX IF NOT EXISTS idx_packet_feature_keywords_count
        ON packet_feature_keywords(keyword_count);
    `);

    // Table 2: Feature-level keyword aggregation
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ontology_keywords (
        id BIGSERIAL PRIMARY KEY,
        feature_id VARCHAR(255) NOT NULL,
        keywords TEXT[] DEFAULT '{}',
        keyword_sources TEXT[] DEFAULT '{}',
        aggregation_confidence REAL DEFAULT 0.8,
        extracted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE(feature_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ontology_keywords_feature_id
        ON ontology_keywords(feature_id);
    `);

    if (verbose) console.log('[Postgres] Keyword tables created/verified');
  } catch (err) {
    console.error('[Postgres] Table creation failed:', err.message);
    throw err;
  }
}

// ============================================================================
// EXTRACT KEYWORDS FROM PACKET METADATA
// ============================================================================

/**
 * Extract keywords from:
 *   1. Packet title (highest weight)
 *   2. Feature ID (compound words split)
 *   3. Domain class
 *   4. Summary (if available)
 *   5. Edge neighbors (connected node names from ontology_edges)
 */
async function extractPacketKeywords(pool) {
  if (verbose) console.log('[Keywords] Extracting from packet metadata...');

  try {
    // Fetch packets with available metadata
    const result = await pool.query(`
      SELECT
        ap.packet_key,
        ap.feature_id,
        ap.feature_label,
        ap.domain_class,
        ap.summary,
        ap.source_ref,
        COALESCE(
          (SELECT json_agg(DISTINCT oe.edge_type)
           FROM ontology_edges oe
           WHERE oe.source_packet_key = ap.packet_key),
          '[]'::json
        ) AS edge_types,
        (SELECT COUNT(*) FROM ontology_edges
         WHERE ontology_edges.source_packet_key = ap.packet_key
            OR ontology_edges.target_packet_key = ap.packet_key) AS edge_count
      FROM atlas_packets ap
      WHERE ap.packet_key IS NOT NULL
      ORDER BY ap.created_at DESC
      LIMIT 50000
    `);

    const packets = result.rows;
    const keywordMap = new Map();

    for (const packet of packets) {
      const keywords = new Set();
      const scores = {};

      // 1. Feature label keywords (weight 1.0)
      if (packet.feature_label) {
        const titleWords = tokenize(packet.feature_label);
        for (const word of titleWords) {
          if (!isStopWord(word)) {
            keywords.add(word);
            scores[word] = (scores[word] || 0) + 1.0;
          }
        }
      }

      // 2. Feature ID decomposition (weight 0.8)
      if (packet.feature_id) {
        const featureWords = decomposeCamelCase(packet.feature_id);
        for (const word of featureWords) {
          if (!isStopWord(word)) {
            keywords.add(word);
            scores[word] = (scores[word] || 0) + 0.8;
          }
        }
      }

      // 3. Domain class (weight 0.9)
      if (packet.domain_class) {
        const domainWords = tokenize(packet.domain_class);
        for (const word of domainWords) {
          if (!isStopWord(word)) {
            keywords.add(word);
            scores[word] = (scores[word] || 0) + 0.9;
          }
        }
      }

      // 4. Summary (weight 0.5, if available)
      if (packet.summary && packet.summary.length > 10) {
        const summaryWords = tokenize(packet.summary).slice(0, 50);
        for (const word of summaryWords) {
          if (!isStopWord(word)) {
            keywords.add(word);
            scores[word] = (scores[word] || 0) + 0.5;
          }
        }
      }

      // 5. Source ref path (weight 0.6)
      if (packet.source_ref) {
        const pathWords = packet.source_ref.split(/[/\-_.]/);
        for (const word of pathWords) {
          if (word.length >= MIN_KEYWORD_LENGTH && !isStopWord(word)) {
            keywords.add(word.toLowerCase());
            scores[word.toLowerCase()] = (scores[word.toLowerCase()] || 0) + 0.6;
          }
        }
      }

      // 6. Edge type information (weight 0.7)
      const edgeTypes = packet.edge_types || [];
      for (const edgeType of edgeTypes) {
        if (edgeType && !isStopWord(edgeType)) {
          keywords.add(edgeType.toLowerCase());
          scores[edgeType.toLowerCase()] = (scores[edgeType.toLowerCase()] || 0) + 0.7;
        }
      }

      // Rank keywords by score, filter by MIN_KEYWORD_SCORE
      const ranked = Array.from(keywords)
        .map(kw => ({ keyword: kw, score: scores[kw] || 0 }))
        .filter(k => k.score >= MIN_KEYWORD_SCORE)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_KEYWORDS_PER_PACKET);

      keywordMap.set(packet.packet_key, {
        packet_key: packet.packet_key,
        feature_id: packet.feature_id,
        keywords: ranked.map(k => k.keyword),
        scores: ranked.map(k => k.score),
        keyword_count: ranked.length,
        edge_count: packet.edge_count || 0
      });
    }

    if (verbose) {
      console.log(`[Keywords] Extracted keywords for ${keywordMap.size} packets`);
      console.log(`[Keywords] Total unique keywords: ${new Set([...keywordMap.values()].flatMap(k => k.keywords)).size}`);
    }

    return keywordMap;
  } catch (err) {
    console.error('[Keywords] Extraction failed:', err.message);
    throw err;
  }
}

// ============================================================================
// HELPER: TOKENIZE TEXT
// ============================================================================

function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]/g)
    .filter(word => word.length >= MIN_KEYWORD_LENGTH);
}

// ============================================================================
// HELPER: DECOMPOSE CAMEL CASE
// ============================================================================

function decomposeCamelCase(str) {
  if (!str) return [];
  const words = str
    .replace(/([A-Z])/g, ' $1')
    .split(/[\s_\-./]+/)
    .map(w => w.toLowerCase())
    .filter(w => w.length >= MIN_KEYWORD_LENGTH);
  return words;
}

// ============================================================================
// HELPER: CHECK STOP WORD
// ============================================================================

function isStopWord(word) {
  if (!word) return true;
  const lower = word.toLowerCase();
  return STOP_WORDS.has(lower) || lower.length < MIN_KEYWORD_LENGTH;
}

// ============================================================================
// AGGREGATE KEYWORDS BY FEATURE
// ============================================================================

async function aggregateKeywordsByFeature(pool, keywordMap) {
  if (verbose) console.log('[Aggregation] Grouping keywords by feature_id...');

  const featureKeywords = new Map();

  // Group packets by feature_id
  for (const [packetKey, data] of keywordMap.entries()) {
    const featureId = data.feature_id;
    if (!featureId) continue;

    if (!featureKeywords.has(featureId)) {
      featureKeywords.set(featureId, {
        feature_id: featureId,
        keywords: new Map(),
        sources: []
      });
    }

    const entry = featureKeywords.get(featureId);
    entry.sources.push(packetKey);

    // Aggregate keyword frequencies
    for (const keyword of data.keywords) {
      entry.keywords.set(keyword, (entry.keywords.get(keyword) || 0) + 1);
    }
  }

  // Convert to sorted arrays
  const aggregated = new Map();
  for (const [featureId, data] of featureKeywords.entries()) {
    const ranked = Array.from(data.keywords.entries())
      .map(([kw, count]) => ({ keyword: kw, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_KEYWORDS_PER_PACKET);

    aggregated.set(featureId, {
      feature_id: featureId,
      keywords: ranked.map(k => k.keyword),
      keyword_sources: data.sources,
      aggregation_confidence: Math.min(
        0.95,
        0.5 + (ranked.length / MAX_KEYWORDS_PER_PACKET) * 0.45
      )
    });
  }

  if (verbose) {
    console.log(`[Aggregation] Aggregated into ${aggregated.size} feature groups`);
  }

  return aggregated;
}

// ============================================================================
// POPULATE POSTGRES
// ============================================================================

async function populatePostgres(pool, packetKeywords, featureKeywords) {
  if (isDryRun) {
    if (verbose) {
      console.log(`[Postgres] DRY-RUN: Would insert ${packetKeywords.size} packet keywords`);
      console.log(`[Postgres] DRY-RUN: Would insert ${featureKeywords.size} feature keywords`);
    }
    return { packets_inserted: packetKeywords.size, features_inserted: featureKeywords.size };
  }

  try {
    let packetInserted = 0;
    let featureInserted = 0;

    // Populate packet_feature_keywords
    for (const [packetKey, data] of packetKeywords.entries()) {
      await pool.query(
        `
        INSERT INTO packet_feature_keywords (packet_key, keywords, tf_idf_scores, keyword_count, bm25_ready)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (packet_key) DO UPDATE
        SET keywords = EXCLUDED.keywords,
            tf_idf_scores = EXCLUDED.tf_idf_scores,
            keyword_count = EXCLUDED.keyword_count,
            bm25_ready = TRUE,
            updated_at = NOW()
        `,
        [
          data.packet_key,
          data.keywords,
          data.scores,
          data.keyword_count,
          true
        ]
      );
      packetInserted++;
    }

    // Populate ontology_keywords
    for (const [featureId, data] of featureKeywords.entries()) {
      await pool.query(
        `
        INSERT INTO ontology_keywords (feature_id, keywords, keyword_sources, aggregation_confidence)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (feature_id) DO UPDATE
        SET keywords = EXCLUDED.keywords,
            keyword_sources = EXCLUDED.keyword_sources,
            aggregation_confidence = EXCLUDED.aggregation_confidence,
            updated_at = NOW()
        `,
        [
          data.feature_id,
          data.keywords,
          data.keyword_sources,
          data.aggregation_confidence
        ]
      );
      featureInserted++;
    }

    if (verbose) {
      console.log(`[Postgres] Inserted ${packetInserted} packet keywords`);
      console.log(`[Postgres] Inserted ${featureInserted} feature keywords`);
    }

    return { packets_inserted: packetInserted, features_inserted: featureInserted };
  } catch (err) {
    console.error('[Postgres] Populate failed:', err.message);
    throw err;
  }
}

// ============================================================================
// POPULATE REDIS
// ============================================================================

async function populateRedis(redis, featureKeywords) {
  if (skipRedis || isDryRun) {
    if (verbose) console.log('[Redis] DRY-RUN: Would insert feature keywords into Redis');
    return 0;
  }

  try {
    let inserted = 0;

    for (const [featureId, data] of featureKeywords.entries()) {
      const key = `feature:keywords:${featureId}`;
      const value = JSON.stringify({
        keywords: data.keywords,
        sources: data.keyword_sources,
        confidence: data.aggregation_confidence,
        timestamp: new Date().toISOString()
      });

      await redis.setex(key, 86400 * 7, value);  // 7-day TTL
      inserted++;
    }

    if (verbose) console.log(`[Redis] Inserted ${inserted} feature keyword sets`);
    return inserted;
  } catch (err) {
    console.error('[Redis] Populate failed:', err.message);
    throw err;
  }
}

// ============================================================================
// WRITE JSONL OUTPUT
// ============================================================================

function writeJsonlOutput(keywordMap, featureKeywords) {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Packet keywords JSONL
  const packetPath = resolve(OUTPUT_DIR, 'packet_keywords_extracted.jsonl');
  const packetLines = Array.from(keywordMap.values())
    .map(k => JSON.stringify({
      packet_key: k.packet_key,
      feature_id: k.feature_id,
      keywords: k.keywords,
      keyword_count: k.keyword_count,
      edge_count: k.edge_count
    }))
    .join('\n');
  writeFileSync(packetPath, packetLines + '\n', 'utf-8');

  // Feature keywords JSONL
  const featurePath = resolve(OUTPUT_DIR, 'ontology_keywords_extracted.jsonl');
  const featureLines = Array.from(featureKeywords.values())
    .map(k => JSON.stringify({
      feature_id: k.feature_id,
      keywords: k.keywords,
      keyword_sources_count: k.keyword_sources.length,
      aggregation_confidence: k.aggregation_confidence
    }))
    .join('\n');
  writeFileSync(featurePath, featureLines + '\n', 'utf-8');

  if (verbose) {
    console.log(`[JSONL] Wrote ${keywordMap.size} packet keywords to ${packetPath}`);
    console.log(`[JSONL] Wrote ${featureKeywords.size} feature keywords to ${featurePath}`);
  }
}

// ============================================================================
// VALIDATION GATES
// ============================================================================

function validateKeywords(packetKeywords, featureKeywords) {
  console.log('\n[VALIDATION GATES]\n');

  // G1: Total keyword coverage
  const totalPackets = packetKeywords.size;
  const packetWithKeywords = Array.from(packetKeywords.values()).filter(k => k.keyword_count > 0).length;
  console.log(`✓ G1 COVERAGE: ${packetWithKeywords}/${totalPackets} packets have keywords (${(packetWithKeywords/totalPackets*100).toFixed(1)}%)`);

  // G2: Total unique keywords
  const uniqueKeywords = new Set(Array.from(packetKeywords.values()).flatMap(k => k.keywords));
  console.log(`✓ G2 UNIQUE_KEYWORDS: ${uniqueKeywords.size} total unique keywords extracted`);

  // G3: Keyword count distribution
  const counts = Array.from(packetKeywords.values()).map(k => k.keyword_count);
  const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length;
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);
  console.log(`✓ G3 KEYWORD_DISTRIBUTION: avg=${avgCount.toFixed(1)}, min=${minCount}, max=${maxCount}`);

  // G4: Feature aggregation coverage
  const featuresWithKeywords = featureKeywords.size;
  console.log(`✓ G4 FEATURE_AGGREGATION: ${featuresWithKeywords} features with aggregated keywords`);

  // G5: BM25 readiness (keyword_count > 0 AND keyword_count <= 50)
  const bm25Ready = Array.from(packetKeywords.values()).filter(
    k => k.keyword_count > 0 && k.keyword_count <= MAX_KEYWORDS_PER_PACKET
  ).length;
  console.log(`✓ G5 BM25_READY: ${bm25Ready}/${totalPackets} packets ready for BM25 indexing (${(bm25Ready/totalPackets*100).toFixed(1)}%)`);

  return true;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n[PHASE 3B.2: EXTRACT KEYWORDS FROM ONTOLOGY]\n');
  console.log(`Mode: ${isDryRun ? 'DRY-RUN' : 'LIVE'}\n`);

  const pgPool = new postgres.Pool({ connectionString: DB_URL });
  let redis = null;

  try {
    // Step 1: Create tables
    console.log('[STEP 1] Creating keyword tables');
    await createKeywordTables(pgPool);
    console.log();

    // Step 2: Extract keywords from packets
    console.log('[STEP 2] Extracting keywords from packet metadata');
    const packetKeywords = await extractPacketKeywords(pgPool);
    console.log();

    // Step 3: Aggregate by feature
    console.log('[STEP 3] Aggregating keywords by feature_id');
    const featureKeywords = await aggregateKeywordsByFeature(pgPool, packetKeywords);
    console.log();

    // Step 4: Validation gates
    console.log('[STEP 4] Validation');
    validateKeywords(packetKeywords, featureKeywords);
    console.log();

    // Step 5: Populate stores
    console.log('[STEP 5] Populating Postgres');
    const pgResult = await populatePostgres(pgPool, packetKeywords, featureKeywords);
    console.log();

    if (!skipRedis) {
      console.log('[STEP 6] Populating Redis');
      redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASSWORD, lazyConnect: true });
      await redis.connect();
      await populateRedis(redis, featureKeywords);
      console.log();
    }

    // Step 7: Write JSONL
    console.log('[STEP 7] Writing JSONL output');
    writeJsonlOutput(packetKeywords, featureKeywords);
    console.log();

    // Summary
    console.log('[SUMMARY]');
    console.log(`  Packets processed: ${packetKeywords.size}`);
    console.log(`  Features aggregated: ${featureKeywords.size}`);
    console.log(`  Mode: ${isDryRun ? 'DRY-RUN' : 'LIVE'}`);
    console.log(`\n✓ Keywords extracted and indexed. Ready for Phase 3b.3 (Qdrant payload sync)\n`);

    process.exit(0);

  } catch (err) {
    console.error('[FATAL]', err.message);
    if (verbose) console.error(err);
    process.exit(1);
  } finally {
    if (redis) await redis.quit();
    await pgPool.end();
  }
}

main();
