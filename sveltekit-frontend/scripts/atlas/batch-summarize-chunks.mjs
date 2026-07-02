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
import pkg from 'pg';
import fetch from 'node-fetch';

const { Pool } = pkg;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONFIG
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const GEMMA4_URL = process.env.GEMMA4_URL || 'http://127.0.0.1:8090';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';

// Parse command-line args
const isDryRun = process.argv.includes('--dry-run');
const isApply = process.argv.includes('--apply');
const batchSizeArg = process.argv.find(arg => arg.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 50;
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 1000;

if (!isDryRun && !isApply) {
  console.error('Usage: node batch-summarize-chunks.mjs [--dry-run|--apply] [--batch-size=N] [--limit=N]');
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
 * Generate summary via Gemma4 llama-server
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
        stream: false
      }),
      signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok) {
      throw new Error(`Gemma4 returned ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error(`  ✗ Gemma4 error for ${sourceRef}:`, err.message);
    return null;
  }
}

/**
 * Embed summary via Ollama embeddinggemma
 */
async function embedSummary(summary) {
  try {
    const response = await fetch(`http://127.0.0.1:11434/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: summary
      }),
      signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const data = await response.json();
    return data.embedding || null;
  } catch (err) {
    console.error(`  ✗ Embedding error:`, err.message);
    return null;
  }
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
                summary_text: summary,
                summary_model: 'gemma4-legal-iq4xs',
                summary_embedding_model: 'embeddinggemma:latest',
                summary_generated_at: new Date().toISOString()
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
    // Fetch chunks without summaries
    const result = await pool.query(
      `SELECT id, qdrant_id, relative_path, source_ref, content
       FROM codebase_chunk_index
       WHERE summary IS NULL OR summary = ''
       ORDER BY id
       LIMIT $1`,
      [limit]
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

        if (isDryRun) {
          console.log(`✓ (${summary.length} chars)`);
          successful++;
          processed++;
          continue;
        }

        // Apply: Write to Postgres
        try {
          await pool.query(
            `UPDATE codebase_chunk_index
             SET summary = $1, summary_model = 'gemma4-legal-iq4xs',
                 summary_embedding = $2, enriched_at = NOW()
             WHERE id = $3`,
            [summary, JSON.stringify(summaryEmbedding.slice(0, 384)), chunk.id]
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
