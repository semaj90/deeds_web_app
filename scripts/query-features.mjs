import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: 'sveltekit-frontend/.env' });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function query() {
  const res = await pool.query("SELECT id, lane, source_ref, title FROM parent_atlas_records WHERE lane = 'features' LIMIT 10");
  console.log(JSON.stringify(res.rows, null, 2));
  await pool.end();
}

query().catch(console.error);
