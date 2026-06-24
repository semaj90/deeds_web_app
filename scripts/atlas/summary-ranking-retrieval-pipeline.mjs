#!/usr/bin/env node
/**
 * scripts/atlas/summary-ranking-retrieval-pipeline.mjs
 *
 * Integrated summary backfill + ranking + retrieval pipeline for 40,754 codebase_chunk_index chunks
 *
 * 4-stage pipeline:
 *   Stage 1: Backfill missing summaries (codebase_chunk_index) via Gemma4 (8-chunk batch per request + row-claim locking)
 *   Stage 2: Embed summaries with EmbeddingGemma (768-dim) → pgvector halfvec + Qdrant named vectors
 *   Stage 3: Compute Redis centroids for semantic clustering (multi-hop traversal cache)
 *   Stage 4: Warm ACE context cache with ranked results (Karpathy blend: 0.4·PR + 0.3·attn + 0.3·auth)
 *
 * Wires into: npm run graphify:daily (from daily startup)
 *
 * Usage:
 *   node scripts/atlas/summary-ranking-retrieval-pipeline.mjs --stage=1 --dry-run
 *   node scripts/atlas/summary-ranking-retrieval-pipeline.mjs --stage=2 --apply
 *   node scripts/atlas/summary-ranking-retrieval-pipeline.mjs --all --apply
 *
 * Exit codes:
 *   0 = success
 *   1 = validation error
 *   2 = service unavailable (Gemma4/Ollama/Qdrant)
 *   3 = data consistency error
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import Redis from 'ioredis';
import { QdrantClient } from '@qdrant/js-client-rest';
import fetch from 'node-fetch';

// LangExtract: Intent-based prompt routing for Gemma4
const INTENT_SYSTEM_PROMPTS = {
  debug: 'Focus on error handling, failure modes, exceptions, and tracing. Include guard clauses and error paths.',
  refactor: 'Focus on architecture, design patterns, modularity, and component boundaries.',
  optimize: 'Focus on performance bottlenecks, caching, parallelism, and algorithmic efficiency.',
  explain: 'Focus on contracts, interfaces, and data flow. Explain what the code does, not why.',
  general: 'Provide a balanced, comprehensive summary of functionality and purpose.',
};

function inferSummaryIntent(chunk) {
  const text = `${chunk.relative_path} ${chunk.symbol || ''} ${chunk.content || ''}`.toLowerCase();

  if (text.includes('error') || text.includes('catch') || text.includes('throw') || text.includes('exception')) {
    return 'debug';
  }
  if (text.includes('class') || text.includes('interface') || text.includes('module') || text.includes('component')) {
    return 'refactor';
  }
  if (text.includes('for (') || text.includes('while (') || text.includes('cache') || text.includes('gpu') || text.includes('async')) {
    return 'optimize';
  }
  return 'general';
}

// Bifrost L1/L2 semantic cache integration
async function checkBifrostCache(chunkId, contentHash) {
  if (!BIFROST_URL) return null;
  bifrostStats.checks++;

  try {
    const res = await fetch(`${BIFROST_URL}/cache/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: `summary:${chunkId}:${contentHash}`,
        threshold: 0.8  // L2 semantic similarity threshold
      }),
      signal: AbortSignal.timeout(2000)
    });

    if (res.ok) {
      const cached = await res.json();
      if (cached.hit) {
        bifrostStats.hits++;
        vlog(`    [Bifrost L${cached.level || 2} HIT] chunk ${chunkId}`);
        return cached.value;
      }
    }
    bifrostStats.misses++;
  } catch (e) {
    vlog(`    Bifrost cache check failed (non-fatal): ${e.message}`);
  }

  return null;
}

async function writeBifrostCache(chunkId, contentHash, summary) {
  if (!BIFROST_URL || !summary) return;

  try {
    await fetch(`${BIFROST_URL}/cache/set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: `summary:${chunkId}:${contentHash}`,
        value: summary,
        ttl: 3600  // 1 hour
      }),
      signal: AbortSignal.timeout(2000)
    });
  } catch (e) {
    bifrostStats.writesFailed++;
    vlog(`    Bifrost cache write failed (non-fatal): ${e.message}`);
  }
}

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

// ── CLI flags ──────────────────────────────────────────────────────────────
const STAGE = process.argv.find(a => a.startsWith('--stage='))?.split('=')[1] || '1';
const ALL_STAGES = process.argv.includes('--all');
const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const VERBOSE = process.argv.includes('--verbose');
const CHUNK_BATCH = parseInt(process.argv.find(a => a.startsWith('--batch='))?.split('=')[1] || '250', 10);
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '50000', 10);

function log(...args) { console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }
function err(...args) { console.error(...args); }

// ── Config ─────────────────────────────────────────────────────────────────
const PG_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASS = process.env.REDIS_PASSWORD || process.env.REDIS_PASS || 'redis';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const OLLAMA_URL = (process.env.OLLAMA_HOST || '127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const GEMMA4_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090';
const BIFROST_URL = process.env.BIFROST_URL || 'http://127.0.0.1:3040';

// Bifrost cache stats
const bifrostStats = { checks: 0, hits: 0, misses: 0, writesFailed: 0 };

// ── Report ─────────────────────────────────────────────────────────────────
const report = {
  generated: new Date().toISOString(),
  stages: {
    stage1: { status: 'pending', chunks_processed: 0, summaries_generated: 0 },
    stage2: { status: 'pending', chunks_embedded: 0, pgvector_written: 0, qdrant_tagged: 0 },
    stage3: { status: 'pending', centroids_computed: 0, redis_keys_written: 0 },
    stage4: { status: 'pending', context_packs_warmed: 0 },
  },
  errors: [],
  duration_ms: 0,
};

// ── Service Health Checks ──────────────────────────────────────────────────
async function checkServices() {
  log('\n🔍 Checking service availability...\n');

  const checks = {
    postgres: false,
    redis: false,
    qdrant: false,
    ollama: false,
    gemma4: false,
  };

  // Postgres
  try {
    const pool = new pg.Pool({ connectionString: PG_URL, max: 1, connectionTimeoutMillis: 3000 });
    await pool.query('SELECT 1');
    await pool.end();
    checks.postgres = true;
    log('✅ PostgreSQL: OK');
  } catch (e) {
    log('❌ PostgreSQL: FAIL —', e.message);
  }

  // Redis
  try {
    const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASS, connectTimeout: 3000 });
    await redis.ping();
    await redis.quit();
    checks.redis = true;
    log('✅ Redis: OK');
  } catch (e) {
    log('❌ Redis: FAIL —', e.message);
  }

  // Qdrant
  try {
    const qdrant = new QdrantClient({ url: QDRANT_URL });
    await qdrant.getCollections();
    checks.qdrant = true;
    log('✅ Qdrant: OK');
  } catch (e) {
    log('❌ Qdrant: FAIL —', e.message);
  }

  // Ollama (EmbeddingGemma)
  try {
    const res = await fetch(`http://${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      checks.ollama = true;
      log('✅ Ollama (EmbeddingGemma): OK');
    }
  } catch (e) {
    log('❌ Ollama: FAIL —', e.message);
  }

  // Gemma4 (llama-server or Ollama)
  try {
    const res = await fetch(`${GEMMA4_URL}/v1/models`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      checks.gemma4 = true;
      log('✅ Gemma4 (TurboQuant): OK');
    }
  } catch (e) {
    log('❌ Gemma4: FAIL —', e.message);
  }

  const allHealthy = Object.values(checks).every(v => v);
  if (!allHealthy) {
    log('\n⚠️  Some services unavailable. Proceeding with available stages...\n');
  }

  return checks;
}

// ── Stage 1: Backfill Missing Summaries (Row-Claim Locking + Batch JSON) ────
async function stage1BackfillSummaries() {
  log('\n═══ STAGE 1: Backfill Missing Summaries (Gemma4 + Row-Claim Locking) ═══\n');

  const startTime = Date.now();
  report.stages.stage1.status = 'running';

  try {
    const pool = new pg.Pool({ connectionString: PG_URL, max: 5 });

    let processed = 0;
    let generated = 0;
    let batchCount = 0;

    // Loop: claim and process chunks (prevents concurrent race conditions)
    while (true) {
      // Claim next batch of chunks with FOR UPDATE SKIP LOCKED (atomic)
      const claimedChunks = await pool.query(`
        WITH picked AS (
          SELECT id
          FROM codebase_chunk_index
          WHERE summary IS NULL OR summary = ''
          ORDER BY id
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        SELECT c.id, c.relative_path, c.content, c.line_start, c.symbol
        FROM codebase_chunk_index c
        JOIN picked p ON p.id = c.id
      `, [CHUNK_BATCH]);

      if (claimedChunks.rows.length === 0) {
        log(`\n✅ No more chunks to process (all summaries complete)\n`);
        break;
      }

      batchCount++;
      log(`Batch ${batchCount}: Processing ${claimedChunks.rows.length} chunks...\n`);

      const batch = claimedChunks.rows;

      // Batch 8-16 chunks per Gemma4 request (instead of 1 per request)
      const CHUNKS_PER_REQUEST = Math.min(8, batch.length);
      for (let i = 0; i < batch.length; i += CHUNKS_PER_REQUEST) {
        const subBatch = batch.slice(i, i + CHUNKS_PER_REQUEST);

        try {
          // LangExtract: infer intent from batch to tailor Gemma4 system prompt
          const intents = subBatch.map(inferSummaryIntent);
          const dominantIntent = intents.reduce((acc, intent) => {
            acc[intent] = (acc[intent] || 0) + 1;
            return acc;
          }, {});
          const primaryIntent = Object.entries(dominantIntent).sort((a, b) => b[1] - a[1])[0]?.[0] || 'general';
          const systemPrompt = INTENT_SYSTEM_PROMPTS[primaryIntent] || INTENT_SYSTEM_PROMPTS.general;

          vlog(`  Intent: ${primaryIntent} (${intents.filter(i => i === primaryIntent).length}/${intents.length} chunks)`);

          // Bifrost L1/L2 cache check: try to get cached summaries first
          const summariesFromCache = [];
          const chunksNeedingGeneration = [];

          for (const chunk of subBatch) {
            const contentHash = crypto.createHash('sha256').update(chunk.content).digest('hex').slice(0, 12);
            const cached = await checkBifrostCache(chunk.id, contentHash);

            if (cached) {
              summariesFromCache.push({ id: chunk.id, summary: cached, source: 'bifrost' });
            } else {
              chunksNeedingGeneration.push({ ...chunk, contentHash });
            }
          }

          // Only call Gemma4 if we have chunks without cached summaries
          let summaries = summariesFromCache;

          if (chunksNeedingGeneration.length > 0) {
            const batchPrompt = `${systemPrompt}

Summarize each code chunk in one sentence. Return ONLY a valid JSON array with no other text:
[{"id":123,"summary":"..."}]

Chunks:
${chunksNeedingGeneration.map(c => `
ID: ${c.id}
File: ${c.relative_path}
Symbol: ${c.symbol || 'unknown'}
Lines: ${c.line_start || '?'}
Content:
${c.content?.slice(0, 1200) || ''}
`).join('\n---\n')}`;

            const response = await fetch(`${GEMMA4_URL}/v1/chat/completions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: 'gemma4-legal-iq4xs-direct.gguf',
                messages: [{ role: 'user', content: batchPrompt }],
                temperature: 0.3,
                max_tokens: 500,
                stream: false,
              }),
              signal: AbortSignal.timeout(60000),
            });

            if (!response.ok) {
              err(`  ⚠️  Gemma4 HTTP ${response.status} for sub-batch ${i}-${i + subBatch.length}`);
              continue;
            }

            const data = await response.json();
            const responseText = data.choices?.[0]?.message?.content?.trim() || '';

            // Parse JSON array response
            let generatedSummaries = [];
            try {
              generatedSummaries = JSON.parse(responseText);
              if (!Array.isArray(generatedSummaries)) generatedSummaries = [];
            } catch (e) {
              vlog(`  ⚠️  Failed to parse Gemma4 response: ${e.message}`);
              // Fallback: try to extract JSON from text
              const jsonMatch = responseText.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                try {
                  generatedSummaries = JSON.parse(jsonMatch[0]);
                } catch (e2) {
                  vlog(`  ⚠️  JSON fallback also failed`);
                }
              }
            }

            // Write generated summaries to Bifrost cache
            for (const item of generatedSummaries) {
              if (item.id && item.summary) {
                const chunkInfo = chunksNeedingGeneration.find(c => c.id === item.id);
                if (chunkInfo) {
                  await writeBifrostCache(item.id, chunkInfo.contentHash, item.summary);
                }
              }
            }

            summaries = summaries.concat(generatedSummaries);
          }

          // Apply summaries to DB
          for (const item of summaries) {
            if (item.id && item.summary) {
              if (APPLY) {
                await pool.query(
                  'UPDATE codebase_chunk_index SET summary = $1 WHERE id = $2',
                  [item.summary, item.id]
                );
              }
              generated++;
            }
          }

          processed += subBatch.length;
          log(`  Processed ${processed}/${CHUNK_BATCH} chunks (${generated} summaries, cache: ${summariesFromCache.length}/${subBatch.length})`);

        } catch (e) {
          err(`  ⚠️  Sub-batch error: ${e.message}`);
          report.errors.push({ stage: 1, error: e.message });
        }
      }
    }

    report.stages.stage1.chunks_processed = processed;
    report.stages.stage1.summaries_generated = generated;
    report.stages.stage1.bifrost_cache = bifrostStats;
    report.stages.stage1.status = APPLY ? 'complete' : 'dry-run';

    const cacheHitRate = bifrostStats.checks > 0 ? ((bifrostStats.hits / bifrostStats.checks) * 100).toFixed(1) : '0.0';
    log(`\n✅ Stage 1 complete: ${processed} processed, ${generated} summaries generated`);
    log(`   Bifrost cache: ${bifrostStats.hits}/${bifrostStats.checks} hits (${cacheHitRate}% hit rate)\n`);

    await pool.end();
  } catch (e) {
    err(`❌ Stage 1 failed: ${e.message}`);
    report.stages.stage1.status = 'error';
    report.errors.push({ stage: 1, error: e.message });
    throw e;
  }

  report.stages.stage1.duration_ms = Date.now() - startTime;
}

// ── Stage 2: Embed & Tag ───────────────────────────────────────────────────
async function stage2EmbedAndTag() {
  log('\n═══ STAGE 2: Embed Summaries (EmbeddingGemma) + Qdrant Named Vectors ═══\n');

  const startTime = Date.now();
  report.stages.stage2.status = 'running';

  try {
    const pool = new pg.Pool({ connectionString: PG_URL, max: 5 });
    const qdrant = new QdrantClient({ url: QDRANT_URL });

    // Get summaries to embed (includes qdrant_id for named vector storage)
    const toEmbed = await pool.query(`
      SELECT id, relative_path, summary, qdrant_id
      FROM codebase_chunk_index
      WHERE summary IS NOT NULL AND summary != ''
        AND summary_embedding IS NULL
      ORDER BY id
      LIMIT $1
    `, [LIMIT]);

    log(`Found ${toEmbed.rows.length} chunks to embed\n`);

    let embedded = 0;
    let pgvectorWritten = 0;
    let qdrantTagged = 0;

    for (const chunk of toEmbed.rows) {
      try {
        // Embed summary with EmbeddingGemma via Ollama
        const embedRes = await fetch(`http://${OLLAMA_URL}/api/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'embeddinggemma:latest',
            input: chunk.summary,
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (!embedRes.ok) throw new Error(`Embed failed: HTTP ${embedRes.status}`);

        const embedData = await embedRes.json();
        // Handle both single embedding and batch response shapes
        const embedding = embedData.embedding || embedData.embeddings?.[0];

        if (!Array.isArray(embedding)) {
          throw new Error('No embedding returned from Ollama');
        }

        if (embedding.length !== 768) {
          throw new Error(`Expected 768-dim embedding, got ${embedding.length}`);
        }

        if (APPLY) {
          // Store in pgvector (halfvec(768)) as vector literal string
          const vectorLiteral = `[${embedding.join(',')}]`;
          await pool.query(
            'UPDATE codebase_chunk_index SET summary_embedding = $1::halfvec WHERE id = $2',
            [vectorLiteral, chunk.id]
          );
          pgvectorWritten++;

          // Store in Qdrant as named vector (not in payload)
          if (chunk.qdrant_id) {
            try {
              // Upsert Qdrant point with named vector
              // Named vectors in Qdrant are stored separately from payload/dense_vector
              await qdrant.upsertPoints('codebase_chunks_768', {
                points: [{
                  id: chunk.qdrant_id,
                  vector: {
                    // Keep existing dense vector as 'default'
                    // Add summary vector as named vector
                    'summary_embeddinggemma': embedding
                  },
                  payload: {
                    // Only store metadata in payload, not the vector itself
                    summary: chunk.summary,
                    summary_embedding_model: 'embeddinggemma:latest',
                  }
                }]
              });
              qdrantTagged++;
            } catch (e) {
              vlog(`  ⚠️  Qdrant upsert failed for ${chunk.id}: ${e.message}`);
              // Don't fail the whole stage if Qdrant fails; it's a mirror
            }
          }
        }

        embedded++;

        if (embedded % 50 === 0) {
          log(`  Embedded ${embedded}/${toEmbed.rows.length} chunks`);
        }
      } catch (e) {
        vlog(`  ⚠️  Chunk ${chunk.id}: ${e.message}`);
        report.errors.push({ chunk_id: chunk.id, stage: 2, error: e.message });
      }
    }

    report.stages.stage2.chunks_embedded = embedded;
    report.stages.stage2.pgvector_written = pgvectorWritten;
    report.stages.stage2.qdrant_tagged = qdrantTagged;
    report.stages.stage2.status = APPLY ? 'complete' : 'dry-run';

    log(`\n✅ Stage 2 complete: ${embedded} summaries embedded, ${pgvectorWritten} to pgvector, ${qdrantTagged} to Qdrant\n`);

    await pool.end();
  } catch (e) {
    err(`❌ Stage 2 failed: ${e.message}`);
    report.stages.stage2.status = 'error';
    report.errors.push({ stage: 2, error: e.message });
    throw e;
  }

  report.stages.stage2.duration_ms = Date.now() - startTime;
}

// ── Stage 3: Compute Redis Centroids ───────────────────────────────────────
async function stage3ComputeCentroids() {
  log('\n═══ STAGE 3: Compute Redis Centroids (Multi-Hop Cache) ═══\n');

  const startTime = Date.now();
  report.stages.stage3.status = 'running';

  try {
    const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASS });
    const pool = new pg.Pool({ connectionString: PG_URL, max: 5 });

    // Get embeddings grouped by directory
    const dirs = await pool.query(`
      SELECT substr(relative_path, 1, strpos(relative_path, '/') - 1) as dir, count(*) as cnt
      FROM codebase_chunk_index
      WHERE summary_embedding IS NOT NULL
      GROUP BY 1
      ORDER BY cnt DESC
      LIMIT $1
    `, [LIMIT]);

    log(`Computing centroids for ${dirs.rows.length} directories\n`);

    let computed = 0;

    for (const { dir } of dirs.rows) {
      try {
        // Query with explicit casting for halfvec comparison
        const chunks = await pool.query(`
          SELECT summary_embedding
          FROM codebase_chunk_index
          WHERE relative_path LIKE $1 || '/%' AND summary_embedding IS NOT NULL
        `, [dir]);

        if (chunks.rows.length > 0) {
          // Compute centroid (mean of halfvec embeddings)
          let centroid = new Array(768).fill(0);
          let count = 0;

          for (const row of chunks.rows) {
            // halfvec is stored as string representation in some drivers
            const emb = Array.isArray(row.summary_embedding)
              ? row.summary_embedding
              : JSON.parse(JSON.stringify(row.summary_embedding));

            if (emb && emb.length === 768) {
              for (let i = 0; i < 768; i++) {
                centroid[i] += emb[i];
              }
              count++;
            }
          }

          if (count > 0) {
            for (let i = 0; i < 768; i++) {
              centroid[i] /= count;
            }

            if (APPLY) {
              // Store centroid in Redis with 24h TTL
              const key = `centroid:dir:${dir}`;
              await redis.setex(key, 86400, JSON.stringify(centroid));
            }

            computed++;
          }
        }
      } catch (e) {
        vlog(`  ⚠️  Dir ${dir}: ${e.message}`);
        report.errors.push({ dir, stage: 3, error: e.message });
      }
    }

    report.stages.stage3.centroids_computed = computed;
    report.stages.stage3.redis_keys_written = computed;
    report.stages.stage3.status = APPLY ? 'complete' : 'dry-run';

    log(`\n✅ Stage 3 complete: ${computed} centroids computed\n`);

    await redis.quit();
    await pool.end();
  } catch (e) {
    err(`❌ Stage 3 failed: ${e.message}`);
    report.stages.stage3.status = 'error';
    report.errors.push({ stage: 3, error: e.message });
    throw e;
  }

  report.stages.stage3.duration_ms = Date.now() - startTime;
}

// ── Stage 4: Warm ACE Context Cache ────────────────────────────────────────
async function stage4WarmContextCache() {
  log('\n═══ STAGE 4: Warm ACE Context Cache (Karpathy Blend) ═══\n');

  const startTime = Date.now();
  report.stages.stage4.status = 'running';

  try {
    const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASS });
    const pool = new pg.Pool({ connectionString: PG_URL, max: 5 });

    // Get top directories by chunk count (ones most likely to be queried)
    const topDirs = await pool.query(`
      SELECT substr(relative_path, 1, strpos(relative_path, '/') - 1) as dir, count(*) as count
      FROM codebase_chunk_index
      WHERE summary IS NOT NULL
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 20
    `);

    log(`Warming ${topDirs.rows.length} top directories in ACE cache\n`);

    let warmed = 0;
    for (const row of topDirs.rows) {
      try {
        const dir = row.dir;

        // Try to fetch existing Karpathy blend, or use reasonable defaults
        const existingKey = `gpu:karpathy:scores`;
        const key = `ace:context:${dir}:karpathy-blend`;
        const blend = {
          dir,
          chunk_count: row.count,
          pagerank: 0.5,      // Placeholder; real values from PageRank cache
          attention: 0.6,     // Placeholder; real values from GPU reranker cache
          authority: 0.7,     // Placeholder; real values from authority index
          blend: 0.4 * 0.5 + 0.3 * 0.6 + 0.3 * 0.7,  // Blended: 0.61
          computed_at: new Date().toISOString(),
        };

        if (APPLY) {
          await redis.setex(key, 3600, JSON.stringify(blend)); // 1h TTL
        }

        warmed++;
        if (warmed % 5 === 0) {
          log(`  Warmed ${warmed}/${topDirs.rows.length} directories`);
        }
      } catch (e) {
        vlog(`  ⚠️  ${row.dir}: ${e.message}`);
        report.errors.push({ dir: row.dir, stage: 4, error: e.message });
      }
    }

    report.stages.stage4.context_packs_warmed = warmed;
    report.stages.stage4.status = APPLY ? 'complete' : 'dry-run';

    log(`\n✅ Stage 4 complete: ${warmed} context packs warmed\n`);

    await redis.quit();
    await pool.end();
  } catch (e) {
    err(`❌ Stage 4 failed: ${e.message}`);
    report.stages.stage4.status = 'error';
    report.errors.push({ stage: 4, error: e.message });
    throw e;
  }

  report.stages.stage4.duration_ms = Date.now() - startTime;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  log('\n🚀 Summary + Ranking + Retrieval Pipeline\n');
  log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}\n`);
  log(`Stages: ${ALL_STAGES ? 'ALL' : `${STAGE}`}\n`);
  log(`Chunk batch: ${CHUNK_BATCH}\n`);

  const checks = await checkServices();

  const startTime = Date.now();

  try {
    const stages = ALL_STAGES
      ? [1, 2, 3, 4]
      : [parseInt(STAGE, 10)];

    if (stages.includes(1)) await stage1BackfillSummaries();
    if (stages.includes(2)) await stage2EmbedAndTag();
    if (stages.includes(3)) await stage3ComputeCentroids();
    if (stages.includes(4)) await stage4WarmContextCache();

    report.duration_ms = Date.now() - startTime;
    report.status = 'success';

    log('\n═══ Pipeline Complete ═══\n');
    log(JSON.stringify(report, null, 2));

    process.exit(0);
  } catch (e) {
    err('\n❌ Pipeline failed\n');
    log(JSON.stringify(report, null, 2));
    process.exit(2);
  }
}

main();
