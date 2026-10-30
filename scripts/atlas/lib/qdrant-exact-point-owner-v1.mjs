export function resolveExactQdrantPointOwnerId(row, point) {
  const expectedId = typeof row?.canonical_chunk_id === 'string' ? row.canonical_chunk_id : '';
  if (!expectedId || String(point?.id ?? '') !== expectedId) return null;
  if (String(point?.payload?.postgres_id ?? '') !== expectedId) return null;
  return expectedId;
}
