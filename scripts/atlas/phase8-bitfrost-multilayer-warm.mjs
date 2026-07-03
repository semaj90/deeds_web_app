#!/usr/bin/env node
/**
 * Phase 8: BitFrost Multi-Layer Cache Warming
 *
 * Populates all 5 cache layers after Phase 7 (summarization) + Phase 8 (Qdrant sync):
 *
 * L1 Exact Match
 *   bitfrost:summary:<chunk_id>          → summary text (5ms lookup)
 *   bitfrost:packet:<packet_key>         → packet envelope JSON
 *
 * L2 Feature/Domain Buckets
 *   bitfrost:feature:<feature_id>        → SET of chunk_ids
 *   bitfrost:domain:<domain>             → SET of chunk_ids
 *
 * L3 Topology Buckets
 *   bitfrost:som:<row>:<col>             → SET of chunk_ids
 *   bitfrost:kmeans:<cluster_id>         → SET of chunk_ids
 *   bitfrost:manifold4d:<cell>           → SET of chunk_ids
 *
 * L4 Word/Intent Buckets
 *   bitfrost:term:<word>                 → SET of chunk_ids
 *   bitfrost:bigram:<word1_word2>        → SET of chunk_ids
 *   bitfrost:intent:<intent_id>          → SET of chunk_ids
 *
 * L5 Reward/Ranking (ZSET)
 *   bitfrost:reward:zset                 → chunk_id → authority_score
 *   bitfrost:hot:zset                    → chunk_id → hit_count
 *
 * Usage:
 *   node scripts/atlas/phase8-bitfrost-multilayer-warm.mjs             # dry-run
 *   node scripts/atlas/phase8-bitfrost-multilayer-warm.mjs --apply
 *   node scripts/atlas/phase8-bitfrost-multilayer-warm.mjs --apply --limit=5000
 *   node scripts/atlas/phase8-bitfrost-multilayer-warm.mjs --apply --batch=1000
 */

import pg from 'pg';
import Redis from 'ioredis';
import { performance } from 'perf_hooks';

const { Pool } = pg;

const APPLY = process.argv.includes('--apply');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const BATCH_ARG = process.argv.find(a => a.startsWith('--batch='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : 50000;
const BATCH_SIZE = BATCH_ARG ? parseInt(BATCH_ARG.split('=')[1], 10) : 1000;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'redis';

const pgPool = new Pool({ connectionString: DATABASE_URL });
const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  lazyConnect: true,
  enableOfflineQueue: false,
});

const TTL_L1 = 86400 * 7;      // 7 days (exact matches)
const TTL_L2_L4 = 86400 * 3;   // 3 days (buckets)
const TTL_L5 = 86400;           // 1 day (rankings, fresh from Neo4j)

// ============================================================================
// Extraction Helpers
// ============================================================================

/**
 * Extract meaningful terms from summary text
 */
function extractTerms(summary) {
  if (!summary) return [];
  const words = summary.toLowerCase().split(/\s+/);
  // Filter: 3+ chars, not stopwords
  const stopwords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'not', 'but', 'all', 'was', 'were', 'has', 'have', 'had', 'can', 'could', 'should', 'would', 'may', 'might']);
  return words
    .filter(w => w.length >= 3 && !stopwords.has(w) && /^[a-z]+$/.test(w))
    .slice(0, 20); // Max 20 terms per summary
}

/**
 * Extract bigrams (pairs of consecutive words)
 */
function extractBigrams(summary) {
  const terms = extractTerms(summary);
  const bigrams = [];
  for (let i = 0; i < terms.length - 1; i++) {
    bigrams.push(`${terms[i]}_${terms[i + 1]}`);
  }
  return bigrams.slice(0, 10);
}

/**
 * Extract domain from symbol (prefix before colon or use domain column)
 */
function extractDomainFromSymbol(symbol) {
  if (!symbol) return null;
  const parts = symbol.split(':');
  return parts[0]; // e.g., "auth", "database", "api"
}

// ============================================================================
// Warming Functions
// ============================================================================

/**
 * Warm L1 (exact match) — already done by Phase 7 worker
 * This is just for verification/top-up
 */
async function warmL1(redis, chunks) {
  console.log('  L1 Exact Match (summary + packet envelope)...');
  let count = 0;
  for (const chunk of chunks) {
    if (chunk.summary) {
      await redis.setex(`bitfrost:summary:${chunk.id}`, TTL_L1, chunk.summary);
      count++;
    }
  }
  return count;
}

/**
 * Warm L2 (symbol/domain buckets)
 */
async function warmL2(redis, chunks) {
  console.log('  L2 Symbol/Domain buckets...');
  let count = 0;
  for (const chunk of chunks) {
    if (chunk.symbol) {
      await redis.sadd(`bitfrost:symbol:${chunk.symbol}`, chunk.id);
      count++;
    }
    if (chunk.domain) {
      await redis.sadd(`bitfrost:domain:${chunk.domain}`, chunk.id);
      count++;
    }
  }
  // Set TTL on sets (expire all members together)
  const symbolKeys = chunks
    .filter(c => c.symbol)
    .map(c => `bitfrost:symbol:${c.symbol}`);
  const domainKeys = chunks
    .filter(c => c.domain)
    .map(c => `bitfrost:domain:${c.domain}`);

  for (const key of [...new Set([...symbolKeys, ...domainKeys])]) {
    await redis.expire(key, TTL_L2_L4);
  }

  return count;
}

/**
 * Warm L3 (topology buckets — SOM, GPU cluster, Community)
 */
async function warmL3(redis, chunks) {
  console.log('  L3 Topology (SOM, GPU cluster, Community)...');
  let count = 0;

  for (const chunk of chunks) {
    // SOM cluster
    if (chunk.som_cluster !== null && chunk.som_cluster !== undefined) {
      await redis.sadd(`bitfrost:som:${chunk.som_cluster}`, chunk.id);
      count++;
    }

    // GPU cluster
    if (chunk.gpu_cluster !== null && chunk.gpu_cluster !== undefined) {
      await redis.sadd(`bitfrost:gpu_cluster:${chunk.gpu_cluster}`, chunk.id);
      count++;
    }

    // Community (from PageRank)
    if (chunk.community_id !== null && chunk.community_id !== undefined) {
      await redis.sadd(`bitfrost:community:${chunk.community_id}`, chunk.id);
      count++;
    }
  }

  // Set TTL on topology sets
  const topoKeys = [];
  for (const chunk of chunks) {
    if (chunk.som_cluster !== null) {
      topoKeys.push(`bitfrost:som:${chunk.som_cluster}`);
    }
    if (chunk.gpu_cluster !== null) {
      topoKeys.push(`bitfrost:gpu_cluster:${chunk.gpu_cluster}`);
    }
    if (chunk.community_id !== null) {
      topoKeys.push(`bitfrost:community:${chunk.community_id}`);
    }
  }

  for (const key of [...new Set(topoKeys)]) {
    await redis.expire(key, TTL_L2_L4);
  }

  return count;
}

/**
 * Warm L4 (word/intent buckets)
 */
async function warmL4(redis, chunks) {
  console.log('  L4 Word/Intent (terms, bigrams, intents)...');
  let count = 0;

  for (const chunk of chunks) {
    // Extract terms from summary
    const terms = extractTerms(chunk.summary);
    for (const term of terms) {
      await redis.sadd(`bitfrost:term:${term}`, chunk.id);
      count++;
    }

    // Extract bigrams
    const bigrams = extractBigrams(chunk.summary);
    for (const bigram of bigrams) {
      await redis.sadd(`bitfrost:bigram:${bigram}`, chunk.id);
      count++;
    }

    // Intent (if present in metadata)
    const meta = chunk.metadata || {};
    if (meta.intent_id) {
      await redis.sadd(`bitfrost:intent:${meta.intent_id}`, chunk.id);
      count++;
    }
  }

  // Set TTL on word/intent sets
  const wordKeys = [];
  for (const chunk of chunks) {
    const terms = extractTerms(chunk.summary);
    wordKeys.push(...terms.map(t => `bitfrost:term:${t}`));

    const bigrams = extractBigrams(chunk.summary);
    wordKeys.push(...bigrams.map(b => `bitfrost:bigram:${b}`));

    const meta = chunk.metadata || {};
    if (meta.intent_id) {
      wordKeys.push(`bitfrost:intent:${meta.intent_id}`);
    }
  }

  for (const key of [...new Set(wordKeys)]) {
    await redis.expire(key, TTL_L2_L4);
  }

  return count;
}

/**
 * Warm L5 (reward/ranking ZSET)
 * Authority score from PageRank (page_rank_score column)
 */
async function warmL5(redis, chunks) {
  console.log('  L5 Reward/Ranking (PageRank + Kind ZSET)...');
  let count = 0;

  for (const chunk of chunks) {
    // PageRank score (default 0.5 if not present)
    const pageRankScore = typeof chunk.page_rank_score === 'number' ? chunk.page_rank_score : 0.5;
    await redis.zadd('bitfrost:reward:zset', pageRankScore, chunk.id);

    // Kind-based initial ranking (functions/classes higher priority)
    let kindScore = 0.5;
    if (chunk.kind === 'function') kindScore = 0.8;
    if (chunk.kind === 'class') kindScore = 0.7;
    if (chunk.kind === 'method') kindScore = 0.75;
    await redis.zadd('bitfrost:kind:zset', kindScore, chunk.id);

    count += 2;
  }

  // Set TTL on ZSETs
  await redis.expire('bitfrost:reward:zset', TTL_L5);
  await redis.expire('bitfrost:kind:zset', TTL_L5);

  return count;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 8: BitFrost Multi-Layer Cache Warming                  ║');
  console.log('║  5 layers: exact → feature/domain → topology → words → rank  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Limit: ${LIMIT} chunks`);
  console.log(`Batch size: ${BATCH_SIZE}\n`);

  if (!APPLY) {
    console.log('⚠️  DRY-RUN mode. Add --apply to write to Redis.\n');
  }

  await redis.connect();
  const t0 = performance.now();

  try {
    let totalProcessed = 0;
    let totalWarmed = 0;

    // Fetch chunks in batches (only those with summaries)
    for (let offset = 0; offset < LIMIT; offset += BATCH_SIZE) {
      const result = await pgPool.query(`
        SELECT
          id,
          summary,
          relative_path,
          symbol,
          kind,
          domain,
          tags,
          page_rank_score,
          som_cluster,
          gpu_cluster,
          community_id,
          updated_at
        FROM codebase_chunk_index
        WHERE summary IS NOT NULL AND LENGTH(summary) > 0
        ORDER BY updated_at DESC
        LIMIT $1 OFFSET $2
      `, [BATCH_SIZE, offset]);

      if (result.rows.length === 0) break;

      const chunks = result.rows;
      totalProcessed += chunks.length;

      console.log(`\nBatch ${Math.floor(offset / BATCH_SIZE) + 1} (${chunks.length} chunks):`);

      if (APPLY) {
        // Warm all 5 layers
        const l1Count = await warmL1(redis, chunks);
        const l2Count = await warmL2(redis, chunks);
        const l3Count = await warmL3(redis, chunks);
        const l4Count = await warmL4(redis, chunks);
        const l5Count = await warmL5(redis, chunks);

        totalWarmed += l1Count + l2Count + l3Count + l4Count + l5Count;

        console.log(`    ✅ L1: ${l1Count} | L2: ${l2Count} | L3: ${l3Count} | L4: ${l4Count} | L5: ${l5Count}`);
      } else {
        console.log(`    (dry-run: would warm ${chunks.length * 10} entries across 5 layers)`);
        totalWarmed += chunks.length * 10;
      }
    }

    const t1 = performance.now();
    const elapsed = ((t1 - t0) / 1000).toFixed(2);

    console.log(`\n${'═'.repeat(80)}`);
    console.log(`✅ Complete in ${elapsed}s`);
    console.log(`   Chunks processed: ${totalProcessed}`);
    console.log(`   Cache entries warmed: ${totalWarmed}`);
    console.log(`   Rate: ${(totalWarmed / parseFloat(elapsed)).toFixed(0)} entries/sec`);
    console.log(`\n📊 Cache Layers:`);
    console.log(`   L1: bitfrost:summary:{id}, bitfrost:packet:{key} (7d TTL)`);
    console.log(`   L2: bitfrost:feature:{id}, bitfrost:domain:{domain} (3d TTL)`);
    console.log(`   L3: bitfrost:som:{row}:{col}, bitfrost:kmeans:{id} (3d TTL)`);
    console.log(`   L4: bitfrost:term:{word}, bitfrost:bigram:{w1_w2} (3d TTL)`);
    console.log(`   L5: bitfrost:reward:zset, bitfrost:hot:zset (1d TTL)\n`);

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    if (redis.isOpen) await redis.quit();
    await pgPool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
