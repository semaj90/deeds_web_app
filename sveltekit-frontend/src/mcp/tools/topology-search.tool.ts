import { z } from 'zod';

export const topologySearchTool = {
  name: 'topology_search',
  description: 'Search the 4D topology-indexed codebase (cosine prefilter → manifold4 Euclidean rerank). Returns hits with hybridScore, topoClass, somCluster, graphAuthorityScore, and summary. Requires topology-search-server on port 8101.',
  parameters: z.object({
    query: z.string().describe('Natural-language search query'),
    radius: z.number().min(0.05).max(2.0).default(0.25).optional().describe('Manifold4 Euclidean radius'),
    limit: z.number().int().min(1).max(40).default(15).optional().describe('Max hits to return'),
    somCluster: z.number().int().optional().describe('Filter to this SOM cluster'),
  }),
  execute: async (args: { query: string; radius?: number; limit?: number; somCluster?: number }) => {
    const { queryTopology } = await import('$lib/server/retrieval/topology-search-client.js');
    const result = await queryTopology(args.query, {
      radius: args.radius ?? 0.25,
      limit: args.limit ?? 15,
      somCluster: args.somCluster,
    });
    if (!result) return JSON.stringify({ error: 'Topology search engine unavailable. Run: npm run topology:search:ensure', hint: 'port 8101' });
    return JSON.stringify({
      query: args.query,
      center: result.center,
      radius: result.radius,
      totalFound: result.totalFound,
      durationMs: result.durationMs,
      hits: result.hits.map(h => ({
        path: h.path,
        topoClass: h.topoClass,
        topoHex: h.topoHex,
        somCluster: h.somCluster,
        hybridScore: h.hybridScore ?? h.manifoldScore,
        cosineScore: h.cosineScore ?? null,
        graphAuthorityScore: h.graphAuthorityScore ?? null,
        summary: h.summary ?? h.contentPreview ?? '',
      })),
    });
  },
} as const;
