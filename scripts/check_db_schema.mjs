import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

async function main() {
  try {
    console.log('Querying table columns for atlas_packets...');
    const cols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'atlas_packets'
    `);
    console.log('Columns:', cols.rows.map(r => `${r.column_name} (${r.data_type})`));

    console.log('\nRunning counts...');
    const colNames = cols.rows.map(r => r.column_name);
    const embeddingCol = colNames.find(c => c.includes('embedding') || c.includes('vector'));
    console.log('Detected embedding/vector column:', embeddingCol);

    const countsQuery = `
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE reward_prior >= 0.1) AS reward_ready,
        ${embeddingCol ? `COUNT(*) FILTER (WHERE ${embeddingCol} IS NOT NULL) AS has_embedding` : '0 AS has_embedding'},
        ${colNames.includes('feature_id') ? `COUNT(*) FILTER (WHERE feature_id IS NOT NULL) AS has_feature_id` : '0 AS has_feature_id'}
      FROM atlas_packets
    `;
    const counts = await pool.query(countsQuery);
    console.log('Counts result:', counts.rows[0]);

    if (embeddingCol) {
      try {
        const dimResult = await pool.query(`
          SELECT 
            vector_dims(${embeddingCol}) as dims,
            count(*) as count
          FROM atlas_packets
          WHERE ${embeddingCol} IS NOT NULL
          GROUP BY dims
        `);
        console.log('Vector dimensions:', dimResult.rows);
      } catch (err) {
        console.log('Error getting vector dims:', err.message);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
