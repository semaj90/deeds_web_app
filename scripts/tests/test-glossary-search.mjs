import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

async function testSearch() {
  // Test 1: Semantic search
  const resp = await fetch('http://localhost:11434/api/embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'embeddinggemma:latest', input: ['self defense justification'] }),
    signal: AbortSignal.timeout(10000)
  });
  const data = await resp.json();
  const vec = data.embeddings[0];

  const res = await pool.query(
    `SELECT term, category, 1 - (embedding <=> $1::vector) as similarity
     FROM legal_glossary WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector LIMIT 8`,
    ['[' + vec.join(',') + ']']
  );
  console.log('=== Semantic search: "self defense justification" ===');
  res.rows.forEach(r => console.log(`  ${r.similarity.toFixed(3)} | ${r.category.padEnd(16)} | ${r.term}`));

  // Test 2: Category distribution
  const cats = await pool.query(
    'SELECT category, COUNT(*)::int as cnt FROM legal_glossary GROUP BY category ORDER BY cnt DESC'
  );
  console.log('\n=== Categories ===');
  cats.rows.forEach(r => console.log(`  ${r.category.padEnd(22)} ${r.cnt}`));

  // Test 3: FTS search
  const fts = await pool.query(
    `SELECT term, category FROM legal_glossary
     WHERE to_tsvector('english', term || ' ' || definition) @@ websearch_to_tsquery('english', 'fourth amendment search seizure')
     LIMIT 5`
  );
  console.log('\n=== FTS: "fourth amendment search seizure" ===');
  fts.rows.forEach(r => console.log(`  ${r.category.padEnd(16)} | ${r.term}`));

  pool.end();
}

testSearch().catch(e => { console.error(e.message); pool.end(); process.exit(1); });
