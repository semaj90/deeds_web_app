import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const EMBED_MODEL = process.env.EMBED_MODEL || 'embeddinggemma:latest';
const BATCH_SIZE = 25;

async function embedBatch(texts) {
  const resp = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) {
    throw new Error(`Embedding failed: ${resp.status} ${resp.statusText}`);
  }
  const data = await resp.json();
  return data.embeddings;
}

async function main() {
  const { rows } = await pool.query(
    'SELECT id, term, definition FROM legal_glossary WHERE embedding IS NULL ORDER BY id'
  );
  console.log(`Found ${rows.length} glossary rows needing embeddings`);
  if (rows.length === 0) {
    await pool.end();
    return;
  }

  let updated = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE);
    const texts = slice.map(r => `${r.term}: ${r.definition}`);
    try {
      const embeddings = await embedBatch(texts);
      for (let j = 0; j < slice.length; j++) {
        const vec = embeddings[j];
        if (vec && vec.length === 768) {
          const vecStr = '[' + vec.join(',') + ']';
          await pool.query(
            'UPDATE legal_glossary SET embedding = $1::vector, updated_at = NOW() WHERE id = $2',
            [vecStr, slice[j].id]
          );
          updated++;
        }
      }
      process.stdout.write(`\r  Embedded: ${updated}/${rows.length}`);
    } catch (err) {
      console.error(`\nBatch error at ${i}:`, err.message);
    }
  }

  console.log(`\nEmbedding complete: ${updated} rows updated.`);
  const check = await pool.query('SELECT COUNT(*) as total, COUNT(embedding) as embedded FROM legal_glossary');
  console.log(`Total: ${check.rows[0].total}, Embedded: ${check.rows[0].embedded}`);
  await pool.end();
}

main().catch(err => {
  console.error(err);
  pool.end();
  process.exit(1);
});
