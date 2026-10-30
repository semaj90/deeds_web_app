#!/usr/bin/env node
/**
 * prove-ontology-linked-tuple-persistence.mjs
 *
 * Rollback-protected proof for KAG-01/02 persistence
 * (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration): inside ONE
 * transaction it writes a clearly-tagged test row through the exact SQL shape used by
 * sveltekit-frontend/src/lib/server/atlas/ontology-linked-tuple-postgres.ts
 * ::persistOntologyLinkedTuples() against the real `atlas_ontology_linked_tuples`
 * table (drizzle/manual/20260825_atlas_ontology_linked_tuples.sql), reads it back,
 * repeats the write to prove the upsert is idempotent, then ROLLS BACK. Nothing is
 * committed and nothing is deleted; a final read proves zero residual rows.
 *
 * The test row is REFERENCE_ONLY on purpose: this proof never asserts verified evidence.
 * Credentials come from DATABASE_URL or DB_PASSWORD (environment, .env, .env.local) via
 * connection-config.mjs, which fails closed when no password is configured.
 *
 * Does NOT import the real TS module — that module imports
 * `$lib/server/db/client.js`, which requires SvelteKit's `$env/dynamic/private`
 * runtime context and cannot be loaded from a bare `tsx`/`node` process (see
 * "NPX Execution Context & Module Alias Resolution" in project CLAUDE.md).
 * This script proves the table/SQL shape is correct via a direct `pg.Pool`
 * connection instead.
 *
 * Usage (run from repo root or sveltekit-frontend/):
 *   node scripts/atlas/prove-ontology-linked-tuple-persistence.mjs
 */
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const DATABASE_URL = resolveDatabaseUrl(loadRepoEnv());
const TUPLE_ID = 'tuple:live-probe-2026-08-25';

const UPSERT_SQL = `INSERT INTO atlas_ontology_linked_tuples (
         tuple_id, schema_version, packet_key, source_ref, tree_node_id, document_id, title_id,
         surface_text, token_index, part_of_speech, label, label_kind, label_source,
         ontology_ids, concept_ids, participants, evidence_refs, relation_revision,
         evidence_span, confidence, evidence_state, lifecycle, provenance, producer_revision, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
         $14::text[],$15::text[],$16::jsonb,$17::text[],$18,
         $19::jsonb,$20,$21,$22,$23::jsonb,$24,now()
       )
       ON CONFLICT (tuple_id) DO UPDATE SET label = EXCLUDED.label, updated_at = now()`;

function probeValues(label) {
  return [
    TUPLE_ID, 'ontology-linked-tuple.v1', null, 'taxonomy:live-probe', null, null, null,
    label, null, null, label, 'ontology', 'semantic_tagger',
    ['ontology:probe'], ['concept:probe'], JSON.stringify([]), [], null,
    null, 0.5, 'REFERENCE_ONLY', 'OBSERVED',
    JSON.stringify({ sourceTables: ['taxonomy_nodes'], labelerVersion: null, taggerVersion: null, ontologyVersion: null, nlpVersion: null }),
    'live-probe:v1',
  ];
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(UPSERT_SQL, probeValues('live probe'));
    console.log('WRITE_OK (inside transaction)');

    const readback = await client.query(
      'SELECT tuple_id, label, ontology_ids, evidence_state, provenance FROM atlas_ontology_linked_tuples WHERE tuple_id = $1',
      [TUPLE_ID]
    );
    console.log('READBACK', JSON.stringify(readback.rows));
    if (readback.rowCount !== 1) throw new Error(`expected 1 row, got ${readback.rowCount}`);
    if (readback.rows[0].label !== 'live probe') throw new Error('readback label mismatch');
    if (readback.rows[0].evidence_state !== 'REFERENCE_ONLY') throw new Error('evidence_state was not preserved');

    await client.query(UPSERT_SQL, probeValues('live probe again'));
    const again = await client.query('SELECT count(*)::int AS n, max(label) AS label FROM atlas_ontology_linked_tuples WHERE tuple_id = $1', [TUPLE_ID]);
    if (again.rows[0].n !== 1) throw new Error(`idempotent rewrite produced ${again.rows[0].n} rows`);
    console.log('IDEMPOTENT_REWRITE_OK');

    await client.query('ROLLBACK');
    console.log('ROLLED_BACK');

    const residual = await pool.query('SELECT count(*)::int AS n FROM atlas_ontology_linked_tuples WHERE tuple_id = $1', [TUPLE_ID]);
    if (residual.rows[0].n !== 0) throw new Error(`residual rows after rollback: ${residual.rows[0].n}`);
    console.log('ZERO_RESIDUAL_ROWS');
    console.log('LIVE_PROOF_PASSED');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('LIVE_PROOF_FAILED', err.message);
  process.exit(1);
});
