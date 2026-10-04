/**
 * PacketIncidenceLineageV1 (HYPERRAG-LINEAGE-01/04/05/06/08/09): pure contract, checksums, per-row proof and
 * exact-revision consumer filter. It has NO database access and NO writer: persistence (-07) needs a DB-apply
 * decision and `atlas_packet_incidence` does not exist yet. Identity is exact; nothing here is fuzzy or inferred.
 * Excluded from identity: DB row ids, timestamps, Qdrant/Neo4j ids, insertion order, executor ids.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const PACKET_INCIDENCE_LINEAGE_SCHEMA_V1 = 'atlas.packet-incidence-lineage.v1' as const;

export interface PacketIncidenceIdentityV1 {
  packetKey: string;
  canonicalId: string;
  sourceRevision: string;
  neighborPacketKey: string;
  neighborCanonicalId: string;
  neighborSourceRevision: string;
  edgeType: string;
  workspaceRevision: string;
  graphRevision: string;
  producerId: string;
  producerRevision: string;
  evidenceRefs: string[];
}

export interface PacketIncidenceLineageV1 extends PacketIncidenceIdentityV1 {
  schema: typeof PACKET_INCIDENCE_LINEAGE_SCHEMA_V1;
  inputChecksum: string;
  lineageChecksum: string;
}

const nonEmptyString = z.string().trim().min(1);
const lineageDigest = z.string().regex(/^sha256:[0-9a-f]{64}$/i);

export const PacketIncidenceLineageV1Schema = z.object({
  schema: z.literal(PACKET_INCIDENCE_LINEAGE_SCHEMA_V1),
  packetKey: nonEmptyString,
  canonicalId: nonEmptyString,
  sourceRevision: nonEmptyString,
  neighborPacketKey: nonEmptyString,
  neighborCanonicalId: nonEmptyString,
  neighborSourceRevision: nonEmptyString,
  edgeType: nonEmptyString,
  workspaceRevision: nonEmptyString,
  graphRevision: nonEmptyString,
  producerId: nonEmptyString,
  producerRevision: nonEmptyString,
  evidenceRefs: z.array(nonEmptyString).min(1),
  inputChecksum: lineageDigest,
  lineageChecksum: lineageDigest,
}).strict();

export type PacketIncidenceProofV1 =
  | 'PACKET_A_RESOLVES'
  | 'PACKET_B_RESOLVES'
  | 'SOURCE_REVISION_A_EXACT'
  | 'SOURCE_REVISION_B_EXACT'
  | 'WORKSPACE_REVISION_EXACT'
  | 'GRAPH_REVISION_EXACT'
  | 'EVIDENCE_NONEMPTY'
  | 'INPUT_CHECKSUM_VALID'
  | 'LINEAGE_CHECKSUM_VALID';

export const PACKET_INCIDENCE_PROOFS_V1: readonly PacketIncidenceProofV1[] = [
  'PACKET_A_RESOLVES', 'PACKET_B_RESOLVES', 'SOURCE_REVISION_A_EXACT', 'SOURCE_REVISION_B_EXACT',
  'WORKSPACE_REVISION_EXACT', 'GRAPH_REVISION_EXACT', 'EVIDENCE_NONEMPTY', 'INPUT_CHECKSUM_VALID', 'LINEAGE_CHECKSUM_VALID',
];

/** Deterministic JSON: object keys sorted, arrays kept in given order (callers sort what must be a set). */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const sha256 = (text: string) => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
const sortedEvidence = (refs: readonly string[]) => [...new Set(refs)].sort();

export function computeInputChecksumV1(i: PacketIncidenceIdentityV1): string {
  return sha256(canonicalJson({
    packetKeys: [i.packetKey, i.neighborPacketKey],
    sourceRevisions: [i.sourceRevision, i.neighborSourceRevision],
    edgeType: i.edgeType,
    workspaceRevision: i.workspaceRevision,
    graphRevision: i.graphRevision,
    evidenceRefs: sortedEvidence(i.evidenceRefs),
  }));
}

export function computeLineageChecksumV1(i: PacketIncidenceIdentityV1, inputChecksum: string): string {
  return sha256(canonicalJson({
    schema: PACKET_INCIDENCE_LINEAGE_SCHEMA_V1,
    packets: [
      { packetKey: i.packetKey, canonicalId: i.canonicalId, sourceRevision: i.sourceRevision },
      { packetKey: i.neighborPacketKey, canonicalId: i.neighborCanonicalId, sourceRevision: i.neighborSourceRevision },
    ],
    edgeType: i.edgeType,
    workspaceRevision: i.workspaceRevision,
    graphRevision: i.graphRevision,
    producerId: i.producerId,
    producerRevision: i.producerRevision,
    evidenceRefs: sortedEvidence(i.evidenceRefs),
    inputChecksum,
  }));
}

const nonEmpty = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;

/** Seal an identity: fails closed on any missing field, never defaults a revision (-04/-05/-06). */
export function buildPacketIncidenceLineageV1(i: PacketIncidenceIdentityV1): PacketIncidenceLineageV1 {
  const required: (keyof PacketIncidenceIdentityV1)[] = [
    'packetKey', 'canonicalId', 'sourceRevision', 'neighborPacketKey', 'neighborCanonicalId', 'neighborSourceRevision',
    'edgeType', 'workspaceRevision', 'graphRevision', 'producerId', 'producerRevision',
  ];
  for (const k of required) if (!nonEmpty(i[k])) throw new Error(`PACKET_INCIDENCE_MISSING_FIELD: ${k}`);
  if (!Array.isArray(i.evidenceRefs) || !i.evidenceRefs.some(nonEmpty)) throw new Error('PACKET_INCIDENCE_MISSING_FIELD: evidenceRefs');
  if (i.packetKey === i.neighborPacketKey) throw new Error('PACKET_INCIDENCE_SELF_EDGE');
  const evidenceRefs = sortedEvidence(i.evidenceRefs.filter(nonEmpty));
  const sealed = { ...i, evidenceRefs };
  const inputChecksum = computeInputChecksumV1(sealed);
  return { schema: PACKET_INCIDENCE_LINEAGE_SCHEMA_V1, ...sealed, inputChecksum, lineageChecksum: computeLineageChecksumV1(sealed, inputChecksum) };
}

/** What the verifier knows from Postgres at the exact revisions (supplied by the caller; this module reads nothing). */
export interface PacketIncidenceExpectedV1 {
  resolvePacket(packetKey: string): { canonicalId: string; sourceRevision: string } | null;
  workspaceRevision: string;
  graphRevision: string;
}

export interface PacketIncidenceVerdictV1 {
  status: 'LINEAGE_PROVEN' | 'LINEAGE_UNPROVEN';
  proofs: Record<PacketIncidenceProofV1, boolean>;
  failed: PacketIncidenceProofV1[];
}

/** Per-row proof (-08). Any failed proof means LINEAGE_UNPROVEN; there is no fuzzy fallback. */
export function verifyPacketIncidenceLineageV1(row: PacketIncidenceLineageV1, expected: PacketIncidenceExpectedV1): PacketIncidenceVerdictV1 {
  const a = expected.resolvePacket(row.packetKey);
  const b = expected.resolvePacket(row.neighborPacketKey);
  let inputOk = false;
  let lineageOk = false;
  try {
    const input = computeInputChecksumV1(row);
    inputOk = input === row.inputChecksum;
    lineageOk = inputOk && computeLineageChecksumV1(row, input) === row.lineageChecksum;
  } catch {
    // malformed row: both checksum proofs stay false
  }
  const proofs: Record<PacketIncidenceProofV1, boolean> = {
    PACKET_A_RESOLVES: !!a && a.canonicalId === row.canonicalId,
    PACKET_B_RESOLVES: !!b && b.canonicalId === row.neighborCanonicalId,
    SOURCE_REVISION_A_EXACT: !!a && a.sourceRevision === row.sourceRevision,
    SOURCE_REVISION_B_EXACT: !!b && b.sourceRevision === row.neighborSourceRevision,
    WORKSPACE_REVISION_EXACT: row.workspaceRevision === expected.workspaceRevision,
    GRAPH_REVISION_EXACT: row.graphRevision === expected.graphRevision,
    EVIDENCE_NONEMPTY: Array.isArray(row.evidenceRefs) && row.evidenceRefs.some(nonEmpty),
    INPUT_CHECKSUM_VALID: inputOk,
    LINEAGE_CHECKSUM_VALID: lineageOk,
  };
  const failed = PACKET_INCIDENCE_PROOFS_V1.filter((p) => !proofs[p]);
  return { status: failed.length === 0 ? 'LINEAGE_PROVEN' : 'LINEAGE_UNPROVEN', proofs, failed };
}

export interface PacketIncidenceConsumeResultV1 {
  status: 'EXACT_REVISION_INCIDENCE' | 'EMPTY_EXACT_REVISION_INCIDENCE';
  neighbors: PacketIncidenceLineageV1[];
  rejected: { neighborPacketKey: string; failed: PacketIncidenceProofV1[] }[];
}

/**
 * HyperRAG consumer rule (-09): keep only rows for `packetKey` that prove at the exact revisions. No stale
 * fallback: zero surviving rows is a valid EMPTY_EXACT_REVISION_INCIDENCE, never a widened query.
 */
export function consumeExactRevisionIncidenceV1(
  packetKey: string,
  candidates: readonly PacketIncidenceLineageV1[],
  expected: PacketIncidenceExpectedV1,
): PacketIncidenceConsumeResultV1 {
  const neighbors: PacketIncidenceLineageV1[] = [];
  const rejected: PacketIncidenceConsumeResultV1['rejected'] = [];
  for (const row of candidates) {
    if (row.packetKey !== packetKey) continue;
    const verdict = verifyPacketIncidenceLineageV1(row, expected);
    if (verdict.status === 'LINEAGE_PROVEN') neighbors.push(row);
    else rejected.push({ neighborPacketKey: row.neighborPacketKey, failed: verdict.failed });
  }
  return { status: neighbors.length ? 'EXACT_REVISION_INCIDENCE' : 'EMPTY_EXACT_REVISION_INCIDENCE', neighbors, rejected };
}
