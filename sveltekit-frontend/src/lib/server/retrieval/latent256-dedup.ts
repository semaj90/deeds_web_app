/**
 * selectDiverseCandidates — non-destructive candidate selection using latent_256 semantic
 * near-duplicate detection, with refill so a skipped duplicate is replaced by the next-ranked
 * candidate rather than silently shrinking the result count.
 *
 * Supersedes an earlier destructive applyLatent256SemanticDedup() (kept only in git history --
 * zero live callers existed, so no compat shim needed) per review: "remove" encourages a
 * destructive mental model where dedup can only shrink a fixed top-K with no replacement.
 * selectDiverseCandidates always walks a LARGER candidatePoolK and refills until finalK is
 * reached (or the pool is exhausted), so:
 *
 *   dedup may change WHICH candidates survive
 *   but does not silently reduce requested result cardinality (as long as the pool is large
 *   enough -- see the real-world benchmark below for how big that needs to be)
 *
 * Two stages, in order:
 *   Stage A (exact):    candidates sharing a caller-supplied contentHash collapse to the
 *                        best-ranked one. Free, deterministic, no representation needed --
 *                        this is what "duplicate" means before any learned model is involved.
 *   Stage B (semantic):  latent_256 cosine similarity >= threshold, using the SAME greedy
 *                        select-in-rank-order algorithm as before, but now with refill.
 *
 * Governance boundary preserved exactly as before: production rank order is immutable input,
 * this function assigns no score and casts no extra retrieval vote. latent_256 remains
 * canonicalAuthority=false, retrievalVote=false, standaloneTextEmbedding=false.
 */

import { PostgresLatent256CandidateProvider, type Latent256CandidateProviderV1 } from './latent256-candidate-provider.js';
import { EVALUATED_LATENT256_SIMILARITY_THRESHOLD } from './post-process-reranker.js';

export interface RankedCandidate {
  /** codebase_chunk_index.id (uuid), used only by the latent artifact provider. */
  candidateId: string;
  /** Atlas packet identity, if already resolved. Never used as the latent provider key. */
  packetKey?: string;
  sourceRef: string;
  /** Optional: enables Stage A exact-duplicate collapse. Caller-supplied (this module does no
   * extra I/O to fetch it) -- matches the same no-I/O boundary as post-process-reranker.ts. */
  contentHash?: string;
}

export interface SelectDiverseCandidatesInput {
  /** MUST already be in production-rank order (best first). This function never reorders by
   * relevance -- it only selects a subset, in the input order, honoring exact/semantic
   * near-duplicate skips with refill. */
  candidates: readonly RankedCandidate[];
  /** How many final candidates to return. Selection stops as soon as this many are chosen, or
   * the pool is exhausted, whichever comes first. */
  finalK: number;
  /** How much of `candidates` to actually consider. Must be >= finalK for refill to have
   * headroom -- if the pool is too small, near-duplicate skips can still reduce the result
   * below finalK (there is nothing left to refill from; this is the exact failure mode the
   * review diagnosed for a bare top-K-then-prune shape). Defaults to candidates.length. */
  candidatePoolK?: number;
  /** Defaults to EVALUATED_LATENT256_SIMILARITY_THRESHOLD (0.90, evaluation-backed -- NOT
   * promoted to a production default; see that constant's own doc comment). */
  threshold?: number;
  checkpointRevision: string;
  candidateSnapshotRevision: string;
  representationRevision: string;
  provider?: Latent256CandidateProviderV1;
  /** Stage A toggle. Default true -- exact-content-hash collapse is free and should generally
   * run before the learned-representation stage justifies itself against it. */
  collapseExactContentHash?: boolean;
}

export interface SelectDiverseCandidatesResult {
  selected: RankedCandidate[];
  skippedExactDuplicate: Array<RankedCandidate & { duplicateOfPacketKey: string }>;
  skippedSemanticDuplicate: Array<RankedCandidate & { duplicateOfPacketKey: string }>;
  /** True if the pool was exhausted before reaching finalK -- i.e. candidatePoolK was too small
   * relative to how much near-duplication existed in the pool. Signal to widen the pool, not a
   * silent-shrink bug (selected.length is reported honestly, never padded). */
  poolExhaustedBeforeFinalK: boolean;
  poolConsidered: number;
  hydration: {
    requested: number;
    found: number;
    missing: number;
    revisionMismatch: number;
    invalidShape: number;
    receiptChecksum: string;
  };
  thresholdUsed: number;
}

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function selectDiverseCandidates(
  input: SelectDiverseCandidatesInput,
): Promise<SelectDiverseCandidatesResult> {
  const {
    candidates,
    finalK,
    threshold = EVALUATED_LATENT256_SIMILARITY_THRESHOLD,
    checkpointRevision,
    candidateSnapshotRevision,
    representationRevision,
    collapseExactContentHash = true,
  } = input;
  const candidatePoolK = input.candidatePoolK ?? candidates.length;
  if (!Number.isInteger(finalK) || finalK <= 0) throw new Error('LATENT256_FINAL_K_INVALID');
  if (!Number.isInteger(candidatePoolK) || candidatePoolK < finalK) throw new Error('LATENT256_CANDIDATE_POOL_LT_FINAL_K');
  if (!Number.isFinite(threshold) || threshold < -1 || threshold > 1) throw new Error('LATENT256_SIMILARITY_THRESHOLD_INVALID');
  const provider = input.provider ?? new PostgresLatent256CandidateProvider();

  // Pool is already in production-rank order -- never reordered.
  const pool = candidates.slice(0, candidatePoolK);

  // Stage A: exact content-hash collapse (free, no representation needed).
  const skippedExactDuplicate: Array<RankedCandidate & { duplicateOfPacketKey: string }> = [];
  const stageAOutput: RankedCandidate[] = [];
  if (collapseExactContentHash) {
    const seenHash = new Map<string, string>(); // contentHash -> candidateId of the kept candidate
    for (const c of pool) {
      if (!c.contentHash) {
        stageAOutput.push(c);
        continue;
      }
      const keeper = seenHash.get(c.contentHash);
      if (keeper) {
        skippedExactDuplicate.push({ ...c, duplicateOfPacketKey: keeper });
      } else {
        seenHash.set(c.contentHash, c.candidateId);
        stageAOutput.push(c);
      }
    }
  } else {
    stageAOutput.push(...pool);
  }

  // Stage B: semantic near-duplicate skip + refill, greedy in rank order.
  const hydration = await provider.hydrate({
    candidateIds: stageAOutput.map(c => c.candidateId),
    candidateSnapshotRevision,
    representationRevision,
    checkpointRevision,
  });

  const selected: RankedCandidate[] = [];
  const skippedSemanticDuplicate: Array<RankedCandidate & { duplicateOfPacketKey: string }> = [];
  const selectedVectors: Array<{ candidateId: string; vec: readonly number[] }> = [];

  for (const c of stageAOutput) {
    if (selected.length >= finalK) break;
    const vec = hydration.vectors.get(c.candidateId);
    if (!vec) {
      selected.push(c);
      continue;
    }
    const dup = selectedVectors.find(sv => cosineSimilarity(vec, sv.vec) >= threshold);
    if (dup) {
      skippedSemanticDuplicate.push({ ...c, duplicateOfPacketKey: dup.candidateId });
    } else {
      selectedVectors.push({ candidateId: c.candidateId, vec });
      selected.push(c);
    }
  }

  return {
    selected,
    skippedExactDuplicate,
    skippedSemanticDuplicate,
    poolExhaustedBeforeFinalK: selected.length < finalK,
    poolConsidered: pool.length,
    hydration: {
      requested: hydration.requested,
      found: hydration.found,
      missing: hydration.missing,
      revisionMismatch: hydration.revisionMismatch,
      invalidShape: hydration.invalidShape,
      receiptChecksum: hydration.receiptChecksum,
    },
    thresholdUsed: threshold,
  };
}
