export function validateQdrantProjectionMetadataV1(row) {
  if (typeof row?.relative_path !== 'string' || row.relative_path.trim().length === 0) {
    throw new Error('SOURCE_REF_REQUIRED');
  }
  if (typeof row?.content_hash !== 'string' || row.content_hash.trim().length === 0) {
    throw new Error('CONTENT_HASH_REQUIRED');
  }
  if (typeof row?.chunk_id !== 'string' || row.chunk_id.trim().length === 0) {
    throw new Error('CHUNK_ID_REQUIRED');
  }
  return row;
}

export function buildQdrantPointMetadataV1({ relativePath, contentHash }) {
  if (typeof relativePath !== 'string' || relativePath.trim().length === 0) throw new Error('SOURCE_REF_REQUIRED');
  if (typeof contentHash !== 'string' || contentHash.trim().length === 0) throw new Error('CONTENT_HASH_REQUIRED');
  return `card:${relativePath}:${contentHash}`;
}

/**
 * Qdrant point identity and payload metadata identity are intentionally distinct:
 * - actual point ID: canonical Postgres UUID
 * - qdrant_point_id payload: human/debug metadata derived from source_ref + content_hash
 */
export function assertQdrantPointIdMatchesPostgresV1(postgresId, qdrantPointId) {
  if (!postgresId || String(qdrantPointId) !== String(postgresId)) throw new Error('QDRANT_POINT_ID_NOT_POSTGRES_UUID');
  return true;
}
