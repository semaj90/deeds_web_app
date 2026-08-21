import type { GraphifyStructuralTombstoneV1 } from './graphify-structural-batch-v1.js';

export type CanonicalStructuralLifecycleState = 'ACTIVE' | 'SUPERSEDED' | 'QUARANTINED' | 'DELETED';

export type GraphifyStructuralLifecycleInputV1 = {
  tombstone: GraphifyStructuralTombstoneV1;
  currentState: CanonicalStructuralLifecycleState | null;
  canonicalIdentityPresent: boolean;
  currentSourceRevision: string | null;
};

export type GraphifyStructuralLifecyclePlanV1 = {
  status: 'OBSERVED_TOMBSTONE' | 'BLOCKED_REVISION_MISMATCH' | 'BLOCKED_IDENTITY_MISSING';
  sourceRef: string;
  sourceRevision: string;
  currentState: CanonicalStructuralLifecycleState | null;
  nextState: CanonicalStructuralLifecycleState | null;
  canonicalLifecycleOwner: 'POSTGRES_CANONICAL_LIFECYCLE_RECONCILER';
  projectionInvalidationRequired: boolean;
  parserMayMutateCanonicalState: false;
  persistence: 'NOT_ATTEMPTED';
};

/**
 * Contract-only planning boundary. A parser tombstone is an observation; this
 * function never deletes rows, changes lifecycle state, or invalidates a
 * projection. A later Postgres-owned reconciler may consume this plan.
 */
export function planGraphifyStructuralTombstoneV1(input: GraphifyStructuralLifecycleInputV1): GraphifyStructuralLifecyclePlanV1 {
  const revisionMatches = input.currentSourceRevision === null || input.currentSourceRevision === input.tombstone.sourceRevision;
  const status = !input.canonicalIdentityPresent
    ? 'BLOCKED_IDENTITY_MISSING'
    : !revisionMatches
      ? 'BLOCKED_REVISION_MISMATCH'
      : 'OBSERVED_TOMBSTONE';
  return {
    status,
    sourceRef: input.tombstone.sourceRef,
    sourceRevision: input.tombstone.sourceRevision,
    currentState: input.currentState,
    nextState: status === 'OBSERVED_TOMBSTONE' ? 'SUPERSEDED' : input.currentState,
    canonicalLifecycleOwner: 'POSTGRES_CANONICAL_LIFECYCLE_RECONCILER',
    projectionInvalidationRequired: status === 'OBSERVED_TOMBSTONE',
    parserMayMutateCanonicalState: false,
    persistence: 'NOT_ATTEMPTED',
  };
}
