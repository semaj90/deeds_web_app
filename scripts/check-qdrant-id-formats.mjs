import { Client } from 'pg';

async function main() {
  const client = new Client({
    host: '127.0.0.1',
    port: 5434,
    user: 'legal_admin',
    password: '123456',
    database: 'legal_ai_db'
  });
  await client.connect();

  const res = await client.query(`
    SELECT
      count(*) FILTER (WHERE qdrant_id ~ '^[0-9]+$') as numeric_qdrant_ids,
      count(*) FILTER (WHERE qdrant_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') as uuid_qdrant_ids,
      count(*) FILTER (WHERE qdrant_id !~ '^[0-9]+$' AND qdrant_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') as other_qdrant_ids,
      count(*) as total
    FROM codebase_chunk_index
  `);
  console.log('Qdrant ID breakdown in codebase_chunk_index:', res.rows[0]);

  await client.end();
}

main().catch(console.error);
