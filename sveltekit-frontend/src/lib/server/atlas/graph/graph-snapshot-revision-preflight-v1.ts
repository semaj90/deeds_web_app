import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  workspaceRevisionRecordV1Schema,
  workspaceSourceBindingV1Schema,
  type WorkspaceRevisionRecordV1,
  type WorkspaceSourceBindingV1,
} from '../identity/workspace-source-binding-v1.js';
import {
  bindGraphSnapshotNodeSourceRevisionsV1,
  graphSnapshotSourceBindingReceiptV1Schema,
  type GraphSnapshotSourceBindableNodeV1,
} from './graph-snapshot-source-revision-binding-v1.js';
import {
  buildGraphSnapshotRevisionWriteV1,
  graphSnapshotRevisionV1Schema,
} from './graph-snapshot-revision-v1.js';

export const GRAPH_SNAPSHOT_REVISION_PREFLIGHT_SCHEMA = 'atlas.graph-snapshot-revision-preflight.v1' as const;
const id = z.string().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const graphSnapshotRevisionPreflightReceiptV1Schema = z.object({
  schema: z.literal(GRAPH_SNAPSHOT_REVISION_PREFLIGHT_SCHEMA),
  snapshotRevision: graphSnapshotRevisionV1Schema,
  sourceBinding: graphSnapshotSourceBindingReceiptV1Schema,
  workspaceRevisionOwnedUpstream: z.literal(true),
  graphRevisionOwnedBySnapshot: z.literal(true),
  nodeSourceRevisionOwnedUpstream: z.literal(true),
  applyAllowed: z.boolean(),
  blockers: z.array(id),
  producerRevision: id,
  preflightChecksum: sha256,
}).strict();
export type GraphSnapshotRevisionPreflightReceiptV1 = z.infer<typeof graphSnapshotRevisionPreflightReceiptV1Schema>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function checksum(value: unknown): string {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

/**
 * Pure preflight used immediately before graph snapshot persistence.
 *
 * It consumes the already-owned WorkspaceRevisionRecordV1 and
 * WorkspaceSourceBindingV1 set, binds exact CodeSourceRevisionV1 values onto
 * source-backed graph nodes, derives the snapshot-scoped graph revision, and
 * exposes one fail-closed applyAllowed bit. It never writes a store.
 */
export function prepareGraphSnapshotRevisionPreflightV1<T extends GraphSnapshotSourceBindableNodeV1>(input: {
  snapshotId: string;
  workspaceRecord: WorkspaceRevisionRecordV1;
  workspaceBindings: readonly WorkspaceSourceBindingV1[];
  graphNodes: readonly T[];
  identityContractVersion: string;
  parserContractVersion: string;
  sourceInventoryHash: string;
  topologyHash: string;
  policyHash: string;
  producerRevision: string;
}): {
  nodes: Array<T & { sourceRevision: string | null }>;
  revisionColumns: ReturnType<typeof buildGraphSnapshotRevisionWriteV1>['columns'];
  receipt: GraphSnapshotRevisionPreflightReceiptV1;
} {
  const workspaceRecord = workspaceRevisionRecordV1Schema.parse(input.workspaceRecord);
  const workspaceBindings = input.workspaceBindings.map((binding) => workspaceSourceBindingV1Schema.parse(binding));
  const sourceBinding = bindGraphSnapshotNodeSourceRevisionsV1({
    workspaceRecord,
    bindings: workspaceBindings,
    nodes: input.graphNodes,
    producerRevision: input.producerRevision,
  });
  const revisionWrite = buildGraphSnapshotRevisionWriteV1({
    snapshotId: input.snapshotId,
    workspaceRevision: workspaceRecord.workspaceRevision,
    identityContractVersion: input.identityContractVersion,
    parserContractVersion: input.parserContractVersion,
    sourceInventoryHash: input.sourceInventoryHash,
    topologyHash: input.topologyHash,
    policyHash: input.policyHash,
    producerRevision: input.producerRevision,
  });

  const blockers: string[] = [];
  if (!sourceBinding.receipt.completeCoverage) blockers.push('GRAPH_SOURCE_REVISION_COVERAGE_INCOMPLETE');
  if (revisionWrite.revision.workspaceRevision !== workspaceRecord.workspaceRevision) {
    blockers.push('GRAPH_WORKSPACE_REVISION_BINDING_MISMATCH');
  }
  const applyAllowed = blockers.length === 0;
  const payload = {
    schema: GRAPH_SNAPSHOT_REVISION_PREFLIGHT_SCHEMA,
    snapshotRevision: revisionWrite.revision,
    sourceBinding: sourceBinding.receipt,
    workspaceRevisionOwnedUpstream: true as const,
    graphRevisionOwnedBySnapshot: true as const,
    nodeSourceRevisionOwnedUpstream: true as const,
    applyAllowed,
    blockers,
    producerRevision: input.producerRevision,
  };
  const receipt = graphSnapshotRevisionPreflightReceiptV1Schema.parse({
    ...payload,
    preflightChecksum: checksum(payload),
  });
  return { nodes: sourceBinding.nodes, revisionColumns: revisionWrite.columns, receipt };
}
