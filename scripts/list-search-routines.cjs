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
    SELECT routine_name 
    FROM information_schema.routines 
    WHERE routine_schema = 'public' AND routine_name LIKE '%search%'
  `);
  console.log('Search routines in public schema:', res.rows.map(r => r.routine_name));
  await client.end();
}
main().catch(console.error);
