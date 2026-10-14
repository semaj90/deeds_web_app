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
  const res = await client.query(`
    SELECT id, chunk_id, source_ref, content_hash, qdrant_id, length(content) as content_len 
    FROM codebase_chunk_index 
    WHERE chunk_id = '3188887a-0a08-48fb-ac55-9fa041e28136' OR qdrant_id = '1'
  `);
  console.log('Postgres match for Point 1:', res.rows);
  await client.end();
}
main().catch(console.error);
