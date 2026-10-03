import {
  appendWorkspaceEventV1,
  WorkspaceEventV1Schema,
  WorkspaceHeadV1Schema,
  type WorkspaceEventV1,
  type WorkspaceHeadV1,
} from './workspace-event-sourcing-v1.js';

/**
 * Adapter seam for the planned Postgres event/head sidecar.
 *
 * The adapter owns validation and readback semantics, not storage. The real
 * implementation must provide these methods inside one transaction. This
 * contract deliberately cannot invent IDs, revisions, or event checksums.
 */
export interface WorkspaceEventHeadTransactionV1 {
  readHead(workspaceId: string): Promise<WorkspaceHeadV1 | null>;
  readEvent(eventId: string): Promise<WorkspaceEventV1 | null>;
  insertEvent(event: WorkspaceEventV1): Promise<void>;
  replaceHead(head: WorkspaceHeadV1): Promise<void>;
  readBackEvent(eventId: string): Promise<WorkspaceEventV1 | null>;
  readBackHead(workspaceId: string): Promise<WorkspaceHeadV1 | null>;
}

export interface WorkspaceEventHeadStoreV1 {
  transaction<T>(callback: (tx: WorkspaceEventHeadTransactionV1) => Promise<T>): Promise<T>;
}

export type WorkspaceEventHeadWriteResultV1 = {
  event: WorkspaceEventV1;
  head: WorkspaceHeadV1;
  duplicate: boolean;
  writesPerformed: boolean;
  readbackProven: boolean;
};

function assertReadback(
  expectedEvent: WorkspaceEventV1,
  expectedHead: WorkspaceHeadV1,
  actualEvent: WorkspaceEventV1 | null,
  actualHead: WorkspaceHeadV1 | null,
): void {
  if (!actualEvent || !actualHead) throw new Error('WORKSPACE_EVENT_HEAD_READBACK_MISSING');
  const event = WorkspaceEventV1Schema.parse(actualEvent);
  const head = WorkspaceHeadV1Schema.parse(actualHead);
  if (event.eventChecksum !== expectedEvent.eventChecksum) throw new Error('WORKSPACE_EVENT_READBACK_CHECKSUM_MISMATCH');
  if (event.eventId !== expectedEvent.eventId) throw new Error('WORKSPACE_EVENT_READBACK_ID_MISMATCH');
  if (head.workspaceHeadRevision !== expectedHead.workspaceHeadRevision) throw new Error('WORKSPACE_HEAD_READBACK_REVISION_MISMATCH');
  if (head.lastEventChecksum !== expectedHead.lastEventChecksum) throw new Error('WORKSPACE_HEAD_READBACK_EVENT_MISMATCH');
  if (head.lastEventSequence !== expectedHead.lastEventSequence) throw new Error('WORKSPACE_HEAD_READBACK_SEQUENCE_MISMATCH');
}

export async function writeWorkspaceEventHeadAtomicallyV1(
  store: WorkspaceEventHeadStoreV1,
  eventInput: WorkspaceEventV1,
): Promise<WorkspaceEventHeadWriteResultV1> {
  const event = WorkspaceEventV1Schema.parse(eventInput);
  return store.transaction(async (tx) => {
    const existing = await tx.readEvent(event.eventId);
    if (existing) {
      const stored = WorkspaceEventV1Schema.parse(existing);
      if (stored.eventChecksum !== event.eventChecksum) throw new Error('WORKSPACE_EVENT_IDENTITY_COLLISION');
      const head = WorkspaceHeadV1Schema.parse(await tx.readBackHead(event.workspaceId));
      return { event: stored, head, duplicate: true, writesPerformed: false, readbackProven: true };
    }

    const current = WorkspaceHeadV1Schema.parse(await tx.readHead(event.workspaceId));
    const next = appendWorkspaceEventV1(current, event);
    await tx.insertEvent(event);
    await tx.replaceHead(next);
    const readBackEvent = await tx.readBackEvent(event.eventId);
    const readBackHead = await tx.readBackHead(event.workspaceId);
    assertReadback(event, next, readBackEvent, readBackHead);
    return { event, head: next, duplicate: false, writesPerformed: true, readbackProven: true };
  });
}
