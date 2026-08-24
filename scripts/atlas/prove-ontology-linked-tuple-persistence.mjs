#!/usr/bin/env node
/**
 * prove-ontology-linked-tuple-persistence.mjs
 *
 * Live proof for KAG-01/02 persistence
 * (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration): writes one
 * clearly-tagged test row through the exact SQL shape used by
 * sveltekit-frontend/src/lib/server/atlas/ontology-linked-tuple-postgres.ts
 * ::persistOntologyLinkedTuples() against the real `atlas_ontology_linked_tuples`
 * table (drizzle/manual/20260825_atlas_ontology_linked_tuples.sql), reads it
 * back, then deletes only that one test row.
 *
 * Does NOT import the real TS module — that module imports
 * `$lib/server/db/client.js`, which requires SvelteKit's `$env/dynamic/private`
 * runtime context and cannot be loaded from a bare `tsx`/`node` process (see
 * "NPX Execution Context & Module Alias Resolution" in project CLAUDE.md).
 * This script proves the table/SQL shape is correct via a direct `pg.Pool`
 * connection instead — the same pattern used successfully throughout this
 * session (NE-07, NE-28, symbol-registry promotion, ORF materialization).
 *
 * Usage (run from repo root or sveltekit-frontend/):
 *   node scripts/atlas/prove-ontology-linked-tuple-persistence.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
loadAtlasEnv(ROOT);
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const TUPLE_ID = 'tuple:live-probe-2026-08-25';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    await pool.query(
      `INSERT INTO atlas_ontology_linked_tuples (
         tuple_id, schema_version, packet_key, source_ref, tree_node_id, document_id, title_id,
         surface_text, token_index, part_of_speech, label, label_kind, label_source,
         ontology_ids, concept_ids, participants, evidence_refs, relation_revision,
         evidence_span, confidence, evidence_state, lifecycle, provenance, producer_revision, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
         $14::text[],$15::text[],$16::jsonb,$17::text[],$18,
         $19::jsonb,$20,$21,$22,$23::jsonb,$24,now()
       )
       ON CONFLICT (tuple_id) DO UPDATE SET label = EXCLUDED.label, updated_at = now()`,
      [
        TUPLE_ID, 'ontology-linked-tuple.v1', null, 'taxonomy:live-probe', null, null, null,
        'live probe', null, null, 'live probe', 'ontology', 'semantic_tagger',
        ['ontology:probe'], ['concept:probe'], JSON.stringify([]), [], null,
        null, 0.5, 'ACTIVE_VERIFIED', 'OBSERVED',
        JSON.stringify({ sourceTables: ['taxonomy_nodes'], labelerVersion: null, taggerVersion: null, ontologyVersion: null, nlpVersion: null }),
        'live-probe:v1',
      ]
    );
    console.log('WRITE_OK');

    const readback = await pool.query(
      'SELECT tuple_id, label, ontology_ids, provenance FROM atlas_ontology_linked_tuples WHERE tuple_id = $1',
      [TUPLE_ID]
    );
    console.log('READBACK', JSON.stringify(readback.rows));
    if (readback.rowCount !== 1) throw new Error(`expected 1 row, got ${readback.rowCount}`);
    if (readback.rows[0].label !== 'live probe') throw new Error('readback label mismatch');

    await pool.query('DELETE FROM atlas_ontology_linked_tuples WHERE tuple_id = $1', [TUPLE_ID]);
    console.log('CLEANED_UP_TEST_ROW');
    console.log('LIVE_PROOF_PASSED');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('LIVE_PROOF_FAILED', err.message);
  process.exit(1);
});
