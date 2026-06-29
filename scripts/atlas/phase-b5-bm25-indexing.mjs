#!/usr/bin/env node
/**
 * Phase B Pass 5: BM25 Full-Text Indexing
 *
 * Final pass that:
 * 1. Sends summaries to Go search service (:8096) for BM25 indexing
 * 2. Warms Redis BitFrost cache with top search terms
 * 3. Populates atlas_packets.{bm25_indexed_at, bm25_score, bm25_terms}
 *
 * Output: BM25 index in Go service + Redis cache warmup + Postgres metadata
 *
 * Usage:
 *   node scripts/atlas/phase-b5-bm25-indexing.mjs [--dry-run] [--apply] [--batch=100] [--verbose]
 */

import pg from 'pg';
import Redis from 'ioredis';

const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const BATCH_SIZE = parseInt(process.argv.find(arg => arg.startsWith('--batch='))?.split('=')[1] || '100');

const GO_SEARCH_SERVICE = 'http://127.0.0.1:8096';

// Database connection from .env
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  database: process.env.POSTGRES_DB || 'legal_ai_db',
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

// Redis connection for cache warmup from .env
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || 'redis',
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});

async function indexWithGoService(packets) {
  if (DRY_RUN) return { indexed: 0, failed: 0 };

  let indexed = 0;
  let failed = 0;

  for (const packet of packets) {
    if (!packet.summary) continue;

    try {
      const response = await fetch(`${GO_SEARCH_SERVICE}/api/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: packet.packet_key,
          title: packet.feature_id,
          content: packet.summary,
          metadata: {
            source_ref: packet.source_ref,
            feature_id: packet.feature_id,
            domain_class: packet.domain_class,
            error_pattern: packet.error_pattern,
          },
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        indexed++;
        if (VERBOSE) console.log(`   ✅ Indexed ${packet.packet_key}`);
      } else {
        failed++;
        if (VERBOSE) console.log(`   ⚠️  HTTP ${response.status} for ${packet.packet_key}`);
      }
    } catch (error) {
      failed++;
      if (VERBOSE) console.log(`   ⚠️  Index error: ${error.message}`);
    }
  }

  return { indexed, failed };
}

function extractSearchTerms(summary) {
  if (!summary) return [];

  // Extract significant terms (TF-IDF style)
  const words = summary
    .toLowerCase()
    .split(/[\s\W]+/)
    .filter((w) => w.length > 4);

  const freq = {};
  const stopwords = new Set(['that', 'this', 'from', 'with', 'into', 'have', 'been', 'when', 'error', 'check', 'could']);

  for (const word of words) {
    if (!stopwords.has(word)) {
      freq[word] = (freq[word] || 0) + 1;
    }
  }

  // Return top 5 terms
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

async function warmRedisCache(packets) {
  if (DRY_RUN || !redis.status || redis.status === 'close') return 0;

  let warmed = 0;

  try {
    for (const packet of packets) {
      const terms = extractSearchTerms(packet.summary);
      const key = `bm25:packet:${packet.packet_key}`;
      const value = {
        feature_id: packet.feature_id,
        summary_snippet: packet.summary.substring(0, 200),
        terms: terms,
        indexed_at: new Date().toISOString(),
      };

      await redis.setex(key, 86400, JSON.stringify(value)); // 24h TTL
      warmed++;

      if (VERBOSE) {
        console.log(`   ✅ Warmed cache for ${packet.packet_key} (${terms.length} terms)`);
      }
    }
  } catch (error) {
    if (VERBOSE) console.log(`   ⚠️  Redis cache warmup error: ${error.message}`);
  }

  return warmed;
}

async function writeIndexMetadata(packets) {
  if (DRY_RUN) {
    console.log(`   📋 Dry-run: Would write metadata for ${packets.length} packets`);
    return true;
  }

  try {
    for (const packet of packets) {
      const terms = extractSearchTerms(packet.summary);
      await pool.query(
        `
        UPDATE atlas_packets
        SET
          bm25_indexed_at = NOW(),
          bm25_score = 0.5,
          bm25_terms = $2,
          updated_at = NOW()
        WHERE packet_key = $1
      `,
        [packet.packet_key, terms]
      );
    }
    console.log(`   ✅ Wrote metadata for ${packets.length} packets`);
    return true;
  } catch (error) {
    console.error(`   ❌ Write error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase B Pass 5: BM25 Full-Text Indexing                       ║');
  console.log('║  Go Search Service + Redis Cache Warmup + Metadata             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  if (DRY_RUN) console.log('⚠️  DRY-RUN MODE\n');

  const startTime = Date.now();

  // Connect Redis if not dry-run
  if (!DRY_RUN) {
    try {
      await redis.connect();
      console.log('✅ Redis connected\n');
    } catch (error) {
      console.warn('⚠️  Redis connection failed (cache warmup skipped)');
    }
  }

  try {
    // Step 1: Query packets needing BM25 indexing
    const result = await pool.query(`
      SELECT
        packet_key,
        feature_id,
        source_ref,
        summary,
        domain_class,
        error_pattern,
        bm25_indexed_at
      FROM atlas_packets
      WHERE summary IS NOT NULL
        AND (bm25_indexed_at IS NULL OR bm25_indexed_at < NOW() - INTERVAL '7 days')
      ORDER BY created_at DESC
      LIMIT 10000
    `);

    const packets = result.rows;
    console.log(`📦 Found ${packets.length} packets needing BM25 indexing\n`);

    let totalIndexed = 0;
    let totalFailed = 0;
    let totalWarmed = 0;
    let processed = 0;

    // Process in batches
    for (let i = 0; i < packets.length; i += BATCH_SIZE) {
      const batch = packets.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(packets.length / BATCH_SIZE);

      console.log(`🔄 Processing batch ${batchNum}/${totalBatches}`);

      try {
        // Index with Go service
        const indexResult = await indexWithGoService(batch);
        totalIndexed += indexResult.indexed;
        totalFailed += indexResult.failed;

        // Warm Redis cache
        const warmed = await warmRedisCache(batch);
        totalWarmed += warmed;

        // Write metadata to Postgres
        const success = await writeIndexMetadata(batch);

        if (success) {
          processed += batch.length;
        }
      } catch (error) {
        console.error(`   ❌ Batch error: ${error.message}`);
      }

      // Rate limiting to avoid overwhelming Go service
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Summary
    console.log(`\n✅ BM25 Full-Text Indexing Complete`);
    console.log(`   Go Service indexed: ${totalIndexed}`);
    console.log(`   Go Service failed: ${totalFailed}`);
    console.log(`   Redis cache warmed: ${totalWarmed}`);
    console.log(`   Postgres metadata: ${processed}`);
    console.log(`   Total Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s\n`);

    // Verification query
    if (!DRY_RUN) {
      const verifyResult = await pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN bm25_indexed_at IS NOT NULL THEN 1 END) as indexed,
          COUNT(CASE WHEN bm25_terms IS NOT NULL AND array_length(bm25_terms, 1) > 0 THEN 1 END) as with_terms
        FROM atlas_packets
      `);

      console.log('📊 Verification:');
      const v = verifyResult.rows[0];
      console.log(`   Total packets: ${v.total}`);
      console.log(`   BM25 indexed: ${v.indexed} (${(100 * v.indexed / v.total).toFixed(1)}%)`);
      console.log(`   With search terms: ${v.with_terms}\n`);
    }

    console.log('🎉 Phase B Complete! Ready for Phase C (RFF Lane Fusion)\n');
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  } finally {
    await pool.end();
    if (redis.status === 'ready') await redis.quit();
  }
}

main();
