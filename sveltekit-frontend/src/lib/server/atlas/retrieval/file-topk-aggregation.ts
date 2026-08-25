/**
 * File-level top-K aggregation over `atlas-rapids-semantic768-client.ts`'s exact-KNN hits.
 *
 * `AtlasSemantic768ExactHitV1` carries `packetKey`/`sourceRevision` only — matching the real
 * Python sidecar's `KnnCorpusRow`/`ExactKnnHit` models (`atlas_rapids_sidecar.py`), which never
 * accept or return `sourceRef` at all. A file-ranking result needs `sourceRef`, so this module
 * does NOT fabricate one — it requires the caller to supply a `packetKey -> sourceRef` map, which
 * the caller already has (they built the exact-KNN corpus rows from Postgres in the first place,
 * where `sourceRef` was available before the round trip through the sidecar stripped it).
 *
 * One packet can plausibly still map to a `sourceRef` shared by other packets (multiple
 * ORF/symbol rows per file) — this module deduplicates to one row per `sourceRef`, keeping the
 * highest-`cosineSimilarity` hit for that file, deterministic tie-break by `packetKey`.
 */

import type { AtlasSemantic768ExactHitV1 } from './atlas-rapids-semantic768-client.js';

export interface FileTopKEntryV1 {
  rank: number;
  sourceRef: string;
  packetKey: string;
  sourceRevision: string;
  cosineSimilarity: number;
}

export interface FileTopKAggregationResultV1 {
  files: FileTopKEntryV1[];
  requestedK: number;
  returnedK: number;
  uniqueFiles: number;
  /** Hits dropped because no sourceRef was known for their packetKey — never silently ranked. */
  droppedNoSourceRef: number;
}

/**
 * Aggregate per-packet exact-KNN hits into deduplicated, deterministic per-file top-K.
 *
 * @param hits exact-KNN results, any order (already rank-ordered by the sidecar, but this
 *   function does not rely on that — it re-sorts by `cosineSimilarity` explicitly).
 * @param packetKeyToSourceRef caller-supplied identity join. A `Map` or plain object; hits whose
 *   `packetKey` has no entry are dropped (counted in `droppedNoSourceRef`), never assigned a
 *   fabricated `sourceRef`.
 * @param topK maximum files to return. Must be a positive integer.
 */
export function aggregateExactKnnToFileTopK(
  hits: readonly AtlasSemantic768ExactHitV1[],
  packetKeyToSourceRef: ReadonlyMap<string, string> | Readonly<Record<string, string>>,
  topK: number,
): FileTopKAggregationResultV1 {
  if (!Number.isInteger(topK) || topK < 1) {
    throw new Error(`ATLAS_FILE_TOPK_INVALID_K:${topK}`);
  }

  const lookup = (packetKey: string): string | undefined =>
    packetKeyToSourceRef instanceof Map
      ? packetKeyToSourceRef.get(packetKey)
      : packetKeyToSourceRef[packetKey];

  const bestPerFile = new Map<string, { packetKey: string; sourceRevision: string; cosineSimilarity: number }>();
  let droppedNoSourceRef = 0;

  for (const hit of hits) {
    const sourceRef = lookup(hit.packetKey);
    if (!sourceRef) {
      droppedNoSourceRef++;
      continue;
    }
    const existing = bestPerFile.get(sourceRef);
    if (
      !existing ||
      hit.cosineSimilarity > existing.cosineSimilarity ||
      (hit.cosineSimilarity === existing.cosineSimilarity && hit.packetKey < existing.packetKey)
    ) {
      bestPerFile.set(sourceRef, {
        packetKey: hit.packetKey,
        sourceRevision: hit.sourceRevision,
        cosineSimilarity: hit.cosineSimilarity,
      });
    }
  }

  const ranked = Array.from(bestPerFile.entries())
    .sort((a, b) => b[1].cosineSimilarity - a[1].cosineSimilarity || a[1].packetKey.localeCompare(b[1].packetKey))
    .slice(0, topK)
    .map(([sourceRef, entry], index): FileTopKEntryV1 => ({
      rank: index + 1,
      sourceRef,
      packetKey: entry.packetKey,
      sourceRevision: entry.sourceRevision,
      cosineSimilarity: entry.cosineSimilarity,
    }));

  return {
    files: ranked,
    requestedK: topK,
    returnedK: ranked.length,
    uniqueFiles: bestPerFile.size,
    droppedNoSourceRef,
  };
}
