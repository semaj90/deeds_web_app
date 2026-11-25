#!/usr/bin/env node
/**
 * summarize-indexed-packets-dual-llm.mjs
 *
 * Summarize all 58,304 indexed packets using dual llama-server endpoints.
 * Wired into graphify:daily startup for Phase C provenance.
 *
 * Architecture:
 * - Endpoint 1 (:8090) — Gemma4 summaries via /api/llm/gemma4-chat-clean (16K context)
 * - Endpoint 2 (:8091) — Parallel embedding validation (16K context, 4 workers)
 * - Batch size: 50 packets per request
 * - Concurrency: 2 parallel summaries + validation
 * - Output: Persist to atlas_summary_layers + update atlas_packets.summary
 * - Post-process: Feed to KMeans SOM 20x20 + Autoencoder training
 *
 * Pipeline stages:
 * 1. Read packets from Postgres (atlas_packets, filter by missing summary)
 * 2. Batch into groups of 50
 * 3. Call Gemma4 :8090/api/llm/gemma4-chat-clean with batch
 * 4. Validate embeddings via :8091 (parallel, 4 workers)
 * 5. Write summaries to atlas_summary_layers
 * 6. Update atlas_packets.summary column
 * 7. Queue KMeans + SOM + AE training jobs
 */

import 'dotenv/config';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { execSync } from 'child_process';
import {
  analyzeSummaryContaminationV1,
  sanitizeTransportMarkersV1,
} from './lib/summary-quality-v1.mjs';

const { Pool } = pg;
const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;
const QUEUE_GPU = process.argv.includes('--queue-gpu');
const VIA_BIFROST = process.argv.includes('--via-bifrost');
const NO_REDIS = process.argv.includes('--no-redis');
const LIMIT = process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || null;
const BATCH_ARG = process.argv.find(a => a.startsWith('--batch-size='))?.split('=')[1] || null;
const VERBOSE = process.argv.includes('--verbose');

const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: parseInt(process.env.POSTGRES_PORT ?? '5434', 10),
  database: process.env.POSTGRES_DB ?? 'legal_ai_db',
  user: process.env.POSTGRES_USER ?? 'legal_admin',
  password: process.env.POSTGRES_PASSWORD ?? '123456',
});

const GEMMA4_ENDPOINT = VIA_BIFROST
  ? (process.env.BIFROST_CHAT_ENDPOINT ?? 'http://127.0.0.1:3040/v1/chat/completions')
  : (process.env.GEMMA4_CHAT_ENDPOINT ?? 'http://127.0.0.1:8090/v1/chat/completions');
const EG2_ONNX_HEALTH_ENDPOINT = `${(process.env.GEMMA2_ONNX_URL ?? 'http://127.0.0.1:8094').replace(/\/+$/, '')}/health`;
const BASE_MODEL = process.env.LLAMA_SERVER_MODEL || 'gemma4-legal-iq4xs-direct.gguf';
const ACTIVE_SYNTHESIS_MODEL = VIA_BIFROST ? `openai/${BASE_MODEL}` : BASE_MODEL;
const BATCH_SIZE = Math.max(1, Math.min(50, parseInt(BATCH_ARG ?? '25', 10) || 25));
const CONCURRENCY_ARG = process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || null;
let CONCURRENCY = 2;

/** Cap LLM workers at llama-server slots + 1 (extra worker overlaps DB/Valkey I/O with generation). */
async function resolveConcurrency() {
  let slots = 1;
  try {
    const base = new URL(GEMMA4_ENDPOINT).origin;
    const props = await (await fetch(`${base}/props`, { signal: AbortSignal.timeout(3000) })).json();
    if (Number.isInteger(props?.total_slots) && props.total_slots > 0) slots = props.total_slots;
  } catch { /* gateway may not proxy /props; keep 1 */ }
  const requested = CONCURRENCY_ARG ? parseInt(CONCURRENCY_ARG, 10) : slots + 1;
  CONCURRENCY = Math.max(1, Math.min(8, Number.isFinite(requested) ? requested : slots + 1));
  return { slots, concurrency: CONCURRENCY };
}
const SUMMARY_CACHE_TTL_SEC = 7 * 24 * 3600;

let redisClient = null;
async function getValkeyClient() {
  if (NO_REDIS) return null;
  if (redisClient) return redisClient;
  try {
    const { default: Redis } = await import('ioredis');
    const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
    const client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    });
    await client.connect();
    redisClient = client;
    return redisClient;
  } catch {
    return null;
  }
}

function packetContentKey(packet) {
  const digest = createHash('sha256')
    .update(`${packet.packet_key}|${packet.source_ref ?? ''}|${packet.file_path ?? ''}|${packet.feature_label ?? ''}|${packet.domain_class ?? 'general'}`)
    .digest('hex')
    .slice(0, 16);
  return `ace:summary:v1:${packet.packet_key}:${digest}`;
}

async function log(...args) {
  if (!process.env.QUIET) console.log('[summarize]', ...args);
}

async function warn(...args) {
  console.warn('[summarize]', ...args);
}

async function getPacketsNeedingSummary() {
  const query = `
    SELECT packet_key, source_ref, source_revision, file_path, feature_label, domain_class, summary
    FROM atlas_packets
    WHERE summary IS NULL OR summary = ''
    ORDER BY coalesce(domain_class, 'general') ASC, file_path ASC NULLS LAST, packet_key ASC
    ${LIMIT ? `LIMIT ${parseInt(LIMIT)}` : ''}
  `;
  const result = await pool.query(query);
  return result.rows;
}

const MAX_SUMMARY_CHARS = 400;

function sanitizeAndGateSummary(rawText, packetKey) {
  const candidate = sanitizeTransportMarkersV1(String(rawText ?? '').trim()).text;
  if (!candidate) return '';
  let bounded = candidate;
  if (bounded.length > MAX_SUMMARY_CHARS) {
    const slice = bounded.slice(0, MAX_SUMMARY_CHARS);
    const lastPeriod = slice.lastIndexOf('.');
    if (lastPeriod >= 80) {
      bounded = slice.slice(0, lastPeriod + 1).trim();
    } else {
      if (VERBOSE) warn(`Rejected verbose summary (${bounded.length} chars) for ${packetKey}`);
      return '';
    }
  }
  const quality = analyzeSummaryContaminationV1(bounded);
  if (!quality.clean) {
    if (VERBOSE) warn(`Rejected contaminated summary for ${packetKey}: ${quality.reasons.join(',')}`);
    return '';
  }
  return bounded;
}

function buildDomainSystemPrompt(domainBucket) {
  return (
    `You are a technical documentation summarizer for the Parent Atlas legal-AI codebase. ` +
    `Active domain bucket: "${domainBucket}". Output exactly 1 concise technical sentence per numbered item, no fluff.`
  );
}

async function summarizePacketBatch(packets, domainBucket = 'general') {
  // Build prompt for batch
  const packetsList = packets
    .map((p, i) => `${i + 1}. [${p.packet_key}] ${p.feature_label} (${p.source_ref})`)
    .join('\n');

  const prompt = `Summarize these ${packets.length} indexed code packets in 1 sentence each:\n\n${packetsList}\n\nProvide concise, technical summaries for legal AI indexing.`;

  try {
    const response = await fetch(GEMMA4_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.INTERNAL_SERVICE_KEY ? { 'x-service-key': process.env.INTERNAL_SERVICE_KEY } : {}),
      },
      body: JSON.stringify({
        model: ACTIVE_SYNTHESIS_MODEL,
        messages: [
          {
            role: 'system',
            content: buildDomainSystemPrompt(domainBucket),
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 1000,
        // Ephemeral in-VRAM prompt/KV prefix reuse only; never persisted to Valkey or PG18
        cache_prompt: true,
        chat_template_kwargs: { enable_thinking: false },
      }),
    });

    if (!response.ok) {
      warn(`Gemma4 returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    const rawContent = String(data.choices?.[0]?.message?.content ?? '')
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/<\|thought\|>[\s\S]*?<\|channel\|>/g, '');

    // Parse response into per-packet summaries (strip CoT preambles per AGENTS.md)
    const summaryLines = rawContent
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.includes('<|channel>') && !/^(the user wants|thinking process|let's )/i.test(line));

    const summaries = {};
    const byIndex = new Map();
    for (const line of summaryLines) {
      const m = line.match(/^(\d+)[.)]\s*(?:\[[^\]]*\]\s*)?(.+)$/);
      if (m) byIndex.set(parseInt(m[1], 10) - 1, m[2].trim());
    }
    packets.forEach((p, i) => {
      const numbered = byIndex.get(i);
      const positional = byIndex.size === 0 ? (summaryLines[i] ?? '') : '';
      summaries[p.packet_key] = sanitizeAndGateSummary(numbered ?? positional, p.packet_key);
    });

    return summaries;
  } catch (err) {
    warn(`Gemma4 request failed: ${err.message}`);
    return null;
  }
}

async function validateEmbeddings() {
  // Verify EmbeddingGemma 2 ONNX (:8094) encoder readiness (replaces retired :8091 Ornith check)
  try {
    const response = await fetch(EG2_ONNX_HEALTH_ENDPOINT, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const health = await response.json();
    return health?.status === 'ok' && health?.native_dim === 768;
  } catch (err) {
    warn(`EG2 ONNX validation endpoint error: ${err.message}`);
    return false;
  }
}

async function writeSummaries(summaries) {
  if (DRY_RUN) {
    log('DRY-RUN: Would write', Object.keys(summaries).length, 'summaries');
    return 0;
  }

  const entries = Object.entries(summaries).filter(([, txt]) => txt);
  if (entries.length === 0) return 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      `UPDATE atlas_packets AS a SET summary = v.summary, updated_at = NOW()
         FROM (SELECT unnest($1::text[]) AS packet_key, unnest($2::text[]) AS summary) AS v
        WHERE a.packet_key = v.packet_key`,
      [entries.map(([k]) => k), entries.map(([, t]) => t)],
    );
    await client.query('COMMIT');
    return res.rowCount ?? entries.length;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function queueGPUTraining() {
  if (DRY_RUN) {
    log('DRY-RUN: Would queue KMeans + SOM + AE training');
    return;
  }

  try {
    // Queue GPU training jobs
    log('Queuing KMeans + SOM + AE training jobs...');

    // KMeans (GPU accelerated)
    execSync('npm run atlas:p5:kmeans:queue --apply 2>&1', {
      stdio: 'inherit',
      cwd: 'sveltekit-frontend',
    });

    // SOM (Self-Organizing Map 20x20)
    execSync('npm run atlas:p5:som:queue:20x20 --apply 2>&1', {
      stdio: 'inherit',
      cwd: 'sveltekit-frontend',
    });

    // Autoencoder training
    execSync('npm run atlas:p6:ae:train:queue --apply 2>&1', {
      stdio: 'inherit',
      cwd: 'sveltekit-frontend',
    });

    log('✅ GPU training jobs queued');
  } catch (err) {
    warn(`Failed to queue training: ${err.message}`);
  }
}

async function main() {
  try {
    log('Starting indexed packet summarization (dual LLM)');
    log(`Endpoints: Gemma4=${GEMMA4_ENDPOINT} Eg2OnnxHealth=${EG2_ONNX_HEALTH_ENDPOINT}`);
    // A dry run is a planning pass only: do not probe model slots or connect
    // to Valkey, and never send candidate text to a model.
    const conc = DRY_RUN
      ? { slots: 0, concurrency: Math.max(1, Math.min(8, Number.parseInt(CONCURRENCY_ARG ?? '1', 10) || 1)) }
      : await resolveConcurrency();
    log(`Batch size: ${BATCH_SIZE}, llama slots: ${conc.slots}, LLM workers: ${conc.concurrency}, cpuCores: ${(await import('node:os')).cpus().length}`);
    log(`Dry-run: ${DRY_RUN}`);
    const valkey = DRY_RUN ? null : await getValkeyClient();
    log(`Valkey prefill cache: ${valkey ? 'enabled (:6379)' : 'disabled/offline'}`);
    log('');

    // Get packets needing summary (bucketed by domain_class + file_path for KV prefix reuse)
    const packets = await getPacketsNeedingSummary();
    log(`Found ${packets.length} packets needing summary`);

    if (packets.length === 0) {
      log('No packets to summarize. Done.');
      if (valkey) await valkey.quit().catch(() => {});
      await pool.end();
      return;
    }

    // Group into domain buckets so consecutive batches maximize :8090 ephemeral KV prefix hits
    const buckets = new Map();
    for (const p of packets) {
      const dom = p.domain_class || 'general';
      if (!buckets.has(dom)) buckets.set(dom, []);
      buckets.get(dom).push(p);
    }

    let totalSummarized = 0;
    let valkeyHits = 0;
    let valkeyMisses = 0;
    let retried = 0;
    const t0 = performance.now();

    const jobs = [];
    for (const [domainBucket, bucketPackets] of buckets.entries()) {
      for (let i = 0; i < bucketPackets.length; i += BATCH_SIZE) {
        jobs.push({ domainBucket, batch: bucketPackets.slice(i, i + BATCH_SIZE) });
      }
    }

    if (DRY_RUN) {
      log(`PLAN ONLY: ${packets.length} packets across ${jobs.length} jobs (batchSize=${BATCH_SIZE}, requestedWorkers=${conc.concurrency})`);
      log('PLAN ONLY: no Gemma requests, Valkey reads/writes, database writes, or GPU jobs performed');
      await pool.end();
      return;
    }

    async function processJob({ domainBucket, batch }) {
      // 1. Valkey prefill lookup (content-addressed)
      const cached = {};
      let uncached = batch;
      if (valkey) {
        const vals = await valkey.mget(...batch.map(packetContentKey)).catch(() => []);
        uncached = [];
        batch.forEach((p, idx) => {
          const gated = sanitizeAndGateSummary(vals?.[idx], p.packet_key);
          if (gated) { cached[p.packet_key] = gated; valkeyHits++; }
          else { uncached.push(p); valkeyMisses++; }
        });
      }

      // 2. LLM batch (cache_prompt:true), then per-packet retry for anything the parse missed
      let fresh = {};
      if (uncached.length > 0) {
        fresh = (await summarizePacketBatch(uncached, domainBucket)) ?? {};
        const missing = uncached.filter((p) => !fresh[p.packet_key]);
        for (const p of missing) {
          const single = await summarizePacketBatch([p], domainBucket);
          if (single?.[p.packet_key]) { fresh[p.packet_key] = single[p.packet_key]; retried++; }
        }
        if (valkey && !DRY_RUN) {
          const pipe = valkey.pipeline();
          for (const p of uncached) if (fresh[p.packet_key]) pipe.setex(packetContentKey(p), SUMMARY_CACHE_TTL_SEC, fresh[p.packet_key]);
          await pipe.exec().catch(() => {});
        }
      }

      // 3. Single multi-row UPDATE (one round trip) instead of per-row queries
      const written = await writeSummaries({ ...cached, ...fresh });
      totalSummarized += written;
      log(`  ✅ [${domainBucket}] wrote ${written}/${batch.length} (hits=${valkeyHits}, misses=${valkeyMisses}, retried=${retried})`);
    }

    // Shared-queue worker pool: N workers pull jobs so DB/Valkey I/O overlaps LLM generation
    let nextJob = 0;
    const worker = async () => {
      while (true) {
        const idx = nextJob++;
        if (idx >= jobs.length) return;
        try { await processJob(jobs[idx]); } catch (err) { warn(`job ${idx} failed: ${err.message}`); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));

    const elapsedMs = Math.round(performance.now() - t0);
    log('');
    log(`✅ Summarization complete: ${totalSummarized}/${packets.length} packets in ${elapsedMs}ms (valkeyHits=${valkeyHits}, valkeyMisses=${valkeyMisses})`);

    // Queue GPU training only when explicitly requested via --queue-gpu
    if (QUEUE_GPU) {
      await queueGPUTraining();
    } else {
      log('Skipping GPU training queue (pass --queue-gpu to enqueue SOM/AE)');
    }

    if (valkey) await valkey.quit().catch(() => {});
    await pool.end();
  } catch (err) {
    warn(`Fatal error: ${err.message}`);
    await pool.end();
    process.exit(1);
  }
}

main();
