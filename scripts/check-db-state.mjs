import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: 'sveltekit-frontend/.env' });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function check() {
  console.log('--- Printing all concept records ---');
  
  try {
    const res = await pool.query(`
      SELECT concept_id, evidence_cards, packet_keys, evidence, feature_ids
      FROM concept_records
    `);
    
    for (const row of res.rows) {
      console.log(`\nConcept: ${row.concept_id}`);
      console.log(`  evidence_cards (len ${row.evidence_cards?.length ?? 0}):`, row.evidence_cards?.slice(0, 3));
      console.log(`  packet_keys    (len ${row.packet_keys?.length ?? 0}):`, row.packet_keys?.slice(0, 3));
      console.log(`  evidence       (len ${row.evidence?.length ?? 0}):`, row.evidence?.slice(0, 3));
      console.log(`  feature_ids    (len ${row.feature_ids?.length ?? 0}):`, row.feature_ids?.slice(0, 3));
    }
  } catch (err) {
    console.log('Query error:', err.message);
  }

  await pool.end();
}

check().catch(err => {
  console.error(err);
  pool.end();
});
