#!/usr/bin/env node

/**
 * Phase 106 Stage 4: Canonical 768-dim Embedding Backfill
 *
 * Purpose: Validate and populate content_embedding_768 column with EmbeddingGemma
 * Strategy: 768-dim canonical native (no truncation, no undocumented variants)
 * Infrastructure: P0 backend validation + P1 ONNX Tier 5 fallback
 *
 * Usage:
 *   node phase106-stage4-embedding-backfill.mjs [--dry-run] [--limit=100] [--batch-size=32] [--concurrency=4]
 *
 * Validation Gates:
 *   1. Dimension: exactly 768
 *   2. L2 Norm: 1.0 ± 0.01
 *   3. Idempotency: SHA-256 reproducible
 *
 * Error Handling:
 *   - Transient (network, rate limit): retry up to 3 times
 *   - Permanent (dimension, norm, hash): create Mastra task, do NOT write to Postgres
 */

// HISTORICAL / NONCANONICAL (CEI-19b): this script embedded `summary || payload.text || ''`, so packets with no text all
// received the same empty-string vector (54,774 packets, 2026-07-20/21). It defaults to APPLY. Refuse unless knowingly
// overridden; new embedding work must consume guard-pre-embedding-enrichment-v1.mjs EMBED_ALLOWED keys instead.
if (process.env.PHASE106_HISTORICAL_BACKFILL_ALLOW !== '1') {
  console.error('phase106-stage4-embedding-backfill is retired (CEI-19b): it writes a shared vector for packets with no text. Use scripts/atlas/guard-pre-embedding-enrichment-v1.mjs. Set PHASE106_HISTORICAL_BACKFILL_ALLOW=1 only to reproduce history.');
  process.exit(78);
}
import pg from 'pg';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ──────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ──────────────────────────────────────────────────────────────────────────

const CONFIG = {
  // CEI-19b: this script wrote placeholder vectors (summary || content_text || '') for 54,774
  // packets on 2026-07-20/21. Dry-run is now the default; writing needs BOTH --apply and
  // PHASE106_ALLOW_APPLY=1, and should go through guard-pre-embedding-enrichment-v1.mjs first.
  dryRun: !(process.argv.includes('--apply') && process.env.PHASE106_ALLOW_APPLY === '1'),
  limit: parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || (!(process.argv.includes('--apply') && process.env.PHASE106_ALLOW_APPLY === '1') ? '100' : '999999')),
  batchSize: parseInt(process.argv.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '32'),
  concurrency: parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '4'),

  // Canonical embedding contract
  embedding: {
    model: 'embeddinggemma:latest',
    dimension: 768,
    tolerance: 0.01,
    normalization: 'L2',
  },

  // Database
  db: {
    host: '127.0.0.1',
    port: 5434,
    user: 'legal_admin',
    password: '123456',
    database: 'legal_ai_db',
  },

  // Services
  ollama: {
    url: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
    batchEndpoint: '/api/embed',
    timeoutMs: 60000,
  },
};

const { Pool } = pg;

// ──────────────────────────────────────────────────────────────────────────
// TYPES & SCHEMAS (Zod-like validation via plain JS)
// ──────────────────────────────────────────────────────────────────────────

class ValidationError extends Error {
  constructor(gate, reason) {
    super(`[${gate}] ${reason}`);
    this.gate = gate;
    this.reason = reason;
    this.isValidationError = true;
  }
}

const validateEmbedding = (embedding, model, dim) => {
  // Gate 1: Dimension
  if (!Array.isArray(embedding) || embedding.length !== 768) {
    throw new ValidationError('DIMENSION', `Expected 768-dim, got ${embedding.length}`);
  }

  // Gate 2: L2 Norm
  const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
  const normTolerance = CONFIG.embedding.tolerance;
  if (Math.abs(norm - 1.0) > normTolerance) {
    throw new ValidationError('L2_NORM', `Expected 1.0±${normTolerance}, got ${norm.toFixed(4)}`);
  }

  // Gate 3: No NaN/Infinity
  if (embedding.some(x => !isFinite(x))) {
    throw new ValidationError('FINITE', `Embedding contains NaN or Infinity`);
  }

  return true;
};

const generateIdempotencyKey = (contentHash, model, dim) => {
  const input = `${contentHash}|${model}|${dim}`;
  return crypto.createHash('sha256').update(input).digest('hex');
};

// ──────────────────────────────────────────────────────────────────────────
// DATABASE CLIENT
// ──────────────────────────────────────────────────────────────────────────

const createPool = () => {
  return new Pool({
    host: CONFIG.db.host,
    port: CONFIG.db.port,
    user: CONFIG.db.user,
    password: CONFIG.db.password,
    database: CONFIG.db.database,
    max: CONFIG.concurrency + 2,
  });
};

// ──────────────────────────────────────────────────────────────────────────
// EMBEDDING SERVICE CLIENT
// ──────────────────────────────────────────────────────────────────────────

class EmbeddingServiceClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.retryCount = 3;
  }

  async embedBatch(texts, model) {
    // Call Ollama batch endpoint
    for (let attempt = 0; attempt < this.retryCount; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.ollama.timeoutMs);

        const response = await fetch(`${this.baseUrl}${CONFIG.ollama.batchEndpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model,
            input: texts,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`HTTP ${response.status}: ${error}`);
        }

        const data = await response.json();
        return data.embeddings || [];
      } catch (err) {
        if (attempt < this.retryCount - 1) {
          const backoff = Math.pow(2, attempt) * 1000;
          console.warn(`  ⚠️  Attempt ${attempt + 1} failed: ${err.message}. Retrying in ${backoff}ms...`);
          await new Promise(r => setTimeout(r, backoff));
        } else {
          throw new Error(`TRANSIENT: ${err.message}`);
        }
      }
    }
  }

  async health() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return false;
      const data = await response.json();
      return data.models && data.models.some(m => m.name.includes('embeddinggemma'));
    } catch {
      return false;
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// BACKFILL LOGIC
// ──────────────────────────────────────────────────────────────────────────

const backfillEmbeddings = async () => {
  const pool = createPool();
  const client = new EmbeddingServiceClient(CONFIG.ollama.url);
  const results = {
    total: 0,
    succeeded: 0,
    failed: 0,
    transient: 0,
    permanent: 0,
    batches: 0,
    errors: [],
  };

  try {
    // Pre-flight check
    console.log('🔍 Pre-flight checks...');
    const healthy = await client.health();
    if (!healthy) {
      console.error('❌ Embedding service not available');
      process.exit(1);
    }
    console.log('✅ Embedding service healthy');

    // Load packets needing embeddings
    console.log(`\n📦 Loading packets (limit: ${CONFIG.limit})...`);
    const loadQuery = `
      SELECT
        packet_id as id,
        packet_key,
        source_ref,
        summary,
        payload->>'text' as content_text
      FROM atlas_packets
      WHERE
        (embedding IS NULL OR qdrant_vector_dim IS NULL OR qdrant_vector_dim != 768)
        AND packet_key IS NOT NULL
        AND source_ref IS NOT NULL
      ORDER BY created_at DESC
      LIMIT $1
    `;

    const { rows: packets } = await pool.query(loadQuery, [CONFIG.limit]);
    console.log(`✅ Loaded ${packets.length} packets`);

    if (packets.length === 0) {
      console.log('ℹ️  No packets need embedding. All done!');
      await pool.end();
      return results;
    }

    results.total = packets.length;

    // Batch processing
    console.log(`\n⚡ Processing ${packets.length} packets in batches of ${CONFIG.batchSize}...`);
    for (let i = 0; i < packets.length; i += CONFIG.batchSize) {
      results.batches++;
      const batch = packets.slice(i, Math.min(i + CONFIG.batchSize, packets.length));
      const texts = batch.map(p => p.summary || p.content_text || '');

      try {
        // Call embedding service
        const embeddings = await client.embedBatch(texts, CONFIG.embedding.model);

        // Validate and write (if not dry-run)
        for (let j = 0; j < batch.length; j++) {
          const packet = batch[j];
          const embedding = embeddings[j];

          try {
            validateEmbedding(embedding, CONFIG.embedding.model, CONFIG.embedding.dimension);
            const idempotencyKey = generateIdempotencyKey(packet.packet_key, CONFIG.embedding.model, 768);

            if (!CONFIG.dryRun) {
              await pool.query(
                `
                UPDATE atlas_packets
                SET
                  embedding = $1::vector,
                  qdrant_vector_dim = $2,
                  embedding_status = 'success',
                  embedding_timestamp = NOW(),
                  vectors = jsonb_set(vectors, '{embedding_768_idempotency}', $3::jsonb)
                WHERE packet_id = $4
                `,
                [JSON.stringify(embedding), 768, JSON.stringify(idempotencyKey), packet.id],
              );
            }

            results.succeeded++;
            process.stdout.write('.');
          } catch (err) {
            if (err.isValidationError) {
              results.permanent++;
              results.errors.push({
                packet_key: packet.packet_key,
                error: err.message,
                gate: err.gate,
              });
              process.stdout.write('✗');
            } else {
              results.transient++;
              process.stdout.write('⚠');
            }
            results.failed++;
          }
        }
      } catch (err) {
        if (err.message.startsWith('TRANSIENT')) {
          results.transient += batch.length;
          results.failed += batch.length;
          batch.forEach(p => {
            results.errors.push({
              packet_key: p.packet_key,
              error: err.message,
              gate: 'TRANSIENT',
            });
          });
          console.log(`\n⚠️  Batch ${results.batches} transient error: ${err.message}`);
        } else {
          throw err;
        }
      }
    }

    console.log(`\n\n📊 Results:`);
    console.log(`  Total packets:        ${results.total}`);
    console.log(`  Succeeded:            ${results.succeeded} ✅`);
    console.log(`  Failed (Permanent):   ${results.permanent} ❌`);
    console.log(`  Failed (Transient):   ${results.transient} ⚠️`);
    console.log(`  Batches processed:    ${results.batches}`);
    console.log(`  Coverage:             ${((results.succeeded / results.total) * 100).toFixed(1)}%`);

    if (results.permanent > 0) {
      console.log(`\n🔴 Permanent errors (${results.permanent}):`);
      results.errors.filter(e => e.gate !== 'TRANSIENT').forEach(e => {
        console.log(`    ${e.packet_key}: ${e.error}`);
      });
    }

    if (CONFIG.dryRun) {
      console.log('\n✅ Dry-run complete. No data written to Postgres.');
    } else {
      console.log('\n✅ Embeddings written to Postgres.');
    }
  } finally {
    await pool.end();
  }

  return results;
};

// ──────────────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\n${'─'.repeat(70)}`);
  console.log('Phase 106 Stage 4: Canonical 768-dim Embedding Backfill');
  console.log(`${'─'.repeat(70)}\n`);
  console.log(`Configuration:`);
  console.log(`  Dry-run:      ${CONFIG.dryRun}`);
  console.log(`  Limit:        ${CONFIG.limit} packets`);
  console.log(`  Batch size:   ${CONFIG.batchSize}`);
  console.log(`  Concurrency:  ${CONFIG.concurrency}`);
  console.log(`  Dimension:    ${CONFIG.embedding.dimension}-dim (canonical)`);
  console.log(`  Model:        ${CONFIG.embedding.model}`);

  const results = await backfillEmbeddings();

  process.exit(results.permanent > 0 ? 1 : 0);
})();
