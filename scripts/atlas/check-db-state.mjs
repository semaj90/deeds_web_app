import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: 'sveltekit-frontend/.env' });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function check() {
  console.log('--- Postgres Connection and Table Counts ---');
  console.log('DB:', DATABASE_URL);

  const tables = [
    'parent_atlas_records',
    'parent_atlas_vectors',
    'atlas_feature_map',
    'concept_records',
    'atlas_packets',
    'agent_traces'
  ];

  for (const table of tables) {
    try {
      const res = await pool.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
      console.log(`Table '${table}': ${res.rows[0].count} rows`);
    } catch (err) {
      console.log(`Table '${table}': ERROR: ${err.message}`);
    }
  }

  // Sample parent_atlas_records
  try {
    const res = await pool.query(`SELECT id, lane, source_ref, title FROM parent_atlas_records LIMIT 3`);
    console.log('\nSample parent_atlas_records:', res.rows);
  } catch (err) {
    console.log('Sample parent_atlas_records error:', err.message);
  }

  // Sample parent_atlas_records non-empty source_ref
  try {
    const res = await pool.query(`
      SELECT COUNT(*)::int AS count 
      FROM parent_atlas_records 
      WHERE source_ref IS NOT NULL AND source_ref != ''
    `);
    console.log('parent_atlas_records with non-empty source_ref:', res.rows[0].count);
  } catch (err) {
    console.log('source_ref query error:', err.message);
  }

  // Sample parent_atlas_vectors join count
  try {
    const res = await pool.query(`
      SELECT COUNT(DISTINCT r.id)::int AS unique_joined_count, COUNT(*)::int AS total_joined_count
      FROM parent_atlas_records r
      INNER JOIN parent_atlas_vectors v ON r.id = v.record_id
    `);
    console.log('\nParent Atlas Records INNER JOIN Vectors counts:', res.rows[0]);
  } catch (err) {
    console.log('Join counts error:', err.message);
  }

  // Let's see if concept_records table exists and what columns it has
  try {
    const cols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'concept_records'
    `);
    console.log('\nColumns of concept_records:', cols.rows);
    if (cols.rows.length > 0) {
      const sample = await pool.query(`SELECT concept_id, evidence_cards, packet_keys FROM concept_records`);
      console.log('Concept records:');
      for (const r of sample.rows) {
        console.log(`- concept_id: ${r.concept_id}`);
        console.log(`  evidence_cards:`, Array.isArray(r.evidence_cards) ? r.evidence_cards.slice(0, 5) : typeof r.evidence_cards === 'string' ? r.evidence_cards.substring(0, 50) : r.evidence_cards);
        console.log(`  packet_keys:`, Array.isArray(r.packet_keys) ? r.packet_keys.slice(0, 5) : typeof r.packet_keys === 'string' ? r.packet_keys.substring(0, 50) : r.packet_keys);
      }
    }
  } catch (err) {
    console.log('concept_records cols query error:', err.message);
  }

  // Let's see if atlas_feature_map table exists and what columns it has
  try {
    const cols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'atlas_feature_map'
    `);
    console.log('\nColumns of atlas_feature_map:', cols.rows);
    if (cols.rows.length > 0) {
      const sample = await pool.query(`SELECT normalized_path, source_ref, feature_id, som_cluster FROM atlas_feature_map LIMIT 3`);
      console.log('Sample atlas_feature_map:', sample.rows);
    }
  } catch (err) {
    console.log('atlas_feature_map cols query error:', err.message);
  }

  await pool.end();
}

check().catch(err => {
  console.error(err);
  pool.end();
});
