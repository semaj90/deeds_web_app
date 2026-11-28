import { randomUUID } from 'node:crypto';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { pool } from '$lib/server/db/client.js';
import { createSearchRuntime, type SearchResult } from '$lib/server/retrieval/search-runtime.js';
import { resolveTrustedWorkspaceAuthorityV1 } from '$lib/server/retrieval/trusted-workspace-authority-v1.js';
import { PostgresActorWorkspaceGrantProviderV1 } from '$lib/server/atlas/authorization/postgres-actor-workspace-grant-provider-v1.js';
import { createVerifiedContextPostgresAuthorizerV1 } from '$lib/server/atlas/authorization/verified-context-postgres-authorizer-v1.js';
import type { VerifiedContextWorkspaceScopeV1 } from '$lib/server/atlas/execution/verified-context-service-v1.js';
import { buildBitFrostProceduralDescriptorV1 } from '$lib/server/atlas/cache/bitfrost-token-fsm-v1.js';
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
  workspaceId: z.string().uuid().optional(),
  requireActorGrant: z.boolean().optional(),
  bitfrost: z
    .object({
      modelName: z.string().trim().min(1),
      artifactChecksum: z.string().trim().min(1),
      representationRevision: z.string().trim().min(1),
      slotIndex: z.number().int().nonnegative().optional(),
    })
    .optional(),
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

  const { query, limit, lanes, workspaceId, requireActorGrant, bitfrost } = parsed.data;
  const requestId = request.headers.get('x-request-id')?.trim() || `rag-hyperrag:${randomUUID()}`;

  let actorGrant: VerifiedContextWorkspaceScopeV1 | undefined;
  if (workspaceId !== undefined || requireActorGrant) {
    try {
      const trustedWorkspace = await resolveTrustedWorkspaceAuthorityV1();
      if (trustedWorkspace.status !== 'TRUSTED') {
        return json(
          {
            ok: false,
            error: 'TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE',
            reason: trustedWorkspace.reason,
            canonicalAuthority: false,
            writesPerformed: false,
          },
          { status: 403 },
        );
      }
      const authorizer = createVerifiedContextPostgresAuthorizerV1(
        new PostgresActorWorkspaceGrantProviderV1(pool),
      );
      const grantResult = await authorizer({
        actorId: locals.user.id,
        request: {
          requestId,
          query,
          ...(workspaceId ? { workspaceId } : {}),
          topK: Math.min(limit, 10),
        },
        authority: trustedWorkspace,
      });
      if (grantResult.status === 'BLOCKED') {
        return json(
          {
            ok: false,
            error: grantResult.reason,
            canonicalAuthority: false,
            writesPerformed: false,
          },
          { status: 403 },
        );
      }
      actorGrant = grantResult;
    } catch (err) {
      return json(
        {
          ok: false,
          error: err instanceof Error ? err.message : 'ACTOR_GRANT_RESOLUTION_FAILED',
          canonicalAuthority: false,
          writesPerformed: false,
        },
        { status: 403 },
      );
    }
  }

  const bitfrostDescriptor = bitfrost ? buildBitFrostProceduralDescriptorV1(bitfrost) : null;
  const runtime = createSearchRuntime({ userId: locals.user.id });

  try {
    const result = await runtime.search(
      {
        text: query,
        topK: limit,
        ...(actorGrant ? { workspaceRevision: actorGrant.workspaceRevision } : {}),
        filters: {
          includeGenerated: false,
          includeLegacy: false,
        },
      },
      {
        signal: request.signal,
        runId: requestId,
        ...(actorGrant ? { actorGrant, requireActorGrant: true } : {}),
      },
    );

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
      bitfrostDescriptor,
      actorGrantAuthorityRef: actorGrant?.authorityRef ?? null,
      canonicalAuthority: false,
      writesPerformed: false,
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
