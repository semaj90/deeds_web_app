#!/usr/bin/env node
/**
 * Backfill embeddings for research_summaries rows missing them.
 * Uses the /api/embed endpoint (which routes through gRPC → Ollama fallback).
 * Requires dev server running on port 5173.
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});

const EMBED_URL = `${process.env.PUBLIC_APP_URL ?? 'http://localhost:5173'}/api/embed`;
const BATCH_SIZE = 5;
const DELAY_MS = 200;

async function embedText(text) {
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model: 'embeddinggemma' }),
  });
  if (!res.ok) throw new Error(`Embed failed: ${res.status}`);
  const data = await res.json();
  return data.embedding;
}

async function main() {
  const { rows } = await pool.query(
    `SELECT id, query, summary FROM research_summaries WHERE embedding IS NULL ORDER BY created_at`
  );
  console.log(`Found ${rows.length} rows without embeddings`);

  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (row) => {
      const text = `${row.query}\n\n${row.summary}`;
      try {
        const embedding = await embedText(text);
        const vecStr = `[${embedding.join(',')}]`;
        await pool.query(
          `UPDATE research_summaries SET embedding = $1::vector WHERE id = $2`,
          [vecStr, row.id]
        );
        done++;
        process.stdout.write(`\r  ${done}/${rows.length} embedded`);
      } catch (err) {
        console.error(`\nFailed for ${row.id}: ${err.message}`);
      }
    }));
    if (i + BATCH_SIZE < rows.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }
  console.log(`\nDone! ${done} embeddings written.`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
