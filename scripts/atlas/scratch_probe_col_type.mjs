import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: 'sveltekit-frontend/.env' });
dotenv.config({ path: 'sveltekit-frontend/.env.local', override: true });

const pool = new pg.Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5434),
  database: 'legal_ai_db',
  user: 'legal_admin',
  password: process.env.DB_PASSWORD,
  max: 1
});

async function run() {
  const res = await pool.query(`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_name IN ('atlas_packet_chunk_lineage', 'codebase_chunk_index')
      AND column_name IN ('id', 'chunk_row_id');
  `);
  console.log(res.rows);
  await pool.end();
}
run();
