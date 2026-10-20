import { resolveDatabaseUrl, loadRepoEnv } from './connection-config.mjs';
import pg from 'pg';

const env = loadRepoEnv();
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env) });
const client = await pool.connect();

const isDryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply');

try {
  await client.query('BEGIN');

  // Verify graphify_files match
  const updateResult = await client.query(`
    WITH joined AS (
      SELECT DISTINCT ON (o.packet_key, o.feature_revision)
        o.packet_key,
        o.feature_revision,
        g.code_source_revision,
        g.workspace_revision
      FROM atlas_observation_feature_rows o
      JOIN graphify_files g
        ON o.source_ref = g.source_ref OR ('sveltekit-frontend/' || o.source_ref) = g.source_ref
      ORDER BY o.packet_key, o.feature_revision, g.updated_at DESC
    )
    UPDATE atlas_observation_feature_rows o
    SET
      source_revision = joined.code_source_revision,
      workspace_revision = joined.workspace_revision,
      representation_revision = 'semantic_768:canonical:v1',
      registry_revision = 'proposal:sha256:0aecb825dbc194976c3e3ec261457863f92e05250e1ce3c0c6e3039aec26c73f'
    FROM joined
    WHERE o.packet_key = joined.packet_key
      AND o.feature_revision = joined.feature_revision;
  `);

  console.log(`Updated ${updateResult.rowCount} rows.`);

  const verify = await client.query(`
    SELECT
      count(*) as total,
      count(source_revision) as with_src_rev,
      count(workspace_revision) as with_ws_rev,
      count(representation_revision) as with_rep_rev,
      count(registry_revision) as with_reg_rev
    FROM atlas_observation_feature_rows;
  `);
  console.log('Verification counts:', verify.rows[0]);

  const sample = await client.query(`
    SELECT packet_key, source_ref, source_revision, workspace_revision, representation_revision, registry_revision
    FROM atlas_observation_feature_rows
    WHERE source_revision IS NOT NULL
    LIMIT 3;
  `);
  console.log('Sample updated rows:', sample.rows);

  if (isDryRun) {
    await client.query('ROLLBACK');
    console.log('DRY RUN: Transaction rolled back successfully. No writes performed.');
  } else {
    await client.query('COMMIT');
    console.log('APPLY: Transaction committed successfully.');
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Error during backfill:', error);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
