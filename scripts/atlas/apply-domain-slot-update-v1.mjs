import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });

try {
  console.log('Ensuring codebase_chunk_index.domain_id column exists...');
  await pool.query('ALTER TABLE codebase_chunk_index ADD COLUMN IF NOT EXISTS domain_id text');

  console.log('Populating codebase_chunk_index domain slots from crosswalk...');
  const updateQuery = `
    UPDATE codebase_chunk_index c
    SET domain_id = w.taxonomy_domain_id
    FROM atlas_domain_vocabulary_crosswalk_v1 w
    WHERE LOWER(c.domain) = LOWER(w.source_value)
      AND w.source_vocab = 'codebase_chunk_index.domain'
      AND c.domain_id IS DISTINCT FROM w.taxonomy_domain_id;
  `;
  const updateRes = await pool.query(updateQuery);
  console.log(`Updated rows: ${updateRes.rowCount}`);

  const verifyQuery = `
    SELECT 
        COUNT(*) FILTER (WHERE domain_id IS NOT NULL) AS populated_domain_rows,
        COUNT(*) FILTER (WHERE domain_id IS NULL) AS unresolved_domain_rows,
        COUNT(*) AS total_rows
    FROM codebase_chunk_index;
  `;
  const verifyRes = await pool.query(verifyQuery);
  console.log('Verification Check:', verifyRes.rows[0]);
} catch (error) {
  console.error('Update failed:', error);
  process.exit(1);
} finally {
  await pool.end();
}
