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
 *   node scripts/atlas/prove-ontology-linked-tuple-persistence.mjs                 # original ungrounded probe
 *   node scripts/atlas/prove-ontology-linked-tuple-persistence.mjs --gate-only     # grounded tuple + admission gate, NO database access
 *   node scripts/atlas/prove-ontology-linked-tuple-persistence.mjs --grounded      # same row written inside the rollback transaction,
 *                                                                                  # with field-parity readback of participants/evidence_*
 * Options for the grounded modes: --source=<repo path> --line-start=N --line-end=N
 *
 * Grounded modes call admitGroundedOntologyLinkedTupleV1; the fixture participants are explicitly probe-scoped,
 * not extracted semantic entities. A passing gate proves the shared source/span contract for this probe only: not
 * :8095 extraction, production producer enforcement, or canonical truth.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { tsImport } from 'tsx/esm/api';

const DATABASE_URL = resolveDatabaseUrl(loadRepoEnv());
const TUPLE_ID = 'tuple:live-probe-2026-08-25';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const GATE_ONLY = argv.includes('--gate-only');
const GROUNDED = GATE_ONLY || argv.includes('--grounded');
const opt = (n, d) => (argv.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=').slice(1).join('=');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x)); // jsonb reorders object keys

export function buildGroundedTuple({ source, lineStart, lineEnd, root = ROOT }) {
  const bytes = fs.readFileSync(path.join(root, source));
  const lineStarts = [0];
  for (let i = 0; i < bytes.length; i += 1) if (bytes[i] === 10) lineStarts.push(i + 1);
  if (lineStart < 1 || lineEnd < lineStart || lineEnd > lineStarts.length) throw new Error('LINE_RANGE_OUT_OF_BOUNDS');
  const start = lineStarts[lineStart - 1];
  let end = lineEnd < lineStarts.length ? lineStarts[lineEnd] - 1 : bytes.length;
  if (end > start && bytes[end - 1] === 13) end -= 1;
  const span = bytes.subarray(start, end);
  const spanText = span.toString('utf8');
  const fileDigest = `sha256:${sha256(bytes)}`;
  const spanDigest = `sha256:${sha256(span)}`;
  return {
    tupleId: `tuple:grounded-probe:${sha256([source, lineStart, lineEnd, fileDigest].join('\0')).slice(0, 24)}`,
    schemaVersion: 'ontology-linked-tuple.v1', sourceRef: source,
    surfaceText: spanText || path.basename(source), label: 'rollback persistence probe', labelKind: 'tag', labelSource: 'manual',
    ontologyIds: [], conceptIds: [], confidence: 1, evidenceState: 'GATED', lifecycle: 'OBSERVED',
    relationRevision: 'grounded-probe-relation-v1',
    participants: [
      { entityId: `probe:source:${fileDigest}`, entityKind: 'source_ref', role: 'source', label: source },
      { entityId: `probe:span:${spanDigest}`, entityKind: 'source_ref', role: 'evidence', label: `lines ${lineStart}-${lineEnd}` },
    ],
    evidenceRefs: [`${source}#L${lineStart}-L${lineEnd}`],
    evidenceSpan: { sourceRef: source, start, end },
    // PLACEHOLDER FIXTURE VALUES (rehearsal only, never evidence): workspaceRevision, relationRevision and the probe:* participant
    // ids are synthetic. No admitted workspace snapshot or :8095 extraction backs them; this tuple proves persistence shape only.
    provenance: { sourceTables: [], labelerVersion: null, taggerVersion: null, ontologyVersion: null, nlpVersion: null,
      sourceRevision: fileDigest, workspaceRevision: 'rehearsal:no-admitted-workspace', evidenceSpanChecksum: spanDigest, producerId: 'probe.prove-ontology-linked-tuple-persistence' },
  };
}

export async function admissionGate(t, root = ROOT) {
  const { admitGroundedOntologyLinkedTupleV1 } = await tsImport(
    pathToFileURL(path.join(root, 'sveltekit-frontend/src/lib/server/atlas/integration/grounded-ontology-linked-tuple-admission-v1.ts')).href,
    import.meta.url,
  );
  const sourceBytes = fs.readFileSync(path.join(root, t.sourceRef));
  return admitGroundedOntologyLinkedTupleV1({ tuple: t, sourceBytes, expectedSourceRevision: t.provenance.sourceRevision });
}

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

function groundedValues(t) {
  return [
    t.tupleId, 'ontology-linked-tuple.v1', null, t.sourceRef, null, null, null,
    t.surfaceText, null, null, t.label, 'tag', 'manual',
    [], [], JSON.stringify(t.participants), t.evidenceRefs, null,
    JSON.stringify(t.evidenceSpan), 1, 'GATED', 'OBSERVED', JSON.stringify(t.provenance), 'grounded-probe:v1',
  ];
}

async function groundedMain() {
  const t = buildGroundedTuple({ source: opt('source', 'sveltekit-frontend/src/lib/server/env.server.ts'), lineStart: Number(opt('line-start', '1')), lineEnd: Number(opt('line-end', '15')) });
  const admitted = await admissionGate(t);
  const negatives = [
    ['GROUNDED_TUPLE_PARTICIPANTS_REQUIRED', { ...t, participants: [] }],
    ['GROUNDED_TUPLE_EVIDENCE_REFS_REQUIRED', { ...t, evidenceRefs: [] }],
    ['GROUNDED_TUPLE_STATE_NOT_GATED', { ...t, evidenceState: 'REFERENCE_ONLY' }],
    ['GROUNDED_TUPLE_EVIDENCE_CHECKSUM_MISMATCH', { ...t, provenance: { ...t.provenance, evidenceSpanChecksum: `sha256:${'0'.repeat(64)}` } }],
  ].map(async ([expected, bad]) => {
    try {
      await admissionGate(bad);
      return `${expected}:ACCEPTED`;
    } catch (error) {
      return `${expected}:${String(error.message).includes(expected) ? 'rejected' : `wrong_error:${error.message}`}`;
    }
  });
  const negativeResults = await Promise.all(negatives);
  console.log('GATE', admitted.status === 'PROPOSED_GROUNDED_TUPLE' ? 'PASS' : 'FAIL', JSON.stringify(negativeResults));
  if (admitted.status !== 'PROPOSED_GROUNDED_TUPLE' || negativeResults.some((n) => !n.endsWith(':rejected'))) throw new Error('shared admission gate failed');
  if (GATE_ONLY) { console.log('GATE_ONLY_NO_DATABASE_ACCESS'); return; }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(UPSERT_SQL, groundedValues(t));
    const r = await client.query('SELECT participants, evidence_refs, evidence_span, provenance FROM atlas_ontology_linked_tuples WHERE tuple_id = $1', [t.tupleId]);
    if (r.rowCount !== 1) throw new Error(`expected 1 row, got ${r.rowCount}`);
    const row = r.rows[0];
    const parity = {
      participants: canon(row.participants) === canon(t.participants),
      evidence_refs: canon(row.evidence_refs) === canon(t.evidenceRefs),
      evidence_span: canon(row.evidence_span) === canon(t.evidenceSpan),
      source_revision: row.provenance?.sourceRevision === t.provenance.sourceRevision,
    };
    console.log('GROUNDED_READBACK_PARITY', JSON.stringify(parity));
    if (!Object.values(parity).every(Boolean)) throw new Error('grounded readback parity failed');
    await client.query('ROLLBACK');
    const residual = await pool.query('SELECT count(*)::int AS n FROM atlas_ontology_linked_tuples WHERE tuple_id = $1', [t.tupleId]);
    if (residual.rows[0].n !== 0) throw new Error(`residual rows after rollback: ${residual.rows[0].n}`);
    console.log('ZERO_RESIDUAL_ROWS');
    console.log('GROUNDED_PROOF_PASSED');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  if (GROUNDED) return groundedMain();
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
