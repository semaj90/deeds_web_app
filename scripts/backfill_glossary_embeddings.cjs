/**
 * Backfill embeddings for glossary rows that have embedding IS NULL.
 * Uses Ollama embeddinggemma:latest (768-dim).
 *
 * Usage: node scripts/backfill_glossary_embeddings.cjs
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBED_MODEL = process.env.EMBED_MODEL || 'embeddinggemma:latest';

async function getEmbedding(text) {
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: [text] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const vec = data.embeddings?.[0];
    if (!vec || !vec.length) return null;
    return '[' + vec.join(',') + ']';
  } catch {
    return null;
  }
}

async function main() {
  // Find rows without embeddings
  const { rows } = await pool.query(
    `SELECT id, term, definition FROM legal_glossary WHERE embedding IS NULL ORDER BY term`
  );
  console.log(`Found ${rows.length} rows without embeddings\n`);

  if (rows.length === 0) {
    console.log('All rows already have embeddings.');
    await pool.end();
    return;
  }

  let success = 0;
  let failed = 0;

  for (const row of rows) {
    const text = `${row.term}: ${row.definition}`;
    const vec = await getEmbedding(text);

    if (vec) {
      await pool.query(
        `UPDATE legal_glossary SET embedding = $1::vector, updated_at = NOW() WHERE id = $2`,
        [vec, row.id]
      );
      success++;
      process.stdout.write(`\r  Embedded: ${success}/${rows.length} (${failed} failed)`);
    } else {
      failed++;
      console.log(`\n  FAIL: "${row.term}" — Ollama returned null`);
    }
  }

  // Final count
  const countRes = await pool.query('SELECT COUNT(*) as total FROM legal_glossary WHERE embedding IS NOT NULL');
  console.log(`\n\n=== EMBEDDING BACKFILL COMPLETE ===`);
  console.log(`  Embedded: ${success}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Total with embeddings: ${countRes.rows[0].total}`);

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
