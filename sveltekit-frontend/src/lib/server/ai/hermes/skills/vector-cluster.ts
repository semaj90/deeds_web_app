import type { SkillRecipe } from './registry.js';

export const VECTOR_CLUSTER_SKILLS: Record<string, SkillRecipe> = {
  qdrant_search: {
    id: 'qdrant_search',
    family: 'VectorCluster',
    description: 'Direct semantic search over Qdrant vectors',
    tools: [{ name: 'search:vector' }]
  },
  encoded64_rerank: {
    id: 'encoded64_rerank',
    family: 'VectorCluster',
    description: 'Rerank search results using encoded64 topological projection',
    tools: [{ name: 'search:vector' }, { name: 'gpu:rerank' }]
  },
  cluster_summary_lenses: {
    id: 'cluster_summary_lenses',
    family: 'VectorCluster',
    description: 'Fetch multi-perspective lenses of cluster summaries',
    tools: [{ name: 'topology:summary' }]
  },
  topological_encyclopedia: {
    id: 'topological_encyclopedia',
    family: 'VectorCluster',
    description: 'Browse the codebase via its topological cluster map',
    tools: [{ name: 'search:redis' }]
  },
  did_you_mean_corpus: {
    id: 'did_you_mean_corpus',
    family: 'VectorCluster',
    description: 'Suggest related legal terms or files from the semantic corpus',
    tools: [{ name: 'search:vector' }, { name: 'llm:generate' }]
  },
  centroid_compare: {
    id: 'centroid_compare',
    family: 'VectorCluster',
    description: 'Compare the semantic meaning of two vector centroids',
    tools: [{ name: 'search:redis' }, { name: 'llm:generate' }]
  },
  payload_filter_search: {
    id: 'payload_filter_search',
    family: 'VectorCluster',
    description: 'Search vectors with complex metadata payload filters',
    tools: [{ name: 'search:vector' }]
  },
  cluster_rebalance_check: {
    id: 'cluster_rebalance_check',
    family: 'VectorCluster',
    description: 'Evaluate if large clusters need splitting to maintain retrieval precision',
    tools: [{ name: 'topology:summary' }, { name: 'llm:generate' }]
  },
  vector_drift_analysis: {
    id: 'vector_drift_analysis',
    family: 'VectorCluster',
    description: 'Analyze semantic shift in cluster centroids after recent data ingestion',
    tools: [{ name: 'search:redis' }, { name: 'llm:generate' }]
  },
  identify_outlier_chunks: {
    id: 'identify_outlier_chunks',
    family: 'VectorCluster',
    description: 'Identify data chunks with low similarity to their assigned centroids',
    tools: [{ name: 'search:vector' }]
  },
  semantic_overlap_map: {
    id: 'semantic_overlap_map',
    family: 'VectorCluster',
    description: 'Identify semantically redundant regions between different vector collections',
    tools: [{ name: 'search:hyper' }]
  },
  batch_reindex_collection: {
    id: 'batch_reindex_collection',
    family: 'VectorCluster',
    description: 'Trigger a background re-indexing of an entire Qdrant collection',
    tools: [{ name: 'shell:run' }]
  },
  multi_collection_fusion: {
    id: 'multi_collection_fusion',
    family: 'VectorCluster',
    description: 'Perform parallel search across codebase and legal stores with RRF fusion',
    tools: [{ name: 'search:hyper' }]
  },
  cluster_membership_trace: {
    id: 'cluster_membership_trace',
    family: 'VectorCluster',
    description: 'Trace all cluster assignments for a specific file or document',
    tools: [{ name: 'search:vector' }, { name: 'search:couchdb' }]
  },
  semantic_search_with_boost: {
    id: 'semantic_search_with_boost',
    family: 'VectorCluster',
    description: 'Search vectors with importance boosting for specific metadata fields',
    tools: [{ name: 'search:vector' }]
  },
  cluster_label_regenerator: {
    id: 'cluster_label_regenerator',
    family: 'VectorCluster',
    description: 'Update topological cluster labels based on current membership analysis',
    tools: [{ name: 'topology:summary' }, { name: 'llm:generate' }]
  },
  detect_duplicate_vectors: {
    id: 'detect_duplicate_vectors',
    family: 'VectorCluster',
    description: 'Find and flag near-identical vectors to prune redundancy',
    tools: [{ name: 'search:vector' }]
  }
};
