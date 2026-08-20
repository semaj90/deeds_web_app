import { describe, expect, it } from 'vitest';

import type { GraphifyStructuralTombstoneV1 } from './graphify-structural-batch-v1.js';
import { reconcileStructuralTombstoneV1 } from './canonical-lifecycle-reconciler-v1.js';

const tombstone: GraphifyStructuralTombstoneV1 = {
  schema: 'atlas.graphify-structural-tombstone.v1',
  sourceRef: 'sveltekit-frontend/src/example.ts',
  workspaceRevision: 'ws-42',
  sourceVersionAnchor: 'deleted:event-anchor',
  reason: 'SOURCE_DELETED',
  priorContentHash: 'content-hash-a',
  producerRevision: 'batch-v1',
};

const canonical = {
  canonicalId: 'canonical-1',
  packetKey: 'packet-1',
  sourceRef: tombstone.sourceRef,
  currentWorkspaceRevision: tombstone.workspaceRevision,
  currentSourceRevision: 'source-revision-7',
  currentContentHash: tombstone.priorContentHash,
  lifecycleState: 'ACTIVE' as const,
};

describe('CanonicalLifecycleReconcilerV1', () => {
  it('validates a fresh deletion but never becomes mutation authority', () => {
    const receipt = reconcileStructuralTombstoneV1({
      tombstone,
      canonical,
      producerRevision: 'reconciler-test',
    });

    expect(receipt.status).toBe('READY_FOR_PERSISTENCE_OWNER');
    expect(receipt.proposedLifecycleState).toBe('SUPERSEDED');
    expect(receipt.canonicalIdentityValidated).toBe(true);
    expect(receipt.workspaceRevisionMatched).toBe(true);
    expect(receipt.sourceLineageMatched).toBe(true);
    expect(receipt.observationIsMutationAuthority).toBe(false);
    expect(receipt.canonicalWritesAllowed).toBe(false);
    expect(receipt.persistenceOwnerRequired).toBe(true);
  });

  it('fails closed when canonical identity is unresolved', () => {
    const receipt = reconcileStructuralTombstoneV1({
      tombstone,
      canonical: null,
      producerRevision: 'reconciler-test',
    });

    expect(receipt.status).toBe('BLOCKED_IDENTITY_UNRESOLVED');
    expect(receipt.proposedLifecycleState).toBeNull();
    expect(receipt.invalidationTargets).toEqual([]);
  });

  it('rejects stale delete evidence instead of deleting a newer revision', () => {
    const receipt = reconcileStructuralTombstoneV1({
      tombstone,
      canonical: { ...canonical, currentContentHash: 'newer-content-hash' },
      producerRevision: 'reconciler-test',
    });

    expect(receipt.status).toBe('BLOCKED_SOURCE_REVISION_MISMATCH');
    expect(receipt.sourceLineageMatched).toBe(false);
    expect(receipt.invalidationTargets).toEqual([]);
  });

  it('does not infer source lineage when the tombstone lacks a prior hash', () => {
    const receipt = reconcileStructuralTombstoneV1({
      tombstone: { ...tombstone, priorContentHash: null },
      canonical,
      producerRevision: 'reconciler-test',
    });

    expect(receipt.status).toBe('BLOCKED_SOURCE_LINEAGE_UNAVAILABLE');
    expect(receipt.canonicalWritesAllowed).toBe(false);
  });
});
