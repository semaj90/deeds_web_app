import { createHash } from 'node:crypto';
import type { GraphViewEdgeV1, GraphViewNodeV1, GraphViewPacketV1 } from './graph-runtime-contracts.js';

/**
 * HYPERGRAPH view builder. Inputs are hyperedge rows a caller already read from the Neo4j
 * HyperedgeMirrorV1 / HyperedgeMemberV1 mirror (a derived, rebuildable sample; Postgres stays
 * the source of truth). Nothing here queries a store or mints identity.
 *
 * Each n-ary hyperedge is reified as one node; every participant is an edge carrying its role.
 * Qualification fails closed: mirror rows are canonicalAuthority:false, so every node and edge
 * is PROPOSED, even when the member id encodes a byte span.
 */

export interface HyperedgeMemberRowV1 {
  memberId: string;
  role: string;
  ordinal: number;
}

export interface HyperedgeRowV1 {
  key: string;
  relationKind: string;
  arity: number;
  sourceRef: string | null;
  sourceRevision: string | null;
  members: HyperedgeMemberRowV1[];
}

const edgeId = (...parts: Array<string | number>) =>
  createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 24);

export function buildHypergraphViewV1(input: {
  snapshotId: string;
  queryId: string;
  hyperedges: HyperedgeRowV1[];
  maxNodes?: number;
  workspaceRevision?: string | null;
}): GraphViewPacketV1 {
  const maxNodes = Math.max(1, input.maxNodes ?? 200);
  const nodes = new Map<string, GraphViewNodeV1>();
  const edges: GraphViewEdgeV1[] = [];
  let truncated = false;

  const add = (n: GraphViewNodeV1): boolean => {
    if (nodes.has(n.id)) return true;
    if (nodes.size >= maxNodes) {
      truncated = true;
      return false;
    }
    nodes.set(n.id, n);
    return true;
  };

  for (const h of input.hyperedges) {
    if (h.arity < 3 || h.members.length < 3) continue; // not n-ary: binary edges belong to the structural view
    const hid = `hyperedge:${h.key}`;
    // Admit the hyperedge and all its members together, or none: a partial hyperedge would misstate arity.
    const newIds = [hid, ...h.members.map((m) => `member:${m.memberId}`)].filter((id) => !nodes.has(id));
    if (nodes.size + newIds.length > maxNodes) {
      truncated = true;
      continue;
    }
    add({
      id: hid,
      type: 'Hyperedge',
      label: h.relationKind,
      packetKey: null,
      sourceRef: h.sourceRef,
      hop: 0,
      properties: { relationKind: h.relationKind, arity: h.arity, canonicalAuthority: false },
      sourceRevision: h.sourceRevision,
      qualification: 'PROPOSED',
    });
    for (const m of [...h.members].sort((a, b) => a.ordinal - b.ordinal || a.memberId.localeCompare(b.memberId))) {
      const mid = `member:${m.memberId}`;
      add({
        id: mid,
        type: m.role,
        label: m.memberId.split('/').pop() ?? m.memberId,
        packetKey: null,
        sourceRef: m.role === 'CONTAINER_FILE' ? m.memberId : h.sourceRef,
        hop: 1,
        properties: { role: m.role },
        sourceRevision: h.sourceRevision,
        qualification: 'PROPOSED',
      });
      edges.push({
        id: edgeId(hid, mid, m.role, m.ordinal),
        source: hid,
        target: mid,
        type: 'HAS_PARTICIPANT',
        weight: 1,
        confidence: 1,
        hop: 1,
        qualification: 'PROPOSED',
        sourceRevision: h.sourceRevision,
      });
    }
  }

  return {
    schema: 'atlas.graph-view.v1',
    snapshotId: input.snapshotId,
    queryId: input.queryId,
    executor: 'neo4j',
    nodes: [...nodes.values()],
    edges,
    truncated,
    maxHops: 1,
    maxNodes,
    view: 'HYPERGRAPH',
    nextCursor: null,
    workspaceRevision: input.workspaceRevision ?? null,
  };
}
