import { z } from 'zod';
import {
  buildGraphSnapshotRevisionV1 as buildCanonicalGraphSnapshotRevisionV1,
  deriveGraphRevisionV1 as deriveCanonicalGraphRevisionV1,
  verifyGraphSnapshotRevisionV1 as verifyCanonicalGraphSnapshotRevisionV1,
  type GraphSnapshotRevisionInputV1 as CanonicalGraphSnapshotRevisionInputV1,
} from '@deeds/parent-atlas';

const id = z.string().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const contentRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/);

/**
 * Persistence/wire compatibility shape for existing Svelte Graphify callers.
 * The graph-revision algorithm owner is packages/parent-atlas.
 */
export const graphSnapshotRevisionV1Schema = z.object({
  schema: z.literal('atlas.graph-snapshot-revision.v1'),
  snapshotId: z.string().uuid(),
  workspaceRevision: contentRevision,
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

function toCanonicalInput(input: GraphSnapshotRevisionInputV1): CanonicalGraphSnapshotRevisionInputV1 {
  return {
    snapshotId: input.snapshotId,
    workspaceRevision: input.workspaceRevision,
    sourceInventoryRevision: input.sourceInventoryRevision,
    identityContractVersion: input.identityContractVersion,
    parserContractVersion: input.parserContractVersion,
    sourceInventoryHash: input.sourceInventoryHash,
    topologyHash: input.topologyHash,
    policyHash: input.policyHash,
    producerRevision: input.producerRevision,
  };
}

function fromCanonical(input: ReturnType<typeof buildCanonicalGraphSnapshotRevisionV1>): GraphSnapshotRevisionV1 {
  return graphSnapshotRevisionV1Schema.parse({
    schema: 'atlas.graph-snapshot-revision.v1',
    snapshotId: input.snapshotId,
    workspaceRevision: input.workspaceRevision,
    sourceInventoryRevision: input.sourceInventoryRevision,
    graphRevision: input.graphRevision,
    identityContractVersion: input.identityContractVersion,
    parserContractVersion: input.parserContractVersion,
    sourceInventoryHash: input.sourceInventoryHash,
    topologyHash: input.topologyHash,
    policyHash: input.policyHash,
    producerRevision: input.producerRevision,
    revisionChecksum: input.revisionChecksum,
  });
}

export function deriveGraphRevisionV1(input: GraphSnapshotRevisionInputV1): string {
  return deriveCanonicalGraphRevisionV1(toCanonicalInput(input));
}

export function buildGraphSnapshotRevisionV1(input: GraphSnapshotRevisionInputV1): GraphSnapshotRevisionV1 {
  return fromCanonical(buildCanonicalGraphSnapshotRevisionV1(toCanonicalInput(input)));
}

export function verifyGraphSnapshotRevisionV1(input: unknown): GraphSnapshotRevisionV1 {
  const parsed = graphSnapshotRevisionV1Schema.parse(input);
  verifyCanonicalGraphSnapshotRevisionV1({
    schemaVersion: 'graph-snapshot-revision-v1',
    snapshotId: parsed.snapshotId,
    workspaceRevision: parsed.workspaceRevision,
    sourceInventoryRevision: parsed.sourceInventoryRevision,
    graphRevision: parsed.graphRevision,
    identityContractVersion: parsed.identityContractVersion,
    parserContractVersion: parsed.parserContractVersion,
    sourceInventoryHash: parsed.sourceInventoryHash,
    topologyHash: parsed.topologyHash,
    policyHash: parsed.policyHash,
    producerRevision: parsed.producerRevision,
    revisionChecksum: parsed.revisionChecksum,
  });
  return parsed;
}

/** Maps existing materializer evidence into persisted columns using the package owner. */
export function buildGraphSnapshotRevisionWriteV1(input: {
  snapshotId: string;
  workspaceRevision: string;
  sourceInventorySnapshotId?: string;
  sourceInventoryRevision?: string;
  identityContractVersion: string;
  parserContractVersion: string;
  sourceInventoryHash: string;
  topologyHash: string;
  policyHash: string;
  producerRevision: string;
}) {
  const sourceInventoryRevision = input.sourceInventoryRevision
    ?? (input.sourceInventorySnapshotId?.startsWith('sha256:') ? input.sourceInventorySnapshotId : `sha256:${input.sourceInventoryHash}`);
  const revision = buildGraphSnapshotRevisionV1({
    snapshotId: input.snapshotId,
    workspaceRevision: input.workspaceRevision,
    sourceInventoryRevision,
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
    'packages/parent-atlas owns GraphSnapshotRevisionV1 derivation and verification.',
    'the Svelte graph-snapshot-revision-v1 module is a persistence/wire compatibility adapter only.',
    'WorkspaceRevisionRecordV1 owns workspaceRevision; Git commit/tree IDs are provenance only.',
    'graph nodes and edges inherit graph revisions through snapshot_id.',
    'per-node source_revision may be populated only from authoritative CodeSourceRevisionV1 evidence.',
  ].join(' ');
}
