const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1',
  port: 5434,
  user: 'legal_admin',
  password: '123456',
  database: 'legal_ai_db'
});

async function main() {
  await client.connect();

  console.log('Testing pgvector cosine query over codebase_chunk_index with 768 HNSW:');
  const dummyVector = new Array(768).fill(0.01);
  const vecStr = '[' + dummyVector.join(',') + ']';

  const t0 = Date.now();
  const res = await client.query(`
    EXPLAIN ANALYZE
    SELECT id, chunk_id, source_ref, 1 - (content_embedding_768 <=> $1::vector) AS score
    FROM codebase_chunk_index
    WHERE content_embedding_768 IS NOT NULL
    ORDER BY content_embedding_768 <=> $1::vector
    LIMIT 10
  `, [vecStr]);

  const duration = Date.now() - t0;
  console.log(`Query execution time: ${duration}ms`);
  console.log('EXPLAIN ANALYZE Plan:');
  res.rows.forEach(r => console.log('  ', r['QUERY PLAN']));

  await client.end();
}
main().catch(console.error);
