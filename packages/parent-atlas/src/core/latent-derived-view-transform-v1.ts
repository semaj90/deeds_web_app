/**
 * FETCH-LATENT-DERIVED-VIEWS-02 (parent-atlas-retrieval-lineage-dag-convergence).
 *
 * Pure, deterministic transform for a DERIVED+VIRTUAL representation view: prefix the first N
 * dimensions of a parent vector, then L2-renormalize. This is the MRL-style prefix transform
 * this repo already uses for the semantic_768 -> semantic_512 lane (CLAUDE.md's "Embedding
 * Dimensions Policy" -- "MRL-prefix + L2-renorm"); here it is the SAME mechanism applied to the
 * learned latent_256 representation to produce latent_128, per
 * LATENT-REPRESENTATION-SEMANTICS-03's origin/materialization contract.
 *
 * Deliberately has ZERO storage/DB dependency -- callers own fetching the parent vector and
 * discarding it after computing whatever checksum they need. This file must never import
 * anything from a Postgres/Qdrant client.
 */

export const NESTED_PREFIX_L2_RENORMALIZE_TRANSFORM_ID = 'NESTED_PREFIX_L2_RENORMALIZE' as const;

export function deriveNestedPrefixL2RenormalizedView(
  parentVector: readonly number[],
  targetDimensions: number,
): number[] {
  if (!Number.isInteger(targetDimensions) || targetDimensions <= 0) {
    throw new Error('LATENT_DERIVED_VIEW_TARGET_DIMENSIONS_NOT_POSITIVE_INTEGER');
  }
  if (targetDimensions > parentVector.length) {
    throw new Error('LATENT_DERIVED_VIEW_TARGET_DIMENSIONS_EXCEEDS_PARENT');
  }
  for (const v of parentVector) {
    if (!Number.isFinite(v)) {
      throw new Error('LATENT_DERIVED_VIEW_PARENT_VECTOR_NON_FINITE');
    }
  }

  const prefix = parentVector.slice(0, targetDimensions);
  let sumSquares = 0;
  for (const v of prefix) sumSquares += v * v;
  const norm = Math.sqrt(sumSquares);
  if (!Number.isFinite(norm) || norm === 0) {
    throw new Error('LATENT_DERIVED_VIEW_ZERO_OR_NON_FINITE_NORM');
  }

  return prefix.map((v) => v / norm);
}
