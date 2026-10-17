import { z } from 'zod';
import { buildDomainGraphViewV1, type DomainLinkV1, type DomainOntologyGroupV1 } from './domain-graph-view-v1.js';
import { buildHypergraphViewV1, type HyperedgeRowV1 } from './hypergraph-graph-view-v1.js';
import { buildKnowledgeGraphViewV1, type KnowledgeDocumentInputV1 } from './knowledge-graph-view-v1.js';
import { buildTimelineGraphViewV1, type RejectedTimelineEventV1 } from './timeline-graph-view-v1.js';
import type { GraphViewKindV1, GraphViewPacketV1 } from './graph-runtime-contracts.js';
import type { WorkspaceEventV1, WorkspaceHeadV1 } from '../workspace/workspace-event-sourcing-v1.js';

/** Hard bounds: a caller can never request an unbounded graph. */
export const GRAPH_VIEW_MAX_NODES = 200;
export const GRAPH_VIEW_DEFAULT_NODES = 100;

export const GraphViewRequestV1Schema = z
  .object({
    view: z.enum(['STRUCTURAL', 'DOMAIN', 'KNOWLEDGE', 'TIMELINE', 'HYPERGRAPH']),
    limit: z.coerce.number().int().min(1).max(GRAPH_VIEW_MAX_NODES).default(GRAPH_VIEW_DEFAULT_NODES),
    cursor: z.string().max(256).optional(),
    q: z.string().trim().max(200).optional(),
    taskId: z.string().max(200).optional(),
    worktreeId: z.string().max(500).optional(),
  })
  .strict();
export type GraphViewRequestV1 = z.infer<typeof GraphViewRequestV1Schema>;

/** Uniform response: success and degraded paths expose the same top-level keys. */
export interface GraphViewResponseV1 {
  ok: boolean;
  view: GraphViewKindV1 | null;
  packet: GraphViewPacketV1 | null;
  rejected: RejectedTimelineEventV1[];
  degraded: boolean;
  reason: string | null;
}

export interface GraphViewLoadersV1 {
  domain?: (req: GraphViewRequestV1) => Promise<{ taxonomyRevision: string; groups: DomainOntologyGroupV1[]; links: DomainLinkV1[] }>;
  knowledge?: (req: GraphViewRequestV1) => Promise<KnowledgeDocumentInputV1[]>;
  timeline?: (req: GraphViewRequestV1) => Promise<{ head: WorkspaceHeadV1; events: WorkspaceEventV1[] }>;
  hypergraph?: (req: GraphViewRequestV1) => Promise<HyperedgeRowV1[]>;
  /** STRUCTURAL stays with the existing traversal owner; inject it here when wired. */
  structural?: (req: GraphViewRequestV1) => Promise<GraphViewPacketV1>;
}

const empty = (over: Partial<GraphViewResponseV1>): GraphViewResponseV1 => ({
  ok: false, view: null, packet: null, rejected: [], degraded: true, reason: null, ...over,
});

export async function readGraphViewV1(
  rawRequest: unknown,
  loaders: GraphViewLoadersV1,
): Promise<{ status: number; body: GraphViewResponseV1 }> {
  const parsed = GraphViewRequestV1Schema.safeParse(rawRequest);
  if (!parsed.success) {
    return { status: 400, body: empty({ reason: `INVALID_REQUEST:${parsed.error.issues.map((i) => i.path.join('.')).join(',')}` }) };
  }
  const req = parsed.data;
  const snapshotId = `graph-view:${req.view.toLowerCase()}`;
  const queryId = req.q ?? req.view;
  try {
    switch (req.view) {
      case 'DOMAIN': {
        if (!loaders.domain) return { status: 200, body: empty({ view: 'DOMAIN', reason: 'LOADER_NOT_CONFIGURED' }) };
        const d = await loaders.domain(req);
        const packet = buildDomainGraphViewV1({ snapshotId, queryId, maxNodes: req.limit, ...d });
        return { status: 200, body: { ok: true, view: 'DOMAIN', packet, rejected: [], degraded: false, reason: null } };
      }
      case 'KNOWLEDGE': {
        if (!loaders.knowledge) return { status: 200, body: empty({ view: 'KNOWLEDGE', reason: 'LOADER_NOT_CONFIGURED' }) };
        const documents = await loaders.knowledge(req);
        const packet = buildKnowledgeGraphViewV1({ snapshotId, queryId, maxNodes: req.limit, documents });
        return { status: 200, body: { ok: true, view: 'KNOWLEDGE', packet, rejected: [], degraded: false, reason: null } };
      }
      case 'TIMELINE': {
        if (!loaders.timeline) return { status: 200, body: empty({ view: 'TIMELINE', reason: 'LOADER_NOT_CONFIGURED' }) };
        const t = await loaders.timeline(req);
        const { packet, rejected } = buildTimelineGraphViewV1({
          snapshotId, queryId, maxNodes: req.limit, taskId: req.taskId, worktreeId: req.worktreeId, ...t,
        });
        return { status: 200, body: { ok: true, view: 'TIMELINE', packet, rejected, degraded: false, reason: null } };
      }
      case 'HYPERGRAPH': {
        if (!loaders.hypergraph) return { status: 200, body: empty({ view: 'HYPERGRAPH', reason: 'LOADER_NOT_CONFIGURED' }) };
        const hyperedges = await loaders.hypergraph(req);
        const packet = buildHypergraphViewV1({ snapshotId, queryId, maxNodes: req.limit, hyperedges });
        return { status: 200, body: { ok: true, view: 'HYPERGRAPH', packet, rejected: [], degraded: false, reason: null } };
      }
      case 'STRUCTURAL': {
        if (!loaders.structural) return { status: 200, body: empty({ view: 'STRUCTURAL', reason: 'LOADER_NOT_CONFIGURED' }) };
        const packet = await loaders.structural(req);
        const bounded = { ...packet, nodes: packet.nodes.slice(0, req.limit), truncated: packet.truncated || packet.nodes.length > req.limit, view: 'STRUCTURAL' as const };
        return { status: 200, body: { ok: true, view: 'STRUCTURAL', packet: bounded, rejected: [], degraded: false, reason: null } };
      }
    }
  } catch (error) {
    // GET handlers degrade with 200 and the same keys (Degraded Response Contract).
    return { status: 200, body: empty({ view: req.view, reason: error instanceof Error ? error.message : String(error) }) };
  }
}
