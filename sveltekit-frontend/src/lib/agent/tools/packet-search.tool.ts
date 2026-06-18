/**
 * packet.search tool
 *
 * Bounded packet search over the codebase HyperRAG packet RPC.
 * Returns compact ACE-ready packet hits only.
 */

import { registerTool, type ToolResult } from '../tool-registry';
import { hyperragPacketRpc } from '$lib/server/retrieval/hyperrag-packet-rpc';

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

    const searchResult = await hyperragPacketRpc({
      query,
      limit,
      includeGraph: true,
      useFts: true,
      recordTelemetry: true,
      awaitTelemetry: false,
    });

    const packets = (searchResult.packets ?? [])
      .filter((packet) => !featureId || packet.feature_id === featureId)
      .map((packet) => {
      const score = Number(packet.fusion_score ?? 0);
      return {
        packet_key: packet.packet_key,
        packet_type: packet.packet_type,
        source_ref: packet.source_ref,
        canonical_source_ref: packet.canonical_source_ref,
        feature_id: packet.feature_id,
        feature_label: packet.feature_label,
        score,
        reason: [
          packet.retrieval_lanes.dense > 0 ? 'dense' : null,
          packet.retrieval_lanes.fts > 0 ? 'fts' : null,
          packet.retrieval_lanes.trigram > 0 ? 'trigram' : null,
          packet.retrieval_lanes.jsonb > 0 ? 'jsonb' : null,
          packet.neo4j_neighbors.length > 0 ? 'neo4j' : null,
        ].filter(Boolean).join('+') || 'hyperrag-fusion',
        recommended_action: packet.recommended_action,
        verification_command: packet.verification_command,
        retrieval_strategy: searchResult.trace.retrieval_strategy,
        rank: packet.rank,
        summary: packet.gemma4_summary,
        qdrant_tags: packet.qdrant_tags,
        neo4j_neighbors: packet.neo4j_neighbors,
        fusion_sources: packet.fusion_sources,
        retrieval_lanes: packet.retrieval_lanes,
      };
    });

    return {
      ok: true,
      data: {
        query,
        feature_id: featureId || null,
        strategy: searchResult.strategy,
        limit,
        count: packets.length,
        packets,
        trace: searchResult.trace,
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || String(err),
    };
  }
});
