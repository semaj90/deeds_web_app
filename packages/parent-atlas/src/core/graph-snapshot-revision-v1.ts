import { createHash } from 'node:crypto';
import { z } from 'zod';

const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/i, 'expected a SHA-256 hex digest');
const contentRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/i, 'expected sha256:<digest> revision');
const id = z.string().min(1);

/** Canonical snapshot-level revision owner for Parent Atlas graph projections. */
export const GraphSnapshotRevisionV1Schema = z.object({
  schemaVersion: z.literal('graph-snapshot-revision-v1'),
  snapshotId: z.string().uuid(),
  /** Owned upstream by WorkspaceRevisionRecordV1; Git HEAD is provenance only. */
  workspaceRevision: contentRevision,
  /** Exact graph-source inventory revision, bound to sourceInventoryHash. */
  sourceInventoryRevision: contentRevision,
  /** Deterministic logical graph revision; excludes snapshot occurrence UUID. */
  graphRevision: sha256Hex,
  identityContractVersion: id,
  parserContractVersion: id,
  sourceInventoryHash: sha256Hex,
  topologyHash: sha256Hex,
  policyHash: sha256Hex,
  producerRevision: id,
  revisionChecksum: sha256Hex,
}).strict().superRefine((value, ctx) => {
  if (value.sourceInventoryRevision.toLowerCase() !== `sha256:${value.sourceInventoryHash.toLowerCase()}`) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sourceInventoryRevision'],
      message: 'sourceInventoryRevision must equal sha256:<sourceInventoryHash>',
    });
  }
});

export const GraphSnapshotNodeBindingV1Schema = z.object({
  snapshotId: z.string().uuid(),
  nodeKey: id,
  sourceRevision: contentRevision.nullable(),
  treeNodeId: id.nullable(),
  symbolVersionId: id.nullable(),
}).strict();

export type GraphSnapshotRevisionV1 = z.infer<typeof GraphSnapshotRevisionV1Schema>;
export type GraphSnapshotNodeBindingV1 = z.infer<typeof GraphSnapshotNodeBindingV1Schema>;
export type GraphSnapshotRevisionInputV1 = Omit<GraphSnapshotRevisionV1, 'schemaVersion' | 'graphRevision' | 'revisionChecksum'>;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}

function namespacedDigest(namespace: string, value: unknown): string {
  return createHash('sha256').update(namespace).update('\0').update(stableJson(value), 'utf8').digest('hex');
}

export function deriveGraphRevisionV1(input: GraphSnapshotRevisionInputV1): string {
  return namespacedDigest('atlas.graph-revision.v2', {
    workspaceRevision: input.workspaceRevision.toLowerCase(),
    sourceInventoryRevision: input.sourceInventoryRevision.toLowerCase(),
    identityContractVersion: input.identityContractVersion,
    parserContractVersion: input.parserContractVersion,
    sourceInventoryHash: input.sourceInventoryHash.toLowerCase(),
    topologyHash: input.topologyHash.toLowerCase(),
    policyHash: input.policyHash.toLowerCase(),
  });
}

export function buildGraphSnapshotRevisionV1(input: GraphSnapshotRevisionInputV1): GraphSnapshotRevisionV1 {
  const parsed = z.object({
    snapshotId: z.string().uuid(),
    workspaceRevision: contentRevision,
    sourceInventoryRevision: contentRevision,
    identityContractVersion: id,
    parserContractVersion: id,
    sourceInventoryHash: sha256Hex,
    topologyHash: sha256Hex,
    policyHash: sha256Hex,
    producerRevision: id,
  }).strict().parse(input);
  if (parsed.sourceInventoryRevision.toLowerCase() !== `sha256:${parsed.sourceInventoryHash.toLowerCase()}`) {
    throw new Error('GRAPH_SOURCE_INVENTORY_REVISION_MISMATCH');
  }
  const graphRevision = deriveGraphRevisionV1(parsed);
  const withoutChecksum = {
    schemaVersion: 'graph-snapshot-revision-v1' as const,
    ...parsed,
    graphRevision,
  };
  return GraphSnapshotRevisionV1Schema.parse({
    ...withoutChecksum,
    revisionChecksum: namespacedDigest('atlas.graph-snapshot-revision.v2', withoutChecksum),
  });
}

export function verifyGraphSnapshotRevisionV1(input: unknown): GraphSnapshotRevisionV1 {
  const parsed = GraphSnapshotRevisionV1Schema.parse(input);
  if (parsed.graphRevision !== deriveGraphRevisionV1(parsed)) {
    throw new Error(`GRAPH_REVISION_MISMATCH:${parsed.snapshotId}`);
  }
  const { revisionChecksum, ...withoutChecksum } = parsed;
  const expectedChecksum = namespacedDigest('atlas.graph-snapshot-revision.v2', withoutChecksum);
  if (revisionChecksum !== expectedChecksum) {
    throw new Error(`GRAPH_SNAPSHOT_REVISION_CHECKSUM_MISMATCH:${parsed.snapshotId}`);
  }
  return parsed;
}

/** Backward-compatible checksum helper; now verifies the canonical receipt checksum. */
export function computeGraphSnapshotRevisionChecksum(input: GraphSnapshotRevisionV1): string {
  const parsed = GraphSnapshotRevisionV1Schema.parse(input);
  const { revisionChecksum: _ignored, ...withoutChecksum } = parsed;
  return namespacedDigest('atlas.graph-snapshot-revision.v2', withoutChecksum);
}

export function bindGraphNodeToSnapshotRevision(
  revisionInput: GraphSnapshotRevisionV1,
  nodeInput: GraphSnapshotNodeBindingV1,
): GraphSnapshotNodeBindingV1 {
  const revision = verifyGraphSnapshotRevisionV1(revisionInput);
  const node = GraphSnapshotNodeBindingV1Schema.parse(nodeInput);
  if (node.snapshotId !== revision.snapshotId) throw new Error('GRAPH_SNAPSHOT_NODE_REVISION_MISMATCH');
  return node;
}

export function assertGraphSnapshotRevisionMatchesHashes(
  revisionInput: GraphSnapshotRevisionV1,
  expected: { topologyHash: string; policyHash: string; sourceInventoryHash: string },
): void {
  const revision = verifyGraphSnapshotRevisionV1(revisionInput);
  if (
    revision.topologyHash.toLowerCase() !== expected.topologyHash.toLowerCase() ||
    revision.policyHash.toLowerCase() !== expected.policyHash.toLowerCase() ||
    revision.sourceInventoryHash.toLowerCase() !== expected.sourceInventoryHash.toLowerCase()
  ) throw new Error('GRAPH_SNAPSHOT_REVISION_HASH_MISMATCH');
}
