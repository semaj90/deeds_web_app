import { describe, expect, it } from 'vitest';
import {
  type AuthoritativeLeaseStateV1,
  type KanbanEventCandidateV1,
  type WorktreeStreamHeadV1,
  createWorktreeStreamHeadV1,
  proposeKanbanWorkspaceEventV1,
} from './kanban-workspace-event-bridge-v1.js';

describe('WORKSPACE-EVENT-BRIDGE-01: Kanban-to-Workspace Event Adapter V1', () => {
  const baseCommit = 'sha256:' + 'a'.repeat(64);
  const now = '2026-10-17T02:00:00.000Z';

  function defaultLease(overrides?: Partial<AuthoritativeLeaseStateV1>): AuthoritativeLeaseStateV1 {
    return {
      leaseId: 'lease-kanban-001',
      taskId: 'task-kb-101',
      executionRunId: 'run-901',
      ownerAgent: 'agent-atlas-codegen',
      worktreeId: 'wt-feature-alpha',
      branch: 'feature/alpha-retrieval',
      baseCommit,
      status: 'ACTIVE',
      leaseFenceToken: 42,
      expiresAt: '2026-10-17T03:00:00.000Z',
      releasedAt: null,
      ...overrides,
    };
  }

  function defaultHead(overrides?: Partial<WorktreeStreamHeadV1>): WorktreeStreamHeadV1 {
    return {
      workspaceId: 'repo:deeds-web-app',
      worktreeId: 'wt-feature-alpha',
      lastStreamSequence: 0,
      lastEventDigestV2: null,
      baseCommit,
      seenIdempotencyKeys: [],
      ...overrides,
    };
  }

  function defaultCandidate(overrides?: Partial<KanbanEventCandidateV1>): KanbanEventCandidateV1 {
    return {
      workspaceId: 'repo:deeds-web-app',
      worktreeId: 'wt-feature-alpha',
      branch: 'feature/alpha-retrieval',
      taskId: 'task-kb-101',
      executionRunId: 'run-901',
      leaseId: 'lease-kanban-001',
      presentedFenceToken: 42,
      presentedBaseCommit: baseCommit,
      actor: 'agent-atlas-codegen',
      idempotencyKey: 'idem-key-001',
      eventType: 'SOURCE_UPDATED',
      affectedSourceRefs: ['src/lib/server/retrieval/orchestrator.ts'],
      invalidatedAstSymbols: ['orchestrateRetrievalV1'],
      invalidatedPacketKeys: ['pkt_retrieval_001'],
      invalidatedChunkIds: ['chk_77'],
      invalidatedContextManifestIds: ['cm_active_session'],
      occurredAt: '2026-10-17T01:59:50.000Z',
      tool: 'ast-treesitter-patch',
      causationId: '00000000-0000-4000-8000-000000000001',
      supersedesEventId: null,
      ...overrides,
    };
  }

  // 1. Valid Kanban claim produces proposed event + targeted invalidation manifest
  it('Scenario 1: valid Kanban claim produces proposed event + targeted invalidation manifest with strict safety invariants', () => {
    const lease = defaultLease();
    const head = defaultHead();
    const candidate = defaultCandidate();

    const result = proposeKanbanWorkspaceEventV1({ lease, head, candidate, now });

    expect(result.decision).toBe('ACCEPT');
    if (result.decision !== 'ACCEPT') return;

    // Proposed event verification
    expect(result.proposedEvent.schema).toBe('atlas.proposed-workspace-event.v2');
    expect(result.proposedEvent.streamSequence).toBe(1);
    expect(result.proposedEvent.identityDigestV2).toMatch(/^ev_v2_[a-f0-9]{64}$/);
    expect(result.proposedEvent.provenanceV2.schemaVersion).toBe('atlas.workspace-provenance.v2');
    expect(result.proposedEvent.provenanceV2.taskId).toBe('task-kb-101');
    expect(result.proposedEvent.provenanceV2.leaseFenceToken).toBe(42);
    expect(result.proposedEvent.provenanceV2.occurredAt).toBe('2026-10-17T01:59:50.000Z');
    expect(result.proposedEvent.provenanceV2.recordedAt).toBe(now);

    // Targeted invalidation manifest verification
    expect(result.invalidationManifest.schema).toBe('atlas.targeted-invalidation-manifest.v1');
    expect(result.invalidationManifest.eventDigestV2).toBe(result.proposedEvent.identityDigestV2);
    expect(result.invalidationManifest.affectedSourceRefs).toEqual(['src/lib/server/retrieval/orchestrator.ts']);
    expect(result.invalidationManifest.invalidatedAstSymbols).toEqual(['orchestrateRetrievalV1']);
    expect(result.invalidationManifest.invalidatedPacketKeys).toEqual(['pkt_retrieval_001']);
    expect(result.invalidationManifest.invalidatedChunkIds).toEqual(['chk_77']);
    expect(result.invalidationManifest.invalidatedContextManifestIds).toEqual(['cm_active_session']);

    // Safety and authority invariants: zero mutation, no blanket rebuild, no unearned graph promotion
    expect(result.invalidationManifest.blanketRebuild).toBe(false);
    expect(result.invalidationManifest.pageRankAuthorityPromoted).toBe(false);
    expect(result.invalidationManifest.naryAuthorityPromoted).toBe(false);
    expect(result.invalidationManifest.writesPerformed).toBe(false);
    expect(result.invalidationManifest.canonicalAuthority).toBe(false);

    // Advanced stream head verification
    expect(result.nextStreamHead.lastStreamSequence).toBe(1);
    expect(result.nextStreamHead.lastEventDigestV2).toBe(result.proposedEvent.identityDigestV2);
    expect(result.nextStreamHead.seenIdempotencyKeys).toContain('idem-key-001');
  });

  // 2. Duplicate delivery with matching idempotencyKey returns idempotent no-op
  it('Scenario 2: duplicate delivery with matching idempotencyKey returns idempotent no-op without advancing stream', () => {
    const lease = defaultLease();
    const head = defaultHead({
      lastStreamSequence: 5,
      lastEventDigestV2: 'ev_v2_' + '0'.repeat(64),
      seenIdempotencyKeys: ['idem-key-001', 'idem-key-prior'],
    });
    const candidate = defaultCandidate({ idempotencyKey: 'idem-key-001' });

    const result = proposeKanbanWorkspaceEventV1({ lease, head, candidate, now });

    expect(result.decision).toBe('IDEMPOTENT_DUPLICATE_NOOP');
    if (result.decision !== 'IDEMPOTENT_DUPLICATE_NOOP') return;

    expect(result.reason).toBe('IDEMPOTENT_DUPLICATE_NOOP');
    expect(result.idempotencyKey).toBe('idem-key-001');
    expect(result.streamHead.lastStreamSequence).toBe(5);
    expect(result.streamHead.lastEventDigestV2).toBe('ev_v2_' + '0'.repeat(64));
  });

  // 3. Delayed event with occurredAt earlier than recordedAt orders strictly by streamSequence
  it('Scenario 3: delayed event with occurredAt earlier than recordedAt orders strictly by streamSequence, preserving monotonic stream ordering', () => {
    const lease = defaultLease();
    let currentHead = createWorktreeStreamHeadV1({
      workspaceId: 'repo:deeds-web-app',
      worktreeId: 'wt-feature-alpha',
      baseCommit,
    });

    // Event 1 occurred at 02:00:00Z and was recorded at 02:00:05Z
    const candidate1 = defaultCandidate({
      idempotencyKey: 'event-1-key',
      occurredAt: '2026-10-17T02:00:00.000Z',
      eventType: 'SOURCE_UPDATED',
    });
    const res1 = proposeKanbanWorkspaceEventV1({
      lease,
      head: currentHead,
      candidate: candidate1,
      now: '2026-10-17T02:00:05.000Z',
    });
    expect(res1.decision).toBe('ACCEPT');
    if (res1.decision !== 'ACCEPT') return;
    expect(res1.proposedEvent.streamSequence).toBe(1);
    currentHead = res1.nextStreamHead;

    // Event 2 is delayed from an offline subagent: occurred at 01:00:00Z (an hour earlier than event 1!)
    // but arrives and is recorded at 02:05:00Z
    const candidate2 = defaultCandidate({
      idempotencyKey: 'event-2-delayed-key',
      occurredAt: '2026-10-17T01:00:00.000Z', // Out of order wall clock!
      eventType: 'SOURCE_UPDATED',
    });
    const res2 = proposeKanbanWorkspaceEventV1({
      lease,
      head: currentHead,
      candidate: candidate2,
      now: '2026-10-17T02:05:00.000Z',
    });
    expect(res2.decision).toBe('ACCEPT');
    if (res2.decision !== 'ACCEPT') return;

    // Stream sequence must be 2, strictly monotonically ordered
    expect(res2.proposedEvent.streamSequence).toBe(2);

    // Verify replay order: sort by streamSequence vs sort by occurredAt
    const stream = [res1.proposedEvent, res2.proposedEvent];
    const orderedReplay = [...stream].sort((a, b) => a.streamSequence - b.streamSequence);
    expect(orderedReplay[0].streamSequence).toBe(1);
    expect(orderedReplay[1].streamSequence).toBe(2);
    expect(orderedReplay[0].provenanceV2.idempotencyKey).toBe('event-1-key');
    expect(orderedReplay[1].provenanceV2.idempotencyKey).toBe('event-2-delayed-key');
  });

  // 4. Expired lease or stale leaseFenceToken fails closed
  it('Scenario 4: expired lease or stale leaseFenceToken fails closed', () => {
    const head = defaultHead();

    // 4a. Expired lease
    const expiredLease = defaultLease({
      expiresAt: '2026-10-17T01:59:00.000Z', // 1 minute in the past
    });
    const resExpired = proposeKanbanWorkspaceEventV1({
      lease: expiredLease,
      head,
      candidate: defaultCandidate(),
      now,
    });
    expect(resExpired.decision).toBe('REJECT');
    if (resExpired.decision === 'REJECT') {
      expect(resExpired.rejectionReason).toBe('LEASE_EXPIRED');
    }

    // 4b. Released lease
    const releasedLease = defaultLease({
      status: 'RELEASED',
      releasedAt: '2026-10-17T01:55:00.000Z',
    });
    const resReleased = proposeKanbanWorkspaceEventV1({
      lease: releasedLease,
      head,
      candidate: defaultCandidate(),
      now,
    });
    expect(resReleased.decision).toBe('REJECT');
    if (resReleased.decision === 'REJECT') {
      expect(resReleased.rejectionReason).toBe('LEASE_NOT_ACTIVE');
    }

    // 4c. Stale fence token (zombie agent presenting token 41 when lease is token 42)
    const activeLease = defaultLease({ leaseFenceToken: 42 });
    const staleCandidate = defaultCandidate({ presentedFenceToken: 41 });
    const resStaleFence = proposeKanbanWorkspaceEventV1({
      lease: activeLease,
      head,
      candidate: staleCandidate,
      now,
    });
    expect(resStaleFence.decision).toBe('REJECT');
    if (resStaleFence.decision === 'REJECT') {
      expect(resStaleFence.rejectionReason).toBe('STALE_FENCE_TOKEN');
    }

    // 4d. Ahead fence token (impossible future fence token)
    const aheadCandidate = defaultCandidate({ presentedFenceToken: 43 });
    const resAheadFence = proposeKanbanWorkspaceEventV1({
      lease: activeLease,
      head,
      candidate: aheadCandidate,
      now,
    });
    expect(resAheadFence.decision).toBe('REJECT');
    if (resAheadFence.decision === 'REJECT') {
      expect(resAheadFence.rejectionReason).toBe('FENCE_TOKEN_AHEAD');
    }
  });

  // 5. Concurrent worktrees cannot cross-contaminate each other's stream head
  it("Scenario 5: concurrent worktrees cannot cross-contaminate each other's stream head", () => {
    const headAlpha = defaultHead({ worktreeId: 'wt-feature-alpha' });
    const headBeta = defaultHead({ worktreeId: 'wt-feature-beta' });

    const leaseAlpha = defaultLease({ worktreeId: 'wt-feature-alpha' });
    const candidateAlpha = defaultCandidate({ worktreeId: 'wt-feature-alpha' });

    // 5a. Cross-contamination attempt: candidate for Beta presented against head Alpha
    const candidateBetaCross = defaultCandidate({ worktreeId: 'wt-feature-beta' });
    const resCross = proposeKanbanWorkspaceEventV1({
      lease: leaseAlpha,
      head: headAlpha,
      candidate: candidateBetaCross,
      now,
    });
    expect(resCross.decision).toBe('REJECT');
    if (resCross.decision === 'REJECT') {
      expect(resCross.rejectionReason).toBe('WORKTREE_ISOLATION_VIOLATION');
    }

    // 5b. Advance Alpha stream: Beta stream head remains at sequence 0
    const resAlpha = proposeKanbanWorkspaceEventV1({
      lease: leaseAlpha,
      head: headAlpha,
      candidate: candidateAlpha,
      now,
    });
    expect(resAlpha.decision).toBe('ACCEPT');
    if (resAlpha.decision !== 'ACCEPT') return;

    expect(resAlpha.nextStreamHead.lastStreamSequence).toBe(1);
    expect(headBeta.lastStreamSequence).toBe(0);
    expect(headBeta.seenIdempotencyKeys).toHaveLength(0);
  });

  // 6. Stale baseCommit rejects the proposed event
  it('Scenario 6: stale baseCommit rejects the proposed event', () => {
    const lease = defaultLease();
    const head = defaultHead();

    // 6a. Candidate has stale base commit (e.g. branch advanced on remote)
    const staleCommit = 'sha256:' + 'b'.repeat(64);
    const candidateStaleCommit = defaultCandidate({ presentedBaseCommit: staleCommit });

    const result = proposeKanbanWorkspaceEventV1({
      lease,
      head,
      candidate: candidateStaleCommit,
      now,
    });

    expect(result.decision).toBe('REJECT');
    if (result.decision === 'REJECT') {
      expect(result.rejectionReason).toBe('STALE_BASE_COMMIT');
      expect(result.message).toContain('does not match');
    }

    // 6b. Lease baseCommit diverges from head baseCommit
    const divergentLease = defaultLease({ baseCommit: staleCommit });
    const resultDivergent = proposeKanbanWorkspaceEventV1({
      lease: divergentLease,
      head,
      candidate: defaultCandidate(),
      now,
    });
    expect(resultDivergent.decision).toBe('REJECT');
    if (resultDivergent.decision === 'REJECT') {
      expect(resultDivergent.rejectionReason).toBe('STALE_BASE_COMMIT');
    }
  });
});
