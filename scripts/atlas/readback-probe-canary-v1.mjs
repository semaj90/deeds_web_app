import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });

async function probe() {
  const { rows } = await pool.query(`
    SELECT id, relative_path, content, embedding_model,
           vector_dims(content_embedding::vector) as dims,
           content_embedding::text as vec_text
    FROM codebase_chunk_index
    WHERE embedding_model = 'embeddinggemma:latest:eg-task-prefix-v1'
    ORDER BY updated_at DESC
    LIMIT 10
  `);

  console.log(`Successfully probed ${rows.length} rows:`);
  for (const r of rows) {
    console.log(`  id: ${r.id} | dims: ${r.dims} | model: ${r.embedding_model} | path: ${r.relative_path}`);
  }

  // Verify cosine similarity on row 0 against fresh re-embed
  const sample = rows[0];
  const prompt = `title: ${sample.relative_path?.trim() || 'none'} | text: ${sample.content.trim()}`;
  const res = await fetch('http://127.0.0.1:11434/api/embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'embeddinggemma:latest', input: [prompt] }),
  });
  const data = await res.json();
  const freshVec = data.embeddings[0];
  const storedVec = JSON.parse(sample.vec_text);

  let dot = 0, nFresh = 0, nStored = 0;
  for (let i = 0; i < 768; i++) {
    dot += freshVec[i] * storedVec[i];
    nFresh += freshVec[i] * freshVec[i];
    nStored += storedVec[i] * storedVec[i];
  }
  const cosine = dot / (Math.sqrt(nFresh) * Math.sqrt(nStored));
  console.log(`Readback sample ${sample.id} cosine similarity stored vs fresh: ${cosine.toFixed(7)}`);


  // Probe total count of tagged rows
  const countRes = await pool.query(`
    SELECT count(*)::int as total_tagged
    FROM codebase_chunk_index
    WHERE embedding_model = 'embeddinggemma:latest:eg-task-prefix-v1'
  `);
  console.log(`Total canonical task-prefix tagged rows: ${countRes.rows[0].total_tagged}`);

  await pool.end();
}

probe().catch((err) => {
  console.error('Probe failed:', err);
  process.exit(1);
});
