#!/usr/bin/env node
/**
 * Phase 7: Gemma4 Summarization Worker (Patched)
 *
 * Corrected worker for codebase_chunk_index summary generation.
 * Implements safe concurrency control and Redis warming.
 *
 * Key changes:
 * 1. LLM_CONCURRENCY semaphore (max 2 active llama-server calls)
 * 2. 4 parallel workers can run, but queue concurrency to llama-server
 * 3. Removed fixed 2s sleep
 * 4. Postgres write → Redis warm (not invalidate)
 * 5. Proper failure handling without corrupting summaries
 * 6. Throughput reporting
 *
 * Usage:
 *   npx tsx scripts/atlas/phase7-gemma4-worker-patched.mts [--dry-run]
 *   LLM_CONCURRENCY=2 npx tsx scripts/atlas/phase7-gemma4-worker-patched.mts
 */

import amqp from 'amqplib';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { performance } from 'perf_hooks';
import { isUsableGemma4Summary, sanitizeGemma4Summary } from '../../../scripts/atlas/lib/gemma4-summary-sanitizer.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

// ============================================================================
// Configuration
// ============================================================================

const PG_HOST = process.env.POSTGRES_HOST || 'localhost';
const PG_PORT = parseInt(process.env.POSTGRES_PORT || '5434');
const PG_DB = process.env.POSTGRES_DB || 'legal_ai_db';
const PG_USER = process.env.POSTGRES_USER || 'legal_admin';
const PG_PASSWORD = process.env.POSTGRES_PASSWORD || '123456';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';
const SUMMARY_QUEUE = process.env.PHASE7_SUMMARY_QUEUE || 'phase7.summarization';
const SUMMARY_DLQ = `${SUMMARY_QUEUE}.dlq`;
const MAX_RETRIES = Number(process.env.PHASE7_MAX_RETRIES || 3);
const LLAMA_SERVER_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090';
const MODEL = 'gemma4-legal-iq4xs-direct.gguf';
const TEMPERATURE = 0.3;
const GEMMA4_MAX_TOKENS = Number(process.env.GEMMA4_MAX_TOKENS || 100);
const GEMMA4_INPUT_CHARS = Number(process.env.GEMMA4_INPUT_CHARS || 1200);
const GEMMA4_TIMEOUT_MS = Number(process.env.GEMMA4_TIMEOUT_MS || 120000);

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'redis';

// **CRITICAL**: Concurrency semaphore for llama-server
const LLM_CONCURRENCY = Number(process.env.LLM_CONCURRENCY || 1);
const SUMMARY_PROMPT_TEMPLATE_VERSION = 'phase7-v2';

// ============================================================================
// Clients
// ============================================================================

const pgPool = new Pool({
  host: PG_HOST,
  port: PG_PORT,
  database: PG_DB,
  user: PG_USER,
  password: PG_PASSWORD,
});

const redis: any = new (Redis as any)({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});

// ============================================================================
// Concurrency Control
// ============================================================================

class LLMConcurrencySemaphore {
  private activeCount = 0;
  private queue: Array<() => Promise<void>> = [];

  constructor(private maxConcurrency: number) {}

  async acquire<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const execute = async () => {
        this.activeCount++;
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this.activeCount--;
          this.processQueue();
        }
      };

      if (this.activeCount < this.maxConcurrency) {
        execute();
      } else {
        this.queue.push(execute);
      }
    });
  }

  private processQueue() {
    if (this.queue.length > 0 && this.activeCount < this.maxConcurrency) {
      const fn = this.queue.shift();
      if (fn) fn();
    }
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  getQueueDepth(): number {
    return this.queue.length;
  }
}

const llmSemaphore = new LLMConcurrencySemaphore(LLM_CONCURRENCY);

// ============================================================================
// Metrics
// ============================================================================

class ThroughputTracker {
  private writtenAt: number[] = [];
  private errorCount = 0;
  private startTime = Date.now();

  recordWrite() {
    this.writtenAt.push(Date.now());
    // Keep only last 5 minutes
    const cutoff = Date.now() - 5 * 60 * 1000;
    this.writtenAt = this.writtenAt.filter(t => t > cutoff);
  }

  recordError() {
    this.errorCount++;
  }

  getStats() {
    const now = Date.now();
    const last5min = this.writtenAt.filter(t => t > now - 5 * 60 * 1000).length;
    const last5minMs = now - (now - 5 * 60 * 1000);
    const summariesPerMin = last5min / (last5minMs / 60000);

    return {
      writtenInLast5Min: last5min,
      summariesPerMin: summariesPerMin.toFixed(2),
      activeLLMRequests: llmSemaphore.getActiveCount(),
      queueDepth: llmSemaphore.getQueueDepth(),
      totalErrors: this.errorCount,
      uptimeSeconds: Math.floor((now - this.startTime) / 1000),
    };
  }

  reportStats() {
    const stats = this.getStats();
    console.log(`\n📊 Throughput Report:`);
    console.log(`  Summaries (last 5 min): ${stats.writtenInLast5Min}`);
    console.log(`  Rate: ${stats.summariesPerMin} summaries/min`);
    console.log(`  Active LLM requests: ${stats.activeLLMRequests}`);
    console.log(`  Queue depth: ${stats.queueDepth}`);
    console.log(`  Errors: ${stats.totalErrors}`);
    console.log(`  Uptime: ${stats.uptimeSeconds}s\n`);
  }
}

const tracker = new ThroughputTracker();

// ============================================================================
// Gemma4 Integration
// ============================================================================

interface ChunkMessage {
  id: string;
  content: string;
  source_ref?: string;
  packet_key?: string | null;
  packet_id?: string | null;
  feature_id?: string;
  reuse_feature_id?: string;
  prompt_reuse_bucket?: string;
  prompt_template_version?: string;
  prompt_reuse_hint?: {
    template_version?: string;
    feature_id?: string | null;
    source_prefix?: string | null;
    language?: string | null;
    kind?: string | null;
    som_cluster?: string | number | null;
    gpu_cluster?: string | number | null;
  };
}

function cleanGemmaSummary(raw: string): string {
  return sanitizeGemma4Summary(raw).summary;
}

async function callGemma4(input: string | ChunkMessage, retryCount = 0, contentOverride?: string): Promise<string> {
  const maxRetries = 2;
  const content = contentOverride ?? (typeof input === 'string' ? input : input.content);
  const messages = typeof input === 'string'
    ? [
        {
          role: 'system' as const,
          content: 'You are a legal code analyzer. Summarize in 1-2 sentences. Return only the summary text.',
        },
        {
          role: 'user' as const,
          content: [
            `Summarize the packet in 1-2 sentences.`,
            `Return only the summary text.`,
            `Do not include chain-of-thought, headings, or bullet lists.`,
            `Prompt template version: ${SUMMARY_PROMPT_TEMPLATE_VERSION}.`,
            '',
            'Summarize this code:',
            '',
            content.slice(0, GEMMA4_INPUT_CHARS),
          ].join('\n'),
        },
      ]
    : buildSummaryPrompt(input, content);

  try {
    // **CRITICAL**: Use semaphore to limit concurrent requests
    return await llmSemaphore.acquire(async () => {
      const t0 = performance.now();

      const response = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature: TEMPERATURE,
          max_tokens: GEMMA4_MAX_TOKENS,
          stream: false,
          cache_prompt: true, // Enable KV cache prefilling
        }),
        signal: AbortSignal.timeout(GEMMA4_TIMEOUT_MS),
      });

      const t1 = performance.now();
      const latency = ((t1 - t0) / 1000).toFixed(2);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as any;
      const raw = data.choices?.[0]?.message?.content ?? '';
      const summary = cleanGemmaSummary(raw);

      // Validate summary is non-empty and substantive
      if (!isUsableGemma4Summary(summary, { minLength: 30, minUniqueWords: 6 }) || summary.includes('failed after retries')) {
        throw new Error('summary failed sanitation/quality gate');
      }

      console.log(`    ✓ Gemma4 (${latency}s)`);
      return summary;
    });
  } catch (err) {
    if (retryCount < maxRetries) {
      console.log(`    ⚠️  Retry ${retryCount + 1}/${maxRetries}: ${err}`);
      // Retry with smaller context
      const smallerContent = content.slice(0, 1000);
      return callGemma4(input, retryCount + 1, smallerContent);
    }

    tracker.recordError();
    throw err;
  }
}

function buildSummaryPrompt(
  chunk: ChunkMessage,
  content: string
): Array<{ role: 'system' | 'user'; content: string }> {
  const hint = chunk.prompt_reuse_hint ?? {};
  const promptVersion = chunk.prompt_template_version || hint.template_version || SUMMARY_PROMPT_TEMPLATE_VERSION;
  const sourceRef = String(chunk.source_ref ?? '').trim();
  const featureId = String(chunk.feature_id ?? chunk.reuse_feature_id ?? hint.feature_id ?? '').trim();
  const reuseBucket = String(chunk.prompt_reuse_bucket ?? '').trim();
  const sourcePrefix = String(hint.source_prefix ?? '').trim();
  const language = String(hint.language ?? '').trim();
  const kind = String(hint.kind ?? '').trim();
  const somCluster = hint.som_cluster ?? '';
  const gpuCluster = hint.gpu_cluster ?? '';

  const system = [
    'You are a legal code analyzer.',
    'Summarize the packet in 1-2 sentences.',
    'Return only the summary text.',
    'Do not include chain-of-thought, headings, or bullet lists.',
    `Prompt template version: ${promptVersion}.`,
  ].join(' ');

  const user = [
    `<packet-summary version="${promptVersion}">`,
    `source_ref: ${sourceRef}`,
    `feature_id: ${featureId}`,
    `reuse_feature_id: ${String(chunk.reuse_feature_id ?? '').trim()}`,
    `prompt_reuse_bucket: ${reuseBucket}`,
    `source_prefix: ${sourcePrefix}`,
    `language: ${language}`,
    `kind: ${kind}`,
    `som_cluster: ${String(somCluster)}`,
    `gpu_cluster: ${String(gpuCluster)}`,
    'content:',
    content.slice(0, 2000),
    `</packet-summary>`,
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

// ============================================================================
// Postgres Writing
// ============================================================================

async function writeSummaryToPostgres(
  chunkId: string,
  summary: string,
  packetId?: string | null,
  packetKey?: string | null,
): Promise<boolean> {
  if (DRY_RUN) {
    return true;
  }

  try {
    // **CRITICAL**: Write summary to canonical truth (Postgres)
    const packetIdText = String(packetId ?? '').trim();
    const result = await pgPool.query(
      `UPDATE codebase_chunk_index
       SET summary = $1,
           packet_key = COALESCE($4::text, packet_key),
           metadata = CASE
             WHEN $3::text IS NULL OR btrim($3::text) = '' THEN metadata
             ELSE jsonb_set(
               COALESCE(metadata, '{}'::jsonb),
               '{packet_id}',
               to_jsonb($3::text),
               true
             )
           END,
           updated_at = NOW()
       WHERE id = $2
         AND (summary IS NULL OR btrim(summary) = '')`,
      [summary, chunkId, packetIdText || null, String(packetKey ?? '').trim() || null]
    );

    if (result.rowCount !== 1) {
      console.log(`    ℹ️  Postgres write skipped; summary already present`);
      return true;
    }

    tracker.recordWrite();
    console.log(`    ✓ Postgres write`);
    return true;
  } catch (err) {
    console.error(`    ✗ Postgres write failed: ${err}`);
    tracker.recordError();
    return false;
  }
}

async function isChunkAlreadySummarized(chunkId: string): Promise<boolean> {
  if (DRY_RUN) {
    return false;
  }

  try {
    const result = await pgPool.query(
      `SELECT 1
       FROM codebase_chunk_index
       WHERE id = $1
         AND summary IS NOT NULL
         AND btrim(summary) <> ''
       LIMIT 1`,
      [chunkId]
    );
    return result.rowCount > 0;
  } catch (err) {
    console.warn(`  ⚠️  Summary existence check failed for ${chunkId}: ${err}`);
    return false;
  }
}

// ============================================================================
// Redis Warming (BitFrost L1-L3 Cache)
// ============================================================================

function extractTermsFromSummary(summary: string): string[] {
  // Extract code-related terms: auth, authenticate, session, validate, db, cache, queue, etc.
  const terms = new Set<string>();

  // Split by whitespace and punctuation
  const words = summary.toLowerCase().split(/[\s\-_.,;:()[\]{}'"]+/);

  // Add individual terms
  for (const word of words) {
    if (word.length > 2) {
      terms.add(word);
    }
  }

  return Array.from(terms);
}

async function warmBitFrostCache(
  chunkId: string,
  summary: string,
  packetId?: string | null,
  packetKey?: string | null,
): Promise<void> {
  if (DRY_RUN) {
    return;
  }

  if (!redis.isOpen) {
    return; // Redis not connected, skip cache warming
  }

  try {
    const canonicalPacketKey = String(packetKey ?? '').trim();
    const canonicalPacketId = String(packetId ?? '').trim();
    const cacheId = canonicalPacketKey || canonicalPacketId || chunkId;

    // **L1**: Exact summary cache (5ms lookup)
    await redis.setex(`bitfrost:summary:${cacheId}`, 86400, summary);

    // **L1**: Packet envelope cache (includes summary + metadata)
    const terms = extractTermsFromSummary(summary);
    const packetEnvelope = {
      chunk_id: chunkId,
      packet_id: canonicalPacketId || null,
      packet_key: canonicalPacketKey || null,
      summary,
      terms,
      cached_at: new Date().toISOString(),
      source: 'phase7-gemma4-worker',
    };
    await redis.setex(
      `bitfrost:packet:${cacheId}`,
      86400,
      JSON.stringify(packetEnvelope)
    );

    // **L2-L3**: Lexical/ngram cache for semantic clustering
    // Set bitfrost:term:{term} with chunk ID (for exact keyword matching)
    for (const term of terms) {
      await redis.sadd(`bitfrost:term:${term}`, cacheId);
      await redis.expire(`bitfrost:term:${term}`, 86400);
    }

    console.log(`    ✓ BitFrost L1-L3 warmed (packet + summary + ${terms.length} terms, id=${cacheId})`);
  } catch (err) {
    console.warn(`    ⚠️  BitFrost warm failed (non-blocking): ${err}`);
  }
}

// ============================================================================
// Message Processing
// ============================================================================

function retryCountFor(msg: any): number {
  return Number(msg?.properties?.headers?.['x-retry-count'] ?? 0);
}

async function sendToQueueAwaitDrain(channel: any, queueName: string, content: Buffer, options: any): Promise<void> {
  const accepted = channel.sendToQueue(queueName, content, options);
  if (!accepted) {
    await new Promise(resolve => channel.once('drain', resolve));
  }
}

async function republishOrDlq(channel: any, msg: any, err: unknown): Promise<void> {
  const nextRetry = retryCountFor(msg) + 1;
  const targetQueue = nextRetry > MAX_RETRIES ? SUMMARY_DLQ : SUMMARY_QUEUE;

  await sendToQueueAwaitDrain(channel, targetQueue, msg.content, {
    persistent: true,
    contentType: msg.properties?.contentType || 'application/json',
    headers: {
      ...(msg.properties?.headers || {}),
      'x-retry-count': nextRetry,
      'x-last-error': String((err as Error)?.message || err).slice(0, 300),
    },
  });
  channel.ack(msg);
}

async function processMessage(channel: any, msg: any): Promise<void> {
  if (!msg) return;

  try {
    const chunk: ChunkMessage = JSON.parse(msg.content.toString());
    const t0 = performance.now();

    const packetId = String((chunk as { packet_id?: unknown; packetId?: unknown }).packet_id ?? (chunk as { packetId?: unknown }).packetId ?? '').trim() || null;
    const packetKey = String((chunk as { packet_key?: unknown; packetKey?: unknown }).packet_key ?? (chunk as { packetKey?: unknown }).packetKey ?? '').trim() || null;

    console.log(`\n[${new Date().toISOString()}] Processing chunk ${chunk.id}...`);

    if (await isChunkAlreadySummarized(chunk.id)) {
      console.log(`  ✓ Already summarized; ACK skip`);
      channel.ack(msg);
      return;
    }

    // Step 1: Call Gemma4
    console.log(`  ℹ️  Calling Gemma4...`);
    const summary = await callGemma4(chunk);

    // Step 2: Write to Postgres (canonical truth)
    console.log(`  ℹ️  Writing to Postgres...`);
    const pgSuccess = await writeSummaryToPostgres(chunk.id, summary, packetId, packetKey);

    if (!pgSuccess) {
      console.log(`  ⚠️  Requeuing failed message through bounded retry`);
      await republishOrDlq(channel, msg, new Error('Postgres write failed'));
      return;
    }

    // Step 3: Warm Redis cache
    console.log(`  ℹ️  Warming Redis cache...`);
    await warmBitFrostCache(chunk.id, summary, packetId, packetKey);

    // Step 4: Acknowledge message
    channel.ack(msg);

    const t1 = performance.now();
    const totalTime = ((t1 - t0) / 1000).toFixed(2);
    console.log(`  ✅ Complete (${totalTime}s)`);
  } catch (err) {
    console.error(`  ✗ Error: ${err}`);
    tracker.recordError();
    await republishOrDlq(channel, msg, err);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 7: Gemma4 Summarization Worker (Patched)                ║');
  console.log('║  Fixed concurrency, throughput, and Redis warming              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`LLM Concurrency: ${LLM_CONCURRENCY} max active requests`);
  console.log(`Gemma4 max tokens: ${GEMMA4_MAX_TOKENS}`);
  console.log(`Gemma4 timeout: ${GEMMA4_TIMEOUT_MS}ms`);
  console.log(`RabbitMQ: ${RABBITMQ_URL}`);
  console.log(`Gemma4: ${LLAMA_SERVER_URL}`);
  console.log(`Redis: ${REDIS_HOST}:${REDIS_PORT}\n`);

  let connection: any = null;
  let channel: any = null;

  try {
    // Connect to Redis
    if (!DRY_RUN) {
      await redis.connect();
      console.log('✅ Redis connected\n');
    }

    // Connect to RabbitMQ
    console.log('📡 Connecting to RabbitMQ...');
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    // Declare queue
    await channel.assertQueue(SUMMARY_QUEUE, { durable: true });
    await channel.assertQueue(SUMMARY_DLQ, { durable: true });

    // **CRITICAL**: Prefetch = 1 (process one message at a time per worker)
    // Multiple workers can run (4), but each processes sequentially
    // LLM calls are queued by the semaphore
    await channel.prefetch(1);

    console.log(`✅ Connected to ${SUMMARY_QUEUE}\n`);
    console.log('🚀 Listening for messages...\n');

    // Start metrics reporting every 30 seconds
    if (!DRY_RUN) {
      setInterval(() => {
        tracker.reportStats();
      }, 30000);
    }

    // Consume messages
    channel.consume(SUMMARY_QUEUE, (msg) => {
      if (msg) {
        processMessage(channel!, msg);
      }
    });
  } catch (err) {
    console.error(`❌ Error: ${err}`);
    process.exit(1);
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down...');
    tracker.reportStats();
    if (channel) await channel.close();
    if (connection) await connection.close();
    if (redis.isOpen) await redis.quit();
    await pgPool.end();
    console.log('✅ Closed');
    process.exit(0);
  });
}

main();
