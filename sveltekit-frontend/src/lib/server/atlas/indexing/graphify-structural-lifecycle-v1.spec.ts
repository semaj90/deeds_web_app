import { describe, expect, it } from 'vitest';
import { planGraphifyStructuralTombstoneV1 } from './graphify-structural-lifecycle-v1.js';

const tombstone = { sourceRef: 'src/deleted.ts', sourceRevision: 'source-r1', reason: 'SOURCE_DELETED' as const, observedBy: 'GRAPHIFY_STRUCTURAL_MATERIALIZER' as const };

describe('graphify structural lifecycle v1', () => {
  it('plans supersession without mutating canonical state', () => {
    const plan = planGraphifyStructuralTombstoneV1({ tombstone, currentState: 'ACTIVE', canonicalIdentityPresent: true, currentSourceRevision: 'source-r1' });
    expect(plan.status).toBe('OBSERVED_TOMBSTONE');
    expect(plan.nextState).toBe('SUPERSEDED');
    expect(plan.projectionInvalidationRequired).toBe(true);
    expect(plan.parserMayMutateCanonicalState).toBe(false);
    expect(plan.persistence).toBe('NOT_ATTEMPTED');
  });

  it('blocks a stale tombstone revision', () => {
    const plan = planGraphifyStructuralTombstoneV1({ tombstone, currentState: 'ACTIVE', canonicalIdentityPresent: true, currentSourceRevision: 'source-r2' });
    expect(plan.status).toBe('BLOCKED_REVISION_MISMATCH');
    expect(plan.nextState).toBe('ACTIVE');
  });
});
