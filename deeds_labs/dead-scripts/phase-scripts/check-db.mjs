import pg from 'pg';

const pool = new pg.Pool({
  user: 'user',
  host: '127.0.0.1',
  database: 'legal',
  password: 'pass',
  port: 5433,
});

async function check() {
  const client = await pool.connect();
  const res = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `);
  console.log("Tables:", res.rows.map(r => r.table_name));
  client.release();
  pool.end();
}

check().catch(console.error);