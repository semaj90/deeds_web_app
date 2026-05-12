/**
 * Hermes GPU / Acceleration Skills
 * 
 * Recipes for high-performance GPU-bound tasks.
 */

import type { SkillRecipe } from './registry.js';

export const GPU_ACCELERATION_SKILLS: Record<string, SkillRecipe> = {
  'embedding_batch': {
    id: 'embedding_batch',
    family: 'GPU / Acceleration',
    description: 'Bulk generate embeddings using the GPU bridge',
    tools: [
      {
        name: 'batch:run',
        args: (input) => ({
          tool: 'gpu:embed',
          items: input.items,
          concurrency: 16
        })
      }
    ]
  },
  'encoded64_project': {
    id: 'encoded64_project',
    family: 'GPU / Acceleration',
    description: 'Project 768d vectors to 64d latent space using autoencoder',
    tools: [
      {
        name: 'shell:run',
        args: () => ({
          command: 'npm run autoencoder:project'
        })
      }
    ]
  },
  'rerank_batch': {
    id: 'rerank_batch',
    family: 'GPU / Acceleration',
    description: 'Rerank search results using flash-attention GPU kernels',
    tools: [
      {
        name: 'gpu:rerank',
        args: (input) => ({
          hits: input.hits,
          query: input.query
        })
      }
    ]
  },
  'graph_layout': {
    id: 'graph_layout',
    family: 'GPU / Acceleration',
    description: 'Compute force-directed graph layout on GPU',
    tools: [
      {
        name: 'shell:run',
        args: () => ({
          command: 'npm run graph:layout:gpu'
        })
      }
    ]
  },

  'attention_rank_files': {
    id: 'attention_rank_files',
    family: 'GPU / Acceleration',
    description: 'Qdrant ANN search re-ranked by Karpathy GPU authority blend',
    parallel: false,
    tools: [
      {
        name: 'gpu:attention_rank',
        args: (input) => ({ query: input.query, limit: input.limit ?? 10 })
      }
    ]
  },

  'som_topology_stats': {
    id: 'som_topology_stats',
    family: 'GPU / Acceleration',
    description: 'Read SOM grid dimensions, centroid count, and cluster size distribution from Redis',
    parallel: false,
    tools: [
      {
        name: 'gpu:som_topology',
        args: () => ({})
      }
    ]
  },

  'language_distribution': {
    id: 'language_distribution',
    family: 'GPU / Acceleration',
    description: 'Language tag distribution across Qdrant-tagged codebase clusters',
    parallel: false,
    tools: [
      {
        name: 'gpu:language_distribution',
        args: () => ({})
      }
    ]
  }
};
