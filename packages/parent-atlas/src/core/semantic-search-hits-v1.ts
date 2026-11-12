export interface CanonicalSemanticSearchRowV1 {
  stable_key?: unknown;
  source_ref?: unknown;
  file_path?: unknown;
  content?: unknown;
  semantic_score?: unknown;
  packet_key?: unknown;
  content_hash?: unknown;
  contentHash?: unknown;
  qdrant_id?: unknown;
}

export interface SemanticSearchHitV1 {
  id: string;
  stable_key: string;
  file_path: string;
  source_ref: string;
  content: string;
  score: number;
  semantic_score: number;
  packet_key: string | null;
  content_hash: string | null;
  qdrant_id: string | null;
  sources: ['qdrant'];
}

/** Normalize hydrated canonical semantic-search rows; never promote Qdrant IDs. */
export function normalizeSemanticSearchHitsV1(rows: unknown): SemanticSearchHitV1[] {
  if (!Array.isArray(rows)) return [];
  const normalized: SemanticSearchHitV1[] = [];
  for (const value of rows) {
    if (!value || typeof value !== 'object') continue;
    const row = value as CanonicalSemanticSearchRowV1;
    const stableKey = String(row.stable_key ?? '').trim();
    const sourceRef = String(row.source_ref ?? row.file_path ?? '').trim();
    const content = typeof row.content === 'string' ? row.content : '';
    const score = Number(row.semantic_score);
    if (!stableKey || !sourceRef || !content || !Number.isFinite(score)) continue;
    const contentHash = row.content_hash ?? row.contentHash;
    normalized.push({
      id: stableKey,
      stable_key: stableKey,
      file_path: sourceRef,
      source_ref: sourceRef,
      content: content.slice(0, 4096),
      score,
      semantic_score: score,
      packet_key: typeof row.packet_key === 'string' ? row.packet_key : null,
      content_hash: typeof contentHash === 'string' ? contentHash : null,
      qdrant_id: typeof row.qdrant_id === 'string' ? row.qdrant_id : null,
      sources: ['qdrant'],
    });
  }
  return normalized;
}
