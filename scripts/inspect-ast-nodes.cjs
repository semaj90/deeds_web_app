const { Client } = require('pg');
const client = new Client({ host: '127.0.0.1', port: 5434, user: 'legal_admin', password: '123456', database: 'legal_ai_db' });

async function run() {
  await client.connect();
  const tables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name LIKE '%ast%'
  `);
  console.log('AST tables:', tables.rows);
  for (const t of tables.rows) {
    const tName = t.table_name;
    const cols = await client.query(`
      SELECT column_name, data_type, udt_name 
      FROM information_schema.columns 
      WHERE table_name = $1
      ORDER BY ordinal_position;
    `, [tName]);
    console.log(`Columns for ${tName}:`);
    console.table(cols.rows);

    const count = await client.query(`SELECT count(*) FROM ${tName}`);
    console.log(`${tName} count:`, count.rows[0]);

    const sample = await client.query(`SELECT * FROM ${tName} LIMIT 1`);
    console.log(`Sample from ${tName}:`, sample.rows[0]);
  }
  await client.end();
}

run().catch(console.error);
