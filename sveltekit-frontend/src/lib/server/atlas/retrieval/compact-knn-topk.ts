import { z } from 'zod';
import type { CompiledCandidateOrdinalBitsetGateV1 } from '../features/candidate-ordinal-bitset-selection-v1.js';

/**
 * Exact compact KNN/top-K reference contract.
 *
 * Given a query matrix Q [M,d] and candidate matrix X [N,d], a backend may
 * compute distances/similarities tile-by-tile. Atlas does NOT need to
 * materialize the full [M,N] score matrix. Each candidate tile emits only its
 * local top-K per query, and local winners are merged into a running exact
 * top-K state.
 *
 * The result is mathematically equivalent to TopK over the full matrix so long
 * as every candidate participates exactly once and the score/distance function
 * is unchanged.
 */

export const CompactKnnMetricSchema = z.enum(['COSINE_SIMILARITY', 'INNER_PRODUCT', 'L2_DISTANCE']);
export type CompactKnnMetric = z.infer<typeof CompactKnnMetricSchema>;

export const CompactKnnValueOrderSchema = z.enum(['LARGER_IS_BETTER', 'SMALLER_IS_BETTER']);

export const CompactKnnEntryV1Schema = z.object({
  queryOrdinal: z.number().int().nonnegative(),
  candidateOrdinal: z.number().int().nonnegative(),
  canonicalId: z.string().min(1),
  value: z.number().finite(),
}).strict();
export type CompactKnnEntryV1 = z.infer<typeof CompactKnnEntryV1Schema>;

export const CompactKnnRowStateV1Schema = z.object({
  queryOrdinal: z.number().int().nonnegative(),
  k: z.number().int().positive(),
  entries: z.array(CompactKnnEntryV1Schema),
  processedCandidateCount: z.number().int().nonnegative(),
}).strict().superRefine((value, ctx) => {
  if (value.entries.length > value.k) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entries'], message: 'entries cannot exceed k' });
  }
  if (value.entries.some((entry) => entry.queryOrdinal !== value.queryOrdinal)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entries'], message: 'row state may only contain one queryOrdinal' });
  }
});
export type CompactKnnRowStateV1 = z.infer<typeof CompactKnnRowStateV1Schema>;

export const CompactKnnPlanV1Schema = z.object({
  schema: z.literal('atlas.compact-knn-topk-plan.v1'),
  queryCount: z.number().int().positive(),
  candidateCount: z.number().int().positive(),
  dimension: z.number().int().positive(),
  k: z.number().int().positive(),
  metric: CompactKnnMetricSchema,
  valueOrder: CompactKnnValueOrderSchema,
  candidateTileRows: z.number().int().positive(),
  materializeFullPairMatrix: z.literal(false),
  exactCandidateCoverageRequired: z.literal(true),
  canonicalTieBreakRequired: z.literal(true),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.k > value.candidateCount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['k'], message: 'k cannot exceed candidateCount' });
  }
  const expectedOrder = value.metric === 'L2_DISTANCE' ? 'SMALLER_IS_BETTER' : 'LARGER_IS_BETTER';
  if (value.valueOrder !== expectedOrder) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['valueOrder'], message: `${value.metric} requires ${expectedOrder}` });
  }
});
export type CompactKnnPlanV1 = z.infer<typeof CompactKnnPlanV1Schema>;

export function filterCompactKnnTileOrdinalsV1(input: {
  candidateOrdinals: readonly number[];
  tileCandidateCount: number;
  candidateSnapshotRevision: string;
  workspaceRevision: string;
  ordinalMapChecksum: string;
  gate: CompiledCandidateOrdinalBitsetGateV1;
}): {
  candidateOrdinals: Uint32Array;
  eligibleTileCandidateCount: number;
  excludedTileCandidateCount: number;
} {
  if (input.candidateSnapshotRevision !== input.gate.candidateSnapshotRevision
    || input.workspaceRevision !== input.gate.workspaceRevision
    || input.ordinalMapChecksum !== input.gate.ordinalMapChecksum) {
    throw new Error('COMPACT_KNN_ORDINAL_GATE_SNAPSHOT_MISMATCH');
  }
  const filtered = input.gate.filterTileOrdinals(input.candidateOrdinals, input.tileCandidateCount);
  return {
    candidateOrdinals: Uint32Array.from(filtered),
    eligibleTileCandidateCount: filtered.length,
    excludedTileCandidateCount: input.tileCandidateCount - filtered.length,
  };
}

export function scoreCompactKnnTileWithOrdinalGateCpuV1(input: {
  candidateOrdinals: readonly number[];
  tileCandidateCount: number;
  candidateSnapshotRevision: string;
  workspaceRevision: string;
  ordinalMapChecksum: string;
  gate: CompiledCandidateOrdinalBitsetGateV1;
  queryVector: Float32Array;
  candidateVectors: Float32Array;
  canonicalIdsByOrdinal: readonly string[];
  queryOrdinal: number;
  k: number;
  metric: CompactKnnMetric;
}): {
  localTopK: CompactKnnEntryV1[];
  eligibleTileCandidateCount: number;
  excludedTileCandidateCount: number;
} {
  if (!Number.isInteger(input.queryOrdinal) || input.queryOrdinal < 0) {
    throw new Error('COMPACT_KNN_QUERY_ORDINAL_INVALID');
  }
  if (!Number.isInteger(input.k) || input.k <= 0) throw new Error('COMPACT_KNN_K_INVALID');
  const dimension = input.queryVector.length;
  if (dimension === 0 || input.candidateVectors.length % dimension !== 0) {
    throw new Error('COMPACT_KNN_VECTOR_MATRIX_SHAPE_INVALID');
  }
  const rowCount = input.candidateVectors.length / dimension;
  if (input.canonicalIdsByOrdinal.length !== rowCount) {
    throw new Error('COMPACT_KNN_CANONICAL_ID_COUNT_MISMATCH');
  }
  if (!input.queryVector.every(Number.isFinite)) {
    throw new Error('COMPACT_KNN_NON_FINITE_VECTOR_VALUE');
  }

  const filtered = filterCompactKnnTileOrdinalsV1(input);
  const queryNorm = input.metric === 'COSINE_SIMILARITY'
    ? Math.sqrt(input.queryVector.reduce((sum, value) => sum + value * value, 0))
    : 1;
  const localTopK: CompactKnnEntryV1[] = [];
  for (const candidateOrdinal of filtered.candidateOrdinals) {
    if (candidateOrdinal >= rowCount) throw new Error('COMPACT_KNN_CANDIDATE_ORDINAL_OUT_OF_RANGE');
    const canonicalId = input.canonicalIdsByOrdinal[candidateOrdinal];
    if (!canonicalId) throw new Error('COMPACT_KNN_CANONICAL_ID_MISSING');
    const offset = candidateOrdinal * dimension;
    let dot = 0;
    let squaredDistance = 0;
    let candidateSquaredNorm = 0;
    for (let index = 0; index < dimension; index += 1) {
      const queryValue = input.queryVector[index];
      const candidateValue = input.candidateVectors[offset + index];
      if (!Number.isFinite(candidateValue)) throw new Error('COMPACT_KNN_NON_FINITE_VECTOR_VALUE');
      dot += queryValue * candidateValue;
      if (input.metric === 'L2_DISTANCE') {
        const delta = queryValue - candidateValue;
        squaredDistance += delta * delta;
      }
      if (input.metric === 'COSINE_SIMILARITY') candidateSquaredNorm += candidateValue * candidateValue;
    }
    const value = input.metric === 'L2_DISTANCE'
      ? Math.sqrt(squaredDistance)
      : input.metric === 'INNER_PRODUCT'
        ? dot
        : queryNorm === 0 || candidateSquaredNorm === 0
          ? 0
          : dot / (queryNorm * Math.sqrt(candidateSquaredNorm));
    localTopK.push({ queryOrdinal: input.queryOrdinal, candidateOrdinal, canonicalId, value });
  }
  const valueOrder = input.metric === 'L2_DISTANCE' ? 'SMALLER_IS_BETTER' : 'LARGER_IS_BETTER';
  localTopK.sort((left, right) => compareEntries(left, right, valueOrder));
  return {
    localTopK: localTopK.slice(0, input.k),
    eligibleTileCandidateCount: filtered.eligibleTileCandidateCount,
    excludedTileCandidateCount: filtered.excludedTileCandidateCount,
  };
}

function compareEntries(a: CompactKnnEntryV1, b: CompactKnnEntryV1, order: 'LARGER_IS_BETTER' | 'SMALLER_IS_BETTER'): number {
  const primary = order === 'LARGER_IS_BETTER' ? b.value - a.value : a.value - b.value;
  return primary || a.canonicalId.localeCompare(b.canonicalId) || a.candidateOrdinal - b.candidateOrdinal;
}

export function createCompactKnnRowState(queryOrdinal: number, k: number): CompactKnnRowStateV1 {
  return CompactKnnRowStateV1Schema.parse({ queryOrdinal, k, entries: [], processedCandidateCount: 0 });
}

/**
 * Merge the local top-K for one candidate tile into the running exact top-K.
 *
 * Why local top-K is sufficient:
 * If an item is not in a tile's top-K, at least K items in the same tile rank
 * ahead of it. Therefore that item cannot enter the global top-K either, since
 * those K dominating items also exist in the global candidate set.
 */
export function mergeCompactKnnTile(input: {
  state: CompactKnnRowStateV1;
  localTopK: readonly CompactKnnEntryV1[];
  tileCandidateCount: number;
  valueOrder: 'LARGER_IS_BETTER' | 'SMALLER_IS_BETTER';
}): CompactKnnRowStateV1 {
  const state = CompactKnnRowStateV1Schema.parse(input.state);
  if (!Number.isInteger(input.tileCandidateCount) || input.tileCandidateCount < 0) {
    throw new Error('tileCandidateCount must be a non-negative integer');
  }

  const byCandidate = new Map<number, CompactKnnEntryV1>();
  for (const entry of [...state.entries, ...input.localTopK.map((entry) => CompactKnnEntryV1Schema.parse(entry))]) {
    if (entry.queryOrdinal !== state.queryOrdinal) throw new Error('local top-K queryOrdinal mismatch');
    const previous = byCandidate.get(entry.candidateOrdinal);
    if (previous && previous.canonicalId !== entry.canonicalId) {
      throw new Error(`candidate ordinal ${entry.candidateOrdinal} maps to multiple canonical identities`);
    }
    if (!previous || compareEntries(entry, previous, input.valueOrder) < 0) byCandidate.set(entry.candidateOrdinal, entry);
  }

  const entries = [...byCandidate.values()]
    .sort((a, b) => compareEntries(a, b, input.valueOrder))
    .slice(0, state.k);

  return CompactKnnRowStateV1Schema.parse({
    ...state,
    entries,
    processedCandidateCount: state.processedCandidateCount + input.tileCandidateCount,
  });
}

/** Verify that an exact compact pass really covered the entire candidate set. */
export function compactKnnCoverageComplete(state: CompactKnnRowStateV1, candidateCount: number): boolean {
  const parsed = CompactKnnRowStateV1Schema.parse(state);
  return parsed.processedCandidateCount === candidateCount;
}

/**
 * Produce a compact CSR-like row representation for M query rows:
 * rowOffsets has M+1 entries, values/indices contain at most M*K winners.
 */
export function compactRowsToCsr(rows: readonly CompactKnnRowStateV1[]): {
  rowOffsets: Uint32Array;
  candidateOrdinals: Uint32Array;
  values: Float64Array;
  canonicalIds: string[];
} {
  const parsed = rows.map((row) => CompactKnnRowStateV1Schema.parse(row)).sort((a, b) => a.queryOrdinal - b.queryOrdinal);
  const rowOffsets = new Uint32Array(parsed.length + 1);
  const flattened = parsed.flatMap((row) => row.entries);
  const candidateOrdinals = new Uint32Array(flattened.length);
  const values = new Float64Array(flattened.length);
  const canonicalIds: string[] = new Array(flattened.length);

  let cursor = 0;
  for (let rowIndex = 0; rowIndex < parsed.length; rowIndex += 1) {
    rowOffsets[rowIndex] = cursor;
    for (const entry of parsed[rowIndex].entries) {
      candidateOrdinals[cursor] = entry.candidateOrdinal;
      values[cursor] = entry.value;
      canonicalIds[cursor] = entry.canonicalId;
      cursor += 1;
    }
  }
  rowOffsets[parsed.length] = cursor;
  return { rowOffsets, candidateOrdinals, values, canonicalIds };
}
