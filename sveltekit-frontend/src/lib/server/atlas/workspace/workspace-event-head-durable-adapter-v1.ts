import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import {
  admitProposedWorkspaceEventV1,
  appendWorkspaceEventV1,
  WorkspaceEventV1Schema,
  WorkspaceHeadV1Schema,
  type AuthoritativeTaskClaimV1,
  type AuthoritativeWorktreeLeaseV1,
  type WorkspaceEventObservationV1,
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

// ---------------------------------------------------------------------------
// TRCF-22 fenced append: one transaction decides ACCEPT / DUPLICATE / REJECT from
// AUTHORITATIVE locked state and the DATABASE clock, then appends event + observation +
// head + outbox together and proves the readback before COMMIT.
// Lock order is fixed (stream head -> kanban claim -> worktree lease) to avoid deadlocks.
// ---------------------------------------------------------------------------

export interface FencedAuthoritativeStateV1 {
  task: AuthoritativeTaskClaimV1;
  lease: AuthoritativeWorktreeLeaseV1;
  /** PostgreSQL clock_timestamp() as ISO-8601; never a caller-supplied time. */
  dbNow: string;
}

/**
 * Caller-supplied projection revisions. None are defaulted or invented here: a missing
 * revision means the append is refused, never coerced.
 */
export interface WorkspaceOutboxInputV1 {
  sourceRevision: string;
  graphRevision: string;
  representationRevision: string;
  featureRevision: string;
  /** 64 lowercase hex, no prefix. */
  stageReceiptChecksum: string;
  changedPacketKeys: string[];
  candidateOrdinals?: number[];
  projections: string[];
}

export interface WorkspaceOutboxRowV1 extends WorkspaceOutboxInputV1 {
  outboxEventId: string;
  aggregateType: 'workspace_event';
  aggregateId: string;
  workspaceRevision: string;
  /** 64 lowercase hex, no prefix. */
  eventChecksum: string;
}

export interface FencedWorkspaceEventTransactionV1 extends WorkspaceEventHeadTransactionV1 {
  findEventByIdempotencyKey(workspaceId: string, worktreeId: string, key: string): Promise<WorkspaceEventV1 | null>;
  lockFenceState(ref: { taskId: string; leaseId: string }): Promise<FencedAuthoritativeStateV1 | null>;
  insertObservation(eventId: string, observation: WorkspaceEventObservationV1): Promise<void>;
  insertOutbox(row: WorkspaceOutboxRowV1): Promise<void>;
  readBackOutbox(outboxEventId: string): Promise<Pick<WorkspaceOutboxRowV1, 'aggregateId' | 'eventChecksum' | 'workspaceRevision'> | null>;
}

export interface FencedWorkspaceEventStoreV1 {
  transaction<T>(callback: (tx: FencedWorkspaceEventTransactionV1) => Promise<T>): Promise<T>;
}

export type FencedWorkspaceEventWriteResultV1 =
  | { status: 'APPENDED'; event: WorkspaceEventV1; head: WorkspaceHeadV1; outboxEventId: string; readbackProven: true }
  | { status: 'DUPLICATE'; event: WorkspaceEventV1; head: WorkspaceHeadV1; writesPerformed: false }
  | { status: 'REJECTED'; reason: string; writesPerformed: false };

const HEX64 = /^[a-f0-9]{64}$/;

function uuidFromHex(hex: string): string {
  const bytes = Buffer.from(hex.slice(0, 32), 'hex');
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function buildWorkspaceOutboxRowV1(event: WorkspaceEventV1, input: WorkspaceOutboxInputV1): WorkspaceOutboxRowV1 {
  const checksumHex = event.eventChecksum.replace(/^sha256:/, '');
  const outboxEventId = uuidFromHex(canonicalSha256V1({ schema: 'atlas.workspace-outbox-id.v1', eventChecksum: checksumHex }));
  const row = {
    outboxEventId,
    aggregateType: 'workspace_event' as const,
    aggregateId: event.eventId,
    workspaceRevision: event.workspaceHeadRevision,
    ...input,
    candidateOrdinals: input.candidateOrdinals ?? [],
  };
  const eventChecksum = canonicalSha256V1({ schema: 'atlas.workspace-outbox-row.v1', ...row });
  return { ...row, eventChecksum };
}

function sameIdentity(a: WorkspaceEventV1, b: WorkspaceEventV1): boolean {
  return a.eventChecksum === b.eventChecksum && JSON.stringify(a.provenance ?? null) === JSON.stringify(b.provenance ?? null);
}

export async function writeFencedWorkspaceEventV1(
  store: FencedWorkspaceEventStoreV1,
  input: { event: WorkspaceEventV1; outbox: WorkspaceOutboxInputV1 },
): Promise<FencedWorkspaceEventWriteResultV1> {
  const event = WorkspaceEventV1Schema.parse(input.event);
  const prov = event.provenance;
  if (!prov) return { status: 'REJECTED', reason: 'PROVENANCE_REQUIRED', writesPerformed: false };
  for (const [name, value] of Object.entries({
    sourceRevision: input.outbox.sourceRevision,
    graphRevision: input.outbox.graphRevision,
    representationRevision: input.outbox.representationRevision,
    featureRevision: input.outbox.featureRevision,
  })) {
    if (!value) return { status: 'REJECTED', reason: `OUTBOX_REVISION_MISSING:${name}`, writesPerformed: false };
  }
  if (!HEX64.test(input.outbox.stageReceiptChecksum)) {
    return { status: 'REJECTED', reason: 'OUTBOX_STAGE_RECEIPT_CHECKSUM_INVALID', writesPerformed: false };
  }

  return store.transaction(async (tx) => {
    // 1. stream head first: the serialization point for this (workspace, worktree) stream
    const headRaw = await tx.readHead(event.workspaceId);
    if (!headRaw) return { status: 'REJECTED', reason: 'STREAM_HEAD_MISSING', writesPerformed: false } as const;
    const head = WorkspaceHeadV1Schema.parse(headRaw);

    // 2. duplicate delivery is decided before any expiry check so a replay stays idempotent
    const prior = await tx.findEventByIdempotencyKey(event.workspaceId, prov.worktreeId, prov.idempotencyKey);
    if (prior) {
      if (!sameIdentity(WorkspaceEventV1Schema.parse(prior), event)) {
        return { status: 'REJECTED', reason: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_EVENT', writesPerformed: false } as const;
      }
      return { status: 'DUPLICATE', event: prior, head, writesPerformed: false } as const;
    }

    // 3. lock claim + lease, read the DATABASE clock, and admit against authoritative state
    const fence = await tx.lockFenceState({ taskId: prov.taskId, leaseId: prov.leaseId });
    if (!fence) return { status: 'REJECTED', reason: 'CLAIM_OR_LEASE_NOT_FOUND', writesPerformed: false } as const;
    const admission = admitProposedWorkspaceEventV1({
      event,
      task: fence.task,
      lease: fence.lease,
      seenIdempotencyKeys: new Set(),
      currentBaseCommit: fence.lease.baseCommit,
      now: fence.dbNow,
    });
    if (admission.decision !== 'ACCEPT') {
      return { status: 'REJECTED', reason: admission.reason, writesPerformed: false } as const;
    }

    // 4. append: head CAS via appendWorkspaceEventV1, event, observation, head, outbox
    const next = appendWorkspaceEventV1(head, event);
    const outbox = buildWorkspaceOutboxRowV1(event, input.outbox);
    await tx.insertEvent(event);
    if (event.observation) await tx.insertObservation(event.eventId, event.observation);
    await tx.replaceHead(next);
    await tx.insertOutbox(outbox);

    // 5. prove readback before COMMIT
    const readEvent = await tx.readBackEvent(event.eventId);
    const readHead = await tx.readBackHead(event.workspaceId);
    assertReadback(event, next, readEvent, readHead);
    if (!readEvent || JSON.stringify(readEvent.provenance ?? null) !== JSON.stringify(event.provenance ?? null)) {
      throw new Error('WORKSPACE_EVENT_READBACK_PROVENANCE_MISMATCH');
    }
    const readOutbox = await tx.readBackOutbox(outbox.outboxEventId);
    if (!readOutbox || readOutbox.eventChecksum !== outbox.eventChecksum || readOutbox.aggregateId !== event.eventId) {
      throw new Error('WORKSPACE_OUTBOX_READBACK_MISMATCH');
    }
    return { status: 'APPENDED', event: readEvent, head: next, outboxEventId: outbox.outboxEventId, readbackProven: true } as const;
  });
}
