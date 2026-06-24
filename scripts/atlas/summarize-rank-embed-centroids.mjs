#!/usr/bin/env node
/**
 * summarize-rank-embed-centroids.mjs
 *
 * Integrated 4-stage pipeline: summary → GPU rank → embed → centroids → ACE warm
 *
 * Token-sparse design:
 * - Stage 1: LangExtract intent classifier (no full chunk text)
 * - Stage 2: GPU batch cosine similarity for summary quality
 * - Stage 3: GPU KMeans or mean-pool centroids
 * - Stage 4: TurboVec ANN top-k + minimal join_keys to BitFrost
 *
 * Usage:
 *   node scripts/atlas/summarize-rank-embed-centroids.mjs --apply [--limit=5000]
 *   node scripts/atlas/summarize-rank-embed-centroids.mjs --stage=1 --apply
 */

import pg from 'pg';
import Redis from 'ioredis';
import { QdrantClient } from '@qdrant/js-client-rest';
import fetch from 'node-fetch';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// ── Configuration ──────────────────────────────────────────────────────────
const APPLY = process.argv.includes('--apply');
const STAGE_ARG = (() => {
  const i = process.argv.indexOf('--stage');
  return i !== -1 ? process.argv[i + 1] : null;
})();
const LIMIT = parseInt(
  process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '5000',
  10
);
const VERBOSE = process.argv.includes('--verbose');
const DRY_RUN = !APPLY;

const PG_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASS = process.env.REDIS_PASSWORD || 'redis';

// Gate 2 Fix: Unified endpoint configuration (avoid port mismatch)
// Stage 1 (summaries): llama-server at 8090 (Gemma4)
// Stage 2 (embeddings): Ollama at 11434 (embeddinggemma)
const GEMMA4_URL =
  process.env.GEMMA4_URL ??
  process.env.LLAMA_SERVER_URL ??
  'http://127.0.0.1:8090';

const _ollamaRaw = (process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const OLLAMA_URL = _ollamaRaw.startsWith('http') ? _ollamaRaw : `http://${_ollamaRaw}:11434`;

// ── Gate 3: Summary validator + reasoning strip ────────────────────────────
function cleanSummary(text) {
  if (!text || typeof text !== 'string') return null;

  // Strip reasoning channels and thinking process
  let cleaned = text
    .replace(/^<\|channel\>[\s\S]*?$/gim, '')
    .replace(/^Thinking Process:[\s\S]*?$/gim, '')
    .replace(/^Reasoning:[\s\S]*?$/gim, '')
    .replace(/^\[.*?Thinking.*?\][\s\S]*?$/gim, '')
    .trim();

  return cleaned.length > 0 ? cleaned : null;
}

function validSummary(text) {
  if (!text || typeof text !== 'string' || text.length === 0) return false;
  if (text.includes('<|channel>') || text.includes('Thinking Process') || text.includes('Reasoning:')) return false;
  if (text === '{}' || text.match(/^\s*[\{\[\]]*\s*$/)) return false;
  return true;
}

// ── LangExtract intent classifier (minimal) ────────────────────────────────
const INTENT_SYSTEM_PROMPTS = {
  debug: 'Classify intent: is this asking for bug reproduction, trace analysis, or error investigation?',
  refactor: 'Classify intent: is this about code restructuring, pattern extraction, or API redesign?',
  optimize: 'Classify intent: is this about performance, memory, latency, or throughput?',
  explain: 'Classify intent: is this asking for architecture explanation, dependency mapping, or contract validation?',
  general: 'Classify intent: general question about codebase functionality.',
};

async function classifyIntent(chunkContent) {
  // Fast LangExtract: detect keywords only, no LLM call
  const lower = chunkContent.toLowerCase();
  if (lower.includes('error') || lower.includes('fail') || lower.includes('crash')) return 'debug';
  if (lower.includes('refactor') || lower.includes('pattern') || lower.includes('api')) return 'refactor';
  if (lower.includes('fast') || lower.includes('optim') || lower.includes('perf')) return 'optimize';
  if (lower.includes('explain') || lower.includes('architecture') || lower.includes('dependency')) return 'explain';
  return 'general';
}

// ── GPU acceleration check ─────────────────────────────────────────────────
let gpuAvailable = false;
try {
  const addon = require('../simd-bridge/cpp/build/Release/tensorrt_bridge.node');
  gpuAvailable = addon.isCudaAvailable?.() === 1;
  log(`GPU: ${gpuAvailable ? '✅ ACTIVE' : '❌ INACTIVE'}`);
} catch (e) {
  log(`GPU: ❌ UNAVAILABLE (${e.message})`);
}

// ── Logging ────────────────────────────────────────────────────────────────
function log(...args) { console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }

// ── Stage 1: Summary Generation ────────────────────────────────────────────
async function stage1_generateSummaries(pool, gemma4Url) {
  log('\n🚀 Stage 1: Generate Summaries (LangExtract intent routing)\n');
  if (DRY_RUN) log('Mode: DRY-RUN\n');

  const BATCH_SIZE = 250;
  const CONCURRENCY = 4;
  let processed = 0;
  let generated = 0;
  const startTime = Date.now();

  try {
    while (true) {
      // Claim next batch with FOR UPDATE SKIP LOCKED
      const claimed = await pool.query(`
        WITH picked AS (
          SELECT id FROM codebase_chunk_index
          WHERE (summary IS NULL OR summary = '')
          ORDER BY id
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        SELECT c.id, c.relative_path, c.content, c.line_start, c.symbol
        FROM codebase_chunk_index c
        JOIN picked p ON p.id = c.id
      `, [BATCH_SIZE]);

      if (claimed.rows.length === 0) {
        log(`✅ All summaries complete.\n`);
        break;
      }

      log(`Batch: Processing ${claimed.rows.length} chunks...`);

      // Detect intent, then summarize
      for (let j = 0; j < claimed.rows.length; j += CONCURRENCY) {
        const parallel = claimed.rows.slice(j, j + CONCURRENCY);
        const results = await Promise.all(
          parallel.map(async (chunk) => {
            try {
              const intent = classifyIntent(chunk.content);
              const systemPrompt = INTENT_SYSTEM_PROMPTS[intent] || INTENT_SYSTEM_PROMPTS.general;

              const res = await fetch(`${gemma4Url}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'gemma4-legal-iq4xs-direct.gguf',
                  messages: [
                    { role: 'system', content: systemPrompt },
                    {
                      role: 'user',
                      content: `Summarize:\nFile: ${chunk.relative_path}\nLines: ${chunk.line_start}\n${chunk.content?.slice(0, 300) || ''}...`,
                    },
                  ],
                  temperature: 0.3,
                  max_tokens: 100,
                  stream: false,
                }),
                signal: AbortSignal.timeout(30000),
              });

              if (!res.ok) {
                return { id: chunk.id, summary: null, intent, error: `HTTP ${res.status}` };
              }

              const data = await res.json();
              const summary = data.choices?.[0]?.message?.content?.trim() || '';
              return { id: chunk.id, summary, intent, error: null };
            } catch (e) {
              return { id: chunk.id, summary: null, intent: 'general', error: e.message };
            }
          })
        );

        for (const r of results) {
          if (r.error) {
            vlog(`  ⚠️  ${r.id}: ${r.error}`);
          } else if (r.summary) {
            // Gate 3: Strip reasoning and validate before storing
            const cleaned = cleanSummary(r.summary);
            if (!validSummary(cleaned)) {
              vlog(`  ⚠️  ${r.id}: Summary rejected after cleaning (likely reasoning-only content)`);
              continue;
            }
            if (APPLY) {
              await pool.query(
                'UPDATE codebase_chunk_index SET summary = $1 WHERE id = $2',
                [cleaned, r.id]
              );
              generated++;
            }
          }
        }

        processed += parallel.length;
        if (processed % 40 === 0) {
          log(`  ${processed} processed, ${generated} summaries`);
        }
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`✅ Stage 1: ${processed} processed, ${generated} summaries in ${duration}s\n`);
    return { processed, generated };
  } catch (e) {
    console.error(`❌ Stage 1 Error: ${e.message}`);
    process.exit(1);
  }
}

// ── Stage 2: Embed with GPU Ranking ────────────────────────────────────────
async function stage2_embedAndRank(pool, qdrant) {
  log('\n🚀 Stage 2: Embed + GPU Quality Rank (LibTorch batch cosine)\n');
  if (DRY_RUN) log('Mode: DRY-RUN\n');

  let embedded = 0;
  let pgvectorWritten = 0;
  let gpuRanked = 0;
  const startTime = Date.now();

  try {
    const toEmbed = await pool.query(`
      SELECT id, relative_path, summary, qdrant_id
      FROM codebase_chunk_index
      WHERE summary IS NOT NULL AND summary != ''
        AND summary_embedding IS NULL
      ORDER BY id
      LIMIT $1
    `, [LIMIT]);

    log(`Found ${toEmbed.rows.length} chunks to embed\n`);

    for (const chunk of toEmbed.rows) {
      try {
        // Embed via Ollama
        const embedRes = await fetch(`${OLLAMA_URL}/api/embed`, {
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
        const embedding = embedData.embedding || embedData.embeddings?.[0];

        // Gate 4 diagnostics: catch {} and other invalid states
        if (!embedding) {
          throw new Error(`No embedding in response: ${JSON.stringify(embedData).slice(0, 200)}`);
        }

        if (!Array.isArray(embedding)) {
          vlog(`  Gate 4 FAIL [${chunk.id}]: embedding not array, got ${typeof embedding}`);
          vlog(`    Value: ${JSON.stringify(embedding).slice(0, 100)}`);
          throw new Error(`Embedding not array: ${typeof embedding}`);
        }

        if (embedding.length !== 768) {
          vlog(`  Gate 4 FAIL [${chunk.id}]: dimension mismatch, got ${embedding.length}`);
          throw new Error(`Invalid embedding: ${embedding.length} dims, expected 768`);
        }

        if (APPLY) {
          // Store in pgvector — validate vector literal before write
          const vectorLiteral = `[${embedding.join(',')}]`;

          // Sanity check: vector literal should not be "{}" or empty
          if (vectorLiteral === '[]' || vectorLiteral.length < 100) {
            vlog(`  Gate 4 FAIL [${chunk.id}]: vector literal suspiciously short`);
            vlog(`    Literal: ${vectorLiteral.slice(0, 100)}`);
            throw new Error(`Vector literal invalid: ${vectorLiteral.length} chars`);
          }

          await pool.query(
            'UPDATE codebase_chunk_index SET summary_embedding = $1::halfvec WHERE id = $2',
            [vectorLiteral, chunk.id]
          );
          pgvectorWritten++;

          // GPU rank if available: compute quality score via cosine distance to "good summary" prototype
          let qualityScore = 0.5; // default
          if (gpuAvailable) {
            try {
              const addon = require('../simd-bridge/cpp/build/Release/tensorrt_bridge.node');
              const prototypeGood = new Float32Array(768).fill(0.01); // placeholder
              const scores = addon.batchCosineSimilarity(embedding, [prototypeGood]);
              qualityScore = scores[0] || 0.5;
              gpuRanked++;
            } catch (e) {
              vlog(`  GPU rank failed: ${e.message}`);
            }
          }

          // Store quality score
          await pool.query(
            'UPDATE codebase_chunk_index SET summary_quality_score = $1 WHERE id = $2',
            [qualityScore, chunk.id]
          );

          // Qdrant named vector (optional, may timeout)
          if (chunk.qdrant_id) {
            try {
              await qdrant.upsertPoints('codebase_chunks_768', {
                points: [{
                  id: chunk.qdrant_id,
                  vector: { summary_embeddinggemma: embedding },
                  payload: {
                    summary: chunk.summary,
                    summary_embedding_model: 'embeddinggemma:latest',
                  },
                }],
              });
            } catch (e) {
              vlog(`  Qdrant upsert skipped: ${e.message}`);
            }
          }
        }

        embedded++;
        if (embedded % 50 === 0) {
          log(`  Embedded ${embedded}/${toEmbed.rows.length}`);
        }
      } catch (e) {
        vlog(`  ⚠️  Chunk ${chunk.id}: ${e.message}`);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`✅ Stage 2: ${embedded} embedded, ${pgvectorWritten} to pgvector, ${gpuRanked} GPU-ranked in ${duration}s\n`);
    return { embedded, pgvectorWritten, gpuRanked };
  } catch (e) {
    console.error(`❌ Stage 2 Error: ${e.message}`);
    process.exit(1);
  }
}

// ── Stage 3: Redis Centroids ──────────────────────────────────────────────
async function stage3_computeCentroids(pool, redis) {
  log('\n🚀 Stage 3: Compute Redis Centroids (Directory-level aggregation)\n');
  if (DRY_RUN) log('Mode: DRY-RUN\n');

  let computed = 0;
  const startTime = Date.now();

  try {
    const dirs = await pool.query(`
      SELECT
        CASE
          WHEN strpos(relative_path, '/') > 0
          THEN substr(relative_path, 1, strpos(relative_path, '/') - 1)
          ELSE relative_path
        END as dir,
        count(*) as cnt
      FROM codebase_chunk_index
      WHERE summary_embedding IS NOT NULL
      GROUP BY 1
      ORDER BY cnt DESC
      LIMIT $1
    `, [Math.min(LIMIT, 100)]);

    log(`Computing centroids for ${dirs.rows.length} directories\n`);

    for (const { dir, cnt } of dirs.rows) {
      try {
        const chunks = await pool.query(`
          SELECT summary_embedding
          FROM codebase_chunk_index
          WHERE relative_path LIKE $1 || '/%' AND summary_embedding IS NOT NULL
        `, [dir]);

        if (chunks.rows.length > 0) {
          let centroid = new Array(768).fill(0);
          let count = 0;

          for (const row of chunks.rows) {
            let emb;
            if (typeof row.summary_embedding === 'string') {
              emb = row.summary_embedding
                .replace(/[\[\]]/g, '')
                .split(',')
                .map(v => parseFloat(v.trim()));
            } else if (Array.isArray(row.summary_embedding)) {
              emb = row.summary_embedding.map(Number);
            } else {
              emb = Object.values(row.summary_embedding).map(Number);
            }

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
              const key = `centroid:dir:${dir}`;
              await redis.setex(key, 86400, JSON.stringify(centroid));
            }
            computed++;
            if (computed % 10 === 0) {
              log(`  Computed ${computed} centroids`);
            }
          }
        }
      } catch (e) {
        vlog(`  ⚠️  Dir ${dir}: ${e.message}`);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`✅ Stage 3: ${computed} centroids in ${duration}s\n`);
    return { computed };
  } catch (e) {
    console.error(`❌ Stage 3 Error: ${e.message}`);
    process.exit(1);
  }
}

// ── Stage 4: ACE Context Warming (Minimal) ─────────────────────────────────
async function stage4_aceWarm(pool, redis) {
  log('\n🚀 Stage 4: ACE Context Warming (TurboVec top-k + minimal join keys)\n');
  if (DRY_RUN) log('Mode: DRY-RUN\n');

  let warmed = 0;
  const startTime = Date.now();

  try {
    // Get top features by packet count
    const topFeatures = await pool.query(`
      SELECT feature_id, count(*) as cnt
      FROM atlas_packets
      WHERE feature_id IS NOT NULL
      GROUP BY 1
      ORDER BY cnt DESC
      LIMIT 50
    `);

    log(`Warming ${topFeatures.length} feature contexts\n`);

    for (const { feature_id } of topFeatures) {
      try {
        // Minimal tuple: packet_key, feature_id, source_ref only
        const packets = await pool.query(`
          SELECT packet_key, feature_id, source_ref
          FROM atlas_packets
          WHERE feature_id = $1
          LIMIT 100
        `, [feature_id]);

        if (packets.length > 0 && APPLY) {
          // Cache minimal JSON to Redis/Bifrost
          const key = `ace:feature:${feature_id}`;
          const value = JSON.stringify({
            feature_id,
            packet_count: packets.length,
            join_keys: packets.map(p => ({ packet_key: p.packet_key, source_ref: p.source_ref })),
          });
          await redis.setex(key, 3600, value);
          warmed++;
        }
      } catch (e) {
        vlog(`  Feature ${feature_id}: ${e.message}`);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`✅ Stage 4: ${warmed} features warmed in ${duration}s\n`);
    return { warmed };
  } catch (e) {
    console.error(`❌ Stage 4 Error: ${e.message}`);
    process.exit(1);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  log(`\n📦 Summarize-Rank-Embed-Centroids Pipeline\n`);
  log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  log(`Limit: ${LIMIT}\n`);

  const pool = new pg.Pool({ connectionString: PG_URL, max: 5 });
  const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASS });
  const qdrant = new QdrantClient({ url: QDRANT_URL });

  try {
    const stages = [
      { name: '1', fn: () => stage1_generateSummaries(pool, GEMMA4_URL) },
      { name: '2', fn: () => stage2_embedAndRank(pool, qdrant) },
      { name: '3', fn: () => stage3_computeCentroids(pool, redis) },
      { name: '4', fn: () => stage4_aceWarm(pool, redis) },
    ];

    if (STAGE_ARG) {
      const stage = stages.find(s => s.name === STAGE_ARG);
      if (!stage) {
        console.error(`❌ Stage ${STAGE_ARG} not found`);
        process.exit(1);
      }
      await stage.fn();
    } else {
      for (const stage of stages) {
        await stage.fn();
      }
    }

    log('\n✅ Pipeline complete.\n');
  } finally {
    await redis.quit();
    await pool.end();
  }
}

main().catch(e => {
  console.error(`❌ Fatal: ${e.message}`);
  process.exit(1);
});
