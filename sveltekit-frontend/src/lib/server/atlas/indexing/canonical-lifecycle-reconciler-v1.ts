import type { GraphifyStructuralTombstoneV1 } from './graphify-structural-batch-v1.js';

export type CanonicalLifecycleDecisionV1 = {
  schema: 'atlas.canonical-lifecycle-decision.v1';
  sourceRef: string;
  observedSourceRevision: string;
  previousSourceRevision: string | null;
  workspaceRevision: string;
  canonicalId: string | null;
  packetKey: string | null;
  treeNodeId: string | null;
  symbolVersionId: string | null;
  action: 'DELETE';
  status: 'OWNER_RESOLUTION_REQUIRED';
  parserAuthority: false;
  canonicalMutationAuthorized: false;
  invalidationAuthorized: false;
  requiredProofs: readonly [
    'CANONICAL_LIFECYCLE_OWNER',
    'REVISION_COMPARISON',
    'PERSISTENCE_READBACK',
    'PROJECTION_INVALIDATION_RECEIPT',
  ];
  evidenceRefs: string[];
  producerRevision: string;
};

export type CanonicalLifecycleReconcilerReceiptV1 = {
  schema: 'atlas.canonical-lifecycle-reconciler.v1';
  workspaceRevision: string;
  producerRevision: string;
  tombstoneCount: number;
  decisions: CanonicalLifecycleDecisionV1[];
  canonicalWritesAttempted: false;
  projectionInvalidationsAttempted: false;
  ownerAccepted: false;
  status: 'CONTRACT_ONLY_OWNER_UNRESOLVED';
};

/**
 * Contract-only lifecycle handoff.
 *
 * Tree-sitter/Graphify may observe a DELETE and carry identity/revision facts,
 * but neither becomes the canonical deletion authority by doing so. A future
 * accepted PostgreSQL lifecycle owner must compare revisions, transition the
 * canonical record, emit projection invalidation, and prove readback.
 */
export function planCanonicalLifecycleReconciliationV1(input: {
  workspaceRevision: string;
  producerRevision: string;
  tombstones: readonly GraphifyStructuralTombstoneV1[];
}): CanonicalLifecycleReconcilerReceiptV1 {
  const workspaceRevision = input.workspaceRevision.trim();
  const producerRevision = input.producerRevision.trim();
  if (!workspaceRevision) throw new Error('CANONICAL_LIFECYCLE_WORKSPACE_REVISION_REQUIRED');
  if (!producerRevision) throw new Error('CANONICAL_LIFECYCLE_PRODUCER_REVISION_REQUIRED');

  const decisions = input.tombstones.map((tombstone) => {
    if (tombstone.workspaceRevision !== workspaceRevision) {
      throw new Error(`CANONICAL_LIFECYCLE_WORKSPACE_REVISION_MISMATCH:${tombstone.sourceRef}`);
    }
    if (tombstone.canonicalPersistence !== 'NOT_ATTEMPTED') {
      throw new Error(`CANONICAL_LIFECYCLE_UNEXPECTED_UPSTREAM_PERSISTENCE:${tombstone.sourceRef}`);
    }

    return {
      schema: 'atlas.canonical-lifecycle-decision.v1' as const,
      sourceRef: tombstone.sourceRef,
      observedSourceRevision: tombstone.sourceRevision,
      previousSourceRevision: tombstone.previousSourceRevision,
      workspaceRevision,
      canonicalId: tombstone.canonicalId,
      packetKey: tombstone.packetKey,
      treeNodeId: tombstone.treeNodeId,
      symbolVersionId: tombstone.symbolVersionId,
      action: 'DELETE' as const,
      status: 'OWNER_RESOLUTION_REQUIRED' as const,
      parserAuthority: false as const,
      canonicalMutationAuthorized: false as const,
      invalidationAuthorized: false as const,
      requiredProofs: [
        'CANONICAL_LIFECYCLE_OWNER',
        'REVISION_COMPARISON',
        'PERSISTENCE_READBACK',
        'PROJECTION_INVALIDATION_RECEIPT',
      ] as const,
      evidenceRefs: [
        `graphify-tombstone:${tombstone.sourceRef}:${tombstone.sourceRevision}`,
      ],
      producerRevision,
    };
  });

  return {
    schema: 'atlas.canonical-lifecycle-reconciler.v1',
    workspaceRevision,
    producerRevision,
    tombstoneCount: decisions.length,
    decisions,
    canonicalWritesAttempted: false,
    projectionInvalidationsAttempted: false,
    ownerAccepted: false,
    status: 'CONTRACT_ONLY_OWNER_UNRESOLVED',
  };
}
