/**
 * packet.search tool: Find bounded NES/CHR97/ACE packets by query.
 * Returns only: packet_id, summary, feature_id, score.
 * Never loads raw JSON or embeddings into response.
 */

import { registerTool, type ToolResult } from '../tool-registry';
import { qdrant } from '$lib/server/vector/qdrant-manager';

registerTool('packet.search', async (args): Promise<ToolResult> => {
  try {
    const query = String(args.query || '');
    const featureId = args.feature_id ? String(args.feature_id) : undefined;
    const limit = Math.min(Number(args.limit ?? 8), 32); // Cap at 32

    if (!query) {
      return {
        ok: false,
        error: 'query is required',
      };
    }

    // In production: call generateEmbedding(query) then qdrant.search()
    // For now: placeholder that shows the contract
    const packets = [
      {
        packet_id: 'ace:packet:sample-1',
        summary: 'Example packet (placeholder)',
        feature_id: featureId || 'unknown',
        score: 0.85,
        retrieved_at: new Date().toISOString(),
      },
    ];

    // Filter by feature_id if provided
    const filtered = featureId ? packets.filter((p) => p.feature_id === featureId) : packets;

    return {
      ok: true,
      data: {
        query,
        limit,
        count: filtered.length,
        packets: filtered.slice(0, limit),
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err.message,
    };
  }
});
