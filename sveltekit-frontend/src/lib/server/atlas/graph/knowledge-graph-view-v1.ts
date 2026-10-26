import { createHash } from 'node:crypto';
import {
  clampGraphQualificationV1,
  type GraphViewEdgeV1,
  type GraphViewNodeV1,
  type GraphViewPacketV1,
} from './graph-runtime-contracts.js';

/**
 * KNOWLEDGE view builder: deterministic wikilinks from a markdown / .okf-style
 * document become edges with exact UTF-8 byte spans. Link targets are NOT
 * resolved to canonical identity here; they are emitted as unresolved
 * `wikilink:<target>` nodes. Claim/relationship proposals from an LLM enter only
 * through `proposedClaims` and are clamped to PROPOSED.
 */

export interface KnowledgeDocumentInputV1 {
  /** Canonical source reference supplied by the caller; never minted here. */
  sourceRef: string;
  /** sha256:<hex> of the exact source bytes, supplied by the caller. */
  sourceRevision: string;
  text: string;
  packetKey?: string | null;
}

export interface ProposedKnowledgeClaimV1 {
  fromSourceRef: string;
  toTarget: string;
  relation: string;
  confidence: number;
  evidenceRefs?: string[];
}

export interface WikilinkOccurrenceV1 {
  target: string;
  alias: string | null;
  startByte: number;
  endByte: number;
  line: number;
}

const WIKILINK = /\[\[([^\]\|\n]+?)(?:\|([^\]\n]+?))?\]\]/g;

/** Offsets of fenced code regions (``` or ~~~); wikilinks inside are not links. */
function fencedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const fence = /^(?:```|~~~).*$/gm;
  let open: number | null = null;
  for (const m of text.matchAll(fence)) {
    if (open === null) open = m.index!;
    else {
      ranges.push([open, m.index! + m[0].length]);
      open = null;
    }
  }
  if (open !== null) ranges.push([open, text.length]);
  return ranges;
}

export function extractWikilinkOccurrencesV1(text: string): WikilinkOccurrenceV1[] {
  const fenced = fencedRanges(text);
  const out: WikilinkOccurrenceV1[] = [];
  for (const m of text.matchAll(WIKILINK)) {
    const start = m.index!;
    if (fenced.some(([a, b]) => start >= a && start < b)) continue;
    const target = m[1].trim();
    if (!target) continue;
    const before = text.slice(0, start);
    out.push({
      target,
      alias: m[2]?.trim() || null,
      startByte: Buffer.byteLength(before, 'utf8'),
      endByte: Buffer.byteLength(before + m[0], 'utf8'),
      line: before.split('\n').length,
    });
  }
  return out;
}

function edgeId(from: string, to: string, type: string, startByte: number): string {
  return createHash('sha256').update(`${from}\u0000${to}\u0000${type}\u0000${startByte}`).digest('hex').slice(0, 24);
}

export function buildKnowledgeGraphViewV1(input: {
  snapshotId: string;
  queryId: string;
  documents: KnowledgeDocumentInputV1[];
  proposedClaims?: ProposedKnowledgeClaimV1[];
  maxNodes?: number;
  workspaceRevision?: string | null;
}): GraphViewPacketV1 {
  const maxNodes = Math.max(1, input.maxNodes ?? 200);
  const nodes = new Map<string, GraphViewNodeV1>();
  const edges: GraphViewEdgeV1[] = [];
  let truncated = false;

  const addNode = (node: GraphViewNodeV1) => {
    if (nodes.has(node.id)) return true;
    if (nodes.size >= maxNodes) {
      truncated = true;
      return false;
    }
    nodes.set(node.id, node);
    return true;
  };

  for (const doc of input.documents) {
    const docId = `doc:${doc.sourceRef}`;
    addNode({
      id: docId,
      type: 'KnowledgeDocument',
      label: doc.sourceRef.split('/').pop() ?? doc.sourceRef,
      packetKey: doc.packetKey ?? null,
      sourceRef: doc.sourceRef,
      hop: 0,
      properties: {},
      sourceRevision: doc.sourceRevision,
      qualification: 'STRUCTURAL_PROVEN',
    });
    for (const occ of extractWikilinkOccurrencesV1(doc.text)) {
      const targetId = `wikilink:${occ.target}`;
      if (!addNode({
        id: targetId,
        type: 'UnresolvedWikilinkTarget',
        label: occ.alias ?? occ.target,
        packetKey: null,
        sourceRef: null,
        hop: 1,
        properties: { resolved: false, target: occ.target },
        qualification: 'PROPOSED',
      })) continue;
      edges.push({
        id: edgeId(docId, targetId, 'WIKILINK', occ.startByte),
        source: docId,
        target: targetId,
        type: 'WIKILINK',
        weight: 1,
        confidence: 1,
        hop: 1,
        sourceRevision: doc.sourceRevision,
        span: { startByte: occ.startByte, endByte: occ.endByte, startLine: occ.line, endLine: occ.line },
        qualification: clampGraphQualificationV1('STRUCTURAL_PROVEN', { hasSourceSpan: true, humanReviewed: false }),
      });
    }
  }

  for (const claim of input.proposedClaims ?? []) {
    const from = `doc:${claim.fromSourceRef}`;
    const to = `wikilink:${claim.toTarget}`;
    if (!nodes.has(from)) continue;
    if (!nodes.has(to) && !addNode({
      id: to, type: 'UnresolvedWikilinkTarget', label: claim.toTarget, packetKey: null, sourceRef: null,
      hop: 1, properties: { resolved: false, target: claim.toTarget }, qualification: 'PROPOSED',
    })) continue;
    edges.push({
      id: edgeId(from, to, claim.relation, -1),
      source: from,
      target: to,
      type: claim.relation,
      weight: claim.confidence,
      confidence: claim.confidence,
      hop: 1,
      evidenceRefs: claim.evidenceRefs ?? [],
      // An LLM/classifier proposal has no span: it can never exceed PROPOSED.
      qualification: clampGraphQualificationV1('STRUCTURAL_PROVEN', { hasSourceSpan: false, humanReviewed: false }),
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
    maxHops: 1,
    maxNodes,
    view: 'KNOWLEDGE',
    nextCursor: null,
    workspaceRevision: input.workspaceRevision ?? null,
  };
}
