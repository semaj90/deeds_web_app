/**
 * Retrieval Candidate — Dense Lane Provenance Preserved
 *
 * Critical: A candidate retrieved from qdrant_384 lane must remain distinguishable
 * from the same packetKey retrieved from qdrant_768 lane through merge, ranking,
 * and XGBoost feature extraction. This shape preserves explicit lane information
 * so the candidate doesn't collapse during merge.
 */

import { z } from 'zod';
import { DenseRepresentationName, DenseRole, DenseLifecycle } from './dense-lane-policy';

/**
 * Where did this candidate score come from?
 * Critical: This enum is NOT the same as dense representation name.
 * A candidate with scoreSource='qdrant_384' may carry rawScores.dense768
 * if the same packet appeared in both lanes and was merged.
 */
export enum RetrievalScoreSource {
  QDRANT_384 = 'qdrant_384',                    // From Qdrant semantic_384 collection
  QDRANT_768 = 'qdrant_768',                    // From Qdrant semantic_768 collection
  BM25 = 'bm25',                                // BM25 lexical score
  BM42 = 'bm42',                                // Future: BM42 with semantic re-scoring
  POSTGRES_LEXICAL = 'postgres_lexical',        // PostgreSQL FTS or trigram match
  NEO4J_GRAPH = 'neo4j_graph',                  // Neo4j traversal hit
  REDIS_CENTROID = 'redis_centroid',            // Redis semantic centroid cache
  LATE_INTERACTION_RERANKER = 'late_interaction_reranker',  // Cross-encoder rerank
}

export interface EmbeddingLineage {
  lane: DenseRepresentationName;          // semantic_768, semantic_384, or latent_64
  role: DenseRole;                        // What this vector is for
  nativeDimension: number;                // 768, 384, or 64 (the true dimensionality)
  producerVersion: string;                // embeddinggemma:latest, autoencoder_v2, etc.
  normalized: boolean;                    // Was this vector L2-normalized?
  projection?: {
    sourceDimension: number;              // If projected: original dimension (e.g., 768)
    method: string;                       // How it was projected (linear_projection, pca, etc.)
    version: string;                      // Projection version (align_768_384_v2)
  };
}

export interface RetrievalCandidateRawScores {
  dense384?: number;                      // Cosine similarity from semantic_384 collection
  dense768?: number;                      // Cosine similarity from semantic_768 collection
  bm25?: number;                          // BM25 score (normalized 0-1)
  bm42?: number;                          // Future BM42 score
  graph?: number;                         // Neo4j traversal score
  centroid?: number;                      // Redis centroid similarity
  lateInteraction?: number;               // Cross-encoder reranker score
}

export interface RetrievalCandidateProvenance {
  scoreSource: RetrievalScoreSource;      // Where this candidate appearance came from
  rank: number;                           // Rank within its lane (0-indexed)
  score: number;                          // The primary score for this appearance
  timestamp: ISO8601;                     // When this was retrieved
  laneId: string;                         // Trace: which lane/query produced this
}

export interface RetrievalCandidate {
  // Identity (immutable across all lanes and stores)
  packetKey: string;                      // ace:packet:${workspaceId}:${hash}
  sourceRef: string;                      // src/lib/server/auth.ts (normalized POSIX)
  contentHash?: string;                   // sha256(content) for versioning

  // Semantic metadata
  featureId?: string;                     // auth.sessions
  featureLabel?: string;                  // Authentication Sessions
  summary?: string;                       // Brief description

  // Dense vector provenance — THE KEY FIX
  embeddingLineage: EmbeddingLineage;     // What vector is this and why
  rawScores: RetrievalCandidateRawScores; // All lane scores for this packet

  // Provenance chain — may have multiple occurrences
  provenances: RetrievalCandidateProvenance[];  // One per lane hit (qdrant_384, qdrant_768, etc.)

  // Fusion state (computed during RRF merge)
  rrfScore?: number;                      // Merged rank-fusion score
  rrfRanks?: Record<RetrievalScoreSource, number>;  // Final rank from each lane
  observedLanes: RetrievalScoreSource[];  // Which lanes returned this packet

  // Context (for ACE assembly)
  workspace?: string;
  ontologyVersion?: number;
  confidence?: number;                    // Aggregated confidence (if available)
}

export const retrievalCandidateSchema = z.object({
  packetKey: z.string(),
  sourceRef: z.string(),
  contentHash: z.string().optional(),
  featureId: z.string().optional(),
  featureLabel: z.string().optional(),
  summary: z.string().optional(),
  embeddingLineage: z.object({
    lane: z.nativeEnum(DenseRepresentationName),
    role: z.nativeEnum(DenseRole),
    nativeDimension: z.number().int(),
    producerVersion: z.string(),
    normalized: z.boolean(),
    projection: z.object({
      sourceDimension: z.number().int(),
      method: z.string(),
      version: z.string(),
    }).optional(),
  }),
  rawScores: z.object({
    dense384: z.number().optional(),
    dense768: z.number().optional(),
    bm25: z.number().optional(),
    bm42: z.number().optional(),
    graph: z.number().optional(),
    centroid: z.number().optional(),
    lateInteraction: z.number().optional(),
  }),
  provenances: z.array(z.object({
    scoreSource: z.nativeEnum(RetrievalScoreSource),
    rank: z.number().int(),
    score: z.number(),
    timestamp: z.string(),
    laneId: z.string(),
  })),
  rrfScore: z.number().optional(),
  rrfRanks: z.record(z.nativeEnum(RetrievalScoreSource), z.number()).optional(),
  observedLanes: z.array(z.nativeEnum(RetrievalScoreSource)),
  workspace: z.string().optional(),
  ontologyVersion: z.number().optional(),
  confidence: z.number().optional(),
});

/**
 * Candidate merge rule: Same packetKey from different lanes
 * MUST preserve all rawScores and merge provenances without overwriting.
 */
export function mergeDenseCandidate(
  existing: RetrievalCandidate,
  incoming: RetrievalCandidate
): RetrievalCandidate {
  if (existing.packetKey !== incoming.packetKey) {
    throw new Error(
      `Cannot merge candidates with different packetKeys: ${existing.packetKey} vs ${incoming.packetKey}`
    );
  }

  // Merge rawScores: both dense384 and dense768 survive
  const mergedRawScores: RetrievalCandidateRawScores = {
    ...existing.rawScores,
    ...incoming.rawScores,
  };

  // Merge provenances: accumulate all lane hits
  const mergedProvenances = [
    ...existing.provenances,
    ...incoming.provenances,
  ];

  // Merge observedLanes (unique)
  const observedSet = new Set([
    ...existing.observedLanes,
    ...incoming.observedLanes,
  ]);

  return {
    packetKey: existing.packetKey,
    sourceRef: existing.sourceRef,
    contentHash: existing.contentHash ?? incoming.contentHash,
    featureId: existing.featureId ?? incoming.featureId,
    featureLabel: existing.featureLabel ?? incoming.featureLabel,
    summary: existing.summary ?? incoming.summary,
    embeddingLineage: existing.embeddingLineage,  // Keep existing lineage (primary lane)
    rawScores: mergedRawScores,
    provenances: mergedProvenances,
    observedLanes: Array.from(observedSet),
    workspace: existing.workspace ?? incoming.workspace,
    ontologyVersion: existing.ontologyVersion ?? incoming.ontologyVersion,
    confidence: existing.confidence ?? incoming.confidence,
  };
}

/**
 * Runtime telemetry: Track lane overlap and uniqueness
 */
export interface RetrievalRuntimeSummary {
  candidateCounts: Record<RetrievalScoreSource, number>;  // Hits per lane
  uniquePacketsAfterMerge: number;                         // Deduplicated count
  laneOverlap: {
    dense384AndDense768: number;        // Same packet in both Qdrant lanes
    dense384Only: number;
    dense768Only: number;
    otherLaneOnly: number;
  };
  scoreDistribution: Record<RetrievalScoreSource, {
    mean: number;
    stddev: number;
    min: number;
    max: number;
  }>;
}
