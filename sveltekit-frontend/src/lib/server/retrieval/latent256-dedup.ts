/**
 * applyLatent256SemanticDedup — standalone combinator for LATENT256_SEMANTIC_DEDUP.
 *
 * Deliberately NOT wired into unified-orchestrator.ts or any other live scoring path (per the
 * 2026-08-29 finding: postProcessCandidates itself has zero live callers repo-wide, and wiring
 * this into the orchestrator resolves to a much bigger decision -- either activating the entire
 * dormant candidate-scorer.ts -> post-process-reranker.ts pipeline for the first time, or
 * building a second competing scoring mechanism. Neither has been decided.
 *
 * This function is the deliberately-separate call site: any future caller (a new route, a
 * script, or unified-orchestrator.ts itself if that larger decision is later made) can call
 * this directly to get diversity-pruned results, without depending on candidate-scorer.ts's
 * ScoredCandidate/blendedScore machinery at all.
 *
 * Real-world benchmark (docs/reports/latent256-dedup-realworld-benchmark-v1.json, 10 realistic
 * queries against real top-50 pgvector retrieval): avg 15.5% of candidates removed per query,
 * but avg unique-source coverage DECREASED 4.1% -- this prunes true near-duplicate content, which
 * sometimes spans multiple distinct source files. That is a real tradeoff, not a pure win --
 * evaluate whether it fits a given use case before enabling it there.
 */

import { PostgresLatent256CandidateProvider, type Latent256CandidateProviderV1 } from './latent256-candidate-provider.js';
import { EVALUATED_LATENT256_SIMILARITY_THRESHOLD } from './post-process-reranker.js';

export interface Latent256DedupCandidate {
  /** codebase_chunk_index.id (uuid) -- see latent256-candidate-provider.ts's identity-scope note. */
  packetKey: string;
  sourceRef: string;
  /** Relevance score from whatever upstream retrieval produced this candidate (e.g. cosine
   * similarity, RRF score) -- higher is better. Determines dedup precedence: a lower-scoring
   * near-duplicate of a higher-scoring candidate is the one removed. */
  relevanceScore: number;
}

export interface Latent256DedupResult {
  survivors: Latent256DedupCandidate[];
  removed: Array<Latent256DedupCandidate & { duplicateOfPacketKey: string | null }>;
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

export interface Latent256DedupOptions {
  /** Defaults to EVALUATED_LATENT256_SIMILARITY_THRESHOLD (0.90, evaluation-backed -- see
   * docs/reports/latent256-dedup-threshold-evaluation-v1.json). */
  threshold?: number;
  /** Defaults to the checkpoint revision the current latent_256 corpus was backfilled with. */
  checkpointRevision?: string;
  candidateSnapshotRevision?: string;
  representationRevision?: string;
  provider?: Latent256CandidateProviderV1;
}

/** Must match the checkpoint_revision stamped by python/backfill_latent_256.py's current run --
 * see models/nested-semantic-autoencoder/ae_meta.json. */
const DEFAULT_CHECKPOINT_REVISION = 'd6e9395e60f0bb039dd03368012697c5c393d36bb001b8f020b6d7ba22654259';

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

/**
 * Prunes near-duplicate candidates by latent_256 similarity. Candidates without a hydrated
 * latent_256 vector always survive (fail-open, per canonicalAuthority:false).
 *
 * Deterministic: input candidates are sorted by relevanceScore descending, packetKey ascending
 * (tie-break) before pruning, so a rerun on the same input always produces the same result.
 */
export async function applyLatent256SemanticDedup(
  candidates: readonly Latent256DedupCandidate[],
  options: Latent256DedupOptions = {},
): Promise<Latent256DedupResult> {
  const threshold = options.threshold ?? EVALUATED_LATENT256_SIMILARITY_THRESHOLD;
  const checkpointRevision = options.checkpointRevision ?? DEFAULT_CHECKPOINT_REVISION;
  const provider = options.provider ?? new PostgresLatent256CandidateProvider();

  const sorted = [...candidates].sort(
    (a, b) => b.relevanceScore - a.relevanceScore || a.packetKey.localeCompare(b.packetKey),
  );

  const hydration = await provider.hydrate({
    packetKeys: sorted.map(c => c.packetKey),
    candidateSnapshotRevision: options.candidateSnapshotRevision ?? 'latent256-dedup-adhoc',
    representationRevision: options.representationRevision ?? 'latent_256',
    checkpointRevision,
  });

  const survivors: Latent256DedupCandidate[] = [];
  const removed: Array<Latent256DedupCandidate & { duplicateOfPacketKey: string | null }> = [];
  const keptVectors: Array<{ packetKey: string; vec: readonly number[] }> = [];

  for (const c of sorted) {
    const vec = hydration.vectors.get(c.packetKey);
    if (!vec) {
      survivors.push(c);
      continue;
    }
    const dup = keptVectors.find(kv => cosineSimilarity(vec, kv.vec) >= threshold);
    if (dup) {
      removed.push({ ...c, duplicateOfPacketKey: dup.packetKey });
    } else {
      keptVectors.push({ packetKey: c.packetKey, vec });
      survivors.push(c);
    }
  }

  return {
    survivors,
    removed,
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
