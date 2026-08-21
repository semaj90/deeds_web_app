import type { AtlasStructuralEvidence } from '$lib/server/nlp/miniforge-nlp-sidecar.js';
import { buildStructuralIdentity, type StructuralIdentityV1 } from './structural-identity-v1.js';
import { buildRetrievalFanoutPlan, buildStructuralHyperedge, type RetrievalFanoutPlanV1, type StructuralHyperedgeV1 } from './structural-hypergraph-fanout.js';

type ExtendedChunk = AtlasStructuralEvidence['chunks'][number] & {
  signature?: string | null;
  named?: boolean;
  grammar_revision?: string | null;
  ast_path?: number[];
  named_ast_path?: number[];
  parent_ast_path?: number[] | null;
  parent_named_ast_path?: number[] | null;
  parent_node_type?: string | null;
  child_index?: number | null;
  named_child_index?: number | null;
  depth?: number;
};

export type StructuralPromotionRejection = {
  upstreamChunkId: string | null;
  reason: 'MISSING_GRAMMAR_REVISION' | 'MISSING_AST_PATH' | 'MISSING_NAMED_AST_PATH' | 'MISSING_SIGNATURE' | 'UNNAMED_STRUCTURAL_NODE';
};

export type StructuralRoutingIntegrationResult = {
  identities: StructuralIdentityV1[];
  rejected: StructuralPromotionRejection[];
  hyperedges: StructuralHyperedgeV1[];
  fanoutPlan: RetrievalFanoutPlanV1;
  canonicalWrites: false;
  projectionWrites: false;
};

function normalizeSignature(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Read-only bridge from 8095 evidence into Parent Atlas structural routing.
 * It deliberately refuses canonical-looking IDs when exact parser coordinates
 * are absent. GIS/Postgres remains the acceptance/persistence authority.
 */
export function buildStructuralRoutingIntegration(input: {
  requestId: string;
  workspaceRevision: string;
  graphRevision: string;
  representationRevision: string;
  taskKind: string;
  evidence: AtlasStructuralEvidence;
  producerRevision: string;
  somCell?: { x: number; y: number; revision: string } | null;
  neighboringSomCells?: Array<{ x: number; y: number }>;
  kmeansCentroidIds?: string[];
  kmeansRevision?: string | null;
  qdrantPayloadFilters?: Record<string, unknown>;
}): StructuralRoutingIntegrationResult {
  const identities: StructuralIdentityV1[] = [];
  const rejected: StructuralPromotionRejection[] = [];
  const byName = new Map<string, StructuralIdentityV1[]>();

  for (const raw of input.evidence.chunks as ExtendedChunk[]) {
    const signature = normalizeSignature(raw.signature);
    const grammarRevision = raw.grammar_revision?.trim() || null;
    if (!grammarRevision) {
      rejected.push({ upstreamChunkId: raw.upstream_chunk_id ?? null, reason: 'MISSING_GRAMMAR_REVISION' });
      continue;
    }
    if (!Array.isArray(raw.ast_path) || raw.ast_path.length === 0) {
      rejected.push({ upstreamChunkId: raw.upstream_chunk_id ?? null, reason: 'MISSING_AST_PATH' });
      continue;
    }
    if (!Array.isArray(raw.named_ast_path) || raw.named_ast_path.length === 0) {
      rejected.push({ upstreamChunkId: raw.upstream_chunk_id ?? null, reason: 'MISSING_NAMED_AST_PATH' });
      continue;
    }
    if (!signature) {
      rejected.push({ upstreamChunkId: raw.upstream_chunk_id ?? null, reason: 'MISSING_SIGNATURE' });
      continue;
    }
    if (raw.named === false) {
      rejected.push({ upstreamChunkId: raw.upstream_chunk_id ?? null, reason: 'UNNAMED_STRUCTURAL_NODE' });
      continue;
    }

    const identity = buildStructuralIdentity({
      locator: {
        schema: 'atlas.ast-node-locator.v1',
        workspaceRevision: input.workspaceRevision,
        sourceRevision: input.evidence.source_revision,
        sourceRef: input.evidence.file_path,
        parserName: input.evidence.engine,
        parserVersion: input.evidence.engine_version,
        grammarRevision,
        language: input.evidence.language,
        nodeType: raw.node_type,
        nodeKind: raw.kind,
        named: raw.named !== false,
        rawAstPath: raw.ast_path,
        namedAstPath: raw.named_ast_path,
        parentRawAstPath: raw.parent_ast_path ?? null,
        parentNamedAstPath: raw.parent_named_ast_path ?? null,
        parentNodeType: raw.parent_node_type ?? null,
        childIndex: raw.child_index ?? null,
        namedChildIndex: raw.named_child_index ?? null,
        depth: raw.depth ?? raw.ast_path.length,
        span: {
          startByte: raw.start_byte,
          endByte: raw.end_byte,
          startLine: raw.start_line,
          startColumn: raw.start_column,
          endLine: raw.end_line,
          endColumn: raw.end_column,
        },
        qualifiedSymbol: raw.name?.trim() ?? '',
        normalizedSignature: signature,
      },
      producerRevision: input.producerRevision,
      identityStatus: 'NEW_VERSION',
      evidenceRefs: [input.evidence.file_path, raw.upstream_chunk_id].filter((value): value is string => Boolean(value)),
    });
    identities.push(identity);
    const key = raw.name?.trim() || raw.node_type;
    byName.set(key, [...(byName.get(key) ?? []), identity]);
  }

  const hyperedges: StructuralHyperedgeV1[] = [];
  for (const edge of input.evidence.edges) {
    const sourceMatches = byName.get(edge.from_evidence_key) ?? [];
    const targetMatches = byName.get(edge.to_evidence_key) ?? [];
    if (sourceMatches.length !== 1 || targetMatches.length !== 1) continue;
    const source = sourceMatches[0];
    const target = targetMatches[0];
    if (!source || !target) continue;
    hyperedges.push(buildStructuralHyperedge({
      type: edge.type === 'CALLS' ? 'CALL_BINDING' : 'ONTOLOGY_ASSERTION',
      workspaceRevision: input.workspaceRevision,
      sourceRevision: input.evidence.source_revision,
      graphRevision: input.graphRevision,
      representationRevision: input.representationRevision,
      participants: [
        { entityId: source.astNodeId, entityKind: 'ast_node', role: 'ast_node', ordinal: 0 },
        { entityId: source.symbolVersionId, entityKind: 'symbol_version', role: edge.type === 'CALLS' ? 'caller' : 'symbol_version', ordinal: 1 },
        { entityId: target.symbolVersionId, entityKind: 'symbol_version', role: edge.type === 'CALLS' ? 'callee' : 'symbol_version', ordinal: 2 },
      ],
      evidenceRefs: [input.evidence.file_path],
      confidence: edge.resolved ? 1 : 0.5,
      producerRevision: input.producerRevision,
    }));
  }

  const fanoutPlan = buildRetrievalFanoutPlan({
    requestId: input.requestId,
    workspaceRevision: input.workspaceRevision,
    graphRevision: input.graphRevision,
    representationRevision: input.representationRevision,
    taskKind: input.taskKind,
    somCell: input.somCell,
    neighboringSomCells: input.neighboringSomCells,
    kmeansCentroidIds: input.kmeansCentroidIds,
    kmeansRevision: input.kmeansRevision,
    qdrantPayloadFilters: {
      workspace_revision: input.workspaceRevision,
      source_revision: input.evidence.source_revision,
      representation_revision: input.representationRevision,
      ...(input.qdrantPayloadFilters ?? {}),
    },
    qdrantAvailable: true,
  });

  return { identities, rejected, hyperedges, fanoutPlan, canonicalWrites: false, projectionWrites: false };
}
