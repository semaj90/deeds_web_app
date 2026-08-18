import { createHash } from 'node:crypto';

export type AtlasAstEvidenceChunk = {
  upstream_chunk_id?: string;
  upstream_node_id?: string;
  upstream_file_id?: string;
  upstream_symbol_id?: string;
  node_type: string;
  kind: string;
  name?: string | null;
  parent_route?: string[];
  parent_context?: string | null;
  start_byte: number;
  end_byte: number;
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
  calls?: string[];
  imports?: string[];
  exports?: string[];
};

export type AtlasAstEvidenceInput = {
  schema: 'atlas.ast.evidence.v1';
  engine: string;
  engine_version: string;
  language: string;
  file_path: string;
  source_revision: string;
  chunks: AtlasAstEvidenceChunk[];
  edges?: AtlasAstEvidenceEdge[];
  diagnostics: string[];
};

export type AtlasAstEvidenceEdge = {
  from_evidence_key: string;
  to_evidence_key: string;
  type: 'DEFINES' | 'IMPORTS' | 'EXPORTS' | 'CALLS' | 'REFERENCES';
  evidence_start_line: number;
  evidence_start_column: number;
  evidence_end_line: number;
  evidence_end_column: number;
  resolved: boolean;
  resolution?: string | null;
};

export type NormalizedAtlasStructuralEvidence = {
  sourceRef: string;
  sourceRevision: string;
  parserName: string;
  parserVersion: string;
  symbols: Array<{
    upstreamChunkId: string | null;
    upstreamNodeId: string | null;
    upstreamFileId: string | null;
    upstreamSymbolId: string | null;
    parentRoute: string[];
    parentContext: string | null;
    /**
     * Legacy Atlas compatibility coordinate. This remains useful for older
     * consumers, but it is not the native Consiliency node ID and is not a
     * canonical symbol identity.
     */
    treeNodeId: string;
    treeNodeIdSource: 'atlas_compatibility_hash';
    structuralKey: string;
    symbolId: null;
    symbolVersionId: null;
    packetKey: null;
    identityStatus: 'structural_pending_canonical_persistence';
    language: string;
    nodeKind: string;
    qualifiedSymbol: string;
    span: {
      filePath: string;
      startByte: number;
      endByte: number;
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
    };
  }>;
  edges: Array<{
    fromEvidenceKey: string;
    toEvidenceKey: string;
    type: AtlasAstEvidenceEdge['type'];
    resolved: boolean;
    resolution: string | null;
    evidence: {
      filePath: string;
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
    };
  }>;
  provenance: {
    nativeNodeIdCount: number;
    nativeFileIdCount: number;
    nativeSymbolIdCount: number;
    upstreamChunkIdCount: number;
    compatibilityTreeNodeIdCount: number;
  };
  diagnostics: string[];
};

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\/+/, '').toLowerCase();
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function mapNodeKind(kind: string): string {
  const value = kind.toLowerCase();
  if (value.includes('function')) return 'function';
  if (value.includes('method')) return 'method';
  if (value.includes('class')) return 'class';
  if (value.includes('interface')) return 'interface';
  if (value.includes('import')) return 'import';
  if (value.includes('export')) return 'export';
  if (value.includes('type')) return 'type';
  return 'file';
}

/**
 * Converts sidecar evidence into the existing Atlas structural shape while
 * preserving all upstream Consiliency provenance when it is available.
 *
 * `treeNodeId` remains a legacy Atlas compatibility hash for existing callers.
 * New canonicalization code must prefer upstreamNodeId/upstreamSymbolId as
 * provenance and GIS registry resolution for stable_symbol_id.
 */
export function normalizeAtlasAstEvidence(
  input: AtlasAstEvidenceInput,
  options: { repoId?: string } = {},
): NormalizedAtlasStructuralEvidence {
  if (input.schema !== 'atlas.ast.evidence.v1') {
    throw new Error(`AST_EVIDENCE_SCHEMA_INVALID: ${input.schema}`);
  }

  const repoId = options.repoId?.trim() || 'deeds-web-app';
  const sourceRef = normalizePath(input.file_path);
  const symbols = input.chunks.map((chunk) => {
    const nodeKind = mapNodeKind(chunk.kind || chunk.node_type);
    const qualifiedSymbol = chunk.name?.trim() || '';
    const parentRoute = Array.isArray(chunk.parent_route) ? chunk.parent_route.map(String) : [];
    const parentContext = chunk.parent_context?.trim() || null;
    const parentKey = parentRoute.length > 0 ? parentRoute.join('/') : parentContext ?? 'ROOT';
    const normalizedSignature = '';
    const treeNodeId = sha256([
      repoId,
      sourceRef,
      input.language,
      nodeKind,
      qualifiedSymbol,
      parentKey,
      normalizedSignature,
    ].join('\0'));
    const structuralKey = `${repoId}/${sourceRef}#${nodeKind}:${qualifiedSymbol}`;

    return {
      upstreamChunkId: chunk.upstream_chunk_id ?? null,
      upstreamNodeId: chunk.upstream_node_id ?? null,
      upstreamFileId: chunk.upstream_file_id ?? null,
      upstreamSymbolId: chunk.upstream_symbol_id ?? null,
      parentRoute,
      parentContext,
      treeNodeId,
      treeNodeIdSource: 'atlas_compatibility_hash' as const,
      structuralKey,
      symbolId: null,
      symbolVersionId: null,
      packetKey: null,
      identityStatus: 'structural_pending_canonical_persistence' as const,
      language: input.language,
      nodeKind,
      qualifiedSymbol,
      span: {
        filePath: sourceRef,
        startByte: chunk.start_byte,
        endByte: chunk.end_byte,
        startLine: chunk.start_line,
        startColumn: chunk.start_column,
        endLine: chunk.end_line,
        endColumn: chunk.end_column,
      },
    };
  });

  return {
    sourceRef,
    sourceRevision: input.source_revision,
    parserName: input.engine,
    parserVersion: input.engine_version,
    symbols,
    edges: (input.edges ?? []).map((edge) => ({
      fromEvidenceKey: edge.from_evidence_key,
      toEvidenceKey: edge.to_evidence_key,
      type: edge.type,
      resolved: edge.resolved,
      resolution: edge.resolution ?? null,
      evidence: {
        filePath: sourceRef,
        startLine: edge.evidence_start_line,
        startColumn: edge.evidence_start_column,
        endLine: edge.evidence_end_line,
        endColumn: edge.evidence_end_column,
      },
    })),
    provenance: {
      nativeNodeIdCount: symbols.filter((item) => item.upstreamNodeId !== null).length,
      nativeFileIdCount: symbols.filter((item) => item.upstreamFileId !== null).length,
      nativeSymbolIdCount: symbols.filter((item) => item.upstreamSymbolId !== null).length,
      upstreamChunkIdCount: symbols.filter((item) => item.upstreamChunkId !== null).length,
      compatibilityTreeNodeIdCount: symbols.length,
    },
    diagnostics: [...input.diagnostics],
  };
}
