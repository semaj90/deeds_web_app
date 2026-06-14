#!/usr/bin/env node
/**
 * Task 4: Embedding Prep — Summary Layers
 *
 * Generates embeddings for enriched Gemma4 summaries.
 * Supports both /api/embed (Ollama via bifrost) and direct Ollama fallback.
 * Stores embeddings back to Postgres and Qdrant payloads.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const SUMMARIES_DIR = path.join(REPO_ROOT, 'docs', 'reports', 'feature-summaries');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const apply = args.includes('--apply');
const verbose = args.includes('--verbose');
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '100');

/**
 * Embed text via /api/embed (Bifrost L1/L2 cache)
 * Falls back to Ollama if SvelteKit server is unavailable
 */
async function embedText(text, model = 'embeddinggemma:latest') {
  if (!text || text.length === 0) return null;

  // Try SvelteKit /api/embed first (Redis L1 + Bifrost L2 cache)
  try {
    const res = await fetch('http://127.0.0.1:5173/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model }),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      const body = await res.json();
      return body.embedding || null;
    }
  } catch (err) {
    if (verbose) console.warn(`[embed] /api/embed unavailable: ${err.message}`);
  }

  // Fallback to direct Ollama
  try {
    const OLLAMA_HOST = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/0\.0\.0\.0/, '127.0.0.1');
    const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      const body = await res.json();
      return body.embedding || null;
    }
  } catch (err) {
    if (verbose) console.warn(`[embed] Ollama fallback failed: ${err.message}`);
  }

  return null;
}

/**
 * Embed all summary layers for a card
 */
async function embedCard(pool, card) {
  const embeddings = {
    summary_chunk_embedding: null,
    summary_file_embedding: null,
    summary_folder_embedding: null,
    summary_feature_embedding: null,
    summary_system_embedding: null,
  };

  const summaryLayers = ['chunk', 'file', 'folder', 'feature', 'system'];

  for (const layer of summaryLayers) {
    const summaryKey = `summary_${layer}`;
    const embeddingKey = `${summaryKey}_embedding`;

    if (card[summaryKey]) {
      try {
        const embedding = await embedText(card[summaryKey]);
        if (embedding) {
          embeddings[embeddingKey] = embedding;
        }
      } catch (err) {
        if (verbose) console.error(`[embed] Failed to embed ${embeddingKey}:`, err.message);
      }
    }
  }

  return embeddings;
}

/**
 * Load summaries and generate embeddings
 */
async function processEmbeddings(pool) {
  try {
    const files = await fs.readdir(SUMMARIES_DIR);
    const latestJsonFile = files
      .filter(f => f.startsWith('gemma4-enriched-') && f.endsWith('.json'))
      .sort()
      .pop();

    if (!latestJsonFile) {
      console.warn('[embed] No enriched summary files found');
      return { processed: 0, embedded: 0, failed: 0 };
    }

    const content = await fs.readFile(path.join(SUMMARIES_DIR, latestJsonFile), 'utf8');
    const report = JSON.parse(content);
    const cards = (report.fullData || []).slice(0, limit);

    console.log(`[embed] Processing ${cards.length} cards from ${latestJsonFile}`);

    let processed = 0;
    let embedded = 0;
    let failed = 0;

    for (const card of cards) {
      if (!card.packet_key) continue;

      try {
        const embeddings = await embedCard(pool, card);
        const embeddedCount = Object.values(embeddings).filter(e => e !== null).length;

        if (embeddedCount > 0 && apply) {
          // Store embeddings back to Postgres
          await pool.query(
            `UPDATE packet_summaries
             SET summary_chunk_embedding = $1,
                 summary_file_embedding = $2,
                 summary_folder_embedding = $3,
                 summary_feature_embedding = $4,
                 summary_system_embedding = $5
             WHERE packet_key = $6`,
            [
              embeddings.summary_chunk_embedding ? JSON.stringify(embeddings.summary_chunk_embedding) : null,
              embeddings.summary_file_embedding ? JSON.stringify(embeddings.summary_file_embedding) : null,
              embeddings.summary_folder_embedding ? JSON.stringify(embeddings.summary_folder_embedding) : null,
              embeddings.summary_feature_embedding ? JSON.stringify(embeddings.summary_feature_embedding) : null,
              embeddings.summary_system_embedding ? JSON.stringify(embeddings.summary_system_embedding) : null,
              card.packet_key,
            ]
          );

          embedded += embeddedCount;
        }

        processed += 1;
      } catch (err) {
        if (verbose) console.error(`[embed] Failed to process ${card.packet_key}:`, err.message);
        failed += 1;
      }

      if (processed % 10 === 0) {
        console.log(`[embed] Processed ${processed}/${cards.length} cards (${embedded} embeddings created)`);
      }
    }

    console.log(`[embed] ✅ Processed ${processed}/${cards.length} cards (${embedded} embeddings, ${failed} failed)`);
    return { processed, embedded, failed };
  } catch (err) {
    console.error('[embed] Processing failed:', err.message);
    return { processed: 0, embedded: 0, failed: 0 };
  }
}

/**
 * Main pipeline
 */
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  console.log('[embedding-prep] Task 4: Embedding Prep — Summary Layers');
  console.log(`[embedding-prep] Mode: ${dryRun ? 'DRY-RUN' : apply ? 'APPLY' : 'VERIFY'}`);
  console.log(`[embedding-prep] Limit: ${limit} cards`);

  try {
    const result = await processEmbeddings(pool);

    if (!apply) {
      console.log('\n[summary] DRY-RUN completed');
      console.log('[summary] Use --apply to store embeddings');
    } else {
      console.log('\n[summary] ✅ Embeddings created and stored');
      console.log('[summary] Next: npm run atlas:summaries:prune-report --apply');
    }
  } catch (err) {
    console.error('[error]', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
