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

  const cols = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'qdrant_centroid_clusters' ORDER BY ordinal_position"
  );
  console.log('Columns in qdrant_centroid_clusters:', cols.rows);

  const sample = await client.query('SELECT * FROM qdrant_centroid_clusters LIMIT 3');
  console.log('Sample rows:', JSON.stringify(sample.rows, null, 2));

  await client.end();
}

main().catch(console.error);
