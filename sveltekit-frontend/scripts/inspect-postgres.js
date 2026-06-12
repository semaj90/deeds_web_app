import pg from 'pg';

const pool = new pg.Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

try {
  const res = await pool.query('SELECT packet_id, artifact_id, source_ref, feature_id, community_id, concept_ids, cluster_id, summary FROM atlas_packets LIMIT 5');
  console.log('Postgres atlas_packets summary properties:', JSON.stringify(res.rows, null, 2));
} catch (err) {
  console.error('Error querying Postgres:', err);
} finally {
  await pool.end();
}
