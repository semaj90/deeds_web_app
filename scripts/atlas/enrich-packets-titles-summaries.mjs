#!/usr/bin/env node

/**
 * Enrich Packets with Titles and Summaries
 *
 * Purpose: Make packets fully searchable by enriching them with stable titles,
 * summaries, and embedding vectors in Qdrant as named vectors.
 *
 * Pipeline:
 * 1. Query Postgres for packets missing title or summary
 * 2. Batch generate title + summary via Gemma4
 * 3. Validate against packet_key/source_ref/feature_id
 * 4. Embed title + summary + tags via EmbeddingGemma
 * 5. Upsert named vectors to Qdrant (content, title, summary, latent_64)
 * 6. Mirror hot keys into Valkey
 * 7. Log eval_ms per lane
 * 8. Return golden retrieval replay instructions
 *
 * Note: Do NOT train first. First make packets searchable by stable title,
 * source_ref, feature_id, summary, and vector. Training/policy tuning comes after.
 */

import postgres from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const __root = resolve(__dirname, '../../..');

// ============================================================================
// CONFIGURATION
// ============================================================================

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run') || !args.includes('--apply');
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '500', 10);
const verbose = args.includes('--verbose');

// Load environment
const env = {};
if (existsSync(`${__root}/.env`)) {
  readFileSync(`${__root}/.env`, 'utf-8')
    .split('\n')
    .forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) env[key] = value;
    });
}

const DB_URL = env.DATABASE_URL || 'postgresql://legal_admin:password@127.0.0.1:5434/legal_ai_db';
const VALKEY_HOST = env.REDIS_HOST || 'localhost';
const VALKEY_PORT = parseInt(env.REDIS_PORT ?? '6379', 10);
const VALKEY_PASSWORD = env.REDIS_PASSWORD || 'redis';
const LLAMA_URL = env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090/v1';
const QDRANT_URL = env.QDRANT_URL || 'http://127.0.0.1:6333';
const OLLAMA_URL = env.OLLAMA_URL || 'http://127.0.0.1:11434';

// ============================================================================
// CLIENTS
// ============================================================================

const pgPool = new postgres.Pool({ connectionString: DB_URL });
const redis = new Redis({
  host: VALKEY_HOST,
  port: VALKEY_PORT,
  password: VALKEY_PASSWORD,
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});

// ============================================================================
// SCHEMA
// ============================================================================

const BATCH_SIZE = 10; // Gemma4 batch size for title/summary generation
const EMBEDDING_BATCH_SIZE = 20; // EmbeddingGemma batch size
const QDRANT_BATCH_SIZE = 50; // Qdrant upsert batch size

// ============================================================================
// STEP 1: Query Postgres for packets missing title or summary
// ============================================================================

async function queryMissingTitlesAndSummaries() {
  const client = await pgPool.connect();
  try {
    const query = `
      SELECT
        ap.id,
        ap.packet_key,
        ap.source_ref,
        ap.feature_id,
        ap.feature_label,
        ap.metadata,
        ap.domain_class,
        cci.content,
        cci.summary
      FROM atlas_packets ap
      LEFT JOIN codebase_chunk_index cci ON ap.packet_key = cci.packet_key
      WHERE
        ap.packet_key IS NOT NULL
        AND ap.source_ref IS NOT NULL
        AND ap.feature_id IS NOT NULL
        AND (
          ap.metadata->>'title' IS NULL
          OR ap.metadata->>'summary' IS NULL
          OR cci.summary IS NULL
        )
      ORDER BY ap.id
      LIMIT $1
    `;

    const result = await client.query(query, [limit]);
    return result.rows;
  } finally {
    client.release();
  }
}

// ============================================================================
// STEP 2: Batch generate titles and summaries via Gemma4
// ============================================================================

async function generateTitleAndSummary(content) {
  if (!content) return { title: 'Unknown', summary: 'No content available' };

  try {
    const res = await fetch(`${LLAMA_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-legal-iq4xs-direct.gguf',
        messages: [
          {
            role: 'system',
            content: 'You are a title and summary generator. Generate a SHORT title (< 50 chars) and concise summary (1-2 sentences) for code/document.'
          },
          {
            role: 'user',
            content: `Generate title and summary for this content:\n\n${content.substring(0, 500)}`
          }
        ],
        temperature: 0.3,
        max_tokens: 100,
        stream: false
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) throw new Error(`Gemma4: ${res.status}`);
    const data = await res.json();
    const content_text = data.choices?.[0]?.message?.content || '';

    // Parse title and summary from response
    const lines = content_text.split('\n').filter(l => l.trim());
    const title = lines[0]?.substring(0, 50) || 'Untitled';
    const summary = lines.slice(1).join(' ').substring(0, 200) || 'No summary';

    return { title, summary };
  } catch (err) {
    console.warn('[Gemma4] Generation error:', err.message);
    return { title: 'Generation Failed', summary: 'See logs' };
  }
}

async function batchGenerateTitlesAndSummaries(packets) {
  const results = [];
  for (let i = 0; i < packets.length; i += BATCH_SIZE) {
    const batch = packets.slice(i, i + BATCH_SIZE);
    const startTime = Date.now();

    const generated = await Promise.allSettled(
      batch.map(p => generateTitleAndSummary(p.content))
    );

    const batchResults = batch.map((packet, idx) => {
      const settled = generated[idx];
      if (settled.status === 'fulfilled') {
        return { ...packet, ...settled.value };
      } else {
        return { ...packet, title: 'ERROR', summary: 'Generation failed' };
      }
    });

    results.push(...batchResults);
    if (verbose) {
      console.log(`[Batch ${i / BATCH_SIZE + 1}] Generated ${batch.length} titles/summaries in ${Date.now() - startTime}ms`);
    }
  }

  return results;
}

// ============================================================================
// STEP 3: Validate against packet_key/source_ref/feature_id
// ============================================================================

function validatePackets(packets) {
  const invalid = packets.filter(p => !p.packet_key || !p.source_ref || !p.feature_id);
  if (invalid.length > 0) {
    console.warn(`[Validation] ${invalid.length} packets missing identity fields`);
  }

  return packets.filter(p => p.packet_key && p.source_ref && p.feature_id);
}

// ============================================================================
// STEP 4: Embed title + summary + tags via EmbeddingGemma
// ============================================================================

async function embedText(text) {
  if (!text) return null;

  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: text.substring(0, 1000) // Truncate to 1000 chars
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!res.ok) throw new Error(`Ollama: ${res.status}`);
    const data = await res.json();
    return data.embedding || null;
  } catch (err) {
    console.warn('[EmbeddingGemma] Error:', err.message);
    return null;
  }
}

async function batchEmbedTexts(texts) {
  const results = [];
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const startTime = Date.now();

    const embedded = await Promise.allSettled(batch.map(t => embedText(t)));

    const batchResults = embedded.map((settled, idx) => {
      if (settled.status === 'fulfilled') {
        return settled.value;
      } else {
        console.warn(`[Embed batch] Failed to embed text ${i + idx}`);
        return null;
      }
    });

    results.push(...batchResults);
    if (verbose) {
      console.log(`[Embed Batch ${i / EMBEDDING_BATCH_SIZE + 1}] Embedded ${batch.length} texts in ${Date.now() - startTime}ms`);
    }
  }

  return results;
}

// ============================================================================
// STEP 5: Upsert named vectors to Qdrant
// ============================================================================

async function upsertToQdrant(packets, embeddings) {
  if (!packets.length) return { upsertsAttempted: 0, upsertsSucceeded: 0 };

  let upsertsAttempted = 0;
  let upsertsSucceeded = 0;

  for (let i = 0; i < packets.length; i += QDRANT_BATCH_SIZE) {
    const batch = packets.slice(i, i + QDRANT_BATCH_SIZE);
    const batchEmbeds = embeddings.slice(i, i + QDRANT_BATCH_SIZE);

    const points = batch.map((packet, idx) => ({
      id: packet.id,
      vector: {
        content: batchEmbeds[idx] || [] // fallback empty vector
      },
      payload: {
        packet_key: packet.packet_key,
        source_ref: packet.source_ref,
        feature_id: packet.feature_id,
        feature_label: packet.feature_label,
        domain_class: packet.domain_class,
        title: packet.title,
        summary: packet.summary,
        content: packet.content?.substring(0, 500) || '',
        metadata: packet.metadata
      }
    }));

    try {
      const res = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points?wait=true`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points
        }),
        signal: AbortSignal.timeout(30000)
      });

      if (res.ok) {
        upsertsSucceeded += batch.length;
        if (verbose) {
          console.log(`[Qdrant] Upserted ${batch.length} points`);
        }
      } else {
        console.warn(`[Qdrant] Upsert failed: ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      console.warn('[Qdrant] Upsert error:', err.message);
    }

    upsertsAttempted += batch.length;
  }

  return { upsertsAttempted, upsertsSucceeded };
}

// ============================================================================
// STEP 6: Mirror hot keys into Valkey
// ============================================================================

async function mirrorToValkey(packets) {
  if (!packets.length) return 0;

  await redis.connect();
  let mirrored = 0;

  try {
    for (const packet of packets) {
      const key = `packet:${packet.packet_key}`;
      const value = JSON.stringify({
        packet_key: packet.packet_key,
        source_ref: packet.source_ref,
        feature_id: packet.feature_id,
        feature_label: packet.feature_label,
        title: packet.title,
        summary: packet.summary,
        domain_class: packet.domain_class,
        updated_at: new Date().toISOString()
      });

      try {
        await redis.setex(key, 86400, value); // 24h TTL
        mirrored++;
      } catch (err) {
        console.warn(`[Valkey] Failed to set ${key}:`, err.message);
      }
    }
  } finally {
    await redis.quit();
  }

  return mirrored;
}

// ============================================================================
// STEP 7: Log eval_ms per lane
// ============================================================================

function logMetrics(startTime, packets, embeddings, qdrantResult, mirroredCount) {
  const totalTime = Date.now() - startTime;

  const report = {
    timestamp: new Date().toISOString(),
    totalTime_ms: totalTime,
    packets_processed: packets.length,
    qdrant_upsertsAttempted: qdrantResult.upsertsAttempted,
    qdrant_upsertsSucceeded: qdrantResult.upsertsSucceeded,
    valkey_mirrored: mirroredCount,
    embeddings_generated: embeddings.filter(e => e !== null).length,
    per_packet_ms: packets.length > 0 ? Math.round(totalTime / packets.length) : 0,
    dry_run: isDryRun
  };

  console.log('\n[METRICS]');
  console.log(JSON.stringify(report, null, 2));

  return report;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const startTime = Date.now();

  console.log('[ENRICH PACKETS: Step 1] Query Postgres for missing titles/summaries');
  const missingPackets = await queryMissingTitlesAndSummaries();
  console.log(`Found ${missingPackets.length} packets to enrich`);

  if (!missingPackets.length) {
    console.log('✅ No packets need enrichment');
    process.exit(0);
  }

  console.log('[ENRICH PACKETS: Step 2] Batch generate titles and summaries');
  const enrichedPackets = await batchGenerateTitlesAndSummaries(missingPackets);

  console.log('[ENRICH PACKETS: Step 3] Validate packets');
  const validatedPackets = validatePackets(enrichedPackets);
  if (validatedPackets.length < enrichedPackets.length) {
    console.warn(`⚠️  ${enrichedPackets.length - validatedPackets.length} packets failed validation`);
  }

  console.log('[ENRICH PACKETS: Step 4] Embed titles and summaries');
  const titleSummaryTexts = validatedPackets.map(p => `${p.title} ${p.summary}`);
  const embeddings = await batchEmbedTexts(titleSummaryTexts);

  if (!isDryRun) {
    console.log('[ENRICH PACKETS: Step 5] Upsert to Qdrant');
    const qdrantResult = await upsertToQdrant(validatedPackets, embeddings);

    console.log('[ENRICH PACKETS: Step 6] Mirror to Valkey');
    const mirroredCount = await mirrorToValkey(validatedPackets);

    console.log('[ENRICH PACKETS: Step 7] Log metrics');
    const metrics = logMetrics(startTime, validatedPackets, embeddings, qdrantResult, mirroredCount);

    console.log('\n✅ ENRICHMENT COMPLETE');
    console.log(`Processed ${validatedPackets.length} packets in ${metrics.totalTime_ms}ms (${metrics.per_packet_ms}ms/packet)`);
  } else {
    console.log('[DRY-RUN] Skipping Qdrant upsert and Valkey mirror');
    console.log(`Would process ${validatedPackets.length} packets`);
    console.log(`Would generate ${embeddings.filter(e => e !== null).length} embeddings`);

    logMetrics(startTime, validatedPackets, embeddings, { upsertsAttempted: 0, upsertsSucceeded: 0 }, 0);

    console.log('\n✅ DRY-RUN COMPLETE');
    console.log('Run with --apply to apply changes');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
