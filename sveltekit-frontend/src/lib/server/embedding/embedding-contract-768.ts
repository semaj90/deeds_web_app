/**
 * SEMANTIC_768_RUNTIME_CUTOVER — canonical runtime contract.
 *
 * Native EmbeddingGemma semantic_768 is the persisted/search authority.
 * truncateEmbeddingGemmaMrl() produces separately named reference lanes such
 * as semantic_mrl_512; derived prefixes never replace the native authority.
 *
 * Naming note: "512" appears in two unrelated EmbeddingGemma contracts that
 * must never be conflated — the MRL truncation width (semantic_mrl_512, a
 * representation size) and the model's internal attention sliding window
 * (512 tokens, an architecture parameter, unrelated to any embedding output
 * dimension). Always write "semantic_mrl_512" (never bare "semantic_512")
 * specifically so this ambiguity can't recur in code or comments.
 *
 * Active semantic embedding lane: semantic_768 (768-dim, EmbeddingGemma native).
 * The NestedSemanticAutoencoder learned family is latent_256 (physical) with
 * latent_128 / latent_64 as L2-renormalized derived prefixes. These are learned
 * challenger representations, NOT topology representations, NOT embedding APIs,
 * and never substitutable for semantic_768 at retrieval time. The distinct older
 * topology/SOM representation is named topology_ae64_v1 in vector-manifest.ts.
 *
 * 384-dim is retired: no runtime code may read or write it. 512/256/128 are
 * supported EmbeddingGemma MRL-derived reference representations.
 * Migration-only tooling that still needs 384-dim access belongs in
 * `embedding/legacy-384-migration.ts` and must never be imported from
 * retrieval, ACE, cache, or reranking paths.
 */

import { createHash } from 'node:crypto';

export const SEMANTIC_REPRESENTATION_ID = 'semantic_768' as const;
export const SEMANTIC_DIMENSION = 768 as const;
export const CANONICAL_QDRANT_COLLECTION = 'codebase_chunks_768_v2' as const;
export const EMBEDDINGGEMMA_MRL_DIMENSIONS = [768, 512, 256, 128] as const;

/**
 * Lineage revision markers for whether embedded text was passed through
 * formatEmbeddingGemmaInput() before hitting the model. Neither live embedding
 * call site (src/lib/server/retrieval/embedding-service.ts, embedViaOllama;
 * src/lib/server/embeddings/ollama.ts) applies formatEmbeddingGemmaInput()
 * today — both send raw text. So the entire existing corpus (Qdrant
 * codebase_chunks_768, codebase_chunk_index.content_embedding) was embedded
 * under PROMPT_REVISION_UNPROMPTED, not PROMPT_REVISION_TASK_PREFIX_V1.
 * Do not wire formatEmbeddingGemmaInput() into a live query path without also
 * re-embedding the document side to match — a formatted query compared
 * against an unformatted document corpus is a silent representation
 * mismatch, not a like-for-like comparison. See
 * memory/SESSION-201-EG-GGUF-PROOF-GATES-0-2.md.
 */
export const PROMPT_REVISION_TASK_PREFIX_V1 = 'eg-task-prefix-v1' as const;
export const PROMPT_REVISION_UNPROMPTED = 'unprompted-v0' as const;

export type EmbeddingGemmaInputMode = 'retrieval_query' | 'code_query' | 'document';

/**
 * Canonical EmbeddingGemma prompt owner. Callers must not hand-build prompt
 * strings because query/document prompting is part of representation lineage.
 */
export function formatEmbeddingGemmaInput(
  mode: EmbeddingGemmaInputMode,
  content: string,
  title?: string,
): string {
  const normalizedContent = content.trim();
  if (!normalizedContent) {
    throw new Error('EMBEDDINGGEMMA_EMPTY_INPUT');
  }

  switch (mode) {
    case 'retrieval_query':
      return `task: search result | query: ${normalizedContent}`;
    case 'code_query':
      return `task: code retrieval query | query: ${normalizedContent}`;
    case 'document':
      return `title: ${title?.trim() || 'none'} | text: ${normalizedContent}`;
  }
}

export type EmbeddingGemmaMrlDimension = (typeof EMBEDDINGGEMMA_MRL_DIMENSIONS)[number];

/**
 * The NestedSemanticAutoencoder's learned latent family: semantic_768 -> latent_256 (physical,
 * stored) -> latent_128/latent_64 (L2-renormalized prefixes of latent_256, derived at query
 * time, not separately persisted). Distinct from, and must never be confused with, the OLDER
 * SOM-topology autoencoder (renamed topology_ae64_v1 in vector-manifest.ts precisely because it
 * used to share the name "latent_64" with this family despite being different weights entirely
 * -- see packages/semantic-contracts/src/vector-manifest.ts for the full split rationale).
 */
export const LEARNED_LATENT_REPRESENTATIONS = {
  latent_256: 256,
  latent_128: 128,
  latent_64: 64,
} as const;

export type LearnedLatentRepresentationId = keyof typeof LEARNED_LATENT_REPRESENTATIONS;
export type SemanticDimension = typeof SEMANTIC_DIMENSION;
export type LearnedLatentDimension = (typeof LEARNED_LATENT_REPRESENTATIONS)[LearnedLatentRepresentationId];

/**
 * Fail-closed guard for the active semantic lane. Throws rather than
 * silently normalizing, truncating, or padding into a different dimension.
 */
export function assertSemantic768(
  vector: readonly number[] | Float32Array,
): asserts vector is readonly number[] {
  if (vector.length !== SEMANTIC_DIMENSION) {
    throw new Error(
      `SEMANTIC_768_DIMENSION_MISMATCH: expected ${SEMANTIC_DIMENSION}, received ${vector.length}`,
    );
  }
}

/**
 * Derive an EmbeddingGemma MRL representation from canonical semantic_768.
 * This is intentionally not a generic dimension reducer: 384 and arbitrary
 * widths fail closed, and every derived prefix is re-normalized for cosine.
 */
export function truncateEmbeddingGemmaMrl(
  vector: readonly number[] | Float32Array,
  dimension: EmbeddingGemmaMrlDimension,
): Float32Array {
  if (!(EMBEDDINGGEMMA_MRL_DIMENSIONS as readonly number[]).includes(dimension)) {
    throw new Error(`UNSUPPORTED_EMBEDDINGGEMMA_MRL_DIMENSION: ${dimension}`);
  }
  assertSemantic768(vector);

  const truncated = new Float32Array(vector.slice(0, dimension));
  let normSquared = 0;
  for (const value of truncated) {
    if (!Number.isFinite(value)) {
      throw new Error('SEMANTIC_MRL_NON_FINITE_VALUE');
    }
    normSquared += value * value;
  }

  const norm = Math.sqrt(normSquared);
  if (!Number.isFinite(norm) || norm <= 0) {
    throw new Error('SEMANTIC_MRL_ZERO_NORM');
  }

  for (let index = 0; index < truncated.length; index += 1) {
    truncated[index] /= norm;
  }
  return truncated;
}

/**
 * Deterministic digest of an already-truncated/renormalized MRL vector.
 * Little-endian float32 byte layout matches semantic-lineage.ts's
 * digestSemanticEmbedding() so digests are comparable in kind, even though
 * that function is 768-only and this one accepts any EmbeddingGemma MRL
 * width. Does not itself validate dimension membership — pair with
 * truncateEmbeddingGemmaMrl() (or deriveEmbeddingGemmaMrlProjection() below)
 * so only vetted, renormalized vectors ever get digested.
 */
export function digestEmbeddingGemmaMrl(vector: Float32Array | readonly number[]): string {
  const bytes = new Uint8Array(vector.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < vector.length; index += 1) {
    const value = Number(vector[index]);
    if (!Number.isFinite(value)) {
      throw new Error(`SEMANTIC_MRL_DIGEST_NON_FINITE_VALUE: index ${index} is ${String(value)}`);
    }
    view.setFloat32(index * 4, value, true);
  }
  return createHash('sha256').update(bytes).digest('hex');
}

export interface EmbeddingGemmaMrlProjection {
  dimension: EmbeddingGemmaMrlDimension;
  vector: Float32Array;
  digest: string;
}

/**
 * EG-GGUF-5: derive one MRL projection (truncate + L2-renorm + digest) from a
 * canonical semantic_768 source vector in a single call.
 */
export function deriveEmbeddingGemmaMrlProjection(
  vector: readonly number[] | Float32Array,
  dimension: EmbeddingGemmaMrlDimension,
): EmbeddingGemmaMrlProjection {
  const projected = truncateEmbeddingGemmaMrl(vector, dimension);
  return {
    dimension,
    vector: projected,
    digest: digestEmbeddingGemmaMrl(projected),
  };
}

export interface SemanticLaneInput {
  representationId?: string;
  dimension?: number;
}

export interface ResolvedSemanticLane {
  representationId: typeof SEMANTIC_REPRESENTATION_ID;
  dimension: typeof SEMANTIC_DIMENSION;
}

/**
 * Single source of truth for resolving a caller-supplied lane request down
 * to the canonical semantic lane. Fails closed — never normalizes a 384 (or
 * any other) request back onto an accepted lane. Call this from every
 * orchestrator entry point instead of re-implementing the same branch.
 */
export function resolveSemanticLane(input: SemanticLaneInput = {}): ResolvedSemanticLane {
  const representationId = input.representationId ?? SEMANTIC_REPRESENTATION_ID;
  const dimension = input.dimension ?? SEMANTIC_DIMENSION;

  if (representationId !== SEMANTIC_REPRESENTATION_ID || dimension !== SEMANTIC_DIMENSION) {
    throw new Error(`UNSUPPORTED_SEMANTIC_LANE: ${representationId}/${dimension}`);
  }

  return { representationId: SEMANTIC_REPRESENTATION_ID, dimension: SEMANTIC_DIMENSION };
}
