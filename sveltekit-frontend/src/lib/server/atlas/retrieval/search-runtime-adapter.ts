import { SearchRuntime, type SearchQuery, type SearchResult } from '$lib/server/retrieval/search-runtime.js';
import { graphRetrieve, type GraphCandidate } from './graph-retriever.js';

export interface AtlasSearchRequest {
  query: string;
  topK?: number;
  userId?: string;
  caseId?: string;
  filters?: Record<string, unknown>;
  traceId?: string;
  /** Enable bounded graph expansion after fusion. Default false. */
  withGraphExpansion?: boolean;
}

export interface AtlasSearchResponse {
  packets: SearchResult['packets'];
  topPacketKeys: string[];
  metadata: SearchResult['metadata'];
  provenance: SearchResult['provenance'];
  /** Graph candidates seeded from topPacketKeys. Only populated when withGraphExpansion=true. */
  graphExpanded?: GraphCandidate[];
}

export function createAtlasSearchAdapter(config?: { userId?: string; caseId?: string }) {
  const runtime = new SearchRuntime(config ?? {});
  return {
    async search(req: AtlasSearchRequest): Promise<AtlasSearchResponse> {
      const query: SearchQuery = {
        text: req.query,
        topK: req.topK ?? 20,
        userId: req.userId ?? config?.userId,
        caseId: req.caseId ?? config?.caseId,
        filters: req.filters,
        spanContext: req.traceId ? { traceId: req.traceId } : undefined,
      };
      const result = await runtime.search(query);

      const topPacketKeys = result.packets
        .map(p => (p as Record<string, unknown>).packet_key ?? (p as Record<string, unknown>).chunk_id ?? '')
        .filter((k): k is string => typeof k === 'string' && k.length > 0)
        .slice(0, 5);

      let graphExpanded: GraphCandidate[] | undefined;
      if (req.withGraphExpansion && topPacketKeys.length > 0) {
        try {
          graphExpanded = await graphRetrieve({
            seedPacketKeys: topPacketKeys,
            allowedRelationships: ['IMPORTS', 'CALLS', 'SIMILAR_TOPOLOGY', 'USES_CONCEPT'],
            maxDepth: 1,
            maxCandidates: 20,
          });
          // Remove seeds that already appear in main result to avoid duplicates
          const existingKeys = new Set(topPacketKeys);
          graphExpanded = graphExpanded.filter(g => !existingKeys.has(g.packetKey));
        } catch {
          // Graph expansion is best-effort; never degrades the main result
          graphExpanded = [];
        }
      }

      return {
        packets: result.packets,
        topPacketKeys,
        metadata: result.metadata,
        provenance: result.provenance,
        ...(graphExpanded !== undefined ? { graphExpanded } : {}),
      };
    },
  };
}
