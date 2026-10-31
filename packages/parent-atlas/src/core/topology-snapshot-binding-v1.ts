import { z } from 'zod';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const uuid = z.string().uuid();

export const TopologySnapshotBindingV1Schema = z.object({
  contractVersion: z.literal('topology-snapshot-binding-v1'),
  snapshot: z.object({
    snapshotId: uuid,
    status: z.enum(['BUILDING', 'VALIDATED', 'SUPERSEDED', 'FAILED']),
    graphRevision: sha256,
    topologyHash: sha256,
    revisionChecksum: sha256,
  }).strict(),
  topology: z.object({
    snapshotId: uuid,
    topologyHash: sha256,
    nodeCount: z.number().int().nonnegative(),
    edgeCount: z.number().int().nonnegative(),
    contentDigest: sha256,
  }).strict(),
  pageRank: z.object({
    runId: uuid,
    snapshotId: uuid,
    status: z.enum(['BUILDING', 'VALIDATING', 'PASSED', 'FAILED', 'SUPERSEDED']),
    topologyHash: sha256,
    algorithmVersion: z.string().min(1),
    resultHash: sha256,
    nodeCount: z.number().int().nonnegative(),
    edgeCount: z.number().int().nonnegative(),
    scoreCount: z.number().int().nonnegative(),
  }).strict(),
  readback: z.object({
    status: z.enum(['VERIFIED', 'MISSING', 'MISMATCH']),
    snapshotRevisionChecksum: sha256.nullable(),
    topologyContentDigest: sha256.nullable(),
    pageRankResultHash: sha256.nullable(),
    pageRankRunId: uuid.nullable(),
    pageRankAlgorithmVersion: z.string().min(1).nullable(),
    readerId: z.string().min(1).nullable(),
  }).strict(),
  legacyGraphSnapshotHashMapping: z.object({
    status: z.enum(['UNRESOLVED', 'OWNER_REVIEW_REQUIRED', 'APPROVED']),
    semantics: z.enum(['TOPOLOGY_HASH', 'GRAPH_REVISION', 'REVISION_CHECKSUM']).nullable(),
    value: sha256.nullable(),
    ownerReceiptRef: z.string().min(1).nullable(),
  }).strict(),
}).strict();

export type TopologySnapshotBindingV1 = z.infer<typeof TopologySnapshotBindingV1Schema>;

export type TopologySnapshotBindingReviewV1 = {
  status: 'CONSISTENT_FOR_REVIEW' | 'BLOCKED';
  blockers: string[];
  writesAuthorized: false;
};

export function reviewTopologySnapshotBindingV1(input: TopologySnapshotBindingV1): TopologySnapshotBindingReviewV1 {
  const binding = TopologySnapshotBindingV1Schema.parse(input);
  const blockers: string[] = [];

  if (binding.snapshot.status !== 'VALIDATED') blockers.push('SNAPSHOT_NOT_VALIDATED');
  if (binding.topology.snapshotId !== binding.snapshot.snapshotId) blockers.push('TOPOLOGY_SNAPSHOT_MISMATCH');
  if (binding.topology.topologyHash !== binding.snapshot.topologyHash) blockers.push('TOPOLOGY_HASH_MISMATCH');
  if (binding.pageRank.snapshotId !== binding.snapshot.snapshotId) blockers.push('PAGERANK_SNAPSHOT_MISMATCH');
  if (binding.pageRank.topologyHash !== binding.snapshot.topologyHash) blockers.push('PAGERANK_TOPOLOGY_MISMATCH');
  if (binding.pageRank.status !== 'PASSED') blockers.push('PAGERANK_RUN_NOT_PASSED');
  if (binding.pageRank.nodeCount !== binding.topology.nodeCount) blockers.push('PAGERANK_NODE_COUNT_MISMATCH');
  if (binding.pageRank.edgeCount !== binding.topology.edgeCount) blockers.push('PAGERANK_EDGE_COUNT_MISMATCH');
  if (binding.pageRank.scoreCount !== binding.topology.nodeCount) blockers.push('PAGERANK_SCORE_COUNT_MISMATCH');
  if (binding.readback.status !== 'VERIFIED') blockers.push('INDEPENDENT_READBACK_NOT_VERIFIED');
  if (binding.readback.snapshotRevisionChecksum !== binding.snapshot.revisionChecksum) blockers.push('READBACK_SNAPSHOT_REVISION_MISMATCH');
  if (binding.readback.topologyContentDigest !== binding.topology.contentDigest) blockers.push('READBACK_TOPOLOGY_DIGEST_MISMATCH');
  if (binding.readback.pageRankResultHash !== binding.pageRank.resultHash) blockers.push('READBACK_PAGERANK_RESULT_MISMATCH');
  if (binding.readback.pageRankRunId !== binding.pageRank.runId) blockers.push('READBACK_PAGERANK_RUN_MISMATCH');
  if (binding.readback.pageRankAlgorithmVersion !== binding.pageRank.algorithmVersion) blockers.push('READBACK_PAGERANK_ALGORITHM_MISMATCH');
  if (!binding.readback.readerId) blockers.push('INDEPENDENT_READER_ID_MISSING');

  const mapping = binding.legacyGraphSnapshotHashMapping;
  if (mapping.status !== 'APPROVED') {
    blockers.push('LEGACY_GRAPH_SNAPSHOT_HASH_MAPPING_UNAPPROVED');
  } else {
    if (!mapping.semantics || !mapping.ownerReceiptRef || !mapping.value) blockers.push('LEGACY_GRAPH_SNAPSHOT_HASH_MAPPING_EVIDENCE_MISSING');
    const expectedValue = mapping.semantics === 'TOPOLOGY_HASH'
      ? binding.snapshot.topologyHash
      : mapping.semantics === 'GRAPH_REVISION'
        ? binding.snapshot.graphRevision
        : mapping.semantics === 'REVISION_CHECKSUM'
          ? binding.snapshot.revisionChecksum
          : null;
    if (expectedValue !== null && mapping.value !== expectedValue) blockers.push('LEGACY_GRAPH_SNAPSHOT_HASH_MAPPING_VALUE_MISMATCH');
  }

  return {
    status: blockers.length === 0 ? 'CONSISTENT_FOR_REVIEW' : 'BLOCKED',
    blockers: [...new Set(blockers)].sort(),
    writesAuthorized: false,
  };
}
