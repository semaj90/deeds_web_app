/**
 * Normalize hydrated canonical semantic-search rows for the TRACE hybrid lane.
 * Qdrant point IDs are retained as diagnostics only; stable_key/source_ref are
 * the joinable result identity and source. This formatter performs no I/O.
 */
export function normalizeSemanticSearchHitsV1(rows) {
  if (!Array.isArray(rows)) return [];
  const normalized = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const stableKey = String(row.stable_key ?? '').trim();
    const sourceRef = String(row.source_ref ?? row.file_path ?? '').trim();
    const content = typeof row.content === 'string' ? row.content : '';
    const score = Number(row.semantic_score);
    if (!stableKey || !sourceRef || !content || !Number.isFinite(score)) continue;
    normalized.push({
      id: stableKey,
      stable_key: stableKey,
      file_path: sourceRef,
      source_ref: sourceRef,
      content: content.slice(0, 4096),
      score,
      semantic_score: score,
      packet_key: typeof row.packet_key === 'string' ? row.packet_key : null,
      content_hash: typeof (row.content_hash ?? row.contentHash) === 'string'
        ? (row.content_hash ?? row.contentHash)
        : null,
      qdrant_id: typeof row.qdrant_id === 'string' ? row.qdrant_id : null,
      sources: ['qdrant'],
    });
  }
  return normalized;
}
