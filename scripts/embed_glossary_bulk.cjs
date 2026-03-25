/**
 * Bulk Embedding Generator for legal_glossary
 * Generates 768-dim embeddings via Ollama embeddinggemma for all terms missing embeddings
 * Usage: node scripts/embed_glossary_bulk.cjs
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db'
});

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const BATCH_SIZE = 10;

async function generateEmbeddings(texts) {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'embeddinggemma:latest', input: texts }),
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json();
  return data.embeddings;
}

async function main() {
  // Get all terms missing embeddings
  const res = await pool.query(
    `SELECT id, term, definition, category FROM legal_glossary WHERE embedding IS NULL ORDER BY term`
  );
  const terms = res.rows;
  console.log(`Terms missing embeddings: ${terms.length}`);

  if (terms.length === 0) {
    console.log('All terms already have embeddings!');
    await pool.end();
    return;
  }

  let success = 0;
  let errors = 0;

  for (let i = 0; i < terms.length; i += BATCH_SIZE) {
    const batch = terms.slice(i, i + BATCH_SIZE);
    const texts = batch.map(t => `${t.term}: ${t.definition}`);

    try {
      const embeddings = await generateEmbeddings(texts);

      for (let j = 0; j < batch.length; j++) {
        const emb = embeddings[j];
        if (!emb || emb.length !== 768) {
          console.error(`  BAD embedding for "${batch[j].term}": got ${emb?.length ?? 0} dims`);
          errors++;
          continue;
        }
        const vecStr = '[' + emb.join(',') + ']';
        await pool.query(
          `UPDATE legal_glossary SET embedding = $1::vector WHERE id = $2`,
          [vecStr, batch[j].id]
        );
        success++;
      }
      process.stdout.write(`\r  Embedded: ${success}/${terms.length} (${errors} errors)`);
    } catch (err) {
      console.error(`\n  ERROR batch at ${i}: ${err.message}`);
      errors += batch.length;
    }
  }

  // Final stats
  const totalRes = await pool.query('SELECT COUNT(*) as total FROM legal_glossary');
  const embeddedRes = await pool.query('SELECT COUNT(*) as total FROM legal_glossary WHERE embedding IS NOT NULL');
  console.log(`\n\n=== EMBEDDING COMPLETE ===`);
  console.log(`  New embeddings: ${success}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total terms: ${totalRes.rows[0].total}`);
  console.log(`  Total with embeddings: ${embeddedRes.rows[0].total}`);

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
