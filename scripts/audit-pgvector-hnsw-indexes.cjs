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

  console.log('=== 1. EXTENSIONS ===');
  const ext = await client.query("SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'");
  console.log(JSON.stringify(ext.rows, null, 2));

  console.log('\n=== 2. VECTOR & EMBEDDING COLUMNS (768, 512, 256, 128, latent256, latent128, latent64) ===');
  const cols = await client.query(`
    SELECT column_name, udt_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'codebase_chunk_index' 
      AND (
        udt_name IN ('vector', 'halfvec') 
        OR column_name LIKE '%embed%' 
        OR column_name LIKE '%latent%'
        OR column_name LIKE '%768%'
        OR column_name LIKE '%512%'
        OR column_name LIKE '%256%'
        OR column_name LIKE '%128%'
        OR column_name LIKE '%64%'
      )
    ORDER BY ordinal_position
  `);
  console.log('Total vector/embedding columns:', cols.rows.length);
  cols.rows.forEach(c => console.log(`  - ${c.column_name} (${c.udt_name} / ${c.data_type})`));

  console.log('\n=== 3. ALL INDEXES ON codebase_chunk_index ===');
  const indexes = await client.query(`
    SELECT 
      ix.indexrelid::regclass AS index_name, 
      am.amname AS index_method, 
      ix.indisvalid, 
      ix.indisready, 
      pg_size_pretty(pg_relation_size(ix.indexrelid)) AS index_size, 
      pg_get_indexdef(ix.indexrelid) AS definition 
    FROM pg_index ix 
    JOIN pg_class cls ON cls.oid = ix.indexrelid 
    JOIN pg_am am ON am.oid = cls.relam 
    WHERE ix.indrelid = 'codebase_chunk_index'::regclass 
    ORDER BY pg_relation_size(ix.indexrelid) DESC
  `);
  console.log(JSON.stringify(indexes.rows, null, 2));

  await client.end();
}
main().catch(console.error);
