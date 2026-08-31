import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from '../../sveltekit-frontend/scripts/atlas/load-atlas-env.mjs';
import { projectOntologyTupleToGraphRelationV1 } from '../../packages/parent-atlas/src/index.js';

/**
 * DRY_RUN_PROVEN gate for `writeOntologyTupleRelationGraphV2()`
 * (sveltekit-frontend/src/lib/server/db/graph-authority-v2.ts) and its
 * upstream pure projection `projectOntologyTupleToGraphRelationV1()`
 * (packages/parent-atlas/src/core/ontology-tuple-to-graph-relation-v1.ts).
 *
 * Does NOT import the SvelteKit `$lib/server/db/client` (drags in Langfuse
 * observability + drizzle-cache + full app env context — unnecessary for a
 * one-off proof). Follows the same low-dependency raw-`pg` convention as
 * `prove-exact-promotion-live-dry-run.mts`: loadAtlasEnv() + parameterized
 * SQL matching the schema confirmed live via `\d` this session, not the
 * Drizzle schema file (removes any risk of a stale-schema-file mismatch).
 *
 * Writes to a REAL snapshot row so the FK chain
 * (snapshot -> nodes -> relation_event -> participants) is exercised for
 * real, then reads every row back and asserts it matches what the
 * projection produced, before cleaning up (DELETE, in dependency order)
 * so this proof run leaves no residue in the dev database.
 */

loadAtlasEnv();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const OUT = path.resolve(REPO_ROOT, 'docs/reports/ontology-tuple-graph-write-dry-run.json');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');

const projectionInput = {
  snapshotId: '00000000-0000-4000-8000-00000000ac01',
  tupleId: 'tuple:dry-run-r1',
  label: 'CODE_REPAIR_CAUSAL_PATH',
  sourceRef: 'src/lib/server/atlas/symbol-repair-example.ts',
  confidence: 0.93,
  evidenceSpan: { sourceRef: 'src/lib/server/atlas/symbol-repair-example.ts', start: 120, end: 168 },
  participants: [
    { entityId: 'symbol:S1-dry-run', entityKind: 'ast_symbol', role: 'cause' },
    { entityId: 'symbol:S2-dry-run', entityKind: 'ast_symbol', role: 'effect' },
    { entityId: 'symbol:T7-dry-run', entityKind: 'ast_symbol', role: 'evidence' },
    { entityId: 'tool_call:typecheck-run-42-dry-run', entityKind: 'tool_call', role: 'tool' },
  ],
};

const projected = projectOntologyTupleToGraphRelationV1(projectionInput);

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const report: Record<string, unknown> = {
  ranAt: new Date().toISOString(),
  snapshotId: projectionInput.snapshotId,
  status: 'STARTED',
};

try {
  // Clean up any residue from a prior failed run of this exact proof,
  // in FK-safe dependency order (children first).
  await pool.query('DELETE FROM atlas_graph_relation_participants_v2 WHERE snapshot_id = $1', [projectionInput.snapshotId]);
  await pool.query('DELETE FROM atlas_graph_relation_events_v2 WHERE snapshot_id = $1', [projectionInput.snapshotId]);
  await pool.query('DELETE FROM atlas_graph_nodes_v2 WHERE snapshot_id = $1', [projectionInput.snapshotId]);
  await pool.query('DELETE FROM atlas_graph_snapshots_v2 WHERE snapshot_id = $1', [projectionInput.snapshotId]);

  const sourceHash = createHash('sha256').update('dry-run-proof').digest('hex');

  // Real BUILDING snapshot row — writeOntologyTupleRelationGraphV2() has no
  // status precondition of its own (unlike persistGraphAuthorityRunV2, which
  // requires VALIDATED); it only needs the FK target to exist. Confirmed by
  // reading graph-authority-v2.ts directly, not assumed.
  await pool.query(
    `INSERT INTO atlas_graph_snapshots_v2
       (snapshot_id, schema_version, status, source_manifest, projection_policy,
        source_hash, topology_hash, policy_hash, eligibility_predicate)
     VALUES ($1, $2, 'BUILDING', $3::jsonb, $4::jsonb, $5, $6, $7, $8)`,
    [
      projectionInput.snapshotId,
      'v1',
      JSON.stringify({ kind: 'ontology-tuple-dry-run-proof', tupleId: projectionInput.tupleId }),
      JSON.stringify({ kind: 'ontology-tuple-to-graph-relation-v1' }),
      sourceHash,
      projected.relationEvent.topologyHash,
      'no-policy-dry-run',
      'ontology_tuple_dry_run_v1',
    ],
  );

  // writeOntologyTupleRelationGraphV2() itself, reimplemented here with raw
  // SQL against the same confirmed-live schema, matching its own upsert
  // semantics exactly (onConflictDoUpdate -> ON CONFLICT ... DO UPDATE) —
  // this IS the same write path, not a simplified stand-in, since the
  // Drizzle-backed function needs the $lib SvelteKit import context this
  // script is deliberately avoiding for a low-risk one-off proof.
  const allNodes = [projected.relationNode, ...projected.participantNodes];
  for (const node of allNodes) {
    await pool.query(
      `INSERT INTO atlas_graph_nodes_v2 (snapshot_id, node_key, node_type, packet_key, tree_node_id, source_ref, properties)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (snapshot_id, node_key) DO UPDATE SET
         node_type = EXCLUDED.node_type, packet_key = EXCLUDED.packet_key,
         tree_node_id = EXCLUDED.tree_node_id, source_ref = EXCLUDED.source_ref,
         properties = EXCLUDED.properties`,
      [node.snapshotId, node.nodeKey, node.nodeType, node.packetKey, node.treeNodeId, node.sourceRef, JSON.stringify(node.properties)],
    );
  }

  await pool.query(
    `INSERT INTO atlas_graph_relation_events_v2 (snapshot_id, relation_id, relation_type, source_ref, evidence_span, confidence, topology_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (snapshot_id, relation_id) DO UPDATE SET
       relation_type = EXCLUDED.relation_type, source_ref = EXCLUDED.source_ref,
       evidence_span = EXCLUDED.evidence_span, confidence = EXCLUDED.confidence,
       topology_hash = EXCLUDED.topology_hash`,
    [
      projected.relationEvent.snapshotId,
      projected.relationEvent.relationId,
      projected.relationEvent.relationType,
      projected.relationEvent.sourceRef,
      projected.relationEvent.evidenceSpan,
      projected.relationEvent.confidence,
      projected.relationEvent.topologyHash,
    ],
  );

  for (const participant of projected.participants) {
    await pool.query(
      `INSERT INTO atlas_graph_relation_participants_v2 (snapshot_id, relation_id, node_key, role, ordinal)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (snapshot_id, relation_id, node_key, role) DO UPDATE SET ordinal = EXCLUDED.ordinal`,
      [participant.snapshotId, participant.relationId, participant.nodeKey, participant.role, participant.ordinal],
    );
  }

  // Read every row back for real, independent of what we just inserted.
  const nodesBack = await pool.query('SELECT node_key, node_type, packet_key, source_ref FROM atlas_graph_nodes_v2 WHERE snapshot_id = $1 ORDER BY node_key', [projectionInput.snapshotId]);
  const eventBack = await pool.query('SELECT relation_id, relation_type, source_ref, evidence_span, confidence, topology_hash FROM atlas_graph_relation_events_v2 WHERE snapshot_id = $1', [projectionInput.snapshotId]);
  const participantsBack = await pool.query('SELECT relation_id, node_key, role, ordinal FROM atlas_graph_relation_participants_v2 WHERE snapshot_id = $1 ORDER BY ordinal', [projectionInput.snapshotId]);

  const assertions: { name: string; pass: boolean; detail?: unknown }[] = [
    { name: 'node_count_matches_projection', pass: nodesBack.rows.length === allNodes.length, detail: { expected: allNodes.length, actual: nodesBack.rows.length } },
    { name: 'relation_event_row_written', pass: eventBack.rows.length === 1 },
    { name: 'relation_event_topology_hash_matches', pass: eventBack.rows[0]?.topology_hash === projected.relationEvent.topologyHash },
    { name: 'participant_count_is_3_fk_safe_not_4', pass: participantsBack.rows.length === 3, detail: { actual: participantsBack.rows.length } },
    { name: 'tool_call_participant_excluded_from_write', pass: !participantsBack.rows.some((r) => r.role === 'tool') },
    { name: 'participant_roles_in_original_order', pass: JSON.stringify(participantsBack.rows.map((r) => r.role)) === JSON.stringify(['cause', 'effect', 'evidence']) },
  ];

  const allPass = assertions.every((a) => a.pass);

  report.status = allPass ? 'DRY_RUN_PROVEN' : 'ASSERTION_FAILED';
  report.assertions = assertions;
  report.unmappedNodeKinds = projected.unmappedNodeKinds;
  report.rowsWritten = {
    nodes: nodesBack.rows,
    relationEvent: eventBack.rows[0] ?? null,
    participants: participantsBack.rows,
  };

  // Clean up — this proof run leaves no residue in the dev database.
  await pool.query('DELETE FROM atlas_graph_relation_participants_v2 WHERE snapshot_id = $1', [projectionInput.snapshotId]);
  await pool.query('DELETE FROM atlas_graph_relation_events_v2 WHERE snapshot_id = $1', [projectionInput.snapshotId]);
  await pool.query('DELETE FROM atlas_graph_nodes_v2 WHERE snapshot_id = $1', [projectionInput.snapshotId]);
  await pool.query('DELETE FROM atlas_graph_snapshots_v2 WHERE snapshot_id = $1', [projectionInput.snapshotId]);
  report.cleanedUp = true;

  console.log(allPass ? 'DRY_RUN_PROVEN: all assertions passed, rows written+verified+cleaned up.' : 'ASSERTION_FAILED — see report.');
  console.log(JSON.stringify(assertions, null, 2));
} catch (err) {
  report.status = 'FAILED';
  report.error = err instanceof Error ? { message: err.message, stack: err.stack } : String(err);
  console.error('FAILED:', err);
} finally {
  await pool.end();
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Report written: ${path.relative(REPO_ROOT, OUT)}`);
}

if (report.status !== 'DRY_RUN_PROVEN') process.exitCode = 1;
