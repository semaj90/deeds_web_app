import { createHash } from 'node:crypto';

export type AtlasAstEvidenceChunk = {
  upstream_chunk_id?: string;
  upstream_node_id?: string;
  upstream_file_id?: string;
  upstream_symbol_id?: string;
  node_type: string;
  kind: string;
  name?: string | null;
  signature?: string | null;
  named?: boolean;
  ast_path?: number[];
  named_ast_path?: number[];
  parent_ast_path?: number[] | null;
  parent_named_ast_path?: number[] | null;
  parent_node_type?: string | null;
  child_index?: number | null;
  named_child_index?: number | null;
  depth?: number;
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
  grammar_revision?: string | null;
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
  grammarRevision: string | null;
  symbols: Array<{
    upstreamChunkId: string | null;
    upstreamNodeId: string | null;
    upstreamFileId: string | null;
    upstreamSymbolId: string | null;
    treeNodeId: string;
    structuralKey: string;
    symbolId: null;
    symbolVersionId: null;
    packetKey: null;
    identityStatus: 'structural_pending_canonical_persistence';
    language: string;
    nodeType: string;
    nodeKind: string;
    named: boolean | null;
    qualifiedSymbol: string;
    normalizedSignature: string;
    rawAstPath: number[] | null;
    namedAstPath: number[] | null;
    parentRawAstPath: number[] | null;
    parentNamedAstPath: number[] | null;
    parentNodeType: string | null;
    childIndex: number | null;
    namedChildIndex: number | null;
    depth: number | null;
    parentRoute: string[];
    parentContext: string | null;
    structuralCoordinateStatus: 'EXACT_PATH' | 'UPSTREAM_NATIVE' | 'SPAN_FALLBACK';
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

function normalizePath(value: string): string { return value.replaceAll('\\', '/').replace(/^\/+/, '').toLowerCase(); }
function sha256(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function mapNodeKind(kind: string): string { const value = kind.toLowerCase(); if (value.includes('function')) return 'function'; if (value.includes('method')) return 'method'; if (value.includes('class')) return 'class'; if (value.includes('interface')) return 'interface'; if (value.includes('import')) return 'import'; if (value.includes('export')) return 'export'; if (value.includes('type')) return 'type'; return 'file'; }
function normalizedSignature(value: string | null | undefined): string { return String(value ?? '').replace(/\s+/g, ' ').trim(); }

/**
 * Converts 8095 evidence into revision-qualified structural evidence. Native
 * chunk/node/symbol IDs remain provenance only; canonical Atlas symbol/version/
 * packet identity remains null until the downstream persistence authority
 * accepts it. Exact Tree-sitter paths are preferred; missing path evidence is
 * explicitly degraded rather than fabricated.
 */
export function normalizeAtlasAstEvidence(input: AtlasAstEvidenceInput, options: { repoId?: string } = {}): NormalizedAtlasStructuralEvidence {
  if (input.schema !== 'atlas.ast.evidence.v1') throw new Error(`AST_EVIDENCE_SCHEMA_INVALID: ${input.schema}`);
  const repoId = options.repoId?.trim() || 'deeds-web-app';
  const sourceRef = normalizePath(input.file_path);
  const grammarRevision = input.grammar_revision?.trim() || null;

  const symbols = input.chunks.map((chunk) => {
    const nodeKind = mapNodeKind(chunk.kind || chunk.node_type);
    const qualifiedSymbol = chunk.name?.trim() || '';
    const signature = normalizedSignature(chunk.signature);
    const parentRoute = Array.isArray(chunk.parent_route) ? chunk.parent_route.map(String) : [];
    const rawAstPath = Array.isArray(chunk.ast_path) ? chunk.ast_path.map(Number) : null;
    const namedAstPath = Array.isArray(chunk.named_ast_path) ? chunk.named_ast_path.map(Number) : null;
    const parentRawAstPath = chunk.parent_ast_path === null ? null : Array.isArray(chunk.parent_ast_path) ? chunk.parent_ast_path.map(Number) : null;
    const parentNamedAstPath = chunk.parent_named_ast_path === null ? null : Array.isArray(chunk.parent_named_ast_path) ? chunk.parent_named_ast_path.map(Number) : null;
    const structuralCoordinateStatus = rawAstPath && grammarRevision
      ? 'EXACT_PATH' as const
      : chunk.upstream_node_id
        ? 'UPSTREAM_NATIVE' as const
        : 'SPAN_FALLBACK' as const;

    const treeNodeId = structuralCoordinateStatus === 'EXACT_PATH'
      ? sha256([repoId, sourceRef, input.source_revision, input.engine, input.engine_version, grammarRevision, chunk.node_type, rawAstPath!.join('.')].join('\0'))
      : structuralCoordinateStatus === 'UPSTREAM_NATIVE'
        ? sha256([repoId, sourceRef, input.source_revision, 'upstream', chunk.upstream_node_id].join('\0'))
        : sha256([repoId, sourceRef, input.source_revision, chunk.node_type, chunk.start_byte, chunk.end_byte].join('\0'));

    const parentKey = parentNamedAstPath?.join('.') || parentRoute.join('/') || 'ROOT';
    const structuralKey = `${repoId}/${sourceRef}#${nodeKind}:${qualifiedSymbol}:${parentKey}:${signature}`;

    return {
      upstreamChunkId: chunk.upstream_chunk_id ?? null,
      upstreamNodeId: chunk.upstream_node_id ?? null,
      upstreamFileId: chunk.upstream_file_id ?? null,
      upstreamSymbolId: chunk.upstream_symbol_id ?? null,
      treeNodeId,
      structuralKey,
      symbolId: null,
      symbolVersionId: null,
      packetKey: null,
      identityStatus: 'structural_pending_canonical_persistence' as const,
      language: input.language,
      nodeType: chunk.node_type,
      nodeKind,
      named: chunk.named === undefined ? null : Boolean(chunk.named),
      qualifiedSymbol,
      normalizedSignature: signature,
      rawAstPath,
      namedAstPath,
      parentRawAstPath,
      parentNamedAstPath,
      parentNodeType: chunk.parent_node_type ?? null,
      childIndex: chunk.child_index ?? null,
      namedChildIndex: chunk.named_child_index ?? null,
      depth: chunk.depth ?? null,
      parentRoute,
      parentContext: chunk.parent_context ?? null,
      structuralCoordinateStatus,
      span: { filePath: sourceRef, startByte: chunk.start_byte, endByte: chunk.end_byte, startLine: chunk.start_line, startColumn: chunk.start_column, endLine: chunk.end_line, endColumn: chunk.end_column },
    };
  });

  const diagnostics = [...input.diagnostics];
  if (!grammarRevision) diagnostics.push('AST_GRAMMAR_REVISION_MISSING: exact parser-coordinate promotion is disabled');
  if (symbols.some((symbol) => symbol.structuralCoordinateStatus !== 'EXACT_PATH')) diagnostics.push('AST_PATH_INCOMPLETE: one or more nodes use native-ID/span fallback and are not exact path proof');

  return {
    sourceRef,
    sourceRevision: input.source_revision,
    parserName: input.engine,
    parserVersion: input.engine_version,
    grammarRevision,
    symbols,
    edges: (input.edges ?? []).map((edge) => ({ fromEvidenceKey: edge.from_evidence_key, toEvidenceKey: edge.to_evidence_key, type: edge.type, resolved: edge.resolved, resolution: edge.resolution ?? null, evidence: { filePath: sourceRef, startLine: edge.evidence_start_line, startColumn: edge.evidence_start_column, endLine: edge.evidence_end_line, endColumn: edge.evidence_end_column } })),
    diagnostics,
  };
}
