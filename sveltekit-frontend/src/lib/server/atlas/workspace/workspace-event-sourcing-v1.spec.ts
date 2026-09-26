import { describe, expect, it } from 'vitest';
import {
  appendWorkspaceEventV1,
  buildWorkspaceEventV1,
  createWorkspaceHeadV1,
  deriveWorkspaceHeadRevisionV1,
  deriveWorkspaceInvalidationsV1,
} from './workspace-event-sourcing-v1.js';

const baseSnapshotRevision = 'sha256:' + '1'.repeat(64);
const deltaRootChecksum = 'sha256:' + '2'.repeat(64);
const afterStateChecksum = 'sha256:' + '3'.repeat(64);
const sourceId = 'source:docs/claude.md';

function eventFor(head: ReturnType<typeof createWorkspaceHeadV1>) {
  const sequence = 1n;
  const workspaceHeadRevision = deriveWorkspaceHeadRevisionV1(baseSnapshotRevision, sequence, deltaRootChecksum);
  return buildWorkspaceEventV1({
    eventId: '00000000-0000-4000-8000-000000000001',
    workspaceId: 'repo:deeds-web-app',
    sequence,
    baseSnapshotRevision,
    previousHeadRevision: head.workspaceHeadRevision,
    workspaceHeadRevision,
    deltaRootChecksum,
    eventType: 'SOURCE_UPDATED',
    occurredAt: '2026-09-16T12:00:00.000Z',
    correlationId: '00000000-0000-4000-8000-000000000002',
    causationId: null,
    producerRevision: 'workspace-watcher-v1',
    beforeStateChecksum: 'sha256:' + '4'.repeat(64),
    afterStateChecksum,
    participants: [
      { role: 'WORKSPACE', canonicalId: 'repo:deeds-web-app', revision: baseSnapshotRevision, relation: 'SUBJECT' },
      { role: 'SOURCE', canonicalId: sourceId, revision: 'sha256:' + '5'.repeat(64), relation: 'SUBJECT' },
      { role: 'PACKET', canonicalId: 'packet:p17', revision: 'sha256:' + '6'.repeat(64), relation: 'INVALIDATES' },
      { role: 'REPRESENTATION', canonicalId: 'representation:p17:semantic_768', revision: 'semantic-768-v1', relation: 'INVALIDATES' },
    ],
  });
}

describe('workspace event sourcing v1', () => {
  it('folds an event into a lightweight head without creating a full snapshot', () => {
    const head = createWorkspaceHeadV1({ workspaceId: 'repo:deeds-web-app', baseSnapshotRevision, deltaRootChecksum });
    const event = eventFor(head);
    const next = appendWorkspaceEventV1(head, event);

    expect(next.lastEventSequence).toBe(1n);
    expect(next.eventCountSinceSnapshot).toBe(1);
    expect(next.changedSourceCount).toBe(1);
    expect(next.workspaceHeadRevision).toBe(event.workspaceHeadRevision);
  });

  it('rejects stale optimistic appends', () => {
    const head = createWorkspaceHeadV1({ workspaceId: 'repo:deeds-web-app', baseSnapshotRevision, deltaRootChecksum });
    const event = eventFor(head);
    const stale = { ...event, previousHeadRevision: 'sha256:' + '9'.repeat(64) };
    expect(() => appendWorkspaceEventV1(head, stale)).toThrow('WORKSPACE_HEAD_CONFLICT');
  });

  it('derives invalidations only from explicit canonical participants', () => {
    const head = createWorkspaceHeadV1({ workspaceId: 'repo:deeds-web-app', baseSnapshotRevision, deltaRootChecksum });
    const invalidations = deriveWorkspaceInvalidationsV1(eventFor(head));
    expect(invalidations.map((value) => [value.artifactKind, value.canonicalId])).toEqual([
      ['PACKET', 'packet:p17'],
      ['REPRESENTATION', 'representation:p17:semantic_768'],
    ]);
    expect(invalidations.every((value) => value.writesPerformed === false)).toBe(true);
  });
});
