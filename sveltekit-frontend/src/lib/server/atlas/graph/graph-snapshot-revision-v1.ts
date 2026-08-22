import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const graphSnapshotRevisionV1Schema = z.object({
  schema: z.literal('atlas.graph-snapshot-revision.v1'),
  snapshotId: z.string().uuid(),
  workspaceRevision: id,
  sourceInventoryRevision: id,
  graphRevision: sha256,
  identityContractVersion: id,
  parserContractVersion: id,
  sourceInventoryHash: sha256,
  topologyHash: sha256,
  policyHash: sha256,
  producerRevision: id,
  revisionChecksum: sha256,
}).strict();

export type GraphSnapshotRevisionV1 = z.infer<typeof graphSnapshotRevisionV1Schema>;

export type GraphSnapshotRevisionInputV1 = Omit<
  GraphSnapshotRevisionV1,
  'schema' | 'graphRevision' | 'revisionChecksum'
>;

function canonicalJson(value: Record<string, unknown>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, item]),
    ),
  );
}

function digest(namespace: string, payload: Record<string, unknown>): string {
  return createHash('sha256')
    .update(namespace)
    .update('\0')
    .update(canonicalJson(payload))
    .digest('hex');
}

/**
 * Content/revision identity for one logical graph snapshot.
 *
 * snapshotId is the immutable persistence occurrence ID. graphRevision is the
 * deterministic logical revision identity and therefore deliberately excludes
 * snapshotId and wall-clock timestamps so an identical rematerialization can
 * prove it represents the same graph world state.
 */
export function deriveGraphRevisionV1(input: GraphSnapshotRevisionInputV1): string {
  return digest('atlas.graph-revision.v1', {
    workspaceRevision: input.workspaceRevision,
    sourceInventoryRevision: input.sourceInventoryRevision,
    identityContractVersion: input.identityContractVersion,
    parserContractVersion: input.parserContractVersion,
    sourceInventoryHash: input.sourceInventoryHash,
    topologyHash: input.topologyHash,
    policyHash: input.policyHash,
  });
}

export function buildGraphSnapshotRevisionV1(
  input: GraphSnapshotRevisionInputV1,
): GraphSnapshotRevisionV1 {
  const parsedInput = z.object({
    snapshotId: z.string().uuid(),
    workspaceRevision: id,
    sourceInventoryRevision: id,
    identityContractVersion: id,
    parserContractVersion: id,
    sourceInventoryHash: sha256,
    topologyHash: sha256,
    policyHash: sha256,
    producerRevision: id,
  }).strict().parse(input);

  const graphRevision = deriveGraphRevisionV1(parsedInput);
  const withoutChecksum = {
    schema: 'atlas.graph-snapshot-revision.v1' as const,
    ...parsedInput,
    graphRevision,
  };
  const revisionChecksum = digest('atlas.graph-snapshot-revision.v1', withoutChecksum);
  return graphSnapshotRevisionV1Schema.parse({ ...withoutChecksum, revisionChecksum });
}

export function verifyGraphSnapshotRevisionV1(input: unknown): GraphSnapshotRevisionV1 {
  const parsed = graphSnapshotRevisionV1Schema.parse(input);
  const expectedGraphRevision = deriveGraphRevisionV1(parsed);
  if (parsed.graphRevision !== expectedGraphRevision) {
    throw new Error(`GRAPH_REVISION_MISMATCH:${parsed.snapshotId}`);
  }
  const { revisionChecksum, ...withoutChecksum } = parsed;
  const expectedChecksum = digest('atlas.graph-snapshot-revision.v1', withoutChecksum);
  if (revisionChecksum !== expectedChecksum) {
    throw new Error(`GRAPH_SNAPSHOT_REVISION_CHECKSUM_MISMATCH:${parsed.snapshotId}`);
  }
  return parsed;
}

/**
 * Maps the existing materializer/writer evidence into first-class snapshot
 * revision columns. This helper does not write anything itself and does not
 * infer per-node sourceRevision.
 */
export function buildGraphSnapshotRevisionWriteV1(input: {
  snapshotId: string;
  workspaceRevision: string;
  sourceInventorySnapshotId: string;
  identityContractVersion: string;
  parserContractVersion: string;
  sourceInventoryHash: string;
  topologyHash: string;
  policyHash: string;
  producerRevision: string;
}) {
  const revision = buildGraphSnapshotRevisionV1({
    snapshotId: input.snapshotId,
    workspaceRevision: input.workspaceRevision,
    sourceInventoryRevision: input.sourceInventorySnapshotId,
    identityContractVersion: input.identityContractVersion,
    parserContractVersion: input.parserContractVersion,
    sourceInventoryHash: input.sourceInventoryHash,
    topologyHash: input.topologyHash,
    policyHash: input.policyHash,
    producerRevision: input.producerRevision,
  });
  return {
    revision,
    columns: {
      workspace_revision: revision.workspaceRevision,
      source_inventory_revision: revision.sourceInventoryRevision,
      graph_revision: revision.graphRevision,
      identity_contract_version: revision.identityContractVersion,
      parser_contract_version: revision.parserContractVersion,
      revision_checksum: revision.revisionChecksum,
    },
  } as const;
}

export function describeGraphSnapshotRevisionOwnership(): string {
  return [
    'atlas_graph_snapshots_v2 owns snapshot-scoped workspaceRevision, sourceInventoryRevision, graphRevision, topologyHash, and policyHash.',
    'atlas_graph_nodes_v2 and atlas_graph_edges_v2 inherit those revisions through snapshot_id rather than duplicating them on every row.',
    'atlas_graph_nodes_v2.source_revision is nullable and may be populated only by an authoritative source revision owner.',
    'source_ref, content_hash, packet_key, tree_node_id, Neo4j IDs, Qdrant IDs, and GPU ordinals are not source-revision authority.',
  ].join(' ');
}
