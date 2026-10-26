const pg = require('pg');
const pool = new pg.Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

async function main() {
  const res = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);
  console.log("TABLES:", res.rows.map(r => r.table_name).filter(t => t.includes('atlas') || t.includes('chunk') || t.includes('packet')));
  await pool.end();
}

main().catch(console.error);
