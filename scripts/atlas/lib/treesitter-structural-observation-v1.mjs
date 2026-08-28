import crypto from 'node:crypto';

export const STRUCTURAL_OBSERVATION_SCHEMA = 'atlas.structural-observation.v1';

const text = (value) => {
  const result = String(value ?? '').trim();
  return result || null;
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function requireShaRevision(value, field) {
  const revision = text(value);
  if (!revision || !/^sha256:[0-9a-f]{64}$/i.test(revision)) throw new Error(`${field}:SHA256_REQUIRED`);
  return revision;
}

function evidenceKey(sourceRef, startByte, endByte, kind, name) {
  return `ast:${sha256(JSON.stringify({ sourceRef, startByte, endByte, kind, name: name ?? null })).slice(0, 32)}`;
}

export function adaptTreeSitterEvidence({ sourceRef, sourceRevision, response }) {
  const ref = text(sourceRef) || text(response?.file_path);
  if (!ref) throw new Error('STRUCTURAL_SOURCE_REF_REQUIRED');
  const revision = requireShaRevision(sourceRevision || response?.source_revision, 'sourceRevision');
  if (response?.schema !== 'atlas.ast.evidence.v1') throw new Error('STRUCTURAL_SIDEcar_SCHEMA_REQUIRED');

  const chunks = (response.chunks ?? []).map((chunk) => {
    const startByte = Number(chunk.start_byte);
    const endByte = Number(chunk.end_byte);
    if (!Number.isInteger(startByte) || !Number.isInteger(endByte) || endByte < startByte) throw new Error('STRUCTURAL_CHUNK_RANGE_INVALID');
    const kind = text(chunk.kind || chunk.node_type) || 'unknown';
    return {
      schema: STRUCTURAL_OBSERVATION_SCHEMA,
      sourceRef: ref,
      sourceRevision: revision,
      evidenceKey: evidenceKey(ref, startByte, endByte, kind, chunk.name),
      upstreamChunkId: text(chunk.upstream_chunk_id),
      upstreamNodeId: text(chunk.upstream_node_id),
      upstreamFileId: text(chunk.upstream_file_id),
      upstreamSymbolId: text(chunk.upstream_symbol_id),
      nodeType: text(chunk.node_type) || kind,
      kind,
      name: text(chunk.name),
      parentRoute: Array.isArray(chunk.parent_route) ? chunk.parent_route.map(text).filter(Boolean) : [],
      startByte,
      endByte,
      startLine: Number(chunk.start_line),
      endLine: Number(chunk.end_line),
      calls: Array.isArray(chunk.calls) ? chunk.calls.map(text).filter(Boolean).sort() : [],
      imports: Array.isArray(chunk.imports) ? chunk.imports.map(text).filter(Boolean).sort() : [],
      exports: Array.isArray(chunk.exports) ? chunk.exports.map(text).filter(Boolean).sort() : [],
      extractor: `${text(response.engine) || 'treesitter-chunker'}:${text(response.engine_version) || 'unknown'}`,
    };
  }).sort((a, b) => a.startByte - b.startByte || a.endByte - b.endByte || a.evidenceKey.localeCompare(b.evidenceKey));

  const edges = (response.edges ?? []).map((edge) => ({
    sourceRef: ref,
    sourceRevision: revision,
    fromEvidenceKey: text(edge.from_evidence_key),
    toEvidenceKey: text(edge.to_evidence_key),
    type: text(edge.type) || 'UNKNOWN',
    resolved: edge.resolved === true,
    resolution: text(edge.resolution) || null,
  })).sort((a, b) => `${a.fromEvidenceKey}:${a.type}:${a.toEvidenceKey}`.localeCompare(`${b.fromEvidenceKey}:${b.type}:${b.toEvidenceKey}`));

  return {
    schema: STRUCTURAL_OBSERVATION_SCHEMA,
    sourceRef: ref,
    sourceRevision: revision,
    extractor: `${text(response.engine) || 'treesitter-chunker'}:${text(response.engine_version) || 'unknown'}`,
    language: text(response.language),
    syntaxStatus: text(response.syntax_status) || 'CLEAN',
    diagnostics: Array.isArray(response.diagnostics) ? response.diagnostics.map(text).filter(Boolean).sort() : [],
    chunks,
    edges,
    observationChecksum: `sha256:${sha256(JSON.stringify({ sourceRef: ref, sourceRevision: revision, chunks, edges }))}`,
    canonicalAuthority: false,
  };
}
