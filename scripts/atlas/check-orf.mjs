#!/usr/bin/env node
/**
 * Read-only diagnostic tool for atlas_observation_feature_rows (ORF) lineage,
 * join parity with graphify_files, and candidate representation qualifications.
 *
 * Usage:
 *   node scripts/atlas/check-orf.mjs
 */

import pg from 'pg';
import { resolveDatabaseUrl, loadRepoEnv } from './connection-config.mjs';

const env = loadRepoEnv();
const connectionString = resolveDatabaseUrl(env);
const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();

try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

  const totals = await client.query(`
    SELECT
      count(*) as total_rows,
      count(source_revision) as with_source_revision,
      count(workspace_revision) as with_workspace_revision,
      count(representation_revision) as with_representation_revision,
      count(registry_revision) as with_registry_revision
    FROM public.atlas_observation_feature_rows;
  `);

  const distinctRevisions = await client.query(`
    SELECT
      count(DISTINCT source_revision) as distinct_source_revisions,
      count(DISTINCT workspace_revision) as distinct_workspace_revisions,
      count(DISTINCT representation_revision) as distinct_representation_revisions,
      count(DISTINCT registry_revision) as distinct_registry_revisions
    FROM public.atlas_observation_feature_rows;
  `);

  const graphifyJoin = await client.query(`
    SELECT
      count(*) as matched_rows,
      count(DISTINCT o.packet_key) as matched_packets
    FROM public.atlas_observation_feature_rows o
    JOIN public.graphify_files g
      ON o.source_ref = g.source_ref OR ('sveltekit-frontend/' || o.source_ref) = g.source_ref;
  `);

  const sample = await client.query(`
    SELECT
      packet_key,
      source_ref,
      source_revision,
      workspace_revision,
      representation_revision,
      registry_revision
    FROM public.atlas_observation_feature_rows
    WHERE source_revision IS NOT NULL
    LIMIT 3;
  `);

  await client.query('ROLLBACK');

  const report = {
    schema: 'atlas.orf-lineage-diagnostic.v1',
    timestamp: new Date().toISOString(),
    orfTotals: totals.rows[0],
    distinctRevisions: distinctRevisions.rows[0],
    graphifyFileParity: graphifyJoin.rows[0],
    samples: sample.rows,
    canonicalAuthority: false,
    writesPerformed: false,
  };

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Diagnostic error:', error);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
