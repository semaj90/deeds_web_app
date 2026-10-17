import { createHash } from 'node:crypto';
import {
  clampGraphQualificationV1,
  type GraphQualificationV1,
  type GraphSourceSpanV1,
  type GraphViewEdgeV1,
  type GraphViewNodeV1,
  type GraphViewPacketV1,
} from './graph-runtime-contracts.js';

/**
 * DOMAIN view builder. Inputs are rows the caller already read from
 * atlas_domain_ontology / atlas_document_classification (or a reviewed source);
 * nothing here queries a store or mints identity.
 *
 * Qualification rules (fail closed):
 *  - CLASSIFIER links are always PROPOSED regardless of confidence.
 *  - IMPLEMENTS links reach STRUCTURAL_PROVEN only with a source span + sourceRevision.
 *  - HUMAN_REVIEWED requires a named reviewer.
 *  - Taxonomy PARENT_OF edges are PROPOSED unless the caller states the taxonomy was reviewed.
 */

export interface DomainOntologyGroupV1 {
  groupId: string;
  groupLabel: string;
  parentGroupId: string | null;
  taxonomyLevel?: number | null;
}

export type DomainLinkOriginV1 = 'CLASSIFIER' | 'IMPLEMENTS' | 'HUMAN_REVIEW';

export interface DomainLinkV1 {
  sourceRef: string;
  packetKey: string | null;
  groupId: string;
  origin: DomainLinkOriginV1;
  confidence: number;
  sourceRevision?: string | null;
  span?: GraphSourceSpanV1 | null;
  reviewedBy?: string | null;
  evidenceRefs?: string[];
}

function qualificationFor(link: DomainLinkV1): GraphQualificationV1 {
  const hasSourceSpan = !!link.span && !!link.sourceRevision;
  const humanReviewed = link.origin === 'HUMAN_REVIEW' && !!link.reviewedBy;
  if (link.origin === 'HUMAN_REVIEW') {
    return clampGraphQualificationV1('HUMAN_REVIEWED', { hasSourceSpan, humanReviewed });
  }
  if (link.origin === 'IMPLEMENTS') {
    return clampGraphQualificationV1('STRUCTURAL_PROVEN', { hasSourceSpan, humanReviewed: false });
  }
  return 'PROPOSED';
}

const edgeId = (...parts: Array<string | number>) =>
  createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 24);

export function buildDomainGraphViewV1(input: {
  snapshotId: string;
  queryId: string;
  taxonomyRevision: string;
  taxonomyReviewed?: boolean;
  groups: DomainOntologyGroupV1[];
  links: DomainLinkV1[];
  maxNodes?: number;
  workspaceRevision?: string | null;
}): GraphViewPacketV1 {
  const maxNodes = Math.max(1, input.maxNodes ?? 200);
  const nodes = new Map<string, GraphViewNodeV1>();
  const edges: GraphViewEdgeV1[] = [];
  let truncated = false;
  const taxonomyQual = clampGraphQualificationV1('HUMAN_REVIEWED', {
    hasSourceSpan: false,
    humanReviewed: input.taxonomyReviewed === true,
  });

  const add = (n: GraphViewNodeV1): boolean => {
    if (nodes.has(n.id)) return true;
    if (nodes.size >= maxNodes) {
      truncated = true;
      return false;
    }
    nodes.set(n.id, n);
    return true;
  };

  for (const g of input.groups) {
    add({
      id: `domain:${g.groupId}`,
      type: 'DomainGroup',
      label: g.groupLabel,
      packetKey: null,
      sourceRef: null,
      hop: g.taxonomyLevel ?? 0,
      properties: { taxonomyRevision: input.taxonomyRevision, groupId: g.groupId },
      qualification: taxonomyQual,
    });
  }
  for (const g of input.groups) {
    if (!g.parentGroupId) continue;
    const from = `domain:${g.parentGroupId}`;
    const to = `domain:${g.groupId}`;
    if (!nodes.has(from) || !nodes.has(to)) continue;
    edges.push({
      id: edgeId(from, to, 'PARENT_OF'),
      source: from,
      target: to,
      type: 'PARENT_OF',
      weight: 1,
      confidence: 1,
      hop: 1,
      qualification: taxonomyQual,
    });
  }

  for (const link of input.links) {
    const group = `domain:${link.groupId}`;
    if (!nodes.has(group)) continue; // unknown group: drop, never invent taxonomy
    const impl = `impl:${link.sourceRef}`;
    if (!add({
      id: impl,
      type: 'ImplementingSource',
      label: link.sourceRef.split('/').pop() ?? link.sourceRef,
      packetKey: link.packetKey,
      sourceRef: link.sourceRef,
      hop: 2,
      properties: {},
      sourceRevision: link.sourceRevision ?? null,
    })) continue;
    const type = link.origin === 'CLASSIFIER' ? 'CLASSIFIED_AS' : 'IMPLEMENTS';
    edges.push({
      id: edgeId(impl, group, type, link.origin),
      source: impl,
      target: group,
      type,
      weight: link.confidence,
      confidence: link.confidence,
      hop: 2,
      qualification: qualificationFor(link),
      evidenceRefs: link.evidenceRefs ?? [],
      sourceRevision: link.sourceRevision ?? null,
      span: link.span ?? null,
    });
  }

  return {
    schema: 'atlas.graph-view.v1',
    snapshotId: input.snapshotId,
    queryId: input.queryId,
    executor: 'postgres',
    nodes: [...nodes.values()],
    edges,
    truncated,
    maxHops: 2,
    maxNodes,
    view: 'DOMAIN',
    nextCursor: null,
    workspaceRevision: input.workspaceRevision ?? null,
  };
}
