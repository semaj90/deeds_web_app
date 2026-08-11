/**
 * ATLAS_TOPOLOGY_POLICY_V1 — Canonical Topology Policy Owner
 *
 * Centralizes topology evaluation and runtime parameters across vector,
 * clustering, and spatial index contracts.
 */

export const ATLAS_TOPOLOGY_POLICY_V1 = {
  version: 'atlas.topology.policy.v1',

  // KMeans policy
  kmeans: {
    evaluated_k_list: [64, 128, 256] as const,
    runtime_k: 128 as const,
    initial_top_c: 8 as const,
  },

  // SOM policy
  som: {
    grid_width: 20 as const,
    grid_height: 20 as const,
    total_cells: 400 as const,
    radius_1_neighbor_count: 8 as const,
    radius_2_neighbor_count: 24 as const,
  },

  // Hilbert curve spatial indexing
  hilbert: {
    prefetch_cap: 8 as const,
    bits_per_dim: 16 as const,
  },

  // Domain-specific independent constants (kept separate despite sharing value 8)
  domain_independent_caps: {
    MAX_POS_TAGS: 8 as const,
    MAX_DOMAIN_LABELS: 8 as const,
    KMEANS_INITIAL_TOP_C: 8 as const,
    HILBERT_PREFETCH_CAP: 8 as const,
  },
} as const;

export type AtlasTopologyPolicyV1 = typeof ATLAS_TOPOLOGY_POLICY_V1;
