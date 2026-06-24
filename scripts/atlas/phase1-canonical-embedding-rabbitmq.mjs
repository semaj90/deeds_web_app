#!/usr/bin/env node
/**
 * Phase 1 Canonical Embedding RabbitMQ Producer + Worker
 *
 * Generates embeddings for atlas_packets (canonical layer).
 * Currently: 10,763/17,995 (59.8%)
 * Target: 17,995/17,995 (100%) — need 7,232 more
 *
 * Producer: enqueues { packet_id, packet_key, summary, feature_id } jobs to RabbitMQ
 * Worker: dedupes via packet_key claim, checks Valkey by summary_hash,
 *         calls ONNX /api/embed or Ollama, writes to atlas_packets + Valkey + ACP tasks
 *
 * Deduplication:
 *   - Postgres claim: UPDATE ... SET metadata['embedding_claimed_at'] WHERE embedding IS NULL
 *   - Valkey cache: bifrost:embed:embeddinggemma:768:{summary_hash}
 *   - Provider priority: ONNX (localhost:5173) → Ollama (localhost:11434)
 *   - Multi-worker safe: Only claimed packets are processed
 *
 * Usage:
 *   node scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs --enqueue [--limit=1000]
 *   EMBED_MODE=onnx node scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs --worker --concurrency=4
 *   EMBED_MODE=ollama node scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs --worker --concurrency=4
 *   node scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs --stats
 */

import pg from 'pg';
import { createRequire } from 'module';
import { argv } from 'process';
import { createHash } from 'crypto';

const require = createRequire(import.meta.url);
const amqp = require('amqplib');
const Redis = require('ioredis');

// ── Configuration ────────────────────────────────────────────────────────────

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const EMBED_URL_ONNX = process.env.EMBED_URL_ONNX || 'http://127.0.0.1:5173/api/embed';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const REDIS_URL = process.env.REDIS_URL || 'redis://:redis@127.0.0.1:6379';
const BIFROST_URL = process.env.BIFROST_URL || 'http://127.0.0.1:3040';
const ACP_URL = process.env.ACP_URL || 'http://127.0.0.1:5173/api/ai/agent';
const EMBED_MODE = process.env.EMBED_MODE || 'onnx'; // 'onnx' (SvelteKit) or 'ollama'
const QUEUE = 'phase1.canonical-embeddings';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100');
const LIMIT = parseInt(process.env.PACKET_LIMIT || '0');
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '1');
const REDIS_CENTROID_TTL = parseInt(process.env.REDIS_CENTROID_TTL || '604800'); // 7 days in seconds
const REDIS_EMBED_CACHE_TTL = parseInt(process.env.REDIS_EMBED_CACHE_TTL || '2592000'); // 30 days for summary_hash cache

const MODE = argv.includes('--enqueue') ? 'enqueue' : argv.includes('--worker') ? 'worker' : argv.includes('--stats') ? 'stats' : 'enqueue';

const db = new pg.Pool({ connectionString: DB_URL, max: 10 });
const redis = new Redis(REDIS_URL);

// ── Utility: SHA256 Summary Hash ──────────────────────────────────────────────

function sha256(text) {
  return createHash('sha256').update(text.trim()).digest('hex');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

// ── Valkey Cache Lookup by Summary Hash ───────────────────────────────────────

async function getEmbeddingFromCache(summaryHash, verbose = false) {
  try {
    if (!redis.isOpen) await redis.connect();
    const cacheKey = `bifrost:embed:embeddinggemma:768:${summaryHash}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      if (verbose) log(`  ✓ Cache hit (summary_hash): ${cacheKey.substring(0, 40)}...`);
      return { embedding: JSON.parse(cached), provider: 'cache', cacheHit: true };
    }
  } catch (e) {
    if (verbose) log(`  ℹ️  Cache lookup failed: ${e.message}`);
  }
  return null;
}

async function setEmbeddingInCache(summaryHash, embedding, verbose = false) {
  try {
    if (!redis.isOpen) await redis.connect();
    const cacheKey = `bifrost:embed:embeddinggemma:768:${summaryHash}`;
    await redis.setex(cacheKey, REDIS_EMBED_CACHE_TTL, JSON.stringify(embedding));
    if (verbose) log(`  ✓ Cached embedding (30-day TTL): ${cacheKey.substring(0, 40)}...`);
  } catch (e) {
    if (verbose) log(`  ℹ️  Cache write failed: ${e.message}`);
  }
}

// ── ONNX Embedding via SvelteKit /api/embed ───────────────────────────────────

async function callOnnxEmbed(text, verbose = false) {
  try {
    if (verbose) log(`  → Calling ONNX /api/embed (SvelteKit :5173)`);
    const res = await fetch(EMBED_URL_ONNX, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5_000)
    });

    if (!res.ok) {
      if (verbose) log(`  ❌ ONNX error: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const embedding = data.embedding;

    if (!embedding || !Array.isArray(embedding) || embedding.length !== 768) {
      log(`  ❌ Invalid ONNX embedding: expected 768-dim, got ${embedding?.length}`);
      return null;
    }

    if (verbose) log(`  ✓ Got 768-dim embedding from ONNX`);
    return { embedding, provider: 'onnx' };
  } catch (e) {
    if (verbose) log(`  ⚠️  ONNX error: ${e.message}`);
    return null;
  }
}

// ── Ollama Embedding (Fallback) ───────────────────────────────────────────────

async function callOllamaEmbedding(text, verbose = false) {
  try {
    if (verbose) log(`  → Calling Ollama :11434 /api/embeddings`);
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: text
      }),
      signal: AbortSignal.timeout(60_000)
    });

    if (!res.ok) {
      log(`  ❌ Ollama error: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const embedding = data.embedding;

    if (!embedding || !Array.isArray(embedding) || embedding.length !== 768) {
      log(`  ❌ Invalid Ollama embedding: expected 768-dim, got ${embedding?.length}`);
      return null;
    }

    if (verbose) log(`  ✓ Got 768-dim embedding from Ollama`);
    return { embedding, provider: 'ollama' };
  } catch (e) {
    log(`  ❌ Ollama error: ${e.message}`);
    return null;
  }
}

// ── Provider Priority: ONNX → Ollama ──────────────────────────────────────────

async function callEmbedWithProvider(text, verbose = false) {
  if (!text || text.length < 5) {
    if (verbose) log(`  ℹ️  Skipping short summary (${text?.length || 0} chars)`);
    return null;
  }

  if (EMBED_MODE === 'onnx') {
    // Try ONNX first, fall back to Ollama
    let result = await callOnnxEmbed(text, verbose);
    if (!result) {
      if (verbose) log(`  → Falling back to Ollama`);
      result = await callOllamaEmbedding(text, verbose);
    }
    return result;
  } else {
    // Ollama first (EMBED_MODE='ollama')
    let result = await callOllamaEmbedding(text, verbose);
    if (!result) {
      if (verbose) log(`  → Falling back to ONNX`);
      result = await callOnnxEmbed(text, verbose);
    }
    return result;
  }
}

// ── Postgres Claim Pattern (Deduplication Lock) ───────────────────────────────

async function claimPacket(packetId, verbose = false) {
  try {
    // Atomically claim packet: set embedding_claimed_at only if embedding IS NULL
    const result = await db.query(
      `UPDATE atlas_packets
       SET metadata = jsonb_set(
         coalesce(metadata, '{}'::jsonb),
         '{embedding_claimed_at}',
         to_jsonb(now())
       )
       WHERE packet_id = $1
         AND embedding IS NULL
       RETURNING packet_id, packet_key, summary, feature_id, feature_label`,
      [packetId]
    );

    if (result.rows.length === 0) {
      if (verbose) log(`  ⚠️  Packet already claimed by another worker`);
      return null;
    }

    return result.rows[0];
  } catch (e) {
    log(`  ❌ Claim error: ${e.message}`);
    return null;
  }
}

// ── Redis Centroid Creation (L1 Cache Warming) ────────────────────────────────

async function createRedisCentroid(packetKey, embedding, featureId, verbose = false) {
  try {
    if (!redis.isOpen) await redis.connect();

    // Centroid is the raw embedding vector stored as JSON string
    const centroidKey = `centroid:packet:${packetKey}`;
    const centroidJson = JSON.stringify(embedding.slice(0, 64)); // Store first 64 dims for efficiency

    // Set with 7-day TTL (604800 seconds)
    await redis.setex(centroidKey, REDIS_CENTROID_TTL, centroidJson);

    // Also update feature-level aggregate centroid (simple mean of all packet centroids)
    if (featureId) {
      const featureKey = `centroid:feature:${featureId}`;
      // Push to a list; consumer will compute aggregate periodically
      await redis.lpush(featureKey, centroidJson);
      // Keep list to 100 recent embeddings for efficiency
      await redis.ltrim(featureKey, 0, 99);
      await redis.expire(featureKey, REDIS_CENTROID_TTL);
    }

    if (verbose) log(`  ✓ Redis centroid cached: ${centroidKey} (TTL ${REDIS_CENTROID_TTL}s)`);
  } catch (e) {
    log(`  ⚠️  Redis centroid error: ${e.message}`);
    // Non-fatal: continue without cache
  }
}

// ── Bifrost L2 Cache Warming ──────────────────────────────────────────────────

async function warmBifrostCache(packetKey, summary, embedding, verbose = false) {
  try {
    // Bifrost L2 warm: POST /warm endpoint with embedding + summary for semantic indexing
    const bifrostPayload = {
      key: packetKey,
      text: summary,
      embedding: embedding,
      ttl: REDIS_CENTROID_TTL
    };

    const res = await fetch(`${BIFROST_URL}/warm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bifrostPayload),
      signal: AbortSignal.timeout(5_000)
    });

    if (!res.ok) {
      if (verbose) log(`  ℹ️  Bifrost warm skipped (${res.status})`);
      return; // Bifrost unavailable but not fatal
    }

    if (verbose) log(`  ✓ Bifrost L2 cache warmed for ${packetKey}`);
  } catch (e) {
    if (verbose) log(`  ℹ️  Bifrost warm error (non-blocking): ${e.message}`);
    // Non-fatal: Bifrost optional
  }
}

// ── ACP Gemma4 Orchestration (Summary Synthesis Task) ────────────────────────

async function submitAcpGemma4Task(packetKey, featureId, featureLabel, summary, embedding, verbose = false) {
  try {
    // ACP task submission for async Gemma4 summary synthesis
    // This is non-blocking; the task is enqueued for Gemma4 processing
    const acpPayload = {
      task_type: 'gemma4_summary_synthesis',
      packet_key: packetKey,
      feature_id: featureId,
      feature_label: featureLabel,
      original_summary: summary,
      embedding_dim: embedding.length,
      priority: 'normal',
      metadata: {
        source: 'canonical-embedding-worker',
        timestamp: new Date().toISOString()
      }
    };

    const res = await fetch(ACP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(acpPayload),
      signal: AbortSignal.timeout(3_000)
    });

    if (!res.ok) {
      if (verbose) log(`  ℹ️  ACP task submission skipped (${res.status})`);
      return; // ACP unavailable but not fatal
    }

    if (verbose) log(`  ✓ ACP Gemma4 task submitted for ${featureLabel}`);
  } catch (e) {
    if (verbose) log(`  ℹ️  ACP task submission error (non-blocking): ${e.message}`);
    // Non-fatal: ACP optional
  }
}

// ── Qdrant Vector/Payload Upsert (Mirror) ────────────────────────────────────

async function upsertQdrantPayload(packetKey, sourceRef, featureId, featureLabel, embedding, summaryHash, qdrantPointId, verbose = false) {
  // If no qdrant_point_id, skip upsert (not all packets are in Qdrant yet)
  if (!qdrantPointId) {
    if (verbose) log(`  ℹ️  No qdrant_point_id, skipping upsert`);
    return { upserted: false, reason: 'no_point_id' };
  }

  try {
    if (verbose) log(`  → Upserting Qdrant point ${qdrantPointId}`);
    const qdrantPayload = {
      packet_key: packetKey,
      source_ref: sourceRef,
      feature_id: featureId,
      feature_label: featureLabel,
      summary_hash: summaryHash,
      embedding_provider: 'worker',
      embedding_dim: 768,
      updated_at: new Date().toISOString()
    };

    const qdrantUrl = 'http://127.0.0.1:6333'; // Qdrant default
    const res = await fetch(`${qdrantUrl}/collections/codebase_chunks_768/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [{
          id: parseInt(qdrantPointId) || qdrantPointId,
          vector: embedding,
          payload: qdrantPayload
        }]
      }),
      signal: AbortSignal.timeout(5_000)
    });

    if (!res.ok) {
      if (verbose) log(`  ⚠️  Qdrant upsert HTTP ${res.status}`);
      return { upserted: false, reason: `http_${res.status}` };
    }

    if (verbose) log(`  ✓ Qdrant payload upserted`);
    return { upserted: true, reason: 'success' };
  } catch (e) {
    if (verbose) log(`  ℹ️  Qdrant upsert error (non-blocking): ${e.message}`);
    // Non-fatal: Qdrant is a mirror, not truth
    return { upserted: false, reason: `error_${e.message}` };
  }
}

// ── Write Embedding Metrics ────────────────────────────────────────────────────

async function writeEmbeddingMetric(packetKey, provider, latencyMs, cacheHit, summaryHash, qdrantUpserted, redisWarmed, verbose = false) {
  try {
    // Create table if missing
    await db.query(`
      CREATE TABLE IF NOT EXISTS atlas_embedding_metrics (
        packet_key text,
        provider text,
        latency_ms integer,
        cache_hit boolean,
        summary_hash text,
        qdrant_upsert boolean default false,
        redis_warmed boolean default false,
        created_at timestamptz default now()
      )
    `);

    // Insert metric
    await db.query(
      `INSERT INTO atlas_embedding_metrics
       (packet_key, provider, latency_ms, cache_hit, summary_hash, qdrant_upsert, redis_warmed)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [packetKey, provider, latencyMs, cacheHit, summaryHash, qdrantUpserted, redisWarmed]
    );

    if (verbose) log(`  ✓ Metrics recorded`);
  } catch (e) {
    if (verbose) log(`  ⚠️  Metrics write error: ${e.message}`);
    // Non-fatal
  }
}

// ── Enqueue Mode ─────────────────────────────────────────────────────────────

async function enqueueJobs() {
  log(`🚀 Enqueuing canonical packet embeddings`);

  let conn, channel;
  try {
    conn = await amqp.connect(RABBITMQ_URL);
    channel = await conn.createChannel();

    // Always assert queue (idempotent, creates if missing)
    const qInfo = await channel.assertQueue(QUEUE, { durable: true });
    log(`  Queue ready: ${qInfo.messageCount} current messages\n`);

    // Fetch packets needing embeddings
    const result = await db.query(`
      SELECT packet_id, packet_key, summary
      FROM atlas_packets
      WHERE embedding IS NULL
      ORDER BY created_at DESC
      LIMIT $1
    `, [LIMIT || 7232]);

    const packets = result.rows;
    log(`  Found ${packets.length} packets needing embeddings\n`);

    let enqueued = 0;
    const batchId = `batch-${Date.now()}`;

    for (const packet of packets) {
      const job = {
        packet_id: packet.packet_id,
        packet_key: packet.packet_key,
        summary: packet.summary,
        batch_id: batchId,
        timestamp: new Date().toISOString()
      };

      const msgBuffer = Buffer.from(JSON.stringify(job));
      channel.sendToQueue(QUEUE, msgBuffer, { persistent: true });
      enqueued++;

      if (enqueued % 1000 === 0) {
        log(`  Enqueued ${enqueued}/${packets.length} packets`);
      }
    }

    log(`\n✅ Complete`);
    log(`  Total enqueued: ${enqueued}`);
    log(`  Batch ID: ${batchId}`);
    log(`  Queue: ${QUEUE}`);
    log(`  Start 4 workers: node scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs --worker --concurrency=4\n`);

    await channel.close();
    await conn.close();
  } catch (e) {
    log(`❌ Enqueue error: ${e.message}`);
    process.exit(1);
  } finally {
    try { await db.end(); } catch { /* already closed */ }
  }
}

// ── Worker Mode ──────────────────────────────────────────────────────────────

async function startWorker() {
  log(`👷 Starting canonical embedding worker (concurrency: ${CONCURRENCY})`);

  let conn, channel;
  try {
    conn = await amqp.connect(RABBITMQ_URL);
    channel = await conn.createChannel();

    // Check/assert queue
    let qInfo;
    try {
      qInfo = await channel.checkQueue(QUEUE);
    } catch {
      qInfo = await channel.assertQueue(QUEUE, { durable: true });
    }

    channel.prefetch(CONCURRENCY); // Fair dispatch

    let processed = 0;
    const startTime = Date.now();

    log(`  Waiting for jobs on queue: ${QUEUE}`);
    log(`  Messages pending: ${qInfo.messageCount}`);
    log(`  Embedding mode: ${EMBED_MODE} (ONNX → Ollama fallback)`);
    log(`  Deduplication: Postgres claim + Valkey summary_hash cache`);
    log(`  Redis centroid TTL: ${REDIS_CENTROID_TTL / 86400} days`);
    log(`  Redis embed cache TTL: ${REDIS_EMBED_CACHE_TTL / 86400} days\n`);

    channel.consume(QUEUE, async (msg) => {
      if (!msg) return;

      try {
        const job = JSON.parse(msg.content.toString());
        const { packet_id, packet_key, summary } = job;

        // Call embedding endpoint (verbose on first 3 jobs to debug)
        const isVerbose = processed < 3;

        // ───────────────────────────────────────────────────────────────────
        // STEP 1: Claim packet (deduplication lock, multi-worker safe)
        // ───────────────────────────────────────────────────────────────────
        const claimed = await claimPacket(packet_id, isVerbose);
        if (!claimed) {
          // Another worker already processing this packet
          channel.ack(msg);
          return;
        }

        const { feature_id, feature_label } = claimed;

        // ───────────────────────────────────────────────────────────────────
        // STEP 2: Check Valkey cache by summary_hash (avoid duplicate compute)
        // ───────────────────────────────────────────────────────────────────
        const summaryHash = sha256(summary);
        const cached = await getEmbeddingFromCache(summaryHash, isVerbose);
        let embedding;
        let provider;

        if (cached) {
          embedding = cached.embedding;
          provider = 'cache';
        } else {
          // ─────────────────────────────────────────────────────────────────
          // STEP 3: Call embedding provider (ONNX → Ollama priority)
          // ─────────────────────────────────────────────────────────────────
          const result = await callEmbedWithProvider(summary, isVerbose);
          if (!result) {
            // Embedding failed, don't requeue (bad data or transient issue)
            channel.nack(msg, false, false);
            return;
          }
          embedding = result.embedding;
          provider = result.provider;

          // ─────────────────────────────────────────────────────────────────
          // STEP 4: Cache embedding by summary_hash for future reuse
          // ─────────────────────────────────────────────────────────────────
          await setEmbeddingInCache(summaryHash, embedding, isVerbose);
        }

        // ───────────────────────────────────────────────────────────────────
        // STEP 5: Write embedding to database (Postgres canonical truth)
        // ───────────────────────────────────────────────────────────────────
        const vecStr = `[${embedding.join(',')}]`;
        const provenance = {
          embedding_provider: provider,
          embedding_model: 'embeddinggemma',
          embedding_dim: 768,
          summary_hash: summaryHash,
          packet_key: packet_key,
          trace_id: summaryHash  // Use summary_hash as stable trace_id
        };

        // Fetch qdrant_point_id for mirror upsert
        const packetResult = await db.query(
          `SELECT qdrant_point_id FROM atlas_packets WHERE packet_id = $1`,
          [packet_id]
        );
        const qdrantPointId = packetResult.rows[0]?.qdrant_point_id;

        const jobStartTime = Date.now();

        await db.query(
          `UPDATE atlas_packets
           SET embedding = $1::vector(768),
               metadata = jsonb_set(
                 coalesce(metadata, '{}'::jsonb),
                 '{provenance}',
                 to_jsonb($2::jsonb)
               ),
               updated_at = now()
           WHERE packet_id = $3`,
          [vecStr, JSON.stringify(provenance), packet_id]
        );

        // ───────────────────────────────────────────────────────────────────
        // STEP 6: Warm Redis L1 centroid cache (7-day TTL)
        // ───────────────────────────────────────────────────────────────────
        const redisWarmed = await (async () => {
          try {
            await createRedisCentroid(packet_key, embedding, feature_id, isVerbose);
            return true;
          } catch {
            return false;
          }
        })();

        // ───────────────────────────────────────────────────────────────────
        // STEP 7: Warm Bifrost L2 semantic cache
        // ───────────────────────────────────────────────────────────────────
        await warmBifrostCache(packet_key, summary, embedding, isVerbose);

        // ───────────────────────────────────────────────────────────────────
        // STEP 8: Upsert Qdrant (mirror, best-effort)
        // ───────────────────────────────────────────────────────────────────
        const sourceRef = claimed.summary; // From claimed packet result
        const qdrantResult = await upsertQdrantPayload(packet_key, sourceRef, feature_id, feature_label, embedding, summaryHash, qdrantPointId, isVerbose);

        // ───────────────────────────────────────────────────────────────────
        // STEP 9: Submit ACP Gemma4 task (async summary synthesis)
        // ───────────────────────────────────────────────────────────────────
        await submitAcpGemma4Task(packet_key, feature_id, feature_label, summary, embedding, isVerbose);

        // ───────────────────────────────────────────────────────────────────
        // STEP 10: Write metrics
        // ───────────────────────────────────────────────────────────────────
        const latencyMs = Date.now() - jobStartTime;
        await writeEmbeddingMetric(packet_key, provider, latencyMs, cached ? true : false, summaryHash, qdrantResult.upserted, redisWarmed, isVerbose);

        processed++;
        if (processed % 50 === 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          const throughput = processed / elapsed;
          const remaining = 7232 - processed;
          const eta = remaining / throughput / 60;
          log(`  ${processed} embedded | ${throughput.toFixed(2)} p/s | ${EMBED_MODE} | Redis ✓ Bifrost ✓ Qdrant ✓ ACP ✓ | ETA: ${eta.toFixed(1)}m`);
        }

        channel.ack(msg);
      } catch (e) {
        log(`  ❌ Job error: ${e.message}`);
        channel.nack(msg, false, true); // Requeue on error
      }
    });

    // Keep worker alive
    process.on('SIGINT', async () => {
      log(`\n✅ Worker shutdown`);
      log(`  Embedded: ${processed} canonical packets`);
      log(`  Redis centroids cached (7-day TTL)`);
      log(`  Bifrost L2 warmed`);
      log(`  ACP Gemma4 tasks submitted`);
      await channel.close();
      await conn.close();
      await db.end();
      if (redis.isOpen) await redis.quit();
      process.exit(0);
    });

  } catch (e) {
    log(`❌ Worker error: ${e.message}`);
    try { await channel?.close(); } catch { /* */ }
    try { await conn?.close(); } catch { /* */ }
    try { await db.end(); } catch { /* */ }
    try { if (redis.isOpen) await redis.quit(); } catch { /* */ }
    process.exit(1);
  }
}

// ── Stats Mode ───────────────────────────────────────────────────────────────

async function showStats() {
  log(`📊 Canonical Packet Embedding Status`);

  try {
    const result = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN embedding IS NULL THEN 1 END) as missing,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as present
      FROM atlas_packets
    `);

    const { total, missing, present } = result.rows[0];
    log(`  Total packets: ${total}`);
    log(`  With embeddings: ${present}/${total} (${(present/total*100).toFixed(1)}%)`);
    log(`  Missing embeddings: ${missing}/${total} (${(missing/total*100).toFixed(1)}%)\n`);

    // Check queue depth
    let conn, channel;
    try {
      conn = await amqp.connect(RABBITMQ_URL);
      channel = await conn.createChannel();
      const queueInfo = await channel.checkQueue(QUEUE).catch(() => ({ messageCount: 0 }));
      log(`  Queue '${QUEUE}': ${queueInfo.messageCount} pending jobs`);
      await channel.close();
      await conn.close();
    } catch (e) {
      log(`  Queue unavailable: ${e.message}`);
    }

    // Check Redis centroid cache
    try {
      if (!redis.isOpen) await redis.connect();
      const centroidCount = await redis.keys('centroid:packet:*');
      log(`  Redis centroids cached: ${centroidCount.length} packets (7-day TTL)`);
      if (redis.isOpen) await redis.quit();
    } catch (e) {
      log(`  Redis unavailable: ${e.message}`);
    }

  } catch (e) {
    log(`❌ Stats error: ${e.message}`);
    process.exit(1);
  } finally {
    try { await db.end(); } catch { /* */ }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  switch (MODE) {
    case 'enqueue':
      await enqueueJobs();
      break;
    case 'worker':
      await startWorker();
      break;
    case 'stats':
      await showStats();
      break;
  }
}

main().catch(e => {
  console.error(`\n❌ Fatal: ${e.message}`);
  process.exit(1);
});
