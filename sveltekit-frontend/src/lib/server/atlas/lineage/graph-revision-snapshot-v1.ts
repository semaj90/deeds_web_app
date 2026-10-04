/**
 * GraphRevisionSnapshotV1 + edge-candidate admission classifier (HYPERRAG-ENDPOINT-READBACK-01 groundwork).
 *
 * Rule: `workspaceRevisionKey` and `graphRevision` must originate from ONE immutable snapshot receipt, never from the
 * current HEAD and a separate graph read. Pure and DB-free: it reads nothing and writes nothing, and it mints no
 * identity. Anything short of full proof is a named non-admission; there is no partial promotion.
 *
 * OWNERSHIP (audited 2026-10-04, do not re-define here): workspace/source revision identity is owned by
 * `identity/workspace-source-binding-v1.ts` (WorkspaceRevisionRecordV1), `identity/revision-authority-envelope-v1.ts`,
 * `indexing/graphify-revision-authority-v2.ts` (git commit is provenance only) and the coverage receipt by
 * `graph/graph-snapshot-source-revision-binding-v1.ts`. This module owns ONLY the graph-revision pairing and the edge
 * admission verdict; use `buildGraphRevisionSnapshotFromOwnersV1` so the key and coverage are derived from those owners.
 */
import { createHash } from 'node:crypto';
import type { WorkspaceRevisionRecordV1 } from '../identity/workspace-source-binding-v1.js';
import type { GraphSnapshotSourceBindingReceiptV1 } from '../graph/graph-snapshot-source-revision-binding-v1.js';

export const GRAPH_REVISION_SNAPSHOT_SCHEMA_V1 = 'atlas.graph-revision-snapshot.v1' as const;

export interface GraphRevisionSnapshotInputV1 {
  /** `git:<hex>` or `sha256:<hex>`; the immutable workspace state the graph was built from. */
  workspaceRevisionKey: string;
  graphRevision: string;
  producerId: string;
  producerRevision: string;
  sourceRevisionCoverage: { qualified: number; total: number };
}

export interface GraphRevisionSnapshotV1 extends GraphRevisionSnapshotInputV1 {
  schema: typeof GRAPH_REVISION_SNAPSHOT_SCHEMA_V1;
  snapshotChecksum: string;
}

const REVISION_SHAPE = /^(git|sha256):[0-9a-f]{7,64}$/;
const sha256 = (text: string) => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

function checksumOf(i: GraphRevisionSnapshotInputV1): string {
  return sha256(JSON.stringify({
    schema: GRAPH_REVISION_SNAPSHOT_SCHEMA_V1,
    workspaceRevisionKey: i.workspaceRevisionKey,
    graphRevision: i.graphRevision,
    producerId: i.producerId,
    producerRevision: i.producerRevision,
    sourceRevisionCoverage: { qualified: i.sourceRevisionCoverage.qualified, total: i.sourceRevisionCoverage.total },
  }));
}

/** Seal a snapshot. Fails closed on a missing or malformed revision or an impossible coverage figure. */
export function buildGraphRevisionSnapshotV1(input: GraphRevisionSnapshotInputV1): GraphRevisionSnapshotV1 {
  if (!REVISION_SHAPE.test(input.workspaceRevisionKey ?? '')) throw new Error('GRAPH_SNAPSHOT_INVALID: workspaceRevisionKey');
  if (!nonEmpty(input.graphRevision)) throw new Error('GRAPH_SNAPSHOT_INVALID: graphRevision');
  if (!nonEmpty(input.producerId)) throw new Error('GRAPH_SNAPSHOT_INVALID: producerId');
  if (!nonEmpty(input.producerRevision)) throw new Error('GRAPH_SNAPSHOT_INVALID: producerRevision');
  const { qualified, total } = input.sourceRevisionCoverage ?? { qualified: NaN, total: NaN };
  if (!Number.isInteger(qualified) || !Number.isInteger(total) || qualified < 0 || total < 0 || qualified > total) {
    throw new Error('GRAPH_SNAPSHOT_INVALID: sourceRevisionCoverage');
  }
  return { schema: GRAPH_REVISION_SNAPSHOT_SCHEMA_V1, ...input, snapshotChecksum: checksumOf(input) };
}

/**
 * Derive a snapshot from the existing revision owners instead of re-stating their fields. The workspace key is the
 * owner's `workspaceRevision`; coverage comes from the graph-source binding receipt; the two must name the same
 * workspace or the call throws (one snapshot, never two reads).
 */
export function buildGraphRevisionSnapshotFromOwnersV1(input: {
  workspaceRecord: Pick<WorkspaceRevisionRecordV1, 'workspaceRevision'>;
  bindingReceipt: Pick<GraphSnapshotSourceBindingReceiptV1, 'workspaceRevision' | 'boundNodeCount' | 'sourceBackedNodeCount'>;
  graphRevision: string;
  producerId: string;
  producerRevision: string;
}): GraphRevisionSnapshotV1 {
  if (input.bindingReceipt.workspaceRevision !== input.workspaceRecord.workspaceRevision) {
    throw new Error('GRAPH_SNAPSHOT_INVALID: binding receipt and workspace record name different workspace revisions');
  }
  return buildGraphRevisionSnapshotV1({
    workspaceRevisionKey: input.workspaceRecord.workspaceRevision,
    graphRevision: input.graphRevision,
    producerId: input.producerId,
    producerRevision: input.producerRevision,
    sourceRevisionCoverage: { qualified: input.bindingReceipt.boundNodeCount, total: input.bindingReceipt.sourceBackedNodeCount },
  });
}

export function verifyGraphRevisionSnapshotV1(s: GraphRevisionSnapshotV1): boolean {
  try {
    return s.schema === GRAPH_REVISION_SNAPSHOT_SCHEMA_V1 && buildGraphRevisionSnapshotV1(s).snapshotChecksum === s.snapshotChecksum;
  } catch {
    return false;
  }
}

export type EdgeAdmissionStatusV1 =
  | 'ADMISSIBLE'
  | 'ENDPOINT_UNRESOLVED'
  | 'ENDPOINT_AMBIGUOUS'
  | 'SOURCE_REVISION_UNBOUND'
  | 'WORKSPACE_REVISION_UNBOUND'
  | 'GRAPH_REVISION_UNBOUND'
  | 'EVIDENCE_UNBOUND';

export interface GraphEndpointCandidateV1 {
  graphEndpointKey: string;
  /** The revision the GRAPH recorded for this endpoint (e.g. graphify_files.code_source_revision). */
  graphSourceRevision: string | null;
  /** Every atlas_packets row that matched this endpoint (more than one means ambiguous). */
  packets: { packetKey: string; sourceRevision: string | null }[];
}

export interface GraphEdgeCandidateV1 {
  edgeType: string;
  a: GraphEndpointCandidateV1;
  b: GraphEndpointCandidateV1;
  /** What the edge itself claims; compared against the one snapshot, never against HEAD. */
  workspaceRevisionKey: string | null;
  graphRevision: string | null;
  evidenceRefs: string[];
}

export interface EdgeAdmissionVerdictV1 {
  status: EdgeAdmissionStatusV1;
  /** Every failed condition, in the contract order; `status` is the first. */
  failures: Exclude<EdgeAdmissionStatusV1, 'ADMISSIBLE'>[];
}

type Failure = EdgeAdmissionVerdictV1['failures'][number];

function endpointFailure(e: GraphEndpointCandidateV1): Failure | 'OK' {
  if (e.packets.length === 0) return 'ENDPOINT_UNRESOLVED';
  if (e.packets.length > 1) return 'ENDPOINT_AMBIGUOUS';
  const p = e.packets[0];
  if (!nonEmpty(p.packetKey)) return 'ENDPOINT_UNRESOLVED';
  if (!nonEmpty(p.sourceRevision) || !nonEmpty(e.graphSourceRevision)) return 'SOURCE_REVISION_UNBOUND';
  const graphRev = e.graphSourceRevision.startsWith('sha256:') ? e.graphSourceRevision : `sha256:${e.graphSourceRevision}`;
  return p.sourceRevision === graphRev ? 'OK' : 'SOURCE_REVISION_UNBOUND';
}

/** Classify one candidate edge against the single snapshot. ADMISSIBLE only when every condition holds. */
export function classifyEdgeCandidateV1(edge: GraphEdgeCandidateV1, snapshot: GraphRevisionSnapshotV1): EdgeAdmissionVerdictV1 {
  const failures: Failure[] = [];
  const snapshotOk = verifyGraphRevisionSnapshotV1(snapshot);
  for (const e of [edge.a, edge.b]) {
    const f = endpointFailure(e);
    if (f !== 'OK' && !failures.includes(f)) failures.push(f);
  }
  if (!snapshotOk || !nonEmpty(edge.workspaceRevisionKey) || edge.workspaceRevisionKey !== snapshot.workspaceRevisionKey) failures.push('WORKSPACE_REVISION_UNBOUND');
  if (!snapshotOk || !nonEmpty(edge.graphRevision) || edge.graphRevision !== snapshot.graphRevision) failures.push('GRAPH_REVISION_UNBOUND');
  if (!Array.isArray(edge.evidenceRefs) || !edge.evidenceRefs.some(nonEmpty)) failures.push('EVIDENCE_UNBOUND');
  const order: Failure[] = ['ENDPOINT_UNRESOLVED', 'ENDPOINT_AMBIGUOUS', 'SOURCE_REVISION_UNBOUND', 'WORKSPACE_REVISION_UNBOUND', 'GRAPH_REVISION_UNBOUND', 'EVIDENCE_UNBOUND'];
  failures.sort((x, y) => order.indexOf(x) - order.indexOf(y));
  return { status: failures.length === 0 ? 'ADMISSIBLE' : failures[0], failures };
}

/** Summarise a readback batch: counts per status plus the share that is admissible. No partial promotion is implied. */
export function summarizeEdgeReadbackV1(verdicts: readonly EdgeAdmissionVerdictV1[]): Record<EdgeAdmissionStatusV1, number> & { total: number } {
  const out = {
    ADMISSIBLE: 0, ENDPOINT_UNRESOLVED: 0, ENDPOINT_AMBIGUOUS: 0, SOURCE_REVISION_UNBOUND: 0,
    WORKSPACE_REVISION_UNBOUND: 0, GRAPH_REVISION_UNBOUND: 0, EVIDENCE_UNBOUND: 0, total: verdicts.length,
  };
  for (const v of verdicts) out[v.status] += 1;
  return out;
}
