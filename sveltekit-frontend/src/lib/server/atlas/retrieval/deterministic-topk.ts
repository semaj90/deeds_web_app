export type RankedScoreRow = {
  canonicalId: string;
  score: number;
  sourceRevision?: string | null;
};

export type RankedDistanceRow = {
  canonicalId: string;
  distance: number;
  sourceRevision?: string | null;
};

function identityTieBreak(a: { canonicalId: string; sourceRevision?: string | null }, b: { canonicalId: string; sourceRevision?: string | null }): number {
  const canonical = a.canonicalId.localeCompare(b.canonicalId);
  if (canonical !== 0) return canonical;
  return (a.sourceRevision ?? '').localeCompare(b.sourceRevision ?? '');
}

function assertK(k: number, length: number): void {
  if (!Number.isInteger(k) || k < 1) throw new RangeError('k must be a positive integer');
  if (k > length) throw new RangeError(`k=${k} exceeds row count=${length}`);
}

function assertFiniteRows<T extends { canonicalId: string }>(rows: readonly T[], metric: (row: T) => number): void {
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.canonicalId) throw new Error('canonicalId is required for deterministic top-K');
    const value = metric(row);
    if (!Number.isFinite(value)) throw new Error(`non-finite rank value for ${row.canonicalId}`);
    const identity = `${row.canonicalId}\0${'sourceRevision' in row ? String((row as { sourceRevision?: string | null }).sourceRevision ?? '') : ''}`;
    if (seen.has(identity)) throw new Error(`duplicate deterministic top-K identity: ${identity}`);
    seen.add(identity);
  }
}

/**
 * Stable score top-K for semantic/rerank signals where larger is better.
 *
 * We do not rely on backend tie ordering. PyTorch documents that torch.topk
 * indices for tied values are not stable; GPU exact KNN may likewise return
 * equal-distance neighbors in a different order. Canonical identity is the
 * final ordering authority in a receipt.
 */
export function deterministicTopKByScore<T extends RankedScoreRow>(rows: readonly T[], k: number): T[] {
  assertK(k, rows.length);
  assertFiniteRows(rows, (row) => row.score);
  return [...rows]
    .sort((a, b) => b.score - a.score || identityTieBreak(a, b))
    .slice(0, k);
}

/** Stable distance top-K for KNN/path signals where smaller is better. */
export function deterministicTopKByDistance<T extends RankedDistanceRow>(rows: readonly T[], k: number): T[] {
  assertK(k, rows.length);
  assertFiniteRows(rows, (row) => row.distance);
  if (rows.some((row) => row.distance < 0)) throw new RangeError('distance top-K requires non-negative distances');
  return [...rows]
    .sort((a, b) => a.distance - b.distance || identityTieBreak(a, b))
    .slice(0, k);
}

export function overlapRecallAtK(input: {
  exact: readonly RankedDistanceRow[];
  challenger: readonly RankedDistanceRow[];
  k: number;
}): number {
  const exactTop = deterministicTopKByDistance(input.exact, Math.min(input.k, input.exact.length));
  if (exactTop.length === 0) return 1;
  const challengerK = Math.min(input.k, input.challenger.length);
  if (challengerK === 0) return 0;
  const challengerTop = deterministicTopKByDistance(input.challenger, challengerK);
  const challengerIds = new Set(challengerTop.map((row) => `${row.canonicalId}\0${row.sourceRevision ?? ''}`));
  let hits = 0;
  for (const row of exactTop) {
    if (challengerIds.has(`${row.canonicalId}\0${row.sourceRevision ?? ''}`)) hits += 1;
  }
  return hits / exactTop.length;
}

/**
 * Return the smallest K that includes every row tied at the nominal cutoff.
 * This is useful when measuring an exact-vs-ANN oracle: widening the oracle
 * around an equal-distance cutoff avoids turning arbitrary tie order into a
 * false recall regression.
 */
export function widenKForDistanceTies<T extends RankedDistanceRow>(rows: readonly T[], k: number, tolerance = 0): number {
  assertK(k, rows.length);
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new RangeError('tolerance must be finite and non-negative');
  const ordered = deterministicTopKByDistance(rows, rows.length);
  const cutoff = ordered[k - 1].distance;
  let widened = k;
  while (widened < ordered.length && Math.abs(ordered[widened].distance - cutoff) <= tolerance) widened += 1;
  return widened;
}
