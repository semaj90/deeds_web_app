import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { createSearchRuntime, type SearchResult } from '$lib/server/retrieval/search-runtime.js';
import { bifrostChat, VLM_MODELS } from '$lib/server/ollama.js';

/**
 * Legacy HyperRAG compatibility wrapper.
 *
 * This route keeps the historical /api/rag/hyperrag surface alive for callers
 * that still expect the older packet envelope, but the actual retrieval engine
 * is the canonical search runtime.
 */
const bodySchema = z.object({
  query: z.string().min(2).max(2000),
  limit: z.number().int().min(1).max(25).default(10),
  lanes: z.array(z.enum(['semantic', 'kag', 'wide'])).optional().default(['semantic', 'kag', 'wide']),
});

function minifySummary(value: unknown) {
  return typeof value === 'string' ? value.slice(0, 300) : '';
}

function toLegacyPacketResult(packet: SearchResult['packets'][number]) {
  const enriched = packet as Record<string, unknown>;
  const id = String(
    enriched.packet_key ??
      enriched.chunk_id ??
      enriched.source_ref ??
      enriched.id ??
      'unknown',
  );

  return {
    id,
    score: Number(enriched.cross_encoder_score ?? enriched.blended_score ?? enriched.retrieval_score ?? 0),
    lanes: Array.isArray(enriched.retrieval_sources)
      ? enriched.retrieval_sources.map((lane) => String(lane))
      : [String(enriched.retrieval_source ?? 'canonical')],
    prefilterHit: false,
    filePath:
      (enriched.filePath ?? enriched.relativePath ?? enriched.source_ref ?? enriched.sourcePath ?? null) as
        | string
        | null,
    dir: (enriched.dir ?? enriched.directoryPath ?? null) as string | null,
    summary: minifySummary(enriched.summary ?? enriched.content ?? ''),
    wikiNote: null,
    pageRank: (enriched.page_rank_score ?? enriched.pageRank ?? enriched.authority_score ?? null) as
      | number
      | null,
    gpuCluster: (enriched.gpu_cluster ?? enriched.som_cluster ?? null) as number | string | null,
    topoClass: (enriched.topoClass ?? enriched.domain ?? null) as string | null,
  };
}

async function synthesizeSummary(packet: Record<string, unknown>) {
  try {
    const response = await bifrostChat(
      [
        {
          role: 'system',
          content: 'Summarize retrieval results in 3 bullets and 1 next action. Keep it terse.',
        },
        { role: 'user', content: JSON.stringify(packet) },
      ],
      VLM_MODELS.legal,
    );
    return response || null;
  } catch {
    return null;
  }
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!parsed.success) {
    return json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const { query, limit, lanes } = parsed.data;
  const runtime = createSearchRuntime({ userId: locals.user.id });

  try {
    const result = await runtime.search({
      text: query,
      topK: limit,
    });

    const packetResults = result.packets.map(toLegacyPacketResult);
    const packet = {
      query,
      lanes,
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
      turbovecCandidates: packetResults.slice(0, Math.min(packetResults.length, limit * 5)).map((row) => row.id),
      results: packetResults,
    };

    const bitfrostSummary = await synthesizeSummary(packet as Record<string, unknown>);

    return json({
      ok: true,
      packet,
      bitfrostSummary,
      timing: {
        totalMs: result.metadata.durationMs,
      },
      stats: {
        totalResults: packetResults.length,
        wikiHits: 0,
        cluster: packet.cluster?.id ?? null,
        turboVec: false,
      },
    });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
};
