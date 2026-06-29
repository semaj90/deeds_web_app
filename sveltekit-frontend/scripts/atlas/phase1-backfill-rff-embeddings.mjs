#!/usr/bin/env node
/**
 * Phase 1: RFF Agentic Error Fixing — Backfill Error + Signature Embeddings
 *
 * Computes error_embedding and signature_embedding for all 40,754 chunks
 * using Ollama embeddinggemma for semantic search across 5 RFF lanes.
 *
 * RFF Lanes:
 *   Lane 1: content (primary semantic) — already populated
 *   Lane 2: error (error pattern matching) — BACKFILL THIS (45 min)
 *   Lane 3: signature (code structure) — BACKFILL THIS (45 min)
 *   Lane 4: BM25 (full-text keyword)
 *   Lane 5: Neo4j topology (graph relationships)
 *
 * Usage:
 *   node scripts/atlas/phase1-backfill-rff-embeddings.mjs --dry-run
 *   node scripts/atlas/phase1-backfill-rff-embeddings.mjs --apply
 *   node scripts/atlas/phase1-backfill-rff-embeddings.mjs --apply --batch-size 128
 *   node scripts/atlas/phase1-backfill-rff-embeddings.mjs --apply --error-only
 *   node scripts/atlas/phase1-backfill-rff-embeddings.mjs --apply --signature-only
 */

import pkg from 'pg';
const { Pool } = pkg;
import fetch from 'node-fetch';
import { execSync } from 'child_process';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const BATCH_SIZE = parseInt(
  process.argv.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || '256'
);
const ERROR_ONLY = process.argv.includes('--error-only');
const SIGNATURE_ONLY = process.argv.includes('--signature-only');
const VERBOSE = process.argv.includes('--verbose');

// Get Ollama URL from environment
const OLLAMA_HOST = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const OLLAMA_URL = OLLAMA_HOST.startsWith('http') ? OLLAMA_HOST : `http://${OLLAMA_HOST}:11434`;
const EMBED_MODEL = 'embeddinggemma:latest';

// Database connection
const pool = new Pool({
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || '123456',
  database: process.env.POSTGRES_DB || 'legal_ai_db'
});

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Phase 1: RFF Agentic Error Fixing — Backfill Embeddings      ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(54)}║`);
console.log(`║  Batch Size: ${BATCH_SIZE.toString().padEnd(50)}║`);
console.log(`║  Error+Signature: ${(!ERROR_ONLY && !SIGNATURE_ONLY ? 'BOTH' : ERROR_ONLY ? 'ERROR' : 'SIGNATURE').padEnd(45)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function checkOllama() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const models = data.models || [];
    const hasEmbed = models.some(m => m.name.includes('embeddinggemma'));

    console.log(`✓ Ollama healthy at ${OLLAMA_URL}`);
    if (!hasEmbed) console.log(`⚠ ${EMBED_MODEL} not found locally`);
    return true;
  } catch (e) {
    console.error(`✗ Ollama unreachable at ${OLLAMA_URL}: ${e.message}`);
    return false;
  }
}

async function embedChunk(content, type = 'error') {
  /**
   * Embed a chunk using Ollama embeddinggemma.
   * Returns 384-dim vector as Float32Array.
   */
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: content
      }),
      timeout: 30000
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (!data.embeddings || !data.embeddings[0]) {
      throw new Error('No embeddings in response');
    }

    return data.embeddings[0]; // 384-dim array
  } catch (e) {
    console.error(`  ✗ Embedding failed for ${type}: ${e.message}`);
    return null;
  }
}

async function backfillErrorEmbeddings() {
  console.log('📊 Phase 1a: Backfill Error Embeddings\n');

  const client = await pool.connect();
  try {
    // Get chunks without error_embedding
    const countRes = await client.query(`
      SELECT count(*) as total FROM codebase_chunk_index
      WHERE error_embedding IS NULL
    `);
    const totalMissing = parseInt(countRes.rows[0].total);

    console.log(`  Total chunks missing error_embedding: ${totalMissing}\n`);

    if (totalMissing === 0) {
      console.log('  ✓ All chunks have error_embedding, skipping\n');
      return { processed: 0, failed: 0 };
    }

    let processed = 0;
    let failed = 0;
    let offset = 0;
    const startTime = Date.now();

    while (offset < totalMissing) {
      // Fetch batch
      const batchRes = await client.query(`
        SELECT id, content FROM codebase_chunk_index
        WHERE error_embedding IS NULL
        ORDER BY id
        LIMIT $1 OFFSET $2
      `, [BATCH_SIZE, offset]);

      if (batchRes.rows.length === 0) break;

      const updateValues = [];
      const updateIds = [];

      // Process batch
      for (const row of batchRes.rows) {
        // Error patterns: "Error", "Exception", "panic", "fail", "wrong", "invalid", "bug"
        const errorPrompt = `error pattern: "${row.content.slice(0, 200)}"`;
        const embedding = await embedChunk(errorPrompt, 'error');

        if (embedding) {
          updateValues.push(`(${row.id}, '[${embedding.join(',')}]'::vector)`);
          updateIds.push(row.id);
          processed++;
        } else {
          failed++;
        }

        // Rate limit: ~1 req/sec to avoid overwhelming Ollama
        await new Promise(r => setTimeout(r, 100));
      }

      // Batch update if we're applying
      if (APPLY && updateValues.length > 0) {
        const updateSQL = `
          UPDATE codebase_chunk_index SET error_embedding = data.embedding
          FROM (VALUES ${updateValues.join(',')}) AS data(id, embedding)
          WHERE codebase_chunk_index.id = data.id
        `;
        await client.query(updateSQL);

        if (VERBOSE) {
          console.log(`  ✓ Updated ${updateIds.length} chunks (batch ${Math.ceil((offset + batchRes.rows.length) / BATCH_SIZE)})`);
        }
      } else if (DRY_RUN && batchRes.rows.length > 0) {
        console.log(`  [DRY-RUN] Would update ${batchRes.rows.length} chunks\n  Sample: ${updateValues[0]}`);
      }

      offset += batchRes.rows.length;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  Progress: ${offset}/${totalMissing} (${(offset/totalMissing*100).toFixed(1)}%) — ${elapsed}s`);
    }

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`\n  ✓ Backfill complete: ${processed} processed, ${failed} failed (${elapsed} min)\n`);

    return { processed, failed };
  } finally {
    client.release();
  }
}

async function backfillSignatureEmbeddings() {
  console.log('📊 Phase 1b: Backfill Signature Embeddings\n');

  const client = await pool.connect();
  try {
    // Get chunks without signature_embedding
    const countRes = await client.query(`
      SELECT count(*) as total FROM codebase_chunk_index
      WHERE signature_embedding IS NULL
    `);
    const totalMissing = parseInt(countRes.rows[0].total);

    console.log(`  Total chunks missing signature_embedding: ${totalMissing}\n`);

    if (totalMissing === 0) {
      console.log('  ✓ All chunks have signature_embedding, skipping\n');
      return { processed: 0, failed: 0 };
    }

    let processed = 0;
    let failed = 0;
    let offset = 0;
    const startTime = Date.now();

    while (offset < totalMissing) {
      // Fetch batch
      const batchRes = await client.query(`
        SELECT id, content FROM codebase_chunk_index
        WHERE signature_embedding IS NULL
        ORDER BY id
        LIMIT $1 OFFSET $2
      `, [BATCH_SIZE, offset]);

      if (batchRes.rows.length === 0) break;

      const updateValues = [];
      const updateIds = [];

      // Process batch
      for (const row of batchRes.rows) {
        // Signature: function/class structure, parameters, return type
        const signaturePrompt = `code signature: "${row.content.slice(0, 300)}"`;
        const embedding = await embedChunk(signaturePrompt, 'signature');

        if (embedding) {
          updateValues.push(`(${row.id}, '[${embedding.join(',')}]'::vector)`);
          updateIds.push(row.id);
          processed++;
        } else {
          failed++;
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 100));
      }

      // Batch update if we're applying
      if (APPLY && updateValues.length > 0) {
        const updateSQL = `
          UPDATE codebase_chunk_index SET signature_embedding = data.embedding
          FROM (VALUES ${updateValues.join(',')}) AS data(id, embedding)
          WHERE codebase_chunk_index.id = data.id
        `;
        await client.query(updateSQL);

        if (VERBOSE) {
          console.log(`  ✓ Updated ${updateIds.length} chunks (batch ${Math.ceil((offset + batchRes.rows.length) / BATCH_SIZE)})`);
        }
      } else if (DRY_RUN && batchRes.rows.length > 0) {
        console.log(`  [DRY-RUN] Would update ${batchRes.rows.length} chunks\n  Sample: ${updateValues[0]}`);
      }

      offset += batchRes.rows.length;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  Progress: ${offset}/${totalMissing} (${(offset/totalMissing*100).toFixed(1)}%) — ${elapsed}s`);
    }

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`\n  ✓ Backfill complete: ${processed} processed, ${failed} failed (${elapsed} min)\n`);

    return { processed, failed };
  } finally {
    client.release();
  }
}

async function verifyBackfill() {
  console.log('🔍 Verification\n');

  const res = await pool.query(`
    SELECT
      count(*) as total,
      count(error_embedding) as error_count,
      count(signature_embedding) as signature_count,
      count(CASE WHEN error_embedding IS NULL THEN 1 END) as error_missing,
      count(CASE WHEN signature_embedding IS NULL THEN 1 END) as signature_missing
    FROM codebase_chunk_index
  `);

  const row = res.rows[0];
  console.log(`  Total chunks: ${row.total}`);
  console.log(`  Error embeddings: ${row.error_count} (${(row.error_count/row.total*100).toFixed(1)}%)`);
  console.log(`  Signature embeddings: ${row.signature_count} (${(row.signature_count/row.total*100).toFixed(1)}%)`);

  if (row.error_missing > 0) {
    console.log(`  ⚠ Error embeddings missing: ${row.error_missing}`);
  }
  if (row.signature_missing > 0) {
    console.log(`  ⚠ Signature embeddings missing: ${row.signature_missing}`);
  }

  return row.error_missing === 0 && row.signature_missing === 0;
}

async function main() {
  const ollamaOk = await checkOllama();
  if (!ollamaOk) {
    console.error('✗ Cannot proceed without Ollama. Start with: npm run ollama:start');
    process.exit(1);
  }

  console.log('');

  let allGood = true;

  if (!SIGNATURE_ONLY) {
    const errorResult = await backfillErrorEmbeddings();
    if (errorResult.failed > 0) allGood = false;
  }

  if (!ERROR_ONLY) {
    const sigResult = await backfillSignatureEmbeddings();
    if (sigResult.failed > 0) allGood = false;
  }

  const verified = await verifyBackfill();

  console.log('');
  if (DRY_RUN) {
    console.log('✓ Dry-run complete. Run with --apply to persist changes.');
  } else if (verified && allGood) {
    console.log('✓ Phase 1 backfill APPLY_PROVEN');
  } else {
    console.log('⚠ Phase 1 backfill had failures. Check logs above.');
  }

  console.log('');
  await pool.end();
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
