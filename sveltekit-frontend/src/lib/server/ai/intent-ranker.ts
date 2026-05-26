import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { getRedis } from '$lib/server/redis.js';
import { getExactMatchCache } from '$lib/server/cache/redis-exact-match.js';
import { searchSemanticCache } from '$lib/server/cache/redis-semantic-cache.js';
import {
  engramAdapter,
  type EngramRoutingHint,
  type LocalEngramMemoryAdapter,
} from '$lib/server/memory/local-engram-memory-adapter.js';
import { IntentOrchestrator, type ExecutionPlan } from '$lib/server/admin/intent-orchestrator.js';
import { logEvent } from '$lib/server/analytics/event-logger.js';
import { hashStr } from '$lib/server/cache-keys.js';
import type { CachedLLMResponse } from '$lib/server/cache/redis-exact-match.js';
import type { SemanticHit } from '$lib/server/cache/redis-semantic-cache.js';
import { db } from '$lib/server/db/client.js';
import { engramCards, intentEvalRuns } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

export type IntentRankerDecision = {
  queryHash: string;
  decision:
    | 'exact_cache_answer'
    | 'show_did_you_mean'
    | 'semantic_cache_answer'
    | 'reuse_ace_packet'
    | 'run_retrieval'
    | 'run_full_synthesis';
  confidence: number;
  rankedCandidates: Array<{
    decision: IntentRankerDecision['decision'];
    score: number; // normalized 0-1 ranking score
    rawScore: number; // original routing signal before softmax
    probability: number;
    reasons: string[];
  }>;
  rankingLoss: {
    bestDecision: IntentRankerDecision['decision'];
    margin: number;
    entropy: number;
    negativeLogLikelihood: number;
    targetDecision?: IntentRankerDecision['decision'];
    targetLoss?: number;
  };
  intentLabel: string;
  intentConfidence: number;
  didYouMean?: Array<{
    query: string;
    score: number;
    reason: string;
    source: 'engram_bigram' | 'bmu' | 'semantic_cache' | 'accepted_reformulation';
  }>;
  selectedFeatureInputs: Record<string, number | string | boolean | null>;
  cacheKeys: string[];
  expectedTokenSavings?: number | null;
  evalTraceId: string;
};

export type IntentEvalEvent = {
  userId?: string;
  sessionId?: string;
  model: string;
  queryHash: string;
  decision: IntentRankerDecision['decision'];
  confidence: number;
  rankedCandidates: Array<{
    decision: IntentRankerDecision['decision'];
    score: number; // normalized 0-1 ranking score
    rawScore: number; // original routing signal before softmax
    probability: number;
    reasons: string[];
  }>;
  rankingLoss: {
    bestDecision: IntentRankerDecision['decision'];
    margin: number;
    entropy: number;
    negativeLogLikelihood: number;
    targetDecision?: IntentRankerDecision['decision'];
    targetLoss?: number;
  };
  intentLabel: string;
  intentConfidence: number;
  cacheKeys: string[];
  featureInputs: Record<string, number | string | boolean | null>;
  didYouMean?: IntentRankerDecision['didYouMean'];
  durationMs: number;
  queryPreview: string;
};

export interface IntentRankerInput {
  query: string;
  model: string;
  userId?: string;
  sessionId?: string;
  caseId?: string;
  filePath?: string;
  history?: Array<{ role?: string; content?: string }>;
  completionKey?: string;
  packetKey?: string;
  embedding?: Float32Array | number[];
  exactCacheEntry?: CachedLLMResponse | null;
  exactCacheChecked?: boolean;
  targetDecision?: IntentRankerDecision['decision'];
}

export interface IntentRankerDependencies {
  engramAdapter?: LocalEngramMemoryAdapter;
  exactMatchCacheFetcher?: (cacheKey: string) => Promise<CachedLLMResponse | null>;
  semanticSearcher?: (
    redis: Redis,
    embedding: Float32Array | number[],
    model: string
  ) => Promise<SemanticHit | null>;
  intentClassifier?: (
    query: string,
    history: Array<{ role?: string; content?: string }>
  ) => Promise<ExecutionPlan>;
  redisClient?: Redis;
  nowMs?: () => number;
}

const DEFAULT_DECISION_CONFIDENCE = 0.35;
const MIN_DYM_CONFIDENCE = 0.48;
const DEFAULT_SCOPE = 5;

// Zero Hidden Thoughts sanitization helper
export function sanitizeZeroHiddenThoughts<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeZeroHiddenThoughts(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (
        key === 'hiddenThoughts' ||
        key === 'chainOfThought' ||
        key === 'kv_cache' ||
        key === 'tensor' ||
        key === 'cudaPointer'
      ) {
        continue;
      }
      cleaned[key] = sanitizeZeroHiddenThoughts(value);
    }
    return cleaned as T;
  }
  return obj;
}

function buildEvalTraceId(queryHash: string): string {
  return createHash('sha256')
    .update(`${queryHash}:${Date.now()}:${Math.random()}`)
    .digest('hex')
    .slice(0, 16);
}

function normalizeQuery(query: string): string {
  return query.trim();
}

function buildDidYouMeanCandidates(
  hints: NonNullable<Awaited<ReturnType<LocalEngramMemoryAdapter['getRoutingHints']>>>
) {
  const candidates: IntentRankerDecision['didYouMean'] = [];
  const seen = new Set<string>();

  if (hints.didYouMean) {
    candidates.push({
      query: hints.didYouMean,
      score: 0.65,
      reason: 'Engram bigram suggestion from local memory',
      source: 'engram_bigram',
    });
    seen.add(hints.didYouMean);
  }

  for (const [index, query] of hints.priorQueries.slice(0, 2).entries()) {
    if (!query || seen.has(query)) continue;
    candidates.push({
      query,
      score: 0.5 - index * 0.1,
      reason:
        index === 0
          ? 'historical reformulation from Engram memory'
          : 'additional prior query alternative from Engram memory',
      source: 'accepted_reformulation',
    });
    seen.add(query);
  }

  if (hints.bmuHints?.length > 0) {
    candidates.push({
      query: hints.bmuHints[0],
      score: 0.55,
      reason: 'BMU hint from local engram memory',
      source: 'bmu',
    });
  }

  return candidates.length > 0 ? candidates : undefined;
}

function buildCacheKeys(input: IntentRankerInput): string[] {
  return [input.completionKey, input.packetKey].filter((value): value is string => Boolean(value));
}

function buildFeatureInputs(
  exactHit: boolean,
  exactAge: number | null,
  hints: NonNullable<Awaited<ReturnType<LocalEngramMemoryAdapter['getRoutingHints']>>>,
  intentPlan: ExecutionPlan,
  semanticHit: SemanticHit | null,
  input: IntentRankerInput
) {
  return {
    exactCacheHit: exactHit,
    exactCacheAgeSeconds: exactAge,
    engramDidYouMean: Boolean(hints.didYouMean),
    engramPriorQueries: hints.priorQueries.length,
    engramBmuHints: hints.bmuHints.length,
    workflowMemories: hints.workflowMemories.length,
    intentLabel: intentPlan.intent,
    intentConfidence: intentPlan.confidence,
    semanticCacheHit: Boolean(semanticHit),
    semanticCacheScore: semanticHit?.score ?? null,
    packetKeyAvailable: Boolean(input.packetKey),
    completionKeyAvailable: Boolean(input.completionKey),
    embeddingAvailable: Boolean(input.embedding),
  } as const;
}

function softmax(scores: number[]): number[] {
  const max = Math.max(...scores);
  const exps = scores.map((score) => Math.exp(score - max));
  const total = exps.reduce((sum, value) => sum + value, 0) || 1;
  return exps.map((value) => value / total);
}

function entropy(probabilities: number[]): number {
  return -probabilities.reduce((sum, p) => sum + (p > 0 ? p * Math.log(p) : 0), 0);
}

function buildRankedCandidates(
  exactHit: boolean,
  semanticHit: SemanticHit | null,
  hints: NonNullable<Awaited<ReturnType<LocalEngramMemoryAdapter['getRoutingHints']>>>,
  intentPlan: ExecutionPlan,
  input: IntentRankerInput
): IntentRankerDecision['rankedCandidates'] {
  const engramSignal = Number(Boolean(hints.didYouMean)) + hints.priorQueries.length * 0.2 + hints.bmuHints.length * 0.25;
  const workflowSignal = Math.min(0.6, hints.workflowMemories.length * 0.2);
  const semanticScore = semanticHit?.score ?? 0;
  const embeddingPenalty = input.embedding ? 0 : -0.1;
  const packetSignal = input.packetKey ? 0.15 : 0;

  const raw = [
    {
      decision: 'exact_cache_answer' as const,
      score: exactHit ? 4.0 : -1.25,
      reasons: exactHit ? ['exact cache hit'] : ['exact cache unavailable'],
    },
    {
      decision: 'semantic_cache_answer' as const,
      score: semanticHit ? 2.1 + semanticScore : -0.65 + embeddingPenalty,
      reasons: semanticHit ? [`semantic cache score=${semanticScore.toFixed(3)}`] : ['semantic cache miss or not probed'],
    },
    {
      decision: 'show_did_you_mean' as const,
      score: engramSignal > 0 || workflowSignal > 0
        ? 1.35 + engramSignal + workflowSignal + intentPlan.confidence * 0.25
        : -0.45,
      reasons: [
        hints.didYouMean ? 'engram did-you-mean candidate' : '',
        hints.bmuHints.length > 0 ? 'BMU proximity hint' : '',
        hints.workflowMemories.length > 0 ? 'workflow memory available' : '',
      ].filter(Boolean),
    },
    {
      decision: 'reuse_ace_packet' as const,
      score: input.packetKey ? 0.55 + packetSignal + intentPlan.confidence * 0.15 : -0.8,
      reasons: input.packetKey ? ['ACE packet key available for compatibility observation'] : ['no ACE packet key yet'],
    },
    {
      decision: 'run_retrieval' as const,
      score: 0.85 + intentPlan.confidence * 0.45 + (intentPlan.intent === 'code_search' ? 0.25 : 0),
      reasons: ['baseline safe retrieval path', `intent=${intentPlan.intent}`],
    },
    {
      decision: 'run_full_synthesis' as const,
      score: 0.2 + (intentPlan.intent === 'chat_direct' ? intentPlan.confidence * 0.45 : 0),
      reasons: ['fallback synthesis path'],
    },
  ];

  const probabilities = softmax(raw.map((candidate) => candidate.score));
  return raw
    .map((candidate, index) => ({
      ...candidate,
      rawScore: candidate.score,
      score: probabilities[index],
      probability: probabilities[index],
      reasons: candidate.reasons,
    }))
    .sort((a, b) => b.rawScore - a.rawScore);
}

function buildRankingLoss(
  rankedCandidates: IntentRankerDecision['rankedCandidates'],
  targetDecision?: IntentRankerDecision['decision']
): IntentRankerDecision['rankingLoss'] {
  const best = rankedCandidates[0];
  const second = rankedCandidates[1];
  const probabilities = rankedCandidates.map((candidate) => candidate.probability);
  const bestProbability = Math.max(best?.probability ?? 1e-9, 1e-9);
  const target = targetDecision
    ? rankedCandidates.find((candidate) => candidate.decision === targetDecision)
    : undefined;

  return {
    bestDecision: best?.decision ?? 'run_retrieval',
    margin: (best?.probability ?? 0) - (second?.probability ?? 0),
    entropy: entropy(probabilities),
    negativeLogLikelihood: -Math.log(bestProbability),
    targetDecision,
    targetLoss: target ? -Math.log(Math.max(target.probability, 1e-9)) : undefined,
  };
}

export async function rankIntent(
  input: IntentRankerInput,
  deps: IntentRankerDependencies = {}
): Promise<IntentRankerDecision> {
  const nowMs = deps.nowMs?.() ?? Date.now();
  const query = normalizeQuery(input.query);
  const queryHash = hashStr(query);
  const completionKey = input.completionKey;
  const packetKey = input.packetKey;

  let exactCacheEntry = input.exactCacheEntry ?? null;
  if (!exactCacheEntry && completionKey && !input.exactCacheChecked) {
    try {
      exactCacheEntry = await (deps.exactMatchCacheFetcher ?? getExactMatchCache)(completionKey);
    } catch {
      exactCacheEntry = null;
    }
  }

  let engramHints: EngramRoutingHint = {
    queryHash,
    didYouMean: undefined,
    priorQueries: [],
    bmuHints: [],
    clusterHints: [],
    workflowMemories: [],
    source: 'local-engram',
    trust: 'low_hint',
  };
  try {
    engramHints = await (deps.engramAdapter ?? engramAdapter).getRoutingHints(query);
  } catch {
    /* degrade silently */
  }

  let intentPlan: ExecutionPlan;
  try {
    const classify =
      deps.intentClassifier ??
      ((q: string) => Promise.resolve(IntentOrchestrator.getFallbackPlan(q)));
    intentPlan = await classify(query, input.history ?? []);
  } catch {
    intentPlan = IntentOrchestrator.getFallbackPlan(query);
  }

  let semanticHit: SemanticHit | null = null;
  if (input.embedding && input.embedding.length > 0) {
    const redis = deps.redisClient ?? getRedis();
    if (redis) {
      try {
        semanticHit = await (deps.semanticSearcher ?? searchSemanticCache)(
          redis,
          input.embedding,
          input.model
        ).catch(() => null);
      } catch {
        semanticHit = null;
      }
    }
  }

  const exactAgeSeconds =
    exactCacheEntry && exactCacheEntry.cachedAt
      ? Math.round((nowMs - new Date(exactCacheEntry.cachedAt).getTime()) / 1000)
      : null;

  const featureInputs = buildFeatureInputs(
    Boolean(exactCacheEntry),
    exactAgeSeconds,
    engramHints,
    intentPlan,
    semanticHit,
    input
  );

  const rankedCandidates = buildRankedCandidates(
    Boolean(exactCacheEntry),
    semanticHit,
    engramHints,
    intentPlan,
    input
  );
  const rankingLoss = buildRankingLoss(rankedCandidates, input.targetDecision);

  // Apply confidence policy on intentConfidence
  const intentConfidence = intentPlan.confidence;
  let finalDecision = rankedCandidates[0]?.decision ?? 'run_retrieval';

  if (finalDecision !== 'exact_cache_answer' && finalDecision !== 'semantic_cache_answer') {
    const hasDym = buildDidYouMeanCandidates(engramHints);
    if (finalDecision === 'show_did_you_mean' && hasDym && hasDym.length > 0) {
      // keep show_did_you_mean
    } else {
      if (intentConfidence >= 0.8) {
        // Route directly
      } else if (intentConfidence >= 0.5) {
        // Show did-you-mean suggestions + compact context
        finalDecision = 'show_did_you_mean';
      } else {
        // Broad retrieval + clarifying question
        finalDecision = 'run_retrieval';
      }
    }
  }

  const matchingCandidate = rankedCandidates.find((c) => c.decision === finalDecision);
  const confidence = matchingCandidate
    ? matchingCandidate.probability
    : (rankedCandidates[0]?.probability ?? DEFAULT_DECISION_CONFIDENCE);

  const evalRunId = buildEvalTraceId(queryHash);

  // Save the evaluation run to DB
  try {
    const cards = engramHints.workflowMemories.map((m) => m.summary);
    const clusters = engramHints.clusterHints || [];

    const dbPayload = sanitizeZeroHiddenThoughts({
      runId: evalRunId,
      userQuery: query,
      predictedIntent: intentPlan.intent,
      confidence: intentConfidence,
      selectedCards: cards,
      selectedClusters: clusters,
      cacheHit: Boolean(exactCacheEntry),
      metadata: {
        decision: finalDecision,
        rankedCandidates,
        rankingLoss,
        didYouMean: buildDidYouMeanCandidates(engramHints),
        featureInputs,
        model: input.model,
      },
    });

    await db.insert(intentEvalRuns).values(dbPayload);
  } catch (dbErr) {
    // degrade silently so DB issues do not crash the ranker
    console.error('[IntentRanker] Failed to persist eval run:', dbErr);
  }

  return {
    queryHash,
    decision: finalDecision,
    confidence,
    rankedCandidates,
    rankingLoss,
    intentLabel: intentPlan.intent,
    intentConfidence,
    didYouMean: buildDidYouMeanCandidates(engramHints),
    selectedFeatureInputs: featureInputs,
    cacheKeys: buildCacheKeys(input),
    expectedTokenSavings: null,
    evalTraceId: evalRunId,
  };
}

// Alias kept for compatibility.
export const scoreIntent = rankIntent;

export async function logIntentEvalEvent(
  event: Omit<IntentEvalEvent, 'durationMs'> & { durationMs?: number }
): Promise<void> {
  try {
    await logEvent(
      sanitizeZeroHiddenThoughts({
        userId: event.userId,
        sessionId: event.sessionId,
        eventType: 'intent_eval',
        payload: {
          queryHash: event.queryHash,
          confidence: event.confidence,
          queryPreview: event.queryPreview.slice(0, 120),
          metadata: {
            decision: event.decision,
            intentLabel: event.intentLabel,
            intentConfidence: event.intentConfidence,
            cacheKeys: event.cacheKeys,
            featureInputs: event.featureInputs,
            rankedCandidates: event.rankedCandidates,
            rankingLoss: event.rankingLoss,
            didYouMean: event.didYouMean,
            durationMs: event.durationMs ?? 0,
            model: event.model,
          },
        },
      })
    );
  } catch {
    // Never break the main flow for analytics
  }
}

/**
 * Query engramCards by scope/intent with optional Redis caching.
 */
export async function recallEngramsForIntent(intent: string, limit = 5, redis?: Redis) {
  const client = redis ?? getRedis();
  if (client) {
    const cached = await client.get(`engram:intent:${intent}`);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // degrade silently
      }
    }
  }

  const cards = await db
    .select()
    .from(engramCards)
    .where(eq(engramCards.scope, intent))
    .limit(limit);

  if (client && cards.length > 0) {
    try {
      await client.set(`engram:intent:${intent}`, JSON.stringify(cards), 'EX', 3600); // 1 hour cache
    } catch {
      // degrade silently
    }
  }

  return cards;
}

export interface MacroRerankCandidate {
  id: string;
  intentFit: number;       // 0 to 1
  cosine: number;          // 0 to 1
  tagOverlap: number;      // 0 to 1
  clusterHotness: number;  // 0 to 1
  authority: number;       // 0 to 1
  engramMatch: number;     // 0 to 1
  recency: number;         // 0 to 1
  tokenCost: number;       // 0 to 1 (normalized token cost)
  payload?: any;
}

/**
 * Rerank retrieval candidates using a linear weighted scoring formula:
 * score = 0.25 * intentFit + 0.20 * cosine + 0.15 * tagOverlap + 0.15 * clusterHotness
 *       + 0.10 * authority + 0.05 * engramMatch + 0.05 * recency - 0.05 * tokenCost
 */
export function macroRerank(
  candidates: MacroRerankCandidate[]
): Array<MacroRerankCandidate & { finalScore: number }> {
  return candidates
    .map((candidate) => {
      const finalScore =
        0.25 * (candidate.intentFit ?? 0) +
        0.20 * (candidate.cosine ?? 0) +
        0.15 * (candidate.tagOverlap ?? 0) +
        0.15 * (candidate.clusterHotness ?? 0) +
        0.10 * (candidate.authority ?? 0) +
        0.05 * (candidate.engramMatch ?? 0) +
        0.05 * (candidate.recency ?? 0) -
        0.05 * (candidate.tokenCost ?? 0);

      return {
        ...candidate,
        finalScore,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}
