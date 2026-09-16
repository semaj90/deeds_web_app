import { describe, expect, it } from 'vitest';
import { planWorkspaceBindingCasBatchV1, planWorkspaceBindingCasV1 } from './workspace-binding-cas-v1.js';

const state = (revision: string, content: string) => ({ sourceRef: 'repo:root:src/claude.md', sourceRevision: revision, contentDigest: `sha256:${content.repeat(64)}` });

describe('workspace binding CAS v1', () => {
  it('plans a changed source only when expected equals current', () => {
    const before = state('r1', 'a');
    const after = state('r2', 'b');
    expect(planWorkspaceBindingCasV1({ expected: before, current: before, observed: after }).status).toBe('READY_TO_APPLY');
  });

  it('rejects a stale expected source head', () => {
    expect(planWorkspaceBindingCasV1({ expected: state('r1', 'a'), current: state('r2', 'b'), observed: state('r3', 'c') }).status).toBe('SOURCE_HEAD_CONFLICT');
  });

  it('plans deletion as a tombstone and unchanged work as a noop', () => {
    const before = state('r1', 'a');
    expect(planWorkspaceBindingCasV1({ expected: before, current: before, observed: null }).status).toBe('DELETE_TOMBSTONE_READY');
    expect(planWorkspaceBindingCasV1({ expected: before, current: before, observed: before }).status).toBe('UNCHANGED_NOOP');
  });

  it('builds a deterministic batch without allowing duplicate source refs', () => {
    const first = state('r1', 'a');
    const second = { ...first, sourceRef: 'repo:root:src/index.ts' };
    const batch = planWorkspaceBindingCasBatchV1([
      { expected: first, current: first, observed: { ...first, sourceRevision: 'r2', contentDigest: 'sha256:' + 'b'.repeat(64) } },
      { expected: null, current: null, observed: second },
    ]);
    expect(batch.plans.map((plan) => plan.sourceRef)).toEqual(['repo:root:src/claude.md', 'repo:root:src/index.ts']);
    expect(batch.counts.ready).toBe(2);
    expect(batch.writesPerformed).toBe(false);
    expect(() => planWorkspaceBindingCasBatchV1([
      { expected: first, current: first, observed: first },
      { expected: first, current: first, observed: first },
    ])).toThrow('DUPLICATE_SOURCE_REFS');
  });
});
