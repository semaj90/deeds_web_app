import { createHash } from 'node:crypto';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const digest = (value) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value)
  ? value.slice(7) : null;
const present = (value) => typeof value === 'string' && value.trim().length > 0;

export function compareFunctionNativeAstReadbackV1({ symbol, sourceBytes, evidence }) {
  const rejected = (reason) => ({ status: 'REJECTED', reason });
  if (!symbol || !present(symbol.symbolVersionId) || !present(symbol.packetKey)
    || !present(symbol.sourceRef) || !digest(symbol.sourceRevision) || !digest(symbol.workspaceRevision)
    || !present(symbol.upstreamNodeId) || !present(symbol.upstreamSymbolId)
    || !present(symbol.qualifiedName) || !present(symbol.language) || !(sourceBytes instanceof Uint8Array)) {
    return rejected('CANONICAL_IDENTITY_INCOMPLETE');
  }
  if (sha256(sourceBytes) !== digest(symbol.sourceRevision)) return rejected('SOURCE_HASH_MISMATCH');
  const { startByte, endByte } = symbol;
  if (!Number.isSafeInteger(startByte) || !Number.isSafeInteger(endByte)
    || startByte < 0 || endByte <= startByte || endByte > sourceBytes.byteLength) {
    return rejected('SOURCE_SPAN_INVALID');
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes);
    new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes.subarray(startByte, endByte));
  } catch {
    return rejected('UTF8_SPAN_INVALID');
  }
  if (evidence?.schema !== 'atlas.ast.evidence.v1' || evidence.engine !== 'treesitter-chunker'
    || !present(evidence.engine_version) || evidence.engine_version === 'unknown'
    || evidence.syntax_status !== 'CLEAN' || evidence.error_tag != null
    || !Array.isArray(evidence.diagnostics) || !Array.isArray(evidence.chunks)) {
    return rejected('NATIVE_PARSER_PROVENANCE_INVALID');
  }
  if (evidence.source_revision !== symbol.sourceRevision || evidence.file_path !== symbol.sourceRef
    || evidence.language !== symbol.language) {
    return rejected('NATIVE_SOURCE_BINDING_MISMATCH');
  }
  if (evidence.diagnostics.some((value) => typeof value !== 'string'
    || value.includes('CONSILIENCY_IDENTITY_PATH_UNPROVEN'))) {
    return rejected('NATIVE_IDENTITY_PATH_UNPROVEN');
  }
  const matches = evidence.chunks.filter((chunk) => chunk?.start_byte === startByte && chunk?.end_byte === endByte);
  if (matches.length === 0) return rejected('NATIVE_SPAN_NOT_FOUND');
  if (matches.length !== 1) return rejected('NATIVE_SPAN_AMBIGUOUS');
  const match = matches[0];
  if (match.upstream_node_id !== symbol.upstreamNodeId || match.upstream_symbol_id !== symbol.upstreamSymbolId
    || !present(match.upstream_file_id) || !present(match.node_type)
    || !['function', 'method', 'class', 'interface', 'type', 'enum'].includes(match.kind)
    || !Array.isArray(match.parent_route) || match.parent_route.some((part) => !present(part))
    || [...match.parent_route, match.name].join('::') !== symbol.qualifiedName) {
    return rejected('NATIVE_SYMBOL_IDENTITY_MISMATCH');
  }
  return {
    status: 'SOURCE_NATIVE_AST_ALIGNED',
    reason: null,
    engine: evidence.engine,
    engineVersion: evidence.engine_version,
    upstreamNodeId: match.upstream_node_id,
    upstreamSymbolId: match.upstream_symbol_id,
    upstreamFileId: match.upstream_file_id,
    nodeType: match.node_type,
    kind: match.kind,
    startByte,
    endByte,
    spanSha256: sha256(sourceBytes.subarray(startByte, endByte)),
  };
}
