/**
 * Attribute an occurrence to its CONTAINING symbol-version row by exact byte-span containment (pure).
 * rows: [{ stable_symbol_id, symbol_version_id, qualified_name, byte_start, byte_end, source_revision }] for ONE file; callers must pass only rows at
 * the admitted source revision of that file and from exact path forms. The innermost row wins; two innermost rows with identical spans but
 * different stable ids are AMBIGUOUS; no containing row is NO_CONTAINING_SYMBOL_VERSION (file-level use, or coverage gap). Names are not used to match.
 */
export function attributeContainingSymbol(rows, occurrence, { admittedRevision } = {}) {
  if (!Number.isInteger(occurrence.startByte) || !Number.isInteger(occurrence.endByte) || occurrence.endByte < occurrence.startByte) return { status: 'SPAN_INVALID' };
  const usable = rows.filter((r) => (admittedRevision ? r.source_revision === admittedRevision : true) && Number.isInteger(+r.byte_start) && Number.isInteger(+r.byte_end));
  const stale = rows.length - usable.length;
  const containing = usable.filter((r) => +r.byte_start <= occurrence.startByte && +r.byte_end >= occurrence.endByte);
  if (containing.length === 0) return { status: rows.length === 0 ? 'NO_SYMBOL_VERSIONS_FOR_FILE' : stale === rows.length ? 'ONLY_STALE_REVISION_ROWS' : 'NO_CONTAINING_SYMBOL_VERSION' };
  const size = (r) => +r.byte_end - +r.byte_start;
  const smallest = Math.min(...containing.map(size));
  const innermost = containing.filter((r) => size(r) === smallest);
  const ids = [...new Set(innermost.map((r) => r.stable_symbol_id))];
  if (ids.length > 1) return { status: 'AMBIGUOUS', candidates: ids.sort() };
  const row = innermost[0];
  return { status: 'ATTRIBUTED', stableSymbolId: row.stable_symbol_id, symbolVersionId: row.symbol_version_id ?? null, qualifiedName: row.qualified_name, span: [+row.byte_start, +row.byte_end] };
}
