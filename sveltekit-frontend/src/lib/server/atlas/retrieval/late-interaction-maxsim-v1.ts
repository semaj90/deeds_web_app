import { z } from 'zod';

export const LATE_INTERACTION_DIMENSIONS_V1 = [32, 64, 128] as const;
export const LateInteractionDimensionV1Schema = z.union([z.literal(32), z.literal(64), z.literal(128)]);
export type LateInteractionDimensionV1 = z.infer<typeof LateInteractionDimensionV1Schema>;

/**
 * In-memory representation metadata for a bounded RRF cohort. The vectors are
 * intentionally not a persistence contract; identity and revision metadata are.
 */
export interface LateInteractionTokenMatrixV1 {
  canonicalId: string;
  sourceRevision: string;
  representationRevision: string;
  modelRevision: string;
  dimension: LateInteractionDimensionV1;
  tokenOrdinals: readonly number[];
  vectors: readonly (readonly number[])[];
}

function validateMatrix(matrix: LateInteractionTokenMatrixV1, dimension: LateInteractionDimensionV1): void {
  if (!matrix.canonicalId || !matrix.sourceRevision || !matrix.representationRevision || !matrix.modelRevision) {
    throw new Error('LATE_INTERACTION_IDENTITY_INCOMPLETE');
  }
  if (matrix.dimension !== dimension) throw new Error('LATE_INTERACTION_DIMENSION_MISMATCH');
  if (matrix.tokenOrdinals.length === 0 || matrix.tokenOrdinals.length !== matrix.vectors.length) {
    throw new Error('LATE_INTERACTION_TOKEN_VECTOR_LENGTH_MISMATCH');
  }
  const seen = new Set<number>();
  for (let index = 0; index < matrix.tokenOrdinals.length; index += 1) {
    const ordinal = matrix.tokenOrdinals[index]!;
    if (!Number.isInteger(ordinal) || ordinal < 0 || seen.has(ordinal)) {
      throw new Error('LATE_INTERACTION_TOKEN_ORDINAL_INVALID');
    }
    seen.add(ordinal);
    const vector = matrix.vectors[index]!;
    if (vector.length < dimension || vector.some((value) => !Number.isFinite(value))) {
      throw new Error('LATE_INTERACTION_VECTOR_INVALID');
    }
  }
}

/**
 * ColBERT-style MaxSim: for each query token, retain the best document-token
 * dot product, then sum those maxima. No sigmoid or probability semantics are
 * applied; the result is a raw late-interaction score.
 */
export function scoreLateInteractionMaxSimV1(
  query: LateInteractionTokenMatrixV1,
  candidate: LateInteractionTokenMatrixV1,
  dimension: LateInteractionDimensionV1,
): number {
  validateMatrix(query, dimension);
  validateMatrix(candidate, dimension);
  let total = 0;
  for (const queryVector of query.vectors) {
    let best = Number.NEGATIVE_INFINITY;
    for (const documentVector of candidate.vectors) {
      let dot = 0;
      for (let index = 0; index < dimension; index += 1) dot += queryVector[index]! * documentVector[index]!;
      if (dot > best) best = dot;
    }
    total += best;
  }
  if (!Number.isFinite(total)) throw new Error('LATE_INTERACTION_SCORE_NON_FINITE');
  return total;
}
