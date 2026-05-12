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
  }
};
