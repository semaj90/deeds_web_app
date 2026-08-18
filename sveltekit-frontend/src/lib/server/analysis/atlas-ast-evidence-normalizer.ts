import { createHash } from 'node:crypto';

export type AtlasAstEvidenceChunk = {
  upstream_chunk_id?: string;
  node_id?: string | null;
  file_id?: string | null;
  symbol_id?: string | null;
  chunk_id?: string | null;
  parent_route?: string[];
  parent_context?: string | null;
  route?: string[];
  node_type: string;
  kind: string;
  name?: string | null;
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

export type StructuralIdentityStatus =
  | 'native_provenance_complete_pending_canonical_persistence'
  | 'native_provenance_partial_pending_canonical_persistence'
  | 'compatibility_only_blocked_from_promotion';

export type NormalizedAtlasStructuralEvidence = {
  sourceRef: string;
  sourceRevision: string;
  parserName: string;
  parserVersion: string;
  nativeProvenance: {
    complete: boolean;
    chunksWithNativeNodeId: number;
    chunksWithNativeFileId: number;
    chunksWithNativeChunkId: number;
    namedChunks: number;
    namedChunksWithNativeSymbolId: number;
  };
  symbols: Array<{
    upstreamChunkId: string | null;
    nativeNodeId: string | null;
    nativeFileId: string | null;
    nativeSymbolId: string | null;
    nativeChunkId: string | null;
    parentRoute: string[];
    parentContext: string | null;
    route: string[];
    /**
     * Compatibility coordinate only. Never use as canonical structural provenance
     * when native Consiliency node_id is present or when GIS promotion is evaluated.
     */
    compatibilityTreeNodeId: string;
    /** Backward-compatibility alias. See treeNodeIdProvenance. */
    treeNodeId: string;
    treeNodeIdProvenance: 'consiliency_native_node_id' | 'atlas_legacy_compatibility_hash';
    structuralKey: string;
    symbolId: null;
    symbolVersionId: null;
    packetKey: null;
    identityStatus: StructuralIdentityStatus;
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

function compatibilityTreeNodeId(args: {
  repoId: string;
  sourceRef: string;
  language: string;
  nodeKind: string;
  qualifiedSymbol: string;
  parentRoute: string[];
}): string {
  return sha256([
    args.repoId,
    args.sourceRef,
    args.language,
    args.nodeKind,
    args.qualifiedSymbol,
    args.parentRoute.join('/'),
    '',
  ].join('\0'));
}

/**
 * Normalize sidecar evidence without inventing canonical identity.
 *
 * Native Consiliency identifiers/hierarchy are first-class provenance. The old
 * Atlas structural hash remains only as a compatibility coordinate for callers
 * that have not migrated yet. GIS promotion must use `nativeProvenance.complete`
 * and native IDs, never the compatibility hash.
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
    const route = Array.isArray(chunk.route) ? chunk.route.map(String) : [];
    const legacyHash = compatibilityTreeNodeId({ repoId, sourceRef, language: input.language, nodeKind, qualifiedSymbol, parentRoute });
    const nativeNodeId = chunk.node_id?.trim() || null;
    const nativeFileId = chunk.file_id?.trim() || null;
    const nativeSymbolId = chunk.symbol_id?.trim() || null;
    const nativeChunkId = chunk.chunk_id?.trim() || chunk.upstream_chunk_id?.trim() || null;
    const named = qualifiedSymbol.length > 0;
    const nativeCoreComplete = Boolean(nativeNodeId && nativeFileId && nativeChunkId);
    const identityStatus: StructuralIdentityStatus = nativeCoreComplete
      ? named && !nativeSymbolId
        ? 'native_provenance_partial_pending_canonical_persistence'
        : 'native_provenance_complete_pending_canonical_persistence'
      : 'compatibility_only_blocked_from_promotion';
    const structuralKey = `${repoId}/${sourceRef}#${nodeKind}:${qualifiedSymbol}`;

    return {
      upstreamChunkId: chunk.upstream_chunk_id ?? null,
      nativeNodeId,
      nativeFileId,
      nativeSymbolId,
      nativeChunkId,
      parentRoute,
      parentContext: chunk.parent_context?.trim() || null,
      route,
      compatibilityTreeNodeId: legacyHash,
      treeNodeId: nativeNodeId ?? legacyHash,
      treeNodeIdProvenance: nativeNodeId ? 'consiliency_native_node_id' as const : 'atlas_legacy_compatibility_hash' as const,
      structuralKey,
      symbolId: null,
      symbolVersionId: null,
      packetKey: null,
      identityStatus,
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

  const named = symbols.filter((symbol) => symbol.qualifiedSymbol.length > 0);
  const nativeProvenance = {
    complete: symbols.length > 0 && symbols.every((symbol) =>
      Boolean(symbol.nativeNodeId && symbol.nativeFileId && symbol.nativeChunkId) &&
      (symbol.qualifiedSymbol.length === 0 || Boolean(symbol.nativeSymbolId))),
    chunksWithNativeNodeId: symbols.filter((symbol) => Boolean(symbol.nativeNodeId)).length,
    chunksWithNativeFileId: symbols.filter((symbol) => Boolean(symbol.nativeFileId)).length,
    chunksWithNativeChunkId: symbols.filter((symbol) => Boolean(symbol.nativeChunkId)).length,
    namedChunks: named.length,
    namedChunksWithNativeSymbolId: named.filter((symbol) => Boolean(symbol.nativeSymbolId)).length,
  };

  return {
    sourceRef,
    sourceRevision: input.source_revision,
    parserName: input.engine,
    parserVersion: input.engine_version,
    nativeProvenance,
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
    diagnostics: [...input.diagnostics],
  };
}

/** Fail closed if legacy compatibility hashes are about to be promoted as canonical evidence. */
export function assertNativeStructuralProvenanceForPromotion(
  evidence: NormalizedAtlasStructuralEvidence,
): void {
  if (!evidence.nativeProvenance.complete) {
    throw new Error('AST_NATIVE_PROVENANCE_INCOMPLETE: GIS promotion blocked; compatibility structural hashes are non-canonical');
  }
  if (evidence.symbols.some((symbol) => symbol.treeNodeIdProvenance !== 'consiliency_native_node_id')) {
    throw new Error('AST_COMPATIBILITY_HASH_PROMOTION_FORBIDDEN');
  }
}
