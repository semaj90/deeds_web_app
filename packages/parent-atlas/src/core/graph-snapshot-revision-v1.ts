import { createHash } from 'node:crypto';
import { z } from 'zod';

const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/i, 'expected a SHA-256 hex digest');

/** Snapshot-level revision owner for Graphify projections. */
export const GraphSnapshotRevisionV1Schema = z.object({
  schemaVersion: z.literal('graph-snapshot-revision-v1'),
  snapshotId: z.string().uuid(),
  workspaceRevision: z.string().min(1),
  sourceInventoryRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  identityContractVersion: z.string().min(1),
  parserContractVersion: z.string().min(1),
  sourceInventoryHash: sha256Hex,
  topologyHash: sha256Hex,
  policyHash: sha256Hex,
  producerRevision: z.string().min(1),
}).strict();

export const GraphSnapshotNodeBindingV1Schema = z.object({
  snapshotId: z.string().uuid(),
  nodeKey: z.string().min(1),
  sourceRevision: z.string().min(1).nullable(),
  treeNodeId: z.string().min(1).nullable(),
  symbolVersionId: z.string().min(1).nullable(),
}).strict();

export type GraphSnapshotRevisionV1 = z.infer<typeof GraphSnapshotRevisionV1Schema>;
export type GraphSnapshotNodeBindingV1 = z.infer<typeof GraphSnapshotNodeBindingV1Schema>;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}

export function computeGraphSnapshotRevisionChecksum(input: GraphSnapshotRevisionV1): string {
  return createHash('sha256')
    .update(stableJson(GraphSnapshotRevisionV1Schema.parse(input)), 'utf8')
    .digest('hex');
}

export function bindGraphNodeToSnapshotRevision(
  revisionInput: GraphSnapshotRevisionV1,
  nodeInput: GraphSnapshotNodeBindingV1,
): GraphSnapshotNodeBindingV1 {
  const revision = GraphSnapshotRevisionV1Schema.parse(revisionInput);
  const node = GraphSnapshotNodeBindingV1Schema.parse(nodeInput);
  if (node.snapshotId !== revision.snapshotId) throw new Error('GRAPH_SNAPSHOT_NODE_REVISION_MISMATCH');
  return node;
}

export function assertGraphSnapshotRevisionMatchesHashes(
  revisionInput: GraphSnapshotRevisionV1,
  expected: { topologyHash: string; policyHash: string; sourceInventoryHash: string },
): void {
  const revision = GraphSnapshotRevisionV1Schema.parse(revisionInput);
  if (
    revision.topologyHash !== expected.topologyHash ||
    revision.policyHash !== expected.policyHash ||
    revision.sourceInventoryHash !== expected.sourceInventoryHash
  ) throw new Error('GRAPH_SNAPSHOT_REVISION_HASH_MISMATCH');
}
