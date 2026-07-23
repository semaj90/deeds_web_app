#!/usr/bin/env node
/**
 * Batch Summarize Codebase Chunks
 *
 * Generates summaries for codebase_chunk_index via Gemma4
 * Writes results to Postgres + Qdrant multi-vector collection
 *
 * Minimal ACP stack:
 *   - TypeScript orchestration (no LangChain/LangGraph)
 *   - Postgres acp_events table for logging
 *   - Drizzle ORM for typed DB access
 *   - Gemma4 summaries (llama-server :8090)
 *   - Qdrant multi-vector with 'summary' named vector
 *   - pgvector mirror for canonical audit
 *
 * Usage:
 *   node scripts/atlas/batch-summarize-chunks.mjs --dry-run --batch-size 10
 *   node scripts/atlas/batch-summarize-chunks.mjs --apply --batch-size 50
 */

import process from 'process';
import crypto from 'crypto';
import pkg from 'pg';
import fetch from 'node-fetch';

const { Pool } = pkg;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONFIG
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const GEMMA4_URL = process.env.GEMMA4_URL || 'http://127.0.0.1:8090';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';

// ── Embedding contract (lane: summary_embedding_768) ──────────────────────────
// Provider:  Ollama http://127.0.0.1:11434
// Model:     embeddinggemma:latest
// Dimension: 768 (verified 2026-07-22 via direct Ollama probe)
// Column:    codebase_chunk_index.summary_embedding halfvec(768)
//
// DISTINCT from lane dense_384 (ONNX :8081, embeddinggemma 384-dim).
// Do NOT assume the model label alone implies identical output dimensions
// across endpoints.
const SUMMARY_EMBEDDING_DIMENSION = 768;
const SUMMARY_EMBEDDING_ENDPOINT  = 'http://127.0.0.1:11434';
const SUMMARY_EMBEDDING_MODEL     = 'embeddinggemma:latest';
const SUMMARY_GENERATION_MODEL    = 'gemma4-legal-iq4xs-direct.gguf';
const SUMMARY_PROMPT_VERSION      = 'v1';

// Quality gate: reject summaries outside this character range
const SUMMARY_MIN_CHARS = 80;
const SUMMARY_MAX_CHARS = 1200;

// Parse command-line args
const isDryRun = process.argv.includes('--dry-run');
const isApply = process.argv.includes('--apply');
const batchSizeArg = process.argv.find(arg => arg.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 50;
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 1000;
const offsetArg = process.argv.find(arg => arg.startsWith('--offset='));
const offset = offsetArg ? parseInt(offsetArg.split('=')[1]) : 0;

if (!isDryRun && !isApply) {
  console.error('Usage: node batch-summarize-chunks.mjs [--dry-run|--apply] [--batch-size=N] [--limit=N] [--offset=N]');
  process.exit(1);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DATABASE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const pool = new Pool({
  host: process.env.DATABASE_HOST || '127.0.0.1',
  port: parseInt(process.env.DATABASE_PORT || '5434'),
  user: process.env.DATABASE_USER || 'legal_admin',
  password: process.env.DATABASE_PASSWORD || '123456',
  database: process.env.DATABASE_NAME || 'legal_ai_db'
});

/**
 * Log ACP event to Postgres (minimal observability)
 */
async function logAcpEvent(eventType, status, metadata) {
  try {
    await pool.query(
      `INSERT INTO acp_events (event_type, status, metadata, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [eventType, status, JSON.stringify(metadata)]
    );
  } catch (err) {
    // acp_events table may not exist; silently skip
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GEMMA4 SUMMARIZATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Generate summary via Gemma4 llama-server (stream:true required — thinking model)
 */
async function generateSummary(content, sourceRef) {
  const prompt = `Summarize this code/documentation in 2-3 sentences (max 150 words).
Focus on WHAT it does, HOW it works, and WHY it matters.

Source: ${sourceRef}

Content:
${content.slice(0, 2000)}`;

  try {
    const response = await fetch(`${GEMMA4_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-legal-iq4xs-direct.gguf',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.3,
        stream: true,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      throw new Error(`Gemma4 returned ${response.status}`);
    }

    // Assemble SSE stream — required for Gemma4 thinking model
    let assembled = '';
    const decoder = new TextDecoder();
    let buf = '';
    for await (const chunk of response.body) {
      buf += decoder.decode(chunk, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') break;
        try {
          const parsed = JSON.parse(payload);
          assembled += parsed.choices?.[0]?.delta?.content ?? '';
        } catch { /* skip malformed SSE line */ }
      }
    }
    const text = assembled.trim();
    return text.length > 0 ? text : null;
  } catch (err) {
    console.error(`  ✗ Gemma4 error for ${sourceRef}:`, err.message);
    return null;
  }
}

/**
 * Embed summary via Ollama embeddinggemma (lane: summary_embedding_768).
 * Asserts exact dimension before returning — fails hard if the endpoint
 * returns a different length so mismatches are caught before any DB write.
 */
async function embedSummary(summary) {
  try {
    const response = await fetch(`${SUMMARY_EMBEDDING_ENDPOINT}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: SUMMARY_EMBEDDING_MODEL,
        prompt: summary
      }),
      signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const data = await response.json();
    const embedding = data.embedding;

    // Hard dimension assertion — do NOT silently truncate or pad
    if (!Array.isArray(embedding) || embedding.length !== SUMMARY_EMBEDDING_DIMENSION) {
      throw new Error(
        `SUMMARY_EMBEDDING_DIMENSION_MISMATCH: expected ${SUMMARY_EMBEDDING_DIMENSION}, ` +
        `got ${Array.isArray(embedding) ? embedding.length : 'non-array'} ` +
        `(endpoint=${SUMMARY_EMBEDDING_ENDPOINT}, model=${SUMMARY_EMBEDDING_MODEL})`
      );
    }

    return embedding;
  } catch (err) {
    console.error(`  ✗ Embedding error:`, err.message);
    return null;
  }
}

/** SHA-256 of content for provenance tracking */
function contentHash(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QDRANT UPSERT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Upsert summary vector to Qdrant multi-vector collection
 * Adds 'summary' named vector to existing point
 */
async function upsertQdrantSummary(qdrantId, summary, summaryEmbedding) {
  try {
    const response = await fetch(
      `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [
            {
              id: qdrantId,
              vector: {
                summary: summaryEmbedding
              },
              payload: {
                summary_text:              summary,
                summary_model:             SUMMARY_GENERATION_MODEL,
                summary_prompt_version:    SUMMARY_PROMPT_VERSION,
                summary_embedding_model:   SUMMARY_EMBEDDING_MODEL,
                summary_embedding_dim:     SUMMARY_EMBEDDING_DIMENSION,
                summary_generated_at:      new Date().toISOString()
              }
            }
          ]
        })
      }
    );

    if (!response.ok) {
      console.error(`  ✗ Qdrant upsert failed: ${response.status}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`  ✗ Qdrant error:`, err.message);
    return false;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function main() {
  console.log(`Batch Summarize Chunks`);
  console.log(`  Mode: ${isDryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`  Batch size: ${batchSize}`);
  console.log(`  Limit: ${limit}`);
  console.log(`  Gemma4: ${GEMMA4_URL}`);
  console.log(`  Qdrant: ${QDRANT_URL}/${QDRANT_COLLECTION}`);
  console.log();

  try {
    // Fetch chunks without summaries; use --offset=N to split work across parallel workers
    const result = await pool.query(
      `SELECT id, qdrant_id, relative_path, source_ref, content
       FROM codebase_chunk_index
       WHERE summary IS NULL OR summary = ''
       ORDER BY updated_at, id
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const chunks = result.rows;
    console.log(`Found ${chunks.length} chunks without summaries\n`);

    if (chunks.length === 0) {
      console.log('✓ All chunks already have summaries');
      await pool.end();
      return;
    }

    // Process in batches
    let processed = 0;
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      console.log(`\nBatch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)} (${batch.length} chunks)`);

      for (const chunk of batch) {
        process.stdout.write(`  Processing ${chunk.source_ref}... `);

        // Generate summary
        const summary = await generateSummary(chunk.content, chunk.source_ref);
        if (!summary) {
          console.log('✗ (generation failed)');
          failed++;
          processed++;
          continue;
        }

        // Embed summary
        const summaryEmbedding = await embedSummary(summary);
        if (!summaryEmbedding) {
          console.log('✗ (embedding failed)');
          failed++;
          processed++;
          continue;
        }

        // Quality gate: reject out-of-range summaries before any write
        if (summary.length < SUMMARY_MIN_CHARS) {
          console.log(`✗ (quality: too short ${summary.length} < ${SUMMARY_MIN_CHARS})`);
          failed++;
          processed++;
          continue;
        }
        if (summary.length > SUMMARY_MAX_CHARS) {
          console.log(`✗ (quality: too long ${summary.length} > ${SUMMARY_MAX_CHARS})`);
          failed++;
          processed++;
          continue;
        }

        if (isDryRun) {
          console.log(`✓ (${summary.length} chars, hash=${contentHash(chunk.content)})`);
          successful++;
          processed++;
          continue;
        }

        // Apply: Write to Postgres with full generation contract
        try {
          // summary_embedding is halfvec(768) — pass full 768-dim vector as '[x,x,...]'
          const vecLiteral = `[${summaryEmbedding.join(',')}]`;
          // Columns verified live 2026-07-22:
          //   summary, summary_model, summary_hash, summary_embedding (halfvec(768)), enriched_at
          // Provenance columns not yet in schema (summary_prompt_version, summary_embedding_model,
          //   summary_embedding_dim) — tracked in Qdrant payload + log instead.
          const chunkContentHash = contentHash(chunk.content);
          await pool.query(
            `UPDATE codebase_chunk_index
             SET summary           = $1,
                 summary_model     = $2,
                 summary_hash      = $3,
                 summary_embedding = $4::halfvec,
                 enriched_at      = NOW()
             WHERE id = $5`,
            [
              summary,
              SUMMARY_GENERATION_MODEL,
              chunkContentHash,
              vecLiteral,
              chunk.id,
            ]
          );

          // Upsert to Qdrant
          if (chunk.qdrant_id) {
            await upsertQdrantSummary(chunk.qdrant_id, summary, summaryEmbedding);
          }

          console.log('✓');
          successful++;
        } catch (err) {
          console.log(`✗ (write failed: ${err.message})`);
          failed++;
        }

        processed++;
      }

      console.log(`  Progress: ${processed}/${chunks.length} (${successful} successful, ${failed} failed)`);

      // Log batch event
      await logAcpEvent('chunk_summarization_batch', 'completed', {
        batch_size: batch.length,
        successful,
        failed,
        processed
      });
    }

    console.log(`\n━━━ SUMMARY ━━━`);
    console.log(`Processed: ${processed}/${chunks.length}`);
    console.log(`Successful: ${successful}`);
    console.log(`Failed: ${failed}`);
    console.log(`Mode: ${isDryRun ? 'DRY-RUN (no writes)' : 'APPLIED'}`);

    // Verify
    const verify = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(CASE WHEN summary IS NOT NULL AND summary != '' THEN 1 END) as with_summary
       FROM codebase_chunk_index`
    );

    const { total, with_summary } = verify.rows[0];
    console.log(`\nDatabase: ${with_summary}/${total} chunks have summaries (${Math.round(100 * with_summary / total)}%)`);

  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
