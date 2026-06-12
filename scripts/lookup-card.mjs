import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: 'sveltekit-frontend/.env' });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function query() {
  console.log('Searching parent_atlas_records...');
  const res1 = await pool.query("SELECT id, lane, source_ref, title FROM parent_atlas_records WHERE source_ref LIKE '%relations.ts%' OR title LIKE '%relations.ts%' OR id = '00f93223b674f907'");
  console.log('Results 1:', res1.rows);

  const res2 = await pool.query("SELECT id, lane, source_ref, title FROM parent_atlas_records WHERE lane = 'features' AND id LIKE '%f93223%'");
  console.log('Results 2:', res2.rows);

  // Let's search for any record where the ID might be a SHA-256 of the source_ref or package.json
  // Let's look up how the SHA-256 is generated in the system.
  // Wait, let's query the first 20 records in lane = 'features'
  const res3 = await pool.query("SELECT id, lane, source_ref FROM parent_atlas_records WHERE lane = 'features' LIMIT 20");
  console.log('Results 3 (features sample):', res3.rows);

  await pool.end();
}

query().catch(console.error);
