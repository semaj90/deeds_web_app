import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const contentRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const graphSnapshotRevisionV1Schema = z.object({
  schema: z.literal('atlas.graph-snapshot-revision.v1'),
  snapshotId: z.string().uuid(),
  /** Upstream owner: WorkspaceRevisionRecordV1, never Git HEAD directly. */
  workspaceRevision: contentRevision,
  /** Deterministic revision of the exact graph source-inventory input. */
  sourceInventoryRevision: contentRevision,
  graphRevision: sha256,
  identityContractVersion: id,
  parserContractVersion: id,
  sourceInventoryHash: sha256,
  topologyHash: sha256,
  policyHash: sha256,
  producerRevision: id,
  revisionChecksum: sha256,
}).strict().superRefine((value, ctx) => {
  if (value.sourceInventoryRevision !== `sha256:${value.sourceInventoryHash}`) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sourceInventoryRevision'],
      message: 'sourceInventoryRevision must bind sourceInventoryHash',
    });
  }
});

export type GraphSnapshotRevisionV1 = z.infer<typeof graphSnapshotRevisionV1Schema>;
export type GraphSnapshotRevisionInputV1 = Omit<GraphSnapshotRevisionV1, 'schema' | 'graphRevision' | 'revisionChecksum'>;

function canonicalJson(value: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
}
function digest(namespace: string, payload: Record<string, unknown>): string {
  return createHash('sha256').update(namespace).update('\0').update(canonicalJson(payload)).digest('hex');
}

/** Logical graph revision. snapshotId is occurrence identity and excluded. */
export function deriveGraphRevisionV1(input: GraphSnapshotRevisionInputV1): string {
  return digest('atlas.graph-revision.v2', {
    workspaceRevision: input.workspaceRevision,
    sourceInventoryRevision: input.sourceInventoryRevision,
    identityContractVersion: input.identityContractVersion,
    parserContractVersion: input.parserContractVersion,
    sourceInventoryHash: input.sourceInventoryHash,
    topologyHash: input.topologyHash,
    policyHash: input.policyHash,
  });
}

export function buildGraphSnapshotRevisionV1(input: GraphSnapshotRevisionInputV1): GraphSnapshotRevisionV1 {
  const parsedInput = z.object({
    snapshotId: z.string().uuid(),
    workspaceRevision: contentRevision,
    sourceInventoryRevision: contentRevision,
    identityContractVersion: id,
    parserContractVersion: id,
    sourceInventoryHash: sha256,
    topologyHash: sha256,
    policyHash: sha256,
    producerRevision: id,
  }).strict().parse(input);
  if (parsedInput.sourceInventoryRevision !== `sha256:${parsedInput.sourceInventoryHash}`) {
    throw new Error('GRAPH_SOURCE_INVENTORY_REVISION_MISMATCH');
  }
  const graphRevision = deriveGraphRevisionV1(parsedInput);
  const withoutChecksum = { schema: 'atlas.graph-snapshot-revision.v1' as const, ...parsedInput, graphRevision };
  return graphSnapshotRevisionV1Schema.parse({
    ...withoutChecksum,
    revisionChecksum: digest('atlas.graph-snapshot-revision.v2', withoutChecksum),
  });
}

export function verifyGraphSnapshotRevisionV1(input: unknown): GraphSnapshotRevisionV1 {
  const parsed = graphSnapshotRevisionV1Schema.parse(input);
  const expectedGraphRevision = deriveGraphRevisionV1(parsed);
  if (parsed.graphRevision !== expectedGraphRevision) throw new Error(`GRAPH_REVISION_MISMATCH:${parsed.snapshotId}`);
  const { revisionChecksum, ...withoutChecksum } = parsed;
  const expectedChecksum = digest('atlas.graph-snapshot-revision.v2', withoutChecksum);
  if (revisionChecksum !== expectedChecksum) throw new Error(`GRAPH_SNAPSHOT_REVISION_CHECKSUM_MISMATCH:${parsed.snapshotId}`);
  return parsed;
}

/** Maps upstream workspace authority and the materializer's exact source inventory hash into persisted columns. */
export function buildGraphSnapshotRevisionWriteV1(input: {
  snapshotId: string;
  workspaceRevision: string;
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
    sourceInventoryRevision: `sha256:${input.sourceInventoryHash}`,
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
    'WorkspaceRevisionRecordV1 owns workspaceRevision; Git commit/tree IDs are provenance only.',
    'atlas_graph_snapshots_v2 binds that upstream workspaceRevision to deterministic sourceInventoryRevision and graphRevision.',
    'nodes and edges inherit snapshot revisions through snapshot_id rather than duplicating workspace/graph identity.',
    'per-node source_revision may be populated only from authoritative CodeSourceRevisionV1 evidence.',
    'source_ref, content_hash, packet/tree IDs, Qdrant/Neo4j IDs, and GPU ordinals never mint revision identity.',
  ].join(' ');
}
