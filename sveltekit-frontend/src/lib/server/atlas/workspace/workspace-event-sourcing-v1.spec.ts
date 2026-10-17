import { describe, expect, it } from 'vitest';
import {
  admitProposedWorkspaceEventV1,
  appendWorkspaceEventV1,
  buildWorkspaceEventProvenanceFromLeaseV1,
  buildWorkspaceEventV1,
  createWorkspaceHeadV1,
  deriveWorkspaceHeadRevisionV1,
  deriveWorkspaceInvalidationsV1,
  proposeWorkspaceEventV1,
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

  describe('WORKSPACE-EVENT-BRIDGE-01', () => {
    const task: { taskId: string; claimToken: string | null; currentRunId: string | null; claimExpiresAt?: string | null } = {
      taskId: 'task:T1',
      claimToken: 'fence-7',
      currentRunId: 'run-1',
    };
    const lease = {
      leaseId: '00000000-0000-4000-8000-0000000000aa',
      taskId: 'task:T1',
      runId: 'run-1',
      ownerAgent: 'agent-a',
      worktreePath: 'C:/wt/a',
      branchName: 'agent/t1',
      baseCommit: 'abc123',
      status: 'ACTIVE',
      expiresAt: '2026-09-16T13:00:00.000Z',
      releasedAt: null as string | null,
      fenceEpoch: 3,
    };
    const now = '2026-09-16T12:00:00.000Z';
    type BridgeOver = {
      task?: Partial<typeof task>;
      lease?: Partial<typeof lease>;
      fence?: string;
      epoch?: number;
      key?: string;
      base?: string;
      at?: string;
      tool?: string | null;
    };
    const bridge = (over: BridgeOver = {}) =>
      buildWorkspaceEventProvenanceFromLeaseV1({
        task: { ...task, ...over.task },
        lease: { ...lease, ...over.lease },
        presentedFenceToken: over.fence ?? 'fence-7',
        presentedFenceEpoch: over.epoch ?? 3,
        expectedBaseCommit: over.base,
        idempotencyKey: over.key ?? 'k1',
        tool: over.tool ?? null,
        now: over.at ?? now,
      });
    const proposeFor = (head: ReturnType<typeof createWorkspaceHeadV1>, n: number, over: BridgeOver = {}) => {
      const { provenance, observation } = bridge(over);
      return proposeWorkspaceEventV1({
        head,
        eventId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
        correlationId: '00000000-0000-4000-8000-000000000002',
        eventType: 'SOURCE_UPDATED',
        occurredAt: now,
        producerRevision: 'bridge-v1',
        deltaRootChecksum,
        afterStateChecksum,
        participants: [{ role: 'SOURCE', canonicalId: sourceId, revision: 'sha256:' + '5'.repeat(64), relation: 'SUBJECT' }],
        provenance,
        observation,
      });
    };
    type AdmitOver = { task?: Partial<typeof task>; lease?: Partial<typeof lease>; seen?: string[]; base?: string; at?: string };
    const admit = (event: ReturnType<typeof proposeFor>, o: AdmitOver = {}) =>
      admitProposedWorkspaceEventV1({
        event,
        task: { ...task, ...o.task },
        lease: { ...lease, ...o.lease },
        seenIdempotencyKeys: new Set(o.seen ?? []),
        currentBaseCommit: o.base ?? 'abc123',
        now: o.at ?? now,
      });
    const head0 = () => createWorkspaceHeadV1({ workspaceId: 'repo:deeds-web-app', baseSnapshotRevision, deltaRootChecksum });

    it('turns a task claim into a revision-qualified PROPOSED event without appending it', () => {
      const head = head0();
      const event = proposeFor(head, 1);
      expect(event.sequence).toBe(1n);
      expect(event.previousHeadRevision).toBe(head.workspaceHeadRevision);
      expect(event.provenance).toMatchObject({ taskId: 'task:T1', executionRunId: 'run-1', leaseFenceToken: 'fence-7', worktreeId: 'C:/wt/a' });
      expect(event.observation?.approval).toBe('PENDING');
      expect(head.lastEventSequence).toBe(0n); // proposing never mutates the head
      expect(admit(event)).toEqual({ decision: 'ACCEPT', reason: null });
    });

    it('rejects stale, expired, released, cross-bound and unclaimed leases at build time', () => {
      expect(() => bridge({ lease: { status: 'RELEASED' } })).toThrow('LEASE_NOT_ACTIVE');
      expect(() => bridge({ lease: { releasedAt: now } })).toThrow('LEASE_NOT_ACTIVE');
      expect(() => bridge({ lease: { expiresAt: '2026-09-16T11:59:59.000Z' } })).toThrow('LEASE_EXPIRED');
      expect(() => bridge({ lease: { taskId: 'task:T2' } })).toThrow('LEASE_TASK_MISMATCH');
      expect(() => bridge({ lease: { runId: 'run-0' } })).toThrow('LEASE_RUN_MISMATCH');
      expect(() => bridge({ task: { claimToken: null } })).toThrow('TASK_NOT_CLAIMED');
    });

    it('rejects a stale fence token and a stale base commit', () => {
      expect(() => bridge({ epoch: 2 })).toThrow('STALE_FENCE_TOKEN');
      expect(() => bridge({ epoch: 4 })).toThrow('FENCE_EPOCH_AHEAD');
      expect(() => bridge({ fence: 'fence-6' })).toThrow('FENCE_TOKEN_MISMATCH');
      expect(() => bridge({ base: 'zzz999' })).toThrow('STALE_BASE_COMMIT');
      expect(() => bridge({ task: { claimExpiresAt: '2026-09-16T11:00:00.000Z' } })).toThrow('CLAIM_EXPIRED');
      const event = proposeFor(head0(), 1);
      // a zombie holding epoch 3 after the lease was re-granted at epoch 4
      expect(admit(event, { lease: { fenceEpoch: 4 } })).toEqual({ decision: 'REJECT', reason: 'STALE_FENCE_TOKEN' });
      expect(admit(event, { task: { claimToken: 'fence-8' } })).toEqual({ decision: 'REJECT', reason: 'FENCE_TOKEN_MISMATCH' });
      expect(admit(event, { base: 'def456' })).toEqual({ decision: 'REJECT', reason: 'STALE_BASE_COMMIT' });
      expect(admit(event, { at: '2026-09-16T14:00:00.000Z' })).toEqual({ decision: 'REJECT', reason: 'LEASE_EXPIRED' });
    });

    it('treats duplicate delivery as idempotent, even after the lease has expired', () => {
      const event = proposeFor(head0(), 1);
      expect(admit(event, { seen: ['k1'], at: '2026-09-16T14:00:00.000Z' })).toEqual({
        decision: 'DUPLICATE',
        reason: 'IDEMPOTENCY_KEY_SEEN',
      });
    });

    it('keeps observational fields out of the checksum but identity-bearing provenance in it', () => {
      const head = head0();
      const a = proposeFor(head, 1, { at: now, tool: 'edit' });
      const b = proposeFor(head, 1, { at: '2026-09-16T12:30:00.000Z', tool: 'write' });
      expect(a.observation?.recordedAt).not.toBe(b.observation?.recordedAt);
      expect(a.eventChecksum).toBe(b.eventChecksum);
      const other = proposeFor(head, 1, { lease: { worktreePath: 'C:/wt/b' } });
      expect(other.eventChecksum).not.toBe(a.eventChecksum);
      // every other identity-bearing field must also move the digest
      const newEpoch = proposeFor(head, 1, { lease: { fenceEpoch: 4 }, epoch: 4 });
      const newBase = proposeFor(head, 1, { lease: { baseCommit: 'def456' } });
      const newToken = proposeFor(head, 1, { task: { claimToken: 'fence-9' }, fence: 'fence-9' });
      const newKey = proposeFor(head, 1, { key: 'k-other' });
      for (const changed of [newEpoch, newBase, newToken, newKey]) {
        expect(changed.eventChecksum).not.toBe(a.eventChecksum);
      }
    });

    it('keeps independent worktree streams from overwriting one another', () => {
      const headA = createWorkspaceHeadV1({ workspaceId: 'repo:deeds-web-app#wt-a', baseSnapshotRevision, deltaRootChecksum });
      const headB = createWorkspaceHeadV1({ workspaceId: 'repo:deeds-web-app#wt-b', baseSnapshotRevision, deltaRootChecksum });
      const a1 = proposeFor(headA, 1);
      const b1 = proposeFor(headB, 2, { lease: { worktreePath: 'C:/wt/b' } });
      const nextA = appendWorkspaceEventV1(headA, a1);
      const nextB = appendWorkspaceEventV1(headB, b1);
      expect(nextA.workspaceId).not.toBe(nextB.workspaceId);
      expect(() => appendWorkspaceEventV1(headA, b1)).toThrow('WORKSPACE_ID_MISMATCH');
    });

    it('supports a task retry under a new run, but not a retry reusing a stale token', () => {
      const head = head0();
      const retryTask = { currentRunId: 'run-2', claimToken: 'fence-9' };
      const retry = proposeFor(head, 5, { task: retryTask, lease: { runId: 'run-2' }, fence: 'fence-9', key: 'k2' });
      expect(admit(retry, { task: retryTask, lease: { runId: 'run-2' }, seen: ['k1'] })).toEqual({ decision: 'ACCEPT', reason: null });
      expect(admit(retry, { task: { currentRunId: 'run-3', claimToken: 'fence-10' }, lease: { runId: 'run-3' } }).decision).toBe('REJECT');
    });

    it('rejects a delayed event whose sequence skips ahead, and an event with no provenance', () => {
      const head = head0();
      const event = proposeFor(head, 1);
      expect(() => appendWorkspaceEventV1(head, { ...event, sequence: 3n })).toThrow('WORKSPACE_EVENT_SEQUENCE_CONFLICT');
      const plain = eventFor(head);
      expect(admit(plain)).toEqual({ decision: 'REJECT', reason: 'PROVENANCE_REQUIRED' });
    });
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
