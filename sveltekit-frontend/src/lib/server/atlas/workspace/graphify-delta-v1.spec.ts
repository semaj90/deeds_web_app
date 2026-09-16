import { describe, expect, it } from 'vitest';
import {
  buildGraphifyDeltaBatchV1,
  classifyGraphifySourceDeltaV1,
  detectSupersededSourceV1,
  replayWorkspaceEventsV1,
} from './graphify-delta-v1.js';
import {
  buildWorkspaceEventV1,
  createWorkspaceHeadV1,
  deriveWorkspaceHeadRevisionV1,
} from './workspace-event-sourcing-v1.js';

const digest = (n: string) => `sha256:${n.repeat(64)}`;
const source = (revision: string, content: string, sourceRef = 'src/claude.md') => ({ sourceRef, sourceRevision: revision, contentDigest: digest(content) });

describe('graphify delta v1', () => {
  it('classifies added, changed, unchanged, and deleted sources', () => {
    expect(classifyGraphifySourceDeltaV1(null, source('r1', 'a')).kind).toBe('ADDED');
    expect(classifyGraphifySourceDeltaV1(source('r1', 'a'), source('r2', 'b')).kind).toBe('CHANGED');
    expect(classifyGraphifySourceDeltaV1(source('r1', 'a'), source('r1', 'a')).kind).toBe('UNCHANGED');
    expect(classifyGraphifySourceDeltaV1(source('r1', 'a'), null).kind).toBe('DELETED');
  });

  it('sorts the delta batch and counts only affected sources', () => {
    const batch = buildGraphifyDeltaBatchV1({
      batchId: '00000000-0000-4000-8000-000000000010',
      workspaceId: 'repo:deeds-web-app',
      baseSnapshotRevision: digest('1'),
      previousHeadRevision: digest('2'),
      deltas: [
        classifyGraphifySourceDeltaV1(source('r1', 'a', 'z.ts'), source('r2', 'b', 'z.ts')),
        classifyGraphifySourceDeltaV1(null, source('r1', 'c', 'a.ts')),
        classifyGraphifySourceDeltaV1(source('r1', 'd', 'm.ts'), source('r1', 'd', 'm.ts')),
      ],
    });
    expect(batch.changedCount).toBe(1);
    expect(batch.addedCount).toBe(1);
    expect(batch.unchangedCount).toBe(1);
    expect(batch.deletedCount).toBe(0);
    expect(batch.deltas.map((delta) => delta.sourceRef)).toEqual(['a.ts', 'm.ts', 'z.ts']);
  });

  it('rejects stale source results and requires requeue', () => {
    const result = detectSupersededSourceV1(source('r1', 'a'), source('r2', 'b'));
    expect(result?.status).toBe('SOURCE_SUPERSEDED_DURING_BATCH');
    expect(result?.staleResultRejected).toBe(true);
    expect(result?.requeueRequired).toBe(true);
  });

  it('replays ordered events to the same head deterministically', () => {
    const baseSnapshotRevision = digest('1');
    const initial = createWorkspaceHeadV1({ workspaceId: 'repo:deeds-web-app', baseSnapshotRevision, deltaRootChecksum: digest('2') });
    const event1 = buildWorkspaceEventV1({
      eventId: '00000000-0000-4000-8000-000000000011', workspaceId: initial.workspaceId, sequence: 1n,
      baseSnapshotRevision, previousHeadRevision: initial.workspaceHeadRevision,
      workspaceHeadRevision: deriveWorkspaceHeadRevisionV1(baseSnapshotRevision, 1n, digest('3')),
      deltaRootChecksum: digest('3'), eventType: 'SOURCE_UPDATED', occurredAt: '2026-09-16T12:00:00.000Z',
      correlationId: '00000000-0000-4000-8000-000000000012', causationId: null, producerRevision: 'graphify-delta-v1',
      beforeStateChecksum: digest('4'), afterStateChecksum: digest('5'),
      participants: [{ role: 'SOURCE', canonicalId: 'src/claude.md', revision: digest('6'), relation: 'SUBJECT' }],
    });
    const first = replayWorkspaceEventsV1(initial, [event1]);
    const second = replayWorkspaceEventsV1(initial, [event1]);
    expect(first.workspaceHeadRevision).toBe(second.workspaceHeadRevision);
    expect(first.lastEventChecksum).toBe(second.lastEventChecksum);
  });
});
