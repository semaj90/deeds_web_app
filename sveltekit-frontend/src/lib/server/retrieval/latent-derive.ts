/**
 * Derives latent_128 / latent_64 from a stored latent_256 vector via prefix
 * truncation + L2-renormalization — never independently learned branches.
 *
 * Matches the exact algorithm in the real NestedSemanticAutoencoder
 * (python/atlas_compute/latent_autoencoder.py::encode()):
 *   latent256 = L2_normalize(encoder(semantic_768))
 *   latent128 = L2_normalize(latent256[:128])
 *   latent64  = L2_normalize(latent128[:64])
 *
 * By design, per this repo's canonical decision (schema-postgres.ts's
 * codebaseChunkIndex.latent256 comment, backed by the recall benchmark in
 * openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md), latent_128
 * and latent_64 are NOT stored separately in Postgres — they are cheap
 * derivations computed here, at query/read time, from the one physical
 * bottleneck column (latent_256).
 *
 * Never conflate these with `semantic_mrl_128`/`semantic_mrl_512` — those are
 * MRL-prefix truncations of the native EmbeddingGemma semantic_768 embedding,
 * a completely different representation family that happens to share a
 * dimension. See semantic-512.ts for that lane.
 */

export const LATENT_256_DIM = 256;
export const LATENT_128_DIM = 128;
export const LATENT_64_DIM = 64;

function l2Normalize(input: Float32Array): Float32Array {
  let normSq = 0;
  for (let i = 0; i < input.length; i++) normSq += input[i] * input[i];
  const norm = Math.sqrt(normSq);
  if (!Number.isFinite(norm) || norm <= 0) {
    throw new Error('ATLAS_LATENT_ZERO_OR_INVALID_NORM');
  }
  const output = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) output[i] = input[i] / norm;
  return output;
}

/** Derive latent_128 from a stored latent_256 vector (prefix + L2-renormalize). */
export function deriveLatent128(latent256: Float32Array): Float32Array {
  if (latent256.length !== LATENT_256_DIM) {
    throw new Error(`ATLAS_LATENT_256_DIMENSION_MISMATCH: expected ${LATENT_256_DIM}, got ${latent256.length}`);
  }
  return l2Normalize(latent256.slice(0, LATENT_128_DIM));
}

/** Derive latent_64 from a stored latent_256 vector (prefix latent_128 first, then prefix + L2-renormalize again). */
export function deriveLatent64(latent256: Float32Array): Float32Array {
  const latent128 = deriveLatent128(latent256);
  return l2Normalize(latent128.slice(0, LATENT_64_DIM));
}

/** Derive both latent_128 and latent_64 in one pass from a stored latent_256 vector. */
export function deriveLatentFamily(latent256: Float32Array): {
  latent128: Float32Array;
  latent64: Float32Array;
} {
  const latent128 = deriveLatent128(latent256);
  const latent64 = l2Normalize(latent128.slice(0, LATENT_64_DIM));
  return { latent128, latent64 };
}
