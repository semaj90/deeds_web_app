import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

async function check() {
  const res = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'atlas_packets'
  `);
  console.log('Postgres indexes on atlas_packets:', res.rows);
  await pool.end();
}
check();
