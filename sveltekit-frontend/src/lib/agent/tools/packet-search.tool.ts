/**
 * packet.search tool
 *
 * Bounded packet search over the codebase Qdrant collection.
 * Returns compact packet summaries only.
 */

import { registerTool, type ToolResult } from '../tool-registry';
import { embedText } from '$lib/server/embedding/embed';
import { QdrantManager } from '$lib/server/vector/qdrant-manager';

function clampLimit(limit: unknown): number {
  const value = Number(limit ?? 8);
  if (!Number.isFinite(value)) return 8;
  return Math.min(32, Math.max(1, Math.floor(value)));
}

registerTool('packet.search', async (args): Promise<ToolResult> => {
  try {
    const query = String(args.query ?? '').trim();
    const featureId = args.feature_id ? String(args.feature_id).trim() : '';
    const limit = clampLimit(args.limit);

    if (!query) {
      return {
        ok: false,
        error: 'query is required',
      };
    }

    const queryEmbedding = await embedText(query);
    const qdrant = new QdrantManager();
    const filters = featureId ? { feature_id: featureId } : undefined;

    const searchResult = await qdrant.hybridSearch({
      query,
      queryEmbedding,
      collection: 'codebase_chunks',
      filters,
      limit,
      scoreThreshold: 0.01,
    });

    const packets = (searchResult.results ?? []).map((hit) => {
      const payload = (hit.payload ?? {}) as Record<string, unknown>;
      return {
        packet_id: String(hit.id),
        score: hit.score,
        feature_id:
          (payload.feature_id ?? payload.featureId ?? featureId ?? null) as string | null,
        source_ref:
          (payload.source_ref ?? payload.sourceRef ?? payload.file_path ?? payload.path ?? null) as
            | string
            | null,
        file_path: (payload.file_path ?? payload.path ?? null) as string | null,
        summary:
          (payload.summary ?? payload.title ?? payload.content ?? payload.text ?? '') as string,
        cluster_id: (payload.cluster_id ?? payload.clusterId ?? null) as string | number | null,
        semantic_path: (payload.semantic_path ?? null) as string | null,
      };
    });

    return {
      ok: true,
      data: {
        query,
        feature_id: featureId || null,
        collection: 'codebase_chunks',
        limit,
        count: packets.length,
        packets,
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || String(err),
    };
  }
});

