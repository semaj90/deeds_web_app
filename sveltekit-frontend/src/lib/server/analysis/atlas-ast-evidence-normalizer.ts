import { createHash } from 'node:crypto';

export type AtlasAstEvidenceChunk = {
  upstream_chunk_id?: string;
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

export type NormalizedAtlasStructuralEvidence = {
  sourceRef: string;
  sourceRevision: string;
  parserName: string;
  parserVersion: string;
  symbols: Array<{
    upstreamChunkId: string | null;
    treeNodeId: string;
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
 * Converts sidecar evidence into the existing Atlas structural identity shape.
 * The sidecar upstream chunk ID is retained as provenance only. Canonical
 * symbol/version/packet identities remain null until canonical persistence.
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
    const parentKey = 'ROOT';
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
      treeNodeId,
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
    diagnostics: [...input.diagnostics],
  };
}
