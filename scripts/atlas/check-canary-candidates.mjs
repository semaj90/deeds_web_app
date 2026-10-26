import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env) });

async function run() {
  const pLike = await pool.query(`
    SELECT packet_id, packet_key, source_ref, source_revision, workspace_revision, workspace_revision_key
    FROM atlas_packets
    WHERE source_ref ILIKE '%data-hashing%'
       OR source_ref ILIKE '%ff1-plan%'
       OR source_ref ILIKE '%AGENT_CONSTITUTION%'
       OR source_ref ILIKE '%AGENT_SKILL%'
       OR source_ref ILIKE '%drizzle-inspector%'
    LIMIT 10
  `);
  console.log('atlas_packets ILIKE:', pLike.rows);

  const bLike = await pool.query(`
    SELECT canonical_source_ref, source_revision, workspace_revision
    FROM atlas_workspace_source_bindings
    WHERE workspace_revision = 'sha256:c63620c45fca8a3f2b3f17a45876925b7c978d4330bff273821de0d51d29a55c'
      AND (
        canonical_source_ref ILIKE '%data-hashing%'
        OR canonical_source_ref ILIKE '%ff1-plan%'
        OR canonical_source_ref ILIKE '%AGENT_CONSTITUTION%'
        OR canonical_source_ref ILIKE '%AGENT_SKILL%'
        OR canonical_source_ref ILIKE '%drizzle-inspector%'
      )
  `);
  console.log('atlas_workspace_source_bindings ILIKE:', bLike.rows);

  await pool.end();
}

run().catch(console.error);
