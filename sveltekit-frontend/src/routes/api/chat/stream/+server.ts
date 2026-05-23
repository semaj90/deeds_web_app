import { db } from '$lib/server/db/client';
import { chatMessages, chatMetadata, intentEvalRuns } from '$lib/server/db/schema';
import { featureIndexEntries, retrievalCacheTraces } from '$lib/server/db/schema/documents-atlas.js';
import { CacheLogger } from '$lib/server/observability/cache-logger.js';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { RequestHandler } from './$types';
import { acquireGpuLease } from '$lib/server/inference/gpu-arbiter.js';
import { z } from 'zod';
import { isUuid } from '$lib/server/validation.js';
import { callTraceMcp } from '$lib/server/mcp/trace-http.js';
import { getRedis } from '$lib/server/redis.js';
import { storeChatMemoryTurn } from '$lib/server/ai/engram-registry.js';
import { buildFeatureLabels, type FeatureLabel } from '$lib/server/ai/feature-builder.js';
import {
  rankIntent,
  macroRerank,
  recallEngramsForIntent,
  type IntentRankerDecision,
} from '$lib/server/ai/intent-ranker.js';
import { retrieveSummaryCards } from '$lib/server/retrieval/summary-card-retrieval.js';
import { BifrostCacheManager } from '$lib/server/ai/bifrost-cache-manager.js';
import { streamBifrostChatCompletions } from '$lib/server/bifrost/client.js';
import { runWorkflowLoop, type HmmErrorClass } from '$lib/server/ai/error-agent/workflow-loop.js';
import {
  buildToonPacket,
  buildOpenCodeContextPacket,
  rerankFeaturesWithBreakdown,
} from '$lib/server/ai/toon.js';

const chatStreamPostSchema = z.object({
  sessionId: z.string().min(1, 'Missing sessionId').max(200),
  message: z.string().min(1, 'Missing message').max(50000),
  caseId: z.string().uuid().optional(),
});

function classifyHmmErrorClass(errorMessage: string): HmmErrorClass {
  const value = errorMessage.toLowerCase();
  if (value.includes('schema') || value.includes('column') || value.includes('table'))
    return 'schema_mismatch';
  if (value.includes('migration')) return 'stale_migration';
  if (value.includes('qdrant') || value.includes('pgvector') || value.includes('turbovec')) {
    return 'vector_infra_missing';
  }
  if (value.includes('contract') || value.includes('route')) return 'route_contract_mismatch';
  if (value.includes('validation') || value.includes('zod')) return 'api_validation_gap';
  if (value.includes('ssr') || value.includes('window is not defined'))
    return 'ssr_safety_violation';
  if (value.includes('env') || value.includes('url') || value.includes('host.docker.internal')) {
    return 'env_url_mismatch';
  }
  return 'unknown';
}

function normalizeSourceRef(ref: string): string {
  const trimmed = String(ref ?? '').trim();
  return trimmed.startsWith('file:') ? trimmed.slice(5) : trimmed;
}

function pickSourceRefSeeds(query: string, refs: string[]): { exact: string[]; seeds: string[] } {
  const normalized = Array.from(
    new Set(refs.map((ref) => normalizeSourceRef(ref)).filter((ref) => ref.length > 0))
  );
  const q = query.toLowerCase().trim();
  const exact = normalized.filter((ref) => {
    const lower = ref.toLowerCase();
    const base = lower.split('/').pop() ?? lower;
    return lower === q || q.includes(lower) || lower.includes(q) || q.includes(base);
  });
  return {
    exact,
    seeds: (exact.length > 0 ? exact : normalized).slice(0, 8),
  };
}

function uniqueByPath(features: FeatureLabel[]): FeatureLabel[] {
  return Array.from(new Map(features.map((feature) => [feature.path, feature])).values());
}

async function runReadOnlySynthesisChain(args: {
  query: string;
  userId?: string;
  features: FeatureLabel[];
  send: (data: unknown) => void;
}): Promise<{
  ok: boolean;
  features: FeatureLabel[];
  breakdown: Array<Record<string, unknown>>;
  memoryHints: string[];
}> {
  const baseFeatures = uniqueByPath(args.features);
  const sourceRefs = baseFeatures
    .map((feature) => normalizeSourceRef(feature.path))
    .filter(Boolean);
  if (sourceRefs.length === 0) {
    return { ok: false, features: args.features, breakdown: [], memoryHints: [] };
  }

  const { exact, seeds } = pickSourceRefSeeds(args.query, sourceRefs);
  args.send({
    type: 'retrieval_chain',
    stage: 'sourceRef_exact_match',
    source: 'chat.stream',
    exactMatches: exact.slice(0, 8),
    seedSourceRefs: seeds,
    count: seeds.length,
  });

  const graphResult = await callTraceMcp(
    'graph.expand_neighborhood',
    { sourceRefs: seeds, maxHops: 2, limit: 40, query: args.query },
    { timeoutMs: 4000 }
  );
  const graphData =
    graphResult.ok && graphResult.data && typeof graphResult.data === 'object'
      ? (graphResult.data as {
          sourceRefs?: string[];
          nodes?: Array<{ sourceRef?: string; stableKey?: string }>;
          edges?: Array<{ from?: string; to?: string }>;
          graphPaths?: string[];
        })
      : null;

  const graphSourceRefs = Array.from(
    new Set(
      [
        ...(graphData?.sourceRefs ?? []).map((ref) => normalizeSourceRef(ref)),
        ...((graphData?.nodes ?? []).map((node) =>
          normalizeSourceRef(node.sourceRef ?? node.stableKey ?? '')
        ) ?? []),
      ].filter(Boolean)
    )
  );

  args.send({
    type: 'retrieval_chain',
    stage: 'graph.expand_neighborhood',
    ok: graphResult.ok,
    tookMs: graphResult.ms,
    sourceRefs: graphSourceRefs.slice(0, 12),
    graphPaths: (graphData?.graphPaths ?? []).slice(0, 8),
    nodeCount: graphData?.nodes?.length ?? 0,
    edgeCount: graphData?.edges?.length ?? 0,
  });

  const rankInput = Array.from(new Set([...seeds, ...graphSourceRefs])).slice(0, 20);
  const turbovecResult = await callTraceMcp(
    'turbovec.rank_chunks',
    {
      query: args.query,
      sourceRefs: rankInput,
      limit: 12,
    },
    { timeoutMs: 4500 }
  );
  const rankData =
    turbovecResult.ok && turbovecResult.data && typeof turbovecResult.data === 'object'
      ? (turbovecResult.data as {
          sourceRefs?: string[];
          ranked?: Array<{ sourceRef?: string; finalScore?: number; reason?: string }>;
          furtherResearch?: boolean;
        })
      : null;

  const rankedItems = (rankData?.ranked ?? [])
    .map((item) => ({
      sourceRef: normalizeSourceRef(item.sourceRef ?? ''),
      finalScore: typeof item.finalScore === 'number' ? item.finalScore : 0,
      reason: item.reason ?? 'turbovec rank',
    }))
    .filter((item) => item.sourceRef.length > 0);
  const rankedSourceRefs = rankedItems.length
    ? rankedItems.map((item) => item.sourceRef)
    : (rankData?.sourceRefs ?? []).map((ref) => normalizeSourceRef(ref)).filter(Boolean);

  args.send({
    type: 'retrieval_chain',
    stage: 'turbovec.rank_chunks',
    ok: turbovecResult.ok,
    tookMs: turbovecResult.ms,
    rankedSourceRefs: rankedSourceRefs.slice(0, 12),
    furtherResearch: Boolean(rankData?.furtherResearch),
  });

  const memoryResult = args.userId
    ? await callTraceMcp(
        'engram.chat_memory_recent',
        { userId: args.userId, sourceRefs: rankedSourceRefs.slice(0, 8), limit: 6 },
        { timeoutMs: 3000 }
      )
    : { ok: false, ms: 0, data: null };

  const memoryData =
    memoryResult.ok && memoryResult.data && typeof memoryResult.data === 'object'
      ? (memoryResult.data as { memories?: Array<{ summary?: string }> })
      : null;
  const memoryHints = (memoryData?.memories ?? [])
    .map((memory) => String(memory.summary ?? '').trim())
    .filter((summary) => summary.length > 0)
    .slice(0, 4);

  args.send({
    type: 'retrieval_chain',
    stage: 'engram.chat_memory_recent',
    ok: memoryResult.ok,
    tookMs: memoryResult.ms,
    hintCount: memoryHints.length,
  });

  if (rankedSourceRefs.length === 0) {
    return { ok: false, features: args.features, breakdown: [], memoryHints };
  }

  const byPath = new Map(
    baseFeatures.map((feature) => [normalizeSourceRef(feature.path), feature])
  );
  const rankedScoreMap = new Map(rankedItems.map((item) => [item.sourceRef, item]));
  const orderedFeatures = rankedSourceRefs.map((ref) => {
    const existing = byPath.get(ref);
    if (existing) {
      const ranked = rankedScoreMap.get(ref);
      return {
        ...existing,
        score: ranked?.finalScore ?? existing.score,
      } satisfies FeatureLabel;
    }
    const ranked = rankedScoreMap.get(ref);
    return {
      path: ref,
      feature: 'atlas-source-ref',
      labels: ['source-ref', 'graph', 'turbovec'],
      summary: ranked?.reason ?? 'Ranked from graph neighborhood',
      symbols: [],
      score: ranked?.finalScore ?? 0.25,
    } satisfies FeatureLabel;
  });

  const overflow = baseFeatures.filter(
    (feature) => !rankedSourceRefs.includes(normalizeSourceRef(feature.path))
  );

  return {
    ok: true,
    features: [...orderedFeatures, ...overflow].slice(0, 16),
    breakdown: rankedItems.slice(0, 12).map((item) => ({
      path: item.sourceRef,
      finalScore: item.finalScore,
      reason: item.reason,
    })),
    memoryHints,
  };
}

async function logErrorAgentEvalMetadata(input: {
  intentRanked: IntentRankerDecision | null;
  query: string;
  userId?: string;
  caseId?: string | null;
  intentLabel: string;
  errorMessage: string;
}) {
  if (!input.intentRanked?.evalTraceId) return;

  const hmmErrorClass = classifyHmmErrorClass(input.errorMessage);
  const redis = getRedis();
  const engramCards = await recallEngramsForIntent(input.intentLabel, 5, redis).catch(() => []);

  const workflow = await runWorkflowLoop({
    runId: input.intentRanked.evalTraceId,
    query: input.query,
    hmmErrorClass,
    caseId: input.caseId ?? undefined,
    userId: input.userId,
    targetPath: 'src/routes/api/chat/stream/+server.ts',
    metadata: {
      source: 'api/chat/stream',
      intent: input.intentLabel,
      engramCardIds: engramCards
        .slice(0, 5)
        .map((card: { id?: string; memoryId?: string }) => card.id ?? card.memoryId ?? 'unknown'),
      errorMessage: input.errorMessage.slice(0, 400),
    },
  }).catch(() => null);

  const metadataPatch = {
    hmmErrorAgent: {
      class: hmmErrorClass,
      status: workflow?.status ?? 'needs_review',
      lane: workflow?.classification.lane ?? 'general',
      riskScore: workflow?.classification.riskScore ?? 0,
      engramCards: engramCards
        .slice(0, 5)
        .map((card: { id?: string; memoryId?: string; summary?: string }) => ({
          id: card.id ?? card.memoryId ?? 'unknown',
          summary: (card.summary ?? '').slice(0, 240),
        })),
      recommendations: (workflow?.repair.suggestedFixes ?? []).slice(0, 3),
      smoke: workflow?.smoke ?? null,
      loggedAt: new Date().toISOString(),
    },
  };

  await db
    .update(intentEvalRuns)
    .set({ metadata: metadataPatch })
    .where(eq(intentEvalRuns.runId, input.intentRanked.evalTraceId));

  return {
    hmmErrorClass,
    recommendations: (workflow?.repair.suggestedFixes ?? []).slice(0, 3),
    engramCards: engramCards
      .slice(0, 3)
      .map((card: { id?: string; memoryId?: string; summary?: string }) => ({
        id: card.id ?? card.memoryId ?? 'unknown',
        summary: (card.summary ?? '').slice(0, 160),
      })),
  };
}

/**
 * Server-Sent Events endpoint for contextual chat streaming
 * Case-aware: injects case context (evidence, citations) into AI prompts
 *
 * Supports two modes:
 * 1. Query mode: ?q=query&mode=ollama&caseId=xxx (streaming, optional case context)
 * 2. Session mode: ?sessionId=xxx (full chat history + streaming)
 */
export const GET: RequestHandler = async ({ locals, url }) => {
  const query = url.searchParams.get('q');
  const mode = url.searchParams.get('mode') ?? 'ollama';
  const sessionId = url.searchParams.get('sessionId');
  const caseId = url.searchParams.get('caseId');
  const persona = url.searchParams.get('persona') ?? 'neutral';

  // Query mode: Simple streaming without authentication/session
  if (query && !sessionId) {
    if (!locals.user?.id) {
      return new Response('Unauthorized', { status: 401 });
    }
    if (caseId && !isUuid(caseId)) {
      return new Response('Invalid case ID format', { status: 400 });
    }
    return handleQueryMode(query, mode, caseId, persona, locals.user.id);
  }

  // Session mode: Requires authentication
  if (!locals.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!sessionId) {
    return new Response('Missing query or sessionId parameter', { status: 400 });
  }

  // Verify session belongs to user via chatMetadata
  const sessionMeta = await db
    .select()
    .from(chatMetadata)
    .where(eq(chatMetadata.chatId, sessionId))
    .limit(1);

  if (sessionMeta.length > 0 && sessionMeta[0].userId !== Number(locals.user.id)) {
    return new Response('Session not found or unauthorized', { status: 404 });
  }

  // Get case association from metadata
  const sessionCaseId = sessionMeta[0]?.caseId ?? caseId ?? null;

  return handleSessionMode(sessionId, sessionCaseId, Number(locals.user.id));
};

/**
 * Load case context from DB for injection into AI prompts
 */
async function loadCaseContext(caseId: string, userId?: string): Promise<string | null> {
  try {
    const { cases } = await import('$lib/server/db/schema');

    const caseRows = await db
      .select()
      .from(cases)
      .where(
        userId ? and(eq(cases.id, caseId), eq(cases.userId, Number(userId))) : eq(cases.id, caseId)
      )
      .limit(1);

    if (!caseRows.length) return null;

    const c = caseRows[0];
    let context = `## Active Case Context\n`;
    context += `- **Title**: ${c.title}\n`;
    if (c.caseNumber) context += `- **Case #**: ${c.caseNumber}\n`;
    if (c.jurisdiction) context += `- **Jurisdiction**: ${c.jurisdiction}\n`;
    if (c.court) context += `- **Court**: ${c.court}\n`;
    if (c.status) context += `- **Status**: ${c.status}\n`;
    if (c.description) context += `- **Description**: ${c.description}\n`;

    // Load recent evidence for this case
    try {
      const { evidence } = await import('$lib/server/db/schema');
      const evidenceRows = await db
        .select()
        .from(evidence)
        .where(eq(evidence.caseId, caseId))
        .limit(5);

      if (evidenceRows.length > 0) {
        context += `\n## Evidence (${evidenceRows.length} items)\n`;
        for (const e of evidenceRows) {
          context += `- ${e.title ?? e.fileType ?? 'Untitled'}: ${e.description ?? ''}\n`;
        }
      }
    } catch {
      // Evidence table may not exist yet
    }

    // Load citations linked to this case
    try {
      const { savedCitations } = await import('$lib/server/db/schema');
      const citationRows = await db
        .select()
        .from(savedCitations)
        .where(eq(savedCitations.caseId, caseId))
        .limit(10);

      if (citationRows.length > 0) {
        context += `\n## Citations (${citationRows.length} items)\n`;
        for (const cit of citationRows) {
          context += `- ${cit.statuteCode}: ${cit.statuteTitle ?? ''}\n`;
        }
      }
    } catch {
      // Citations table may not exist yet
    }

    return context;
  } catch (error) {
    console.warn('Failed to load case context:', error);
    return null;
  }
}

/**
 * Query Mode: Simple streaming with optional case context
 */
function handleQueryMode(
  query: string,
  mode: string,
  caseId: string | null,
  persona: string = 'neutral',
  userId?: string
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let fullResponse = '';

      const send = (data: unknown) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      const loadRecentMemory = async (id?: string): Promise<string[]> => {
        if (!id) return [];
        try {
          const redis = getRedis();
          const key = `user:memory:${id}`;
          const raw = await redis.zrevrange(key, 0, 2);
          return raw
            .map((entry) => {
              try {
                const parsed = JSON.parse(entry) as { content?: string };
                return parsed.content ?? '';
              } catch {
                return '';
              }
            })
            .filter((entry) => entry.length > 0)
            .reverse();
        } catch {
          return [];
        }
      };

      try {
        // Acquire GPU lease for Ollama streaming (non-blocking)
        await acquireGpuLease('ollama', 120).catch(() => null);

        send({ type: 'status', stage: 'status', message: 'stream-started' });
        send({ type: 'start', query, mode, caseId, timestamp: new Date().toISOString() });

        const redis = getRedis();
        const queryHash = createHash('sha256')
          .update(`${query.toLowerCase().trim()}|${caseId ?? ''}|${persona}`)
          .digest('hex')
          .slice(0, 20);
        const modelAlias =
          process.env.BIFROST_MODEL_ID ??
          process.env.BIFROST_SMOKE_MODEL ??
          'ollama/gemma4-legal:latest';

        const exactCompletionKey = `ace:completion:${queryHash}`;
        const packetId = createHash('sha1')
          .update(`${queryHash}:${caseId ?? ''}`)
          .digest('hex')
          .slice(0, 16);
        const packetCacheKey = `ace:packet:${packetId}`;

        const intentRanked = await rankIntent({
          query,
          model: modelAlias,
          userId,
          caseId: caseId ?? undefined,
          completionKey: exactCompletionKey,
          packetKey: packetCacheKey,
        }).catch(() => null);

        const intentLabel = intentRanked?.intentLabel ?? 'unknown';
        const featureFamily = intentLabel
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .slice(0, 48);
        const featureCacheKey = `ace:feature:${featureFamily || 'general'}`;
        const ctxCacheKey = `ace:ctx:${featureFamily || 'general'}`;

        send({
          type: 'intent',
          decision: intentRanked?.decision ?? 'run_retrieval',
          label: intentLabel,
          confidence: intentRanked?.intentConfidence ?? intentRanked?.confidence ?? 0,
          evalTraceId: intentRanked?.evalTraceId ?? null,
        });
        if ((intentRanked?.didYouMean?.length ?? 0) > 0) {
          send({
            type: 'did_you_mean',
            options: intentRanked!.didYouMean!.slice(0, 4).map((opt) => ({
              query: opt.query,
              score: opt.score,
              source: opt.source,
            })),
          });
        }

        // L1 exact completion cache
        const exactCachedCompletion = await redis.get(exactCompletionKey).catch(() => null);
        if (exactCachedCompletion) {
          send({
            type: 'cache_hit',
            tier: 'L1_exact',
            key: exactCompletionKey,
          });
          void CacheLogger.logTrace({
            runId: `run-${Date.now()}`,
            queryHash,
            cacheHit: true,
            cacheLayerUsed: 'redis_exact',
            packetId: packetId,
            latencyMs: 0,
            traceDetails: { tier: 'L1_exact', cacheKey: exactCompletionKey }
          });
          send({ type: 'token', content: exactCachedCompletion });
          send({ type: 'done' });
          controller.close();
          return;
        }

        // ACE packet/context cache checks before broad retrieval.
        const [cachedPacketRaw, cachedFeatureRaw, cachedCtxRaw] = await Promise.all([
          redis.get(packetCacheKey).catch(() => null),
          redis.get(featureCacheKey).catch(() => null),
          redis.get(ctxCacheKey).catch(() => null),
        ]);

        if (cachedPacketRaw) {
          send({ type: 'cache_hit', tier: 'ACE_packet', key: packetCacheKey });
          void CacheLogger.logTrace({
            runId: `run-${Date.now()}`,
            queryHash,
            cacheHit: true,
            cacheLayerUsed: 'redis_semantic',
            packetId: packetId,
            latencyMs: 0,
            traceDetails: { tier: 'ACE_packet', cacheKey: packetCacheKey }
          });
          let cachedToon: {
            q?: string;
            f?: Array<{ p: string; l: string[]; s: string }>;
            m?: string[];
          } | null = null;
          try {
            cachedToon = JSON.parse(cachedPacketRaw) as {
              q?: string;
              f?: Array<{ p: string; l: string[]; s: string }>;
              m?: string[];
            };
          } catch {
            cachedToon = null;
          }

          if (cachedToon && Array.isArray(cachedToon.f)) {
            send({
              type: 'context_packet',
              format: 'toon',
              data: {
                tokenEstimate: JSON.stringify(cachedToon).length,
                cardCount: cachedToon.f.length,
                packetId,
              },
            });

            const stablePrefix = `You are Deeds Legal AI. Use supplied context packets and keep legal reasoning explicit.`;
            const prefixToken = await BifrostCacheManager.getPrefixToken(stablePrefix).catch(
              () => null
            );
            const prefixMarker = createHash('sha1').update(stablePrefix).digest('hex').slice(0, 12);
            const runId = `chat-stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const messages = prefixToken
              ? [
                  { role: 'system' as const, content: `prefix-id:${prefixMarker}` },
                  { role: 'user' as const, content: JSON.stringify(cachedToon) },
                ]
              : [
                  { role: 'system' as const, content: stablePrefix },
                  { role: 'user' as const, content: JSON.stringify(cachedToon) },
                ];

            for await (const event of streamBifrostChatCompletions({
              model: modelAlias,
              messages,
              temperature: 0.2,
              maxTokens: 2048,
              timeoutMs: 120_000,
              headers: {
                'x-cache-key': `chat-stream:${queryHash}`,
                'x-bf-cache-key': `chat-stream:${queryHash}`,
                'x-run-id': runId,
                ...(prefixToken ? { 'x-bf-prefix-token': prefixToken } : {}),
              },
            })) {
              if (event.type === 'token') {
                fullResponse += event.content;
                send({ type: 'token', content: event.content });
              } else if (event.type === 'error') {
                send({ type: 'error', error: event.error });
                controller.close();
                return;
              }
            }

            if (fullResponse.length > 0) {
              await redis.setex(exactCompletionKey, 3600, fullResponse).catch(() => {});
            }
            send({ type: 'done' });
            controller.close();
            return;
          }
        }

        if (cachedFeatureRaw) {
          send({ type: 'cache_hit', tier: 'ACE_feature_family', key: featureCacheKey });
        }
        if (cachedCtxRaw) {
          send({ type: 'cache_hit', tier: 'ACE_intent_context', key: ctxCacheKey });
        }

        void CacheLogger.logTrace({
          runId: `run-${Date.now()}`,
          queryHash,
          cacheHit: false,
          cacheLayerUsed: 'fallback',
          packetId: packetId,
          latencyMs: 0,
          traceDetails: { tier: 'miss', intentLabel, featureFamily }
        });

        // Load case context if available
        send({ type: 'status', stage: 'retrieval', message: 'loading-context' });
        let caseContext = '';
        if (caseId) {
          const ctx = await loadCaseContext(caseId, userId);
          if (ctx) {
            caseContext = ctx;
            send({ type: 'case_context', caseId, hasContext: true });
          } else {
            send({ type: 'status', stage: 'retrieval', message: 'no-case-context' });
          }
        } else {
          send({ type: 'status', stage: 'retrieval', message: 'no-case-selected' });
        }

        // L1.5/L2 semantic cards retrieval (Redis + Qdrant)
        const summaryCards = await retrieveSummaryCards(query, { limit: 8 }).catch(() => null);
        const selectedCardFeatures =
          summaryCards?.cards?.map((card) => ({
            path: card.path || card.cardKey,
            feature: 'summary-card',
            labels: card.labels,
            summary: card.summary,
            symbols: card.tools,
            score: card.score,
          })) ?? [];

        let featuresForRerank = selectedCardFeatures;

        if (summaryCards && selectedCardFeatures.length > 0) {
          const macroCandidates = summaryCards.cards.map((card) => {
            const tagList = card.labels ?? [];
            const content = `${card.summary} ${tagList.join(' ')}`.toLowerCase();
            const intentToken = featureFamily.replace(/_/g, ' ');
            return {
              id: card.cardKey,
              intentFit: content.includes(intentToken) ? 1 : 0.35,
              cosine: Math.max(0, Math.min(1, card.qdrantScore ?? card.score ?? 0)),
              tagOverlap: tagList.some((tag) => tag.toLowerCase().includes(featureFamily))
                ? 0.8
                : 0.25,
              clusterHotness: card.graphNeighbors.length > 0 ? 0.7 : 0.3,
              authority: Math.max(0, Math.min(1, card.score ?? 0)),
              engramMatch: (intentRanked?.didYouMean?.length ?? 0) > 0 ? 0.6 : 0.2,
              recency: 0.5,
              tokenCost: Math.min(1, (card.summary?.length ?? 0) / 1200),
            };
          });
          const macro = macroRerank(macroCandidates);
          const macroTopIds = new Set(macro.slice(0, 8).map((item) => item.id));
          const macroBreakdown = macro.slice(0, 8).map((item) => ({
            id: item.id,
            finalScore: item.finalScore,
            intentFit: item.intentFit,
            cosine: item.cosine,
            tagOverlap: item.tagOverlap,
            clusterHotness: item.clusterHotness,
            authority: item.authority,
            engramMatch: item.engramMatch,
            recency: item.recency,
            tokenCost: item.tokenCost,
          }));

          send({
            type: 'cache_hit',
            tier: summaryCards.cacheHit ? 'L1.5_semantic_redis' : 'L2_qdrant_semantic',
            key: summaryCards.cacheKey,
            source: summaryCards.source,
          });
          send({
            type: 'selected_cards',
            source: summaryCards.source,
            cacheHit: summaryCards.cacheHit,
            count: macroTopIds.size,
            cards: summaryCards.cards
              .filter((card) => macroTopIds.has(card.cardKey))
              .map((card) => ({
                cardKey: card.cardKey,
                path: card.path,
                summaryType: card.summaryType,
                summary: card.summary,
                labels: card.labels,
                score: card.score,
              })),
          });
          send({
            type: 'rerank_breakdown',
            source: 'intent.macroRerank',
            query,
            count: macroBreakdown.length,
            top: macroBreakdown,
          });

          featuresForRerank = selectedCardFeatures.filter((feature) => {
            const key = feature.path || '';
            const cardMatch = summaryCards.cards.find(
              (card) => (card.path || card.cardKey) === key
            );
            return cardMatch ? macroTopIds.has(cardMatch.cardKey) : false;
          });
        }

        if (featuresForRerank.length === 0) {
          const traceResult = await callTraceMcp(
            'trace.kag_search',
            { query, limit: 8 },
            { timeoutMs: 4000 }
          );
          const features = buildFeatureLabels({
            trace: traceResult.ok ? traceResult.data : [],
          });

          const seedSourceRefs = features
            .slice(0, 3)
            .map((feature) => feature.path)
            .filter((path) => path && path !== 'unknown')
            .map((path) => normalizeSourceRef(path));

          const multiHop =
            seedSourceRefs.length > 0
              ? await callTraceMcp(
                  'graph.expand_neighborhood',
                  { sourceRefs: seedSourceRefs, maxHops: 2, limit: 24, query },
                  { timeoutMs: 3500 }
                )
              : { ok: false, ms: 0, data: null, error: 'no-seed-features' };

          const neighborPaths =
            multiHop.ok && multiHop.data && typeof multiHop.data === 'object'
              ? Array.from(
                  new Set(
                    (
                      (multiHop.data as { neighbors?: Array<{ stable_key?: string }> }).neighbors ??
                      []
                    )
                      .map((neighbor) => neighbor.stable_key ?? '')
                      .filter((key) => key.startsWith('file:'))
                      .map((key) => key.replace(/^file:/, ''))
                  )
                )
              : [];

          const graphFeatures = neighborPaths.map((path) => ({
            path,
            feature: 'graph-neighbor',
            labels: ['multihop', 'graph'],
            summary: 'Expanded from graph neighborhood',
            symbols: [],
            score: 0.25,
          }));

          featuresForRerank = [...features, ...graphFeatures];
          send({
            type: 'feature_labels',
            source: 'trace.kag_search',
            ok: traceResult.ok,
            tookMs: traceResult.ms,
            count: featuresForRerank.length,
            features: featuresForRerank,
          });
          send({
            type: 'multihop',
            source: 'graph.expand_neighborhood',
            ok: multiHop.ok,
            tookMs: multiHop.ms,
            seedStableKeys: seedSourceRefs.map((ref) => `file:${ref}`),
            neighborCount: neighborPaths.length,
            neighbors: neighborPaths.slice(0, 8),
          });
        }

        const synthesisChain = await runReadOnlySynthesisChain({
          query,
          userId,
          features: featuresForRerank,
          send,
        });
        const fallback = synthesisChain.ok
          ? null
          : rerankFeaturesWithBreakdown(query, featuresForRerank);
        const reranked = synthesisChain.ok
          ? synthesisChain.features
          : (fallback?.features ?? featuresForRerank);
        const rerankBreakdown = synthesisChain.ok
          ? synthesisChain.breakdown
          : (fallback?.breakdown ?? []);

        send({
          type: 'rerank_breakdown',
          source: synthesisChain.ok ? 'turbovec.rank_chunks' : 'toon.rerankFeaturesWithBreakdown',
          query,
          count: rerankBreakdown.length,
          top: rerankBreakdown.slice(0, 8),
        });

        const memory = await loadRecentMemory(userId);
        const memoryWithCase = caseContext
          ? [
              ...memory,
              ...synthesisChain.memoryHints,
              `case-context:${caseContext.replace(/\s+/g, ' ').slice(0, 700)}`,
            ]
          : [...memory, ...synthesisChain.memoryHints];
        const rerankedPaths = reranked.map((r) => r.path).filter(Boolean);
        if (rerankedPaths.length > 0) {
          const dbFeatures = await db
            .select()
            .from(featureIndexEntries)
            .where(inArray(featureIndexEntries.path, rerankedPaths))
            .catch(() => []);
          const dbFeaturesMap = new Map<string, any>(dbFeatures.map((df: any) => [df.path, df] as [string, any]));
          for (const r of reranked) {
            const dbFeat = dbFeaturesMap.get(r.path);
            if (dbFeat) {
              r.protocols = dbFeat.protocols ?? [];
              const ext = (dbFeat.metadata as { extension?: string })?.extension;
              r.languages = ext ? [ext] : [];
              r.sourceRefs = [r.path];
            } else {
              r.protocols = r.protocols ?? [];
              r.languages = r.languages ?? [];
              r.sourceRefs = r.sourceRefs ?? [r.path];
            }
          }
        }

        const toon = buildToonPacket({
          query,
          features: reranked,
          memory: memoryWithCase,
        });
        send({
          type: 'context_packet',
          format: 'toon',
          data: {
            tokenEstimate: JSON.stringify(toon).length,
            cardCount: toon.f.length,
            packetId,
          },
        });

        await Promise.all([
          redis.setex(packetCacheKey, 3600, JSON.stringify(toon)).catch(() => {}),
          redis
            .setex(
              featureCacheKey,
              1800,
              JSON.stringify({
                queryHash,
                intent: intentLabel,
                cardCount: toon.f.length,
                ts: new Date().toISOString(),
              })
            )
            .catch(() => {}),
          redis
            .setex(
              ctxCacheKey,
              1800,
              JSON.stringify({
                queryHash,
                intent: intentLabel,
                packetId,
                tokenEstimate: JSON.stringify(toon).length,
              })
            )
            .catch(() => {}),
        ]);

        const openCodePacket = buildOpenCodeContextPacket({
          goal: 'Answer the user query with retrieved feature labels and recent memory context.',
          query,
          features: reranked,
          memory: memoryWithCase,
          files: [
            {
              path: 'src/routes/api/chat/stream/+server.ts',
              lines: '1-260',
              change: 'TOON packet generation and SSE context streaming',
            },
          ],
        });
        send({ type: 'context_packet', format: 'opencode_json', data: openCodePacket });

        // Apply persona styling to prompt
        let systemPrefix = '';
        if (persona && persona !== 'neutral') {
          const { getPersona } = await import('$lib/server/ace/style-adapter.js');
          const config = getPersona(persona as Parameters<typeof getPersona>[0]);
          systemPrefix = config.systemPrefix + '\n\n';
        }

        const stablePrefix = `${systemPrefix}You are Deeds Legal AI. Use supplied context packets and keep legal reasoning explicit.`;
        const prefixToken = await BifrostCacheManager.getPrefixToken(stablePrefix).catch(
          () => null
        );
        const prefixMarker = createHash('sha1').update(stablePrefix).digest('hex').slice(0, 12);
        const runId = `chat-stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const messages = prefixToken
          ? [
              { role: 'system' as const, content: `prefix-id:${prefixMarker}` },
              { role: 'user' as const, content: JSON.stringify(toon) },
            ]
          : [
              { role: 'system' as const, content: stablePrefix },
              { role: 'user' as const, content: JSON.stringify(toon) },
            ];

        send({ type: 'status', stage: 'tool', message: 'invoking-bifrost-stream' });
        for await (const event of streamBifrostChatCompletions({
          model: modelAlias,
          messages,
          temperature: 0.2,
          maxTokens: 2048,
          timeoutMs: 120_000,
          headers: {
            'x-cache-key': `chat-stream:${queryHash}`,
            'x-bf-cache-key': `chat-stream:${queryHash}`,
            'x-run-id': runId,
            ...(prefixToken ? { 'x-bf-prefix-token': prefixToken } : {}),
          },
        })) {
          if (event.type === 'token') {
            fullResponse += event.content;
            send({ type: 'token', content: event.content });
          } else if (event.type === 'error') {
            const errorAgent = await logErrorAgentEvalMetadata({
              intentRanked,
              query,
              userId,
              caseId,
              intentLabel,
              errorMessage: event.error,
            }).catch(() => null);
            send({
              type: 'error',
              error: event.error,
              hmm_error_class: errorAgent?.hmmErrorClass ?? classifyHmmErrorClass(event.error),
              recommendations: errorAgent?.recommendations ?? [],
              engram_cards: errorAgent?.engramCards ?? [],
            });
            controller.close();
            return;
          }
        }

        if (fullResponse.length > 0) {
          await redis.setex(exactCompletionKey, 3600, fullResponse).catch(() => {});
        }

        if (userId && fullResponse.length > 0) {
          const redis = getRedis();
          await storeChatMemoryTurn(redis, {
            user_id: userId,
            turn: { role: 'user', content: query, metadata: { source: 'api/chat/stream' } },
            max_turns: 50,
            ttl_seconds: 604800,
          }).catch(() => {});
          await storeChatMemoryTurn(redis, {
            user_id: userId,
            turn: {
              role: 'assistant',
              content: fullResponse.slice(0, 12000),
              metadata: { source: 'api/chat/stream' },
            },
            max_turns: 50,
            ttl_seconds: 604800,
          }).catch(() => {});
        }

        send({ type: 'status', stage: 'done', message: 'stream-complete' });
        send({ type: 'done' });
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const errorAgent = await logErrorAgentEvalMetadata({
          intentRanked: null,
          query,
          userId,
          caseId,
          intentLabel: 'unknown',
          errorMessage: message,
        }).catch(() => null);
        send({
          type: 'error',
          error: 'Stream error',
          details: message,
          hmm_error_class: errorAgent?.hmmErrorClass ?? classifyHmmErrorClass(message),
          recommendations: errorAgent?.recommendations ?? [],
          engram_cards: errorAgent?.engramCards ?? [],
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/**
 * Session Mode: Full chat history + streaming with case context
 */
function handleSessionMode(sessionId: string, caseId: string | null, userId: number): Response {
  let pollIntervalId: ReturnType<typeof setInterval>;
  let keepAliveId: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: unknown) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      send('connected', { sessionId, caseId, timestamp: new Date().toISOString() });

      // Poll for new messages
      let lastMessageId: string | null = null;
      pollIntervalId = setInterval(async () => {
        try {
          const messages = await db
            .select()
            .from(chatMessages)
            .where(and(eq(chatMessages.chatId, sessionId), eq(chatMessages.userId, userId)))
            .orderBy(desc(chatMessages.createdAt))
            .limit(10);

          if (lastMessageId) {
            const newMessages = messages.filter((m) => m.id > lastMessageId!);

            for (const msg of newMessages.reverse()) {
              send('message', {
                id: msg.id,
                role: msg.role,
                content: msg.content,
                timestamp: msg.createdAt,
              });
              lastMessageId = msg.id;
            }
          } else {
            if (messages.length > 0) {
              lastMessageId = messages[0].id;
              send('message', {
                id: messages[0].id,
                role: messages[0].role,
                content: messages[0].content,
                timestamp: messages[0].createdAt,
              });
            }
          }
        } catch (error) {
          console.error('SSE poll error:', error);
          send('error', { message: 'Failed to fetch messages' });
        }
      }, 1000);

      // Keep-alive ping every 30 seconds
      keepAliveId = setInterval(() => {
        send('ping', { timestamp: new Date().toISOString() });
      }, 30000);
    },

    cancel() {
      clearInterval(pollIntervalId);
      clearInterval(keepAliveId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * POST endpoint to send messages (trigger streaming response)
 * Supports case association via caseId parameter
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	const raw = await request.json();
	const parsed = chatStreamPostSchema.safeParse(raw);
	if (!parsed.success) {
		return new Response(parsed.error.issues[0]?.message ?? 'Invalid input', { status: 400 });
	}
	const { sessionId, message, caseId } = parsed.data;

	try {
		if (caseId) {
      const ctx = await loadCaseContext(caseId, locals.user.id);
      if (!ctx) {
        return new Response('Case not found', { status: 404 });
      }
    }

		// Ensure chat metadata exists (upsert session with case association)
		await db
      .insert(chatMetadata)
      .values({
        chatId: sessionId,
        userId: Number(locals.user.id),
        caseId: caseId ?? null,
        title: message.slice(0, 100),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: chatMetadata.chatId,
        set: {
          updatedAt: new Date(),
          lastMessageAt: new Date(),
          ...(caseId ? { caseId } : {}),
        },
      });

		// Save user message
		const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		await db.insert(chatMessages).values({
      id: msgId,
      chatId: sessionId,
      userId: Number(locals.user.id),
      role: 'user',
      content: message,
    });

		// Load case context for AI response
		const sessionMeta = await db
			.select()
			.from(chatMetadata)
			.where(eq(chatMetadata.chatId, sessionId))
			.limit(1);

		const resolvedCaseId = sessionMeta[0]?.caseId ?? caseId ?? null;

		// Trigger AI response generation
    await generateAIResponse(sessionId, message, Number(locals.user.id), resolvedCaseId);

		return new Response(JSON.stringify({ success: true, sessionId, caseId: resolvedCaseId }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Failed to save message:', error);
		return new Response('Failed to save message', { status: 500 });
	}
};

/**
 * AI Response Generator with RAG/KAG/DAG Integration
 * Case-aware: injects case context into prompts for relevant responses
 */
async function generateAIResponse(
  sessionId: string,
  userMessage: string,
  userId: number,
  caseId: string | null
) {
  try {
    // Load case context
    let caseContext = '';
    if (caseId) {
      const ctx = await loadCaseContext(caseId, String(userId));
      if (ctx) caseContext = ctx;
    }

    // Build case-aware prompt
    const prompt = caseContext ? `${caseContext}\n\n## User Question\n${userMessage}` : userMessage;

    // Import streaming utilities
    const { streamRAGResponse } = await import('$lib/server/streaming/chunked-response');

    let fullResponse = '';
    let chunkCount = 0;
    const assistantMsgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    for await (const chunk of streamRAGResponse(prompt)) {
      if (chunk.type === 'content' && chunk.content) {
        fullResponse += chunk.content;
        chunkCount++;

        // Save every 10 chunks for real-time updates
        if (chunkCount % 10 === 0) {
          await db
            .insert(chatMessages)
            .values({
              id: assistantMsgId,
              chatId: sessionId,
              userId,
              role: 'assistant',
              content: fullResponse,
              metadata: JSON.stringify({
                streaming: true,
                chunks: chunkCount,
                caseId,
                confidence: chunk.metadata?.confidence ?? 0.8,
              }),
            })
            .onConflictDoUpdate({
              target: chatMessages.id,
              set: {
                content: fullResponse,
                metadata: JSON.stringify({
                  streaming: true,
                  chunks: chunkCount,
                  caseId,
                  confidence: chunk.metadata?.confidence ?? 0.8,
                }),
                updatedAt: new Date(),
              },
            });
        }
      } else if (chunk.type === 'done') {
        // Final save with complete response
        await db
          .insert(chatMessages)
          .values({
            id: assistantMsgId,
            chatId: sessionId,
            userId,
            role: 'assistant',
            content: fullResponse,
            metadata: JSON.stringify({
              streaming: false,
              chunks: chunkCount,
              caseId,
              confidence: chunk.metadata?.confidence ?? 0.8,
              sources: chunk.metadata?.sources || [],
            }),
          })
          .onConflictDoUpdate({
            target: chatMessages.id,
            set: {
              content: fullResponse,
              metadata: JSON.stringify({
                streaming: false,
                chunks: chunkCount,
                caseId,
                confidence: chunk.metadata?.confidence ?? 0.8,
                sources: chunk.metadata?.sources || [],
              }),
              updatedAt: new Date(),
            },
          });

        // Update chat metadata message count
        await db
          .update(chatMetadata)
          .set({
            lastMessageAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(chatMetadata.chatId, sessionId));

        // Queue embedding generation via RabbitMQ (async, non-critical)
        try {
          const { publishToQueue } = await import('$lib/server/rabbitmq');
          await publishToQueue('embedding.generation', {
            type: 'chat_message',
            sessionId,
            userId,
            caseId,
            message: fullResponse,
          });
        } catch {
          // RabbitMQ not available - non-critical
        }
      }
    }
  } catch (error) {
    console.error('AI response generation failed:', error);
    const errorMsgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(chatMessages).values({
      id: errorMsgId,
      chatId: sessionId,
      userId,
      role: 'assistant',
      content: 'Sorry, I encountered an error processing your request.',
      metadata: JSON.stringify({
        error: true,
        caseId,
        message: 'Stream error',
      }),
    });
  }
}
