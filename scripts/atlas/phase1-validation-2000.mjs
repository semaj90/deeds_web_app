#!/usr/bin/env node
import pg from 'pg';
import Redis from 'ioredis';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '../..');
const REPORTS_DIR = join(ROOT, 'docs/reports');

const PG_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASS = process.env.REDIS_PASSWORD || 'redis';

const LIMIT = 2000;
const VERBOSE = process.argv.includes('--verbose');

const results = {
  timestamp: new Date().toISOString(),
  test: 'phase1-validation-2000-chunks',
  config: { limit: LIMIT },
  metrics: {
    total_chunks: 0,
    with_summary: 0,
    with_summary_embedding: 0,
    cache_l1_hits: 0,
    cache_l1_misses: 0,
    total_duration_ms: 0,
  },
  provenance_sample: [],
  gaps: {
    missing_summary: 0,
    missing_summary_embedding: 0,
    missing_feature_id: 0,
    missing_source_ref: 0,
    missing_qdrant_id: 0,
  },
};

function log(...args) {
  console.log(args.join(' '));
}

async function measurePhase1(pool, redis) {
  log(`\n📊 Phase 1 Validation: ${LIMIT}-Chunk Scale\n`);

  const startTotal = Date.now();

  const query = `
    SELECT id, relative_path, content, summary, summary_embedding,
           symbol, kind, qdrant_id
    FROM codebase_chunk_index
    ORDER BY id LIMIT $1
  `;

  const chunks = await pool.query(query, [LIMIT]);
  const chunkRows = chunks.rows;

  log(`📦 Fetched ${chunkRows.length} chunks from Postgres\n`);
  results.metrics.total_chunks = chunkRows.length;

  // Coverage analysis
  const withSummary = chunkRows.filter(c => c.summary && c.summary.trim()).length;
  const withSummaryEmbed = chunkRows.filter(c => c.summary_embedding).length;
  const missingQdrantId = chunkRows.filter(c => !c.qdrant_id).length;

  results.metrics.with_summary = withSummary;
  results.metrics.with_summary_embedding = withSummaryEmbed;
  results.gaps.missing_summary = chunkRows.length - withSummary;
  results.gaps.missing_summary_embedding = chunkRows.length - withSummaryEmbed;
  results.gaps.missing_qdrant_id = missingQdrantId;

  log(`Coverage:`);
  log(`  Summaries:          ${withSummary}/${chunkRows.length} (${((withSummary/chunkRows.length)*100).toFixed(1)}%)`);
  log(`  Summary embeddings: ${withSummaryEmbed}/${chunkRows.length} (${((withSummaryEmbed/chunkRows.length)*100).toFixed(1)}%)`);
  log(`  Qdrant IDs:         ${chunkRows.length - missingQdrantId}/${chunkRows.length}\n`);

  // Cache layer analysis
  log(`🔍 Cache Layer: L1 (exact content hash)\n`);

  let l1Hits = 0, l1Misses = 0;
  let sampleCount = 0;

  for (let i = 0; i < chunkRows.length; i++) {
    const chunk = chunkRows[i];
    if (!chunk.summary) continue;

    // L1: content hash exact match
    const contentHash = crypto.createHash('sha256').update(chunk.content || '').digest('hex');
    const hashKey = `summary:${chunk.id}:${contentHash}`;

    const l1Hit = await redis.get(hashKey);
    if (l1Hit) {
      l1Hits++;
    } else {
      l1Misses++;
    }

    // Collect sample provenance
    if (sampleCount < 50) {
      results.provenance_sample.push({
        chunk_id: chunk.id,
        relative_path: chunk.relative_path,
        symbol: chunk.symbol,
        kind: chunk.kind,
        cache_l1: l1Hit ? 'HIT' : 'MISS',
        has_summary: !!chunk.summary,
        has_qdrant_id: !!chunk.qdrant_id,
      });
      sampleCount++;
    }

    if (VERBOSE && (i + 1) % 500 === 0) {
      log(`  Processed ${i + 1}/${chunkRows.length}...`);
    }
  }

  const totalWithSummary = l1Hits + l1Misses;
  const l1HitRate = totalWithSummary > 0 ? ((l1Hits / totalWithSummary) * 100).toFixed(1) : '0.0';

  log(`L1 Cache Hits:  ${l1Hits}/${totalWithSummary} (${l1HitRate}%)`);
  log(`L1 Cache Misses: ${l1Misses}/${totalWithSummary}\n`);

  results.metrics.cache_l1_hits = l1Hits;
  results.metrics.cache_l1_misses = l1Misses;

  const totalDuration = Date.now() - startTotal;
  results.metrics.total_duration_ms = totalDuration;

  log(`⏱️  Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);
  log(`    Throughput: ${((chunkRows.length / totalDuration) * 1000).toFixed(1)} chunks/sec\n`);
}

async function main() {
  log('╔════════════════════════════════════════════════════════════════════════════╗');
  log('║                    Phase 1 Validation: 2000-Chunk Scale                    ║');
  log('╚════════════════════════════════════════════════════════════════════════════╝');

  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const pool = new pg.Pool({ connectionString: PG_URL, max: 5 });
  const redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASS,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  try {
    await redis.connect();
    await measurePhase1(pool, redis);

    const reportPath = join(REPORTS_DIR, 'phase1-validation-2000.json');
    writeFileSync(reportPath, JSON.stringify(results, null, 2));

    log(`✅ Report saved: ${reportPath}`);
    log(`   Provenance sample: ${results.provenance_sample.length} entries\n`);

  } catch (e) {
    console.error('ERROR:', e.message);
    results.error = e.message;
  } finally {
    await redis.quit();
    await pool.end();
  }
}

main();
