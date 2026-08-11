/**
 * RetrievalCandidateFeatureMatrixV1 — In-Memory Ephemeral Query Candidate Matrix Builder
 *
 * Ephemeral query candidate projection returning [C, 25] float32 feature matrix and
 * [C, 25] uint8 presence mask.
 * Projects existing canonical features (e.g. FeatureVector5, domain distributions)
 * without recomputing them or persisting a 25-column table.
 */

import { CANDIDATE_FEATURE_NAMES } from '../atlas/contracts/feature-extraction-v1.js';

export interface CandidateProjectionInput {
  packet_key: string;
  semantic_similarity_768?: number;
  lexical_score?: number;
  exact_symbol_match?: number;
  ast_signal?: number;
  authority_norm?: number;
  community_fit?: number;
  domain_fit_query?: number;
  concept_fit?: number;
  nary_relation_fit?: number;
  kmeans_centroid_similarity?: number;
  kmeans_cluster_rank?: number;
  som_distance?: number;
  som_neighbor_radius?: number;
  hilbert_locality?: number;
  summary_quality?: number;
  summary_provenance?: number;
  recency?: number;
  retrieval_frequency?: number;
  execution_utility?: number; // Column 18
  graph_distance?: number;
  process_fit?: number;
  dependency_fanout?: number;
  feature_label_confidence?: number;
  source_revision_match?: number;
  representation_revision_match?: number;
}

export interface RetrievalCandidateFeatureMatrixV1 {
  candidate_packet_keys: string[];
  candidate_features: Float32Array; // [C, 25]
  presence_mask: Uint8Array;       // [C, 25]
  candidate_count: number;
  feature_count: number;
}

export function buildCandidateFeatureMatrix(
  candidates: CandidateProjectionInput[]
): RetrievalCandidateFeatureMatrixV1 {
  const C = candidates.length;
  const F = 25;

  const candidate_features = new Float32Array(C * F);
  const presence_mask = new Uint8Array(C * F);
  const candidate_packet_keys: string[] = [];

  for (let i = 0; i < C; i++) {
    const c = candidates[i];
    candidate_packet_keys.push(c.packet_key);
    const rowOffset = i * F;

    const featureValues: Array<number | undefined> = [
      c.semantic_similarity_768,
      c.lexical_score,
      c.exact_symbol_match,
      c.ast_signal,
      c.authority_norm,
      c.community_fit,
      c.domain_fit_query,
      c.concept_fit,
      c.nary_relation_fit,
      c.kmeans_centroid_similarity,
      c.kmeans_cluster_rank,
      c.som_distance,
      c.som_neighbor_radius,
      c.hilbert_locality,
      c.summary_quality,
      c.summary_provenance,
      c.recency,
      c.retrieval_frequency,
      c.execution_utility, // Index 18
      c.graph_distance,
      c.process_fit,
      c.dependency_fanout,
      c.feature_label_confidence,
      c.source_revision_match,
      c.representation_revision_match,
    ];

    for (let f = 0; f < F; f++) {
      const val = featureValues[f];
      if (val !== undefined && val !== null && !Number.isNaN(val)) {
        candidate_features[rowOffset + f] = val;
        presence_mask[rowOffset + f] = 1;
      } else {
        candidate_features[rowOffset + f] = 0.0;
        presence_mask[rowOffset + f] = 0; // Explicit presence mask 0 for missing features (e.g. execution_utility)
      }
    }
  }

  return {
    candidate_packet_keys,
    candidate_features,
    presence_mask,
    candidate_count: C,
    feature_count: F,
  };
}
