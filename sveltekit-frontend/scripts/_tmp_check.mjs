import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db' });
const r = await pool.query(
  "SELECT column_name, udt_name FROM information_schema.columns WHERE table_name = 'cluster_summaries' ORDER BY ordinal_position"
);
console.table(r.rows);
await pool.end();
