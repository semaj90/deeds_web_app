import { describe, expect, it } from 'vitest';
import { buildGraphifyDeltaBatchV1 } from './graphify-delta-v1.js';
import { planWorkspaceBindingCasBatchV1 } from './workspace-binding-cas-v1.js';
import { buildGraphifyDailyIncrementalPlanV1 } from './graphify-daily-incremental-plan-v1.js';
import { createWorkspaceHeadV1 } from './workspace-event-sourcing-v1.js';
import { assessWorkspaceCompactionV1 } from './workspace-snapshot-compaction-v1.js';

const digest = (value: string) => `sha256:${value.repeat(64)}`;
const source = (ref: string, revision: string, content: string) => ({ sourceRef: ref, sourceRevision: digest(revision), contentDigest: digest(content) });

function fixture() {
  const base = createWorkspaceHeadV1({ workspaceId: 'repo:test', baseSnapshotRevision: digest('a'), deltaRootChecksum: digest('b') });
  const delta = buildGraphifyDeltaBatchV1({
    batchId: '00000000-0000-4000-8000-000000000301', workspaceId: base.workspaceId,
    baseSnapshotRevision: base.baseSnapshotRevision, previousHeadRevision: base.workspaceHeadRevision,
    deltas: [{ sourceRef: 'repo:test:src/a.ts', kind: 'CHANGED', before: source('repo:test:src/a.ts', 'a', 'c'), after: source('repo:test:src/a.ts', 'b', 'd'), sourceEventRequired: true, staleResultRejected: false }],
  });
  const old = source('repo:test:src/a.ts', 'a', 'c');
  const current = source('repo:test:src/a.ts', 'a', 'c');
  const observed = source('repo:test:src/a.ts', 'b', 'd');
  const cas = planWorkspaceBindingCasBatchV1([{ expected: old, current, observed }]);
  const compaction = assessWorkspaceCompactionV1({ baseHead: base, currentHead: base, events: [], policy: { maxEventsSinceSnapshot: 10, maxChangedSources: 10, force: false } });
  return { delta, cas, compaction };
}

describe('Graphify daily incremental plan v1', () => {
  it('composes read-only delta/CAS/compaction state', () => {
    const { delta, cas, compaction } = fixture();
    const plan = buildGraphifyDailyIncrementalPlanV1({ delta, cas, compaction, invalidations: [] });
    expect(plan.status).toBe('READY_FOR_EVENT_ADMISSION');
    expect(plan.sourceCounts.changed).toBe(1);
    expect(plan.casCounts.ready).toBe(1);
    expect(plan.writesPerformed).toBe(false);
  });

  it('blocks a source-head conflict without creating a write', () => {
    const { delta, compaction } = fixture();
  const old = source('repo:test:src/a.ts', 'a', 'c');
  const cas = planWorkspaceBindingCasBatchV1([{ expected: old, current: source('repo:test:src/a.ts', 'e', 'f'), observed: source('repo:test:src/a.ts', 'b', 'd') }]);
    const plan = buildGraphifyDailyIncrementalPlanV1({ delta, cas, compaction, invalidations: [] });
    expect(plan.status).toBe('BLOCKED_CAS_CONFLICT');
    expect(plan.blockers).toContain('SOURCE_HEAD_CONFLICT');
    expect(plan.writesPerformed).toBe(false);
  });
});
