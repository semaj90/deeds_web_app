import { describe, expect, it } from 'vitest';
import {
  appendWorkspaceEventV1,
  buildWorkspaceEventV1,
  createWorkspaceHeadV1,
  deriveWorkspaceHeadRevisionV1,
} from './workspace-event-sourcing-v1.js';
import { assessWorkspaceCompactionV1, planWorkspaceHeadCompactionV1 } from './workspace-snapshot-compaction-v1.js';

const baseSnapshotRevision = 'sha256:' + 'a'.repeat(64);
const deltaRootChecksum = 'sha256:' + 'b'.repeat(64);
const correlationId = '00000000-0000-4000-8000-000000000001';

function eventFor(head: ReturnType<typeof createWorkspaceHeadV1>, sequence: bigint, id: string) {
  const nextDelta = 'sha256:' + String.fromCharCode(97 + Number(sequence)).repeat(64);
  const nextRevision = deriveWorkspaceHeadRevisionV1(head.baseSnapshotRevision, sequence, nextDelta);
  return buildWorkspaceEventV1({
    eventId: id,
    workspaceId: head.workspaceId,
    sequence,
    baseSnapshotRevision: head.baseSnapshotRevision,
    previousHeadRevision: head.workspaceHeadRevision,
    workspaceHeadRevision: nextRevision,
    deltaRootChecksum: nextDelta,
    eventType: 'SOURCE_UPDATED',
    occurredAt: `2026-09-16T00:00:0${sequence}Z`,
    correlationId,
    causationId: null,
    producerRevision: 'graphify-delta-v1',
    beforeStateChecksum: null,
    afterStateChecksum: 'sha256:' + 'c'.repeat(64),
    participants: [{ role: 'SOURCE', canonicalId: `source-${sequence}`, revision: 'sha256:' + 'd'.repeat(64), relation: 'SUBJECT' }],
  });
}

describe('workspace snapshot compaction eligibility', () => {
  it('does not schedule an empty head', () => {
    const head = createWorkspaceHeadV1({ workspaceId: 'workspace-1', baseSnapshotRevision, deltaRootChecksum });
    const plan = assessWorkspaceCompactionV1({
      baseHead: head,
      currentHead: head,
      events: [],
      policy: { maxEventsSinceSnapshot: 2, maxChangedSources: 2, force: false },
    });
    expect(plan.status).toBe('NO_EVENTS');
    expect(plan.due).toBe(false);
    expect(plan.candidateSnapshotRevision).toBeNull();
    expect(plan.writesPerformed).toBe(false);
  });

  it('replays the event head and becomes due only at policy threshold', () => {
    const base = createWorkspaceHeadV1({ workspaceId: 'workspace-1', baseSnapshotRevision, deltaRootChecksum });
    const first = eventFor(base, 1n, '00000000-0000-4000-8000-000000000011');
    const current = appendWorkspaceEventV1(base, first);
    const plan = assessWorkspaceCompactionV1({
      baseHead: base,
      currentHead: current,
      events: [first],
      policy: { maxEventsSinceSnapshot: 1, maxChangedSources: 10, force: false },
    });
    expect(plan.status).toBe('READY_FOR_EXPLICIT_COMPACTION');
    expect(plan.replayedHeadRevision).toBe(current.workspaceHeadRevision);
    expect(plan.eventStreamChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('blocks a missing sequence or stale current head', () => {
    const base = createWorkspaceHeadV1({ workspaceId: 'workspace-1', baseSnapshotRevision, deltaRootChecksum });
    const second = eventFor(base, 2n, '00000000-0000-4000-8000-000000000012');
    const plan = assessWorkspaceCompactionV1({
      baseHead: base,
      currentHead: base,
      events: [second],
      policy: { maxEventsSinceSnapshot: 1, maxChangedSources: 1, force: true },
    });
    expect(plan.status).toBe('EVENT_GAP');
    expect(plan.due).toBe(false);
    expect(plan.canonicalAuthority).toBe(false);
  });

  it('compacts through a high-water mark while later events remain outside the plan', () => {
    const base = createWorkspaceHeadV1({ workspaceId: 'workspace-1', baseSnapshotRevision, deltaRootChecksum });
    const first = eventFor(base, 1n, '00000000-0000-4000-8000-000000000021');
    const afterFirst = appendWorkspaceEventV1(base, first);
    const second = eventFor(afterFirst, 2n, '00000000-0000-4000-8000-000000000022');
    const current = appendWorkspaceEventV1(afterFirst, second);
    const plan = planWorkspaceHeadCompactionV1({ baseHead: base, currentHead: current, events: [first, second], cutSequence: 1n });
    expect(plan.status).toBe('READY_FOR_EXPLICIT_COMPACTION');
    expect(plan.cut?.eventSequence).toBe('1');
    expect(plan.validation.laterEventsIgnored).toBe(true);
    expect(plan.writesPerformed).toBe(false);
    const repeat = planWorkspaceHeadCompactionV1({ baseHead: base, currentHead: current, events: [first, second], cutSequence: 1n });
    expect(repeat.planChecksum).toBe(plan.planChecksum);
  });

  it('replays from a previously compacted nonzero high-water mark', () => {
    const originalBase = createWorkspaceHeadV1({ workspaceId: 'workspace-1', baseSnapshotRevision, deltaRootChecksum });
    const first = eventFor(originalBase, 1n, '00000000-0000-4000-8000-000000000031');
    const afterFirst = appendWorkspaceEventV1(originalBase, first);
    const compactedBase = {
      ...afterFirst,
      baseSnapshotRevision: 'sha256:' + 'e'.repeat(64),
      eventCountSinceSnapshot: 0,
      changedSourceCount: 0,
    };
    const second = eventFor(compactedBase, 2n, '00000000-0000-4000-8000-000000000032');
    const current = appendWorkspaceEventV1(compactedBase, second);
    const plan = planWorkspaceHeadCompactionV1({
      baseHead: compactedBase,
      currentHead: current,
      events: [second],
      cutSequence: 2n,
    });
    expect(plan.status).toBe('READY_FOR_EXPLICIT_COMPACTION');
    expect(plan.validation.sequenceContinuous).toBe(true);
    expect(plan.validation.predecessorChainValid).toBe(true);
    expect(plan.cut?.eventSequence).toBe('2');
  });
});
