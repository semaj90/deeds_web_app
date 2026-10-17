import { describe, expect, it } from 'vitest';
import {
  buildWorkspaceEventProvenanceFromLeaseV1,
  buildWorkspaceEventV1,
  createWorkspaceHeadV1,
  deriveWorkspaceHeadRevisionV1,
  type WorkspaceEventObservationV1,
  type WorkspaceEventProvenanceV1,
  type WorkspaceHeadV1,
} from '../workspace/workspace-event-sourcing-v1.js';
import { buildTimelineGraphViewV1 } from './timeline-graph-view-v1.js';

const base = 'sha256:' + '1'.repeat(64);
const delta = 'sha256:' + '2'.repeat(64);
const after = 'sha256:' + '3'.repeat(64);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const head0 = () => createWorkspaceHeadV1({ workspaceId: 'repo:x', baseSnapshotRevision: base, deltaRootChecksum: delta });

function ev(head: WorkspaceHeadV1, seq: bigint, n: number, extra: { causationId?: string | null; stamp?: { provenance: WorkspaceEventProvenanceV1; observation: WorkspaceEventObservationV1 } } = {}) {
  return buildWorkspaceEventV1({
    eventId: id(n), workspaceId: 'repo:x', sequence: seq, baseSnapshotRevision: base,
    previousHeadRevision: head.workspaceHeadRevision,
    workspaceHeadRevision: deriveWorkspaceHeadRevisionV1(base, seq, delta),
    deltaRootChecksum: delta, eventType: 'SOURCE_UPDATED', occurredAt: '2026-10-17T00:00:00.000Z',
    correlationId: id(900), causationId: extra.causationId ?? null, producerRevision: 'p1',
    beforeStateChecksum: null, afterStateChecksum: after,
    participants: [{ role: 'SOURCE', canonicalId: 'src/a.ts', revision: 'sha256:' + '5'.repeat(64), relation: 'SUBJECT' }],
    ...(extra.stamp ? { provenance: extra.stamp.provenance, observation: extra.stamp.observation } : {}),
  });
}

const prov = (task: string, supersedes: string | null = null) =>
  buildWorkspaceEventProvenanceFromLeaseV1({
    task: { taskId: task, claimToken: 'f', currentRunId: 'r1' },
    presentedFenceToken: 'f',
    presentedFenceEpoch: 1,
    lease: { leaseId: 'l1', taskId: task, runId: 'r1', ownerAgent: 'a', worktreePath: 'wt/a', branchName: 'b', baseCommit: 'c',
      status: 'ACTIVE', expiresAt: null, releasedAt: null, fenceEpoch: 1 },
    idempotencyKey: `k-${task}-${supersedes ?? 'x'}`, now: '2026-10-17T00:00:00.000Z', supersedesEventId: supersedes,
  });

describe('timeline graph view v1', () => {
  it('replays in sequence order and links PRECEDES / TOUCHES / CAUSED_BY', () => {
    const h0 = head0();
    const e1 = ev(h0, 1n, 1);
    const h1 = { ...h0, workspaceHeadRevision: e1.workspaceHeadRevision };
    const e2 = ev(h1, 2n, 2, { causationId: id(1) });
    const { packet, rejected } = buildTimelineGraphViewV1({ snapshotId: 's', queryId: 'q', head: h0, events: [e2, e1] });
    expect(rejected).toEqual([]);
    expect(packet.view).toBe('TIMELINE');
    // no source span here, so nothing may claim STRUCTURAL_PROVEN
    expect([...packet.nodes, ...packet.edges].every((x) => x.qualification === 'EVENT_CHAIN_VERIFIED')).toBe(true);
    expect(packet.edges.map((e) => e.type).sort()).toEqual(['CAUSED_BY', 'PRECEDES', 'TOUCHES', 'TOUCHES']);
  });

  it('rejects duplicate and out-of-order events without drawing them', () => {
    const h0 = head0();
    const e1 = ev(h0, 1n, 1);
    const late = ev(h0, 3n, 3);
    const { packet, rejected } = buildTimelineGraphViewV1({ snapshotId: 's', queryId: 'q', head: h0, events: [e1, e1, late] });
    expect(rejected.map((r) => r.reason)).toEqual(['WORKSPACE_EVENT_SEQUENCE_CONFLICT', 'WORKSPACE_EVENT_SEQUENCE_CONFLICT']);
    expect(packet.nodes.filter((n) => n.type === 'WorkspaceEvent')).toHaveLength(1);
  });

  it('marks a superseded event STALE and filters by task', () => {
    const h0 = head0();
    const e1 = ev(h0, 1n, 1, { stamp: prov('task:A') });
    const h1 = { ...h0, workspaceHeadRevision: e1.workspaceHeadRevision };
    const e2 = ev(h1, 2n, 2, { stamp: prov('task:A', id(1)) });
    const all = buildTimelineGraphViewV1({ snapshotId: 's', queryId: 'q', head: h0, events: [e1, e2] }).packet;
    expect(all.nodes.find((n) => n.id === `event:${id(1)}`)!.qualification).toBe('STALE');
    expect(all.edges.some((e) => e.type === 'SUPERSEDES')).toBe(true);
    const other = buildTimelineGraphViewV1({ snapshotId: 's', queryId: 'q', head: h0, events: [e1, e2], taskId: 'task:B' }).packet;
    expect(other.nodes.filter((n) => n.type === 'WorkspaceEvent')).toHaveLength(0);
  });
});
