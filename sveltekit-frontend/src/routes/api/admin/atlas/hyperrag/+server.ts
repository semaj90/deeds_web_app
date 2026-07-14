import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';
import { hyperragPacketRpc } from '$lib/server/retrieval/hyperrag-packet-rpc.js';

/**
 * Legacy HyperRAG compatibility wrapper.
 *
 * The route keeps the old admin surface alive, but retrieval and fusion now
 * come from the canonical packet RPC / SearchRuntime spine.
 */
const hyperragBodySchema = z.object({
  query: z.string().min(1, 'query is required').max(500),
  topK: z.number().int().min(1).max(100).optional().default(10),
  topClusters: z.number().int().min(1).max(50).optional().default(5),
  noInference: z.boolean().optional().default(false)
});

function toLegacyPacketResult(packet: Record<string, unknown>) {
  return {
    id: String(packet.packet_key ?? packet.packetKey ?? packet.source_ref ?? packet.sourceRef ?? packet.id ?? 'unknown'),
    score: Number(packet.fusion_score ?? packet.cross_encoder_score ?? packet.blended_score ?? packet.retrieval_score ?? 0),
    lanes: Array.isArray(packet.fusion_sources)
      ? packet.fusion_sources.map((lane) => String(lane))
      : Array.isArray(packet.retrieval_sources)
        ? packet.retrieval_sources.map((lane) => String(lane))
        : ['canonical'],
    prefilterHit: false,
    filePath: (packet.source_ref ?? packet.sourceRef ?? packet.source_path ?? packet.file_path ?? null) as string | null,
    dir: (packet.directory_path ?? packet.dir ?? null) as string | null,
    summary: typeof packet.gemma4_summary === 'string' ? packet.gemma4_summary.slice(0, 300) : '',
    wikiNote: null,
    pageRank: (packet.page_rank ?? packet.pageRank ?? packet.authority_score ?? null) as number | null,
    gpuCluster: (packet.som_cluster ?? packet.kmeans_cluster ?? null) as number | string | null,
    topoClass: (packet.ontology_label ?? packet.domain_class ?? packet.domainClass ?? null) as string | null,
  };
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let parsed;
  try {
    parsed = hyperragBodySchema.safeParse(await request.json());
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!parsed.success) {
    return json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const { query, topK, topClusters, noInference } = parsed.data;
  const result = await hyperragPacketRpc({
    query,
    limit: topK,
    includeGraph: topClusters > 0,
    useFts: true,
  });

  const packetResults = result.packets.map((packet) => toLegacyPacketResult(packet as Record<string, unknown>));

  return json({
    ok: true,
    packet: {
      query,
      lanes: ['semantic', 'kag', 'wide'],
      ts: new Date().toISOString(),
      cluster: packetResults.length
        ? {
            id: packetResults[0].gpuCluster ?? null,
            sim: packetResults[0].pageRank ?? null,
            topoLabel: packetResults[0].topoClass ?? null,
            somRow: null,
            somCol: null,
          }
        : null,
      turbovecPrefilter: false,
      turbovecCandidates: packetResults.slice(0, Math.min(packetResults.length, topK * 5)).map((row) => row.id),
      results: packetResults,
    },
    bitfrostSummary: noInference ? null : null,
    timing: {
      totalMs: result.trace.latency_ms,
    },
    stats: {
      totalResults: packetResults.length,
      wikiHits: 0,
      cluster: packetResults[0]?.gpuCluster ?? null,
      turboVec: false,
    },
  });
};
