/**
 * RetrievalCandidateFeatureMatrixV1 — In-Memory Ephemeral Query Candidate Matrix Builder
 *
 * Ephemeral query candidate projection returning [C, 25] float32 feature matrix and
 * [C, 25] uint8 presence mask.
 * Projects existing canonical features (e.g. FeatureVector5, domain distributions)
 * without recomputing them or persisting a 25-column table.
 */

import { CANDIDATE_FEATURE_NAMES } from '../atlas/contracts/feature-extraction-v1.js';

type OptionalFeatureValue = number | null;

export interface CandidateProjectionInput {
  packet_key: string;
  semantic_similarity_768?: OptionalFeatureValue;
  lexical_score?: OptionalFeatureValue;
  exact_symbol_match?: OptionalFeatureValue;
  ast_signal?: OptionalFeatureValue;
  authority_norm?: OptionalFeatureValue;
  community_fit?: OptionalFeatureValue;
  domain_fit_query?: OptionalFeatureValue;
  concept_fit?: OptionalFeatureValue;
  nary_relation_fit?: OptionalFeatureValue;
  kmeans_centroid_similarity?: OptionalFeatureValue;
  kmeans_cluster_rank?: OptionalFeatureValue;
  som_distance?: OptionalFeatureValue;
  som_neighbor_radius?: OptionalFeatureValue;
  hilbert_locality?: OptionalFeatureValue;
  summary_quality?: OptionalFeatureValue;
  summary_provenance?: OptionalFeatureValue;
  recency?: OptionalFeatureValue;
  retrieval_frequency?: OptionalFeatureValue;
  execution_utility?: OptionalFeatureValue; // Column 18
  graph_distance?: OptionalFeatureValue;
  process_fit?: OptionalFeatureValue;
  dependency_fanout?: OptionalFeatureValue;
  feature_label_confidence?: OptionalFeatureValue;
  source_revision_match?: OptionalFeatureValue;
  representation_revision_match?: OptionalFeatureValue;
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

    const featureValues: Array<number | null | undefined> = [
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
      if (val === undefined || val === null) {
        candidate_features[rowOffset + f] = 0.0;
        presence_mask[rowOffset + f] = 0;
        continue;
      }
      const float32Value = Math.fround(val);
      if (!Number.isFinite(val) || !Number.isFinite(float32Value)) {
        throw new Error(`CANDIDATE_FEATURE_NON_FINITE:${i}:${f}`);
      }
      candidate_features[rowOffset + f] = float32Value;
      presence_mask[rowOffset + f] = 1;
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
