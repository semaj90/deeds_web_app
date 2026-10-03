import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  buildWorkspaceEventV1,
  createWorkspaceHeadV1,
  deriveWorkspaceHeadRevisionV1,
  type WorkspaceEventV1,
  type WorkspaceHeadV1,
} from './workspace-event-sourcing-v1.js';
import { writeWorkspaceEventHeadAtomicallyV1, type WorkspaceEventHeadTransactionV1 } from './workspace-event-head-durable-adapter-v1.js';

const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const eventId = '00000000-0000-4000-8000-000000000091';
const correlationId = '00000000-0000-4000-8000-000000000092';

function createFakeStore(initial: WorkspaceHeadV1) {
  let head = initial;
  const events = new Map<string, WorkspaceEventV1>();
  const store = {
    async transaction<T>(callback: (tx: WorkspaceEventHeadTransactionV1) => Promise<T>): Promise<T> {
      const draftHead = head;
      const draftEvents = new Map(events);
      const tx: WorkspaceEventHeadTransactionV1 = {
        readHead: async () => draftHead,
        readEvent: async (id) => draftEvents.get(id) ?? null,
        insertEvent: async (event) => { draftEvents.set(event.eventId, event); },
        replaceHead: async (next) => { head = next; },
        readBackEvent: async (id) => draftEvents.get(id) ?? null,
        readBackHead: async () => head,
      };
      const result = await callback(tx);
      events.clear();
      for (const [key, value] of draftEvents) events.set(key, value);
      return result;
    },
    state: () => ({ head, events }),
  };
  return store;
}

function makeEvent(head: WorkspaceHeadV1): WorkspaceEventV1 {
  const sequence = 1n;
  const deltaRootChecksum = digest('delta');
  return buildWorkspaceEventV1({
    eventId,
    workspaceId: head.workspaceId,
    sequence,
    baseSnapshotRevision: head.baseSnapshotRevision,
    previousHeadRevision: head.workspaceHeadRevision,
    workspaceHeadRevision: deriveWorkspaceHeadRevisionV1(head.baseSnapshotRevision, sequence, deltaRootChecksum),
    deltaRootChecksum,
    eventType: 'SOURCE_UPDATED',
    occurredAt: '2026-09-16T21:00:00.000Z',
    correlationId,
    causationId: null,
    producerRevision: 'workspace-event-test-v1',
    beforeStateChecksum: digest('before'),
    afterStateChecksum: digest('after'),
    participants: [{ role: 'SOURCE', canonicalId: 'src/claude.md', revision: digest('source'), relation: 'SUBJECT' }],
  });
}

describe('workspace event/head durable adapter', () => {
  it('preserves caller identity and proves event/head readback', async () => {
    const initial = createWorkspaceHeadV1({ workspaceId: 'repo:deeds-web-app', baseSnapshotRevision: digest('base'), deltaRootChecksum: digest('root') });
    const store = createFakeStore(initial);
    const event = makeEvent(initial);
    const result = await writeWorkspaceEventHeadAtomicallyV1(store, event);
    expect(result).toMatchObject({ duplicate: false, writesPerformed: true, readbackProven: true });
    expect(result.event.eventId).toBe(eventId);
    expect(result.head.lastEventSequence).toBe(1n);
  });

  it('is idempotent for the same event checksum and fails closed on collision', async () => {
    const initial = createWorkspaceHeadV1({ workspaceId: 'repo:deeds-web-app', baseSnapshotRevision: digest('base'), deltaRootChecksum: digest('root') });
    const store = createFakeStore(initial);
    const event = makeEvent(initial);
    await writeWorkspaceEventHeadAtomicallyV1(store, event);
    const retry = await writeWorkspaceEventHeadAtomicallyV1(store, event);
    expect(retry).toMatchObject({ duplicate: true, writesPerformed: false, readbackProven: true });
    const { eventChecksum: _eventChecksum, ...eventWithoutChecksum } = event;
    const changed = buildWorkspaceEventV1({ ...eventWithoutChecksum, afterStateChecksum: digest('changed') });
    await expect(writeWorkspaceEventHeadAtomicallyV1(store, changed)).rejects.toThrow('WORKSPACE_EVENT_IDENTITY_COLLISION');
  });
});
