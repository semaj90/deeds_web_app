export const ChunkBridgeClassification = Object.freeze({
  EXACT_CHUNK_IDENTITY: 'EXACT_CHUNK_IDENTITY',
  SOURCE_ONLY_AMBIGUOUS: 'SOURCE_ONLY_AMBIGUOUS',
  MISSING_ORDINAL: 'MISSING_ORDINAL',
  REVISION_UNPROVEN: 'REVISION_UNPROVEN',
  CONTENT_MISMATCH: 'CONTENT_MISMATCH',
  SOURCE_MISMATCH: 'SOURCE_MISMATCH',
  MISSING_CHUNK: 'MISSING_CHUNK',
});

const clean = (value) => {
  const text = String(value ?? '').trim();
  return text || null;
};

const same = (a, b) => clean(a)?.toLowerCase() === clean(b)?.toLowerCase();

export function classifyChunkBridge({ packet, chunks = [] }) {
  const sourceRef = clean(packet?.source_ref);
  const contentHash = clean(packet?.content_hash);
  if (!sourceRef || !contentHash) return { classification: ChunkBridgeClassification.CONTENT_MISMATCH, eligible: false, chunk: null };
  if (chunks.length === 0) return { classification: ChunkBridgeClassification.MISSING_CHUNK, eligible: false, chunk: null };

  const exactHash = chunks.filter((chunk) => same(chunk.source_ref, sourceRef) && same(chunk.content_hash, contentHash));
  if (exactHash.length === 1) {
    const chunk = exactHash[0];
    if (!clean(chunk.id)) return { classification: ChunkBridgeClassification.MISSING_ORDINAL, eligible: false, chunk };
    if (!clean(packet.workspace_revision) || !clean(packet.source_revision)) {
      return { classification: ChunkBridgeClassification.REVISION_UNPROVEN, eligible: false, chunk };
    }
    return { classification: ChunkBridgeClassification.EXACT_CHUNK_IDENTITY, eligible: true, chunk };
  }

  const sameSource = chunks.filter((chunk) => same(chunk.source_ref, sourceRef));
  if (sameSource.length > 0) return { classification: ChunkBridgeClassification.SOURCE_ONLY_AMBIGUOUS, eligible: false, chunk: null };
  return { classification: ChunkBridgeClassification.CONTENT_MISMATCH, eligible: false, chunk: null };
}

export function summarizeChunkBridge(results) {
  const counts = Object.fromEntries(Object.values(ChunkBridgeClassification).map((key) => [key, 0]));
  for (const result of results) counts[result.classification] = (counts[result.classification] ?? 0) + 1;
  return {
    examined: results.length,
    eligibleExactChunkIdentity: counts[ChunkBridgeClassification.EXACT_CHUNK_IDENTITY],
    counts,
    promotionEligible: counts[ChunkBridgeClassification.EXACT_CHUNK_IDENTITY] > 0,
  };
}
