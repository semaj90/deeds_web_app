import { createHash } from 'node:crypto';
import {
  appendWorkspaceEventV1,
  type WorkspaceEventV1,
  type WorkspaceHeadV1,
} from '../workspace/workspace-event-sourcing-v1.js';
import type { GraphViewEdgeV1, GraphViewNodeV1, GraphViewPacketV1 } from './graph-runtime-contracts.js';

/**
 * TIMELINE view builder. Events are replayed through appendWorkspaceEventV1
 * (checksum, sequence, base-snapshot and head-conflict checks); an event that
 * fails replay is returned in `rejected` and never drawn. Ordering comes from
 * the event sequence, never from filesystem timestamps or recordedAt.
 * Edges here come from a checksum-verified event chain, NOT from a source span, so they carry
 * EVENT_CHAIN_VERIFIED and never STRUCTURAL_PROVEN (reserved for edges with a source span plus
 * sourceRevision). An event whose observation approval is REJECTED is shown as REJECTED.
 */

export interface RejectedTimelineEventV1 {
  eventId: string;
  sequence: string;
  reason: string;
}

const edgeId = (...parts: string[]) => createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 24);

export function buildTimelineGraphViewV1(input: {
  snapshotId: string;
  queryId: string;
  head: WorkspaceHeadV1;
  events: readonly WorkspaceEventV1[];
  /** Restrict to one task and/or worktree (by provenance). */
  taskId?: string;
  worktreeId?: string;
  maxNodes?: number;
}): { packet: GraphViewPacketV1; rejected: RejectedTimelineEventV1[]; finalHead: WorkspaceHeadV1 } {
  const maxNodes = Math.max(1, input.maxNodes ?? 200);
  const nodes = new Map<string, GraphViewNodeV1>();
  const edges: GraphViewEdgeV1[] = [];
  const rejected: RejectedTimelineEventV1[] = [];
  const accepted = new Map<string, WorkspaceEventV1>();
  let truncated = false;
  let head = input.head;
  let previousEventNode: string | null = null;

  const ordered = [...input.events].sort((a, b) => (a.sequence < b.sequence ? -1 : a.sequence > b.sequence ? 1 : 0));

  for (const event of ordered) {
    try {
      head = appendWorkspaceEventV1(head, event);
    } catch (error) {
      rejected.push({
        eventId: event.eventId,
        sequence: event.sequence.toString(),
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    accepted.set(event.eventId, event);

    const prov = event.provenance;
    if (input.taskId && prov?.taskId !== input.taskId) continue;
    if (input.worktreeId && prov?.worktreeId !== input.worktreeId) continue;

    const eventNode = `event:${event.eventId}`;
    if (nodes.size >= maxNodes) {
      truncated = true;
      break;
    }
    nodes.set(eventNode, {
      id: eventNode,
      type: 'WorkspaceEvent',
      label: `${event.eventType} #${event.sequence}`,
      packetKey: null,
      sourceRef: null,
      hop: Number(event.sequence),
      properties: { eventType: event.eventType, occurredAt: event.occurredAt, workspaceHeadRevision: event.workspaceHeadRevision },
      qualification: event.observation?.approval === 'REJECTED' ? 'REJECTED' : 'EVENT_CHAIN_VERIFIED',
      evidenceRefs: [event.eventChecksum],
      temporal: {
        workspaceEventId: event.eventId,
        taskId: prov?.taskId ?? null,
        worktreeId: prov?.worktreeId ?? null,
        recordedAt: event.observation?.recordedAt ?? null,
      },
    });

    if (previousEventNode) {
      edges.push({
        id: edgeId(previousEventNode, eventNode, 'PRECEDES'),
        source: previousEventNode, target: eventNode, type: 'PRECEDES', weight: 1, confidence: 1,
        hop: Number(event.sequence), qualification: 'EVENT_CHAIN_VERIFIED', evidenceRefs: [event.eventChecksum],
      });
    }
    previousEventNode = eventNode;

    for (const p of event.participants) {
      if (p.role !== 'SOURCE' || p.relation !== 'SUBJECT') continue;
      const sourceNode = `source:${p.canonicalId}`;
      if (!nodes.has(sourceNode)) {
        if (nodes.size >= maxNodes) { truncated = true; continue; }
        nodes.set(sourceNode, {
          id: sourceNode, type: 'Source', label: p.canonicalId.split('/').pop() ?? p.canonicalId,
          packetKey: null, sourceRef: p.canonicalId, hop: 0, properties: {},
          sourceRevision: p.revision, qualification: 'EVENT_CHAIN_VERIFIED',
        });
      }
      edges.push({
        id: edgeId(eventNode, sourceNode, 'TOUCHES'),
        source: eventNode, target: sourceNode, type: 'TOUCHES', weight: 1, confidence: 1,
        hop: Number(event.sequence), qualification: 'EVENT_CHAIN_VERIFIED', sourceRevision: p.revision,
        evidenceRefs: [event.eventChecksum],
      });
    }

    if (event.causationId && accepted.has(event.causationId) && nodes.has(`event:${event.causationId}`)) {
      edges.push({
        id: edgeId(eventNode, event.causationId, 'CAUSED_BY'),
        source: eventNode, target: `event:${event.causationId}`, type: 'CAUSED_BY', weight: 1, confidence: 1,
        hop: Number(event.sequence), qualification: 'EVENT_CHAIN_VERIFIED', evidenceRefs: [event.eventChecksum],
      });
    }
    const superseded = prov?.supersedesEventId;
    if (superseded && nodes.has(`event:${superseded}`)) {
      edges.push({
        id: edgeId(eventNode, superseded, 'SUPERSEDES'),
        source: eventNode, target: `event:${superseded}`, type: 'SUPERSEDES', weight: 1, confidence: 1,
        hop: Number(event.sequence), qualification: 'EVENT_CHAIN_VERIFIED', evidenceRefs: [event.eventChecksum],
      });
      const old = nodes.get(`event:${superseded}`)!;
      nodes.set(old.id, { ...old, qualification: 'STALE' });
    }
  }

  return {
    packet: {
      schema: 'atlas.graph-view.v1',
      snapshotId: input.snapshotId,
      queryId: input.queryId,
      executor: 'postgres',
      nodes: [...nodes.values()],
      edges,
      truncated,
      maxHops: 1,
      maxNodes,
      view: 'TIMELINE',
      nextCursor: null,
      workspaceRevision: head.workspaceHeadRevision,
    },
    rejected,
    finalHead: head,
  };
}
