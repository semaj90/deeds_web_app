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
    SELECT pg_get_functiondef(oid) as def
    FROM pg_proc
    WHERE proname = 'search_code_hybrid_pg'
  `);
  console.log('Definition of search_code_hybrid_pg:\n', res.rows[0]?.def);
  await client.end();
}
main().catch(console.error);
