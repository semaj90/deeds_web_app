#!/usr/bin/env node
/**
 * Applies drizzle/manual/20260915_feature_ontology_tuples_resolution_columns.sql
 * by hand (manual-migration convention, see 20260909_atlas_packets_source_revision.sql
 * and 20260915_codebase_chunk_index_whole_file_hash.sql for precedent).
 *
 * Statements run individually via separate pool.query() calls -- required for
 * CREATE INDEX CONCURRENTLY, which cannot run inside any transaction.
 *
 * Owner: openspec/changes/parent-atlas-ontology-oaklib-fanout-bitmap (task 3.3,
 * explicitly human-authorized 2026-09-15).
 *
 * Usage: node scripts/atlas/apply-feature-ontology-tuples-resolution-columns-v1.mjs
 */
import { createRequire } from 'node:module';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv()),
  max: 2,
  statement_timeout: 300_000,
  application_name: 'apply-feature-ontology-tuples-resolution-columns-v1',
});

const STATEMENTS = [
  `ALTER TABLE feature_ontology_tuples ADD COLUMN IF NOT EXISTS resolved_concept_id text`,
  `ALTER TABLE feature_ontology_tuples ADD COLUMN IF NOT EXISTS resolution_state text NOT NULL DEFAULT 'UNRESOLVED'`,
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'feature_ontology_tuples_resolution_state_check'
     ) THEN
       ALTER TABLE feature_ontology_tuples
         ADD CONSTRAINT feature_ontology_tuples_resolution_state_check
         CHECK (resolution_state IN ('RESOLVED', 'UNRESOLVED', 'AMBIGUOUS', 'RESOLUTION_UNAVAILABLE'));
     END IF;
   END $$`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_feature_ontology_tuples_resolved_concept_id
     ON feature_ontology_tuples (resolved_concept_id)
     WHERE resolved_concept_id IS NOT NULL`,
];

async function main() {
  for (const [i, statement] of STATEMENTS.entries()) {
    console.log(`[apply-feature-ontology-tuples-resolution-columns] statement ${i + 1}/${STATEMENTS.length}`);
    await pool.query(statement);
  }

  const readback = await pool.query(
    `SELECT count(*) AS total,
            count(resolved_concept_id) AS resolved_populated,
            count(*) FILTER (WHERE resolution_state = 'UNRESOLVED') AS unresolved_count
       FROM feature_ontology_tuples`
  );
  console.log('[apply-feature-ontology-tuples-resolution-columns] readback:', readback.rows[0]);

  const columns = await pool.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_name = 'feature_ontology_tuples'
        AND column_name IN ('resolved_concept_id', 'resolution_state')
      ORDER BY column_name`
  );
  console.log('[apply-feature-ontology-tuples-resolution-columns] columns:', columns.rows);

  const constraint = await pool.query(
    `SELECT conname FROM pg_constraint WHERE conname = 'feature_ontology_tuples_resolution_state_check'`
  );
  console.log('[apply-feature-ontology-tuples-resolution-columns] constraint present:', constraint.rowCount > 0);

  const index = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE indexname = 'idx_feature_ontology_tuples_resolved_concept_id'`
  );
  console.log('[apply-feature-ontology-tuples-resolution-columns] index present:', index.rowCount > 0);

  await pool.end();
}

main().catch(async (error) => {
  console.error('[apply-feature-ontology-tuples-resolution-columns] FAILED', error);
  await pool.end().catch(() => {});
  process.exitCode = 1;
});
