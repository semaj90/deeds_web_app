export function matchExactSymbolVersionV1(row, symbolVersions) {
  const sameIdentity = symbolVersions.filter((symbol) => symbol.packet_key === row.packet_key
    && symbol.source_ref === row.source_ref && symbol.source_revision === row.source_revision
    && symbol.workspace_revision === row.workspace_revision);
  const sameName = sameIdentity.filter((symbol) => symbol.qualified_name === row.symbol_name);
  const exact = sameName.filter((symbol) => Number(symbol.byte_start) === row.start_byte
    && Number(symbol.byte_end) === row.end_byte);
  if (exact.length > 1) return { status: 'AMBIGUOUS_EXACT_SYMBOL_MATCH', canonicalSymbolId: null, symbolVersionId: null };
  if (exact.length === 1) return {
    status: 'EXACT_SYMBOL_VERSION_MATCH',
    canonicalSymbolId: exact[0].stable_symbol_id,
    symbolVersionId: exact[0].symbol_version_id,
  };
  return {
    status: sameName.length ? 'NAME_MATCH_SPAN_MISMATCH' : 'NO_EXACT_SYMBOL_MATCH',
    canonicalSymbolId: null,
    symbolVersionId: null,
  };
}
