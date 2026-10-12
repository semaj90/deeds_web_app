export function classifyIndexedChunkReuseV1(expectedChunks, storedRows) {
  const expectedById = new Map();
  const ambiguousExpectedIds = new Set();
  for (const chunk of expectedChunks) {
    if (!chunk || typeof chunk.qdrant_id !== 'string' || !chunk.qdrant_id) continue;
    if (expectedById.has(chunk.qdrant_id)) ambiguousExpectedIds.add(chunk.qdrant_id);
    else expectedById.set(chunk.qdrant_id, chunk);
  }

  const storedById = new Map();
  const ambiguousStoredIds = new Set();
  for (const row of storedRows) {
    if (!row || typeof row.qdrant_id !== 'string' || !row.qdrant_id) continue;
    if (storedById.has(row.qdrant_id)) ambiguousStoredIds.add(row.qdrant_id);
    else storedById.set(row.qdrant_id, row);
  }

  return [...expectedById].map(([id, expected]) => {
    let status;
    const stored = storedById.get(id);
    if (ambiguousExpectedIds.has(id) || ambiguousStoredIds.has(id)) {
      status = 'AMBIGUOUS_IDENTITY';
    } else if (!stored) {
      status = 'STORED_ROW_MISSING';
    } else if (typeof expected.content_hash !== 'string' || !expected.content_hash
      || typeof expected.file_hash !== 'string' || !expected.file_hash) {
      status = 'EXPECTED_HASH_UNAVAILABLE';
    } else if (stored.content_hash !== expected.content_hash) {
      status = 'CHUNK_CONTENT_HASH_MISMATCH';
    } else if (stored.file_content_hash !== expected.file_hash) {
      status = 'SOURCE_FILE_HASH_MISMATCH';
    } else {
      const expectedSpan = expected.metadata?.source_span;
      if (expectedSpan?.status === 'BYTE_MATCH_NOT_ADMITTED') {
        const storedSpan = stored.metadata?.source_span;
        status = storedSpan && storedSpan.status === expectedSpan.status
          && storedSpan.sourceRef === expectedSpan.sourceRef
          && storedSpan.sourceRevision === expectedSpan.sourceRevision
          && storedSpan.startByte === expectedSpan.startByte
          && storedSpan.endByte === expectedSpan.endByte
          && storedSpan.spanSha256 === expectedSpan.spanSha256
          ? 'EXACT_MATCH'
          : 'SOURCE_SPAN_METADATA_MISMATCH';
      } else {
        status = 'EXACT_MATCH';
      }
    }
    return { qdrant_id: id, status, reusable: status === 'EXACT_MATCH' };
  });
}

export function resolveReusableIndexedChunkIdsV1(expectedChunks, storedRows) {
  return new Set(classifyIndexedChunkReuseV1(expectedChunks, storedRows)
    .filter((entry) => entry.reusable)
    .map((entry) => entry.qdrant_id));
}
