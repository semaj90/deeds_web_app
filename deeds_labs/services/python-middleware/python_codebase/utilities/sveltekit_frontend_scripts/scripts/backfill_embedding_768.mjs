#!/usr/bin/env node
/*
 Backfill script for embedding_768 (embeddinggemma:latest)
 Usage: set DB env vars or rely on defaults, then run:
   node scripts/backfill_embedding_768.mjs

 The script queries `public.vector_embeddings` for rows with NULL embedding_768,
 requests embeddinggemma from local Ollama, and updates the DB in batches.
*/

import postgres from 'postgres';

const DB_URL = process.env.DATABASE_URL || `postgresql://${process.env.DB_USER || 'legal_admin'}:${process.env.DB_PASSWORD || '123456'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'legal_ai_db'}`;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.EMBEDDING_MODEL || 'embeddinggemma:latest';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100', 10);
const PAUSE_MS = parseInt(process.env.PAUSE_MS || '100', 10);

const sql = postgres(DB_URL, { max: 10 });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function getEmbedding(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input: text })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Ollama error ${res.status}: ${t}`);
  }
  const j = await res.json();
  // Support several response shapes
  const emb = j?.data?.[0]?.embedding ?? j?.embedding ?? (j?.result && j.result[0] && j.result[0].embedding);
  if (!Array.isArray(emb)) throw new Error('No embedding array returned');
  return emb;
}

async function main() {
  console.log('Backfill embedding_768: DB=', DB_URL.split('@')[1] || DB_URL, 'Ollama=', OLLAMA_URL, 'model=', MODEL);

  while (true) {
    const rows = await sql`SELECT id, content FROM public.vector_embeddings WHERE embedding_768 IS NULL LIMIT ${BATCH_SIZE}`;
    if (!rows || rows.length === 0) {
      console.log('No more rows to backfill.');
      break;
    }
    console.log(`Processing batch of ${rows.length} rows...`);
    for (const r of rows) {
      try {
        const emb = await getEmbedding(r.content);
        const vecText = `[${emb.join(',')}]`;
        // Update embedding_768 using parameterized value, then cast to vector(768)
        await sql`UPDATE public.vector_embeddings SET embedding_768 = ${vecText}::vector(768), embedding_model = ${MODEL} WHERE id = ${r.id}`;
        console.log('Updated', r.id);
        await sleep(PAUSE_MS);
      } catch (err) {
        console.error('Failed to process id=', r.id, err.message || err);
      }
    }
    // short pause between batches
    await sleep(500);
  }

  await sql.end({ timeout: 5 });
  console.log('Backfill complete.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
