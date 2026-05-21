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

export type IntentScorerDecision = {
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
    decision: IntentScorerDecision['decision'];
    score: number; // normalized 0-1 ranking score
    rawScore: number; // original routing signal before softmax
    probability: number;
    reasons: string[];
  }>;
  rankingLoss: {
    bestDecision: IntentScorerDecision['decision'];
    margin: number;
    entropy: number;
    negativeLogLikelihood: number;
    targetDecision?: IntentScorerDecision['decision'];
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
  decision: IntentScorerDecision['decision'];
  confidence: number;
  rankedCandidates: Array<{
    decision: IntentScorerDecision['decision'];
    score: number; // normalized 0-1 ranking score
    rawScore: number; // original routing signal before softmax
    probability: number;
    reasons: string[];
  }>;
  rankingLoss: {
    bestDecision: IntentScorerDecision['decision'];
    margin: number;
    entropy: number;
    negativeLogLikelihood: number;
    targetDecision?: IntentScorerDecision['decision'];
    targetLoss?: number;
  };
  intentLabel: string;
  intentConfidence: number;
  cacheKeys: string[];
  featureInputs: Record<string, number | string | boolean | null>;
  didYouMean?: IntentScorerDecision['didYouMean'];
  durationMs: number;
  queryPreview: string;
};

export interface IntentScorerInput {
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
  targetDecision?: IntentScorerDecision['decision'];
}

export interface IntentScorerDependencies {
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
  const candidates: IntentScorerDecision['didYouMean'] = [];
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

function buildCacheKeys(input: IntentScorerInput): string[] {
  return [input.completionKey, input.packetKey].filter((value): value is string => Boolean(value));
}

function buildFeatureInputs(
  exactHit: boolean,
  exactAge: number | null,
  hints: NonNullable<Awaited<ReturnType<LocalEngramMemoryAdapter['getRoutingHints']>>>,
  intentPlan: ExecutionPlan,
  semanticHit: SemanticHit | null,
  input: IntentScorerInput
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
  input: IntentScorerInput
): IntentScorerDecision['rankedCandidates'] {
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
    }))
    .sort((a, b) => b.rawScore - a.rawScore);
}

function buildRankingLoss(
  rankedCandidates: IntentScorerDecision['rankedCandidates'],
  targetDecision?: IntentScorerDecision['decision']
): IntentScorerDecision['rankingLoss'] {
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

export async function scoreIntent(
  input: IntentScorerInput,
  deps: IntentScorerDependencies = {}
): Promise<IntentScorerDecision> {
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
    const classify = deps.intentClassifier ?? ((q: string) => Promise.resolve(IntentOrchestrator.getFallbackPlan(q)));
    intentPlan = await classify(query, input.history ?? []);
  } catch {
    intentPlan = IntentOrchestrator.getFallbackPlan(query);
  }

  let semanticHit: SemanticHit | null = null;
  if (input.embedding && input.embedding.length > 0) {
    const redis = deps.redisClient ?? getRedis();
    if (redis) {
      try {
        semanticHit = await (deps.semanticSearcher ?? searchSemanticCache)(redis, input.embedding, input.model).catch(() => null);
      } catch {
        semanticHit = null;
      }
    }
  }

  const exactAgeSeconds = exactCacheEntry && exactCacheEntry.cachedAt
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
  const decision = rankedCandidates[0]?.decision ?? 'run_retrieval';
  const confidence = rankedCandidates[0]?.probability ?? DEFAULT_DECISION_CONFIDENCE;

  return {
    queryHash,
    decision,
    confidence,
    rankedCandidates,
    rankingLoss,
    intentLabel: intentPlan.intent,
    intentConfidence: intentPlan.confidence,
    didYouMean: buildDidYouMeanCandidates(engramHints),
    selectedFeatureInputs: featureInputs,
    cacheKeys: buildCacheKeys(input),
    expectedTokenSavings: null,
    evalTraceId: buildEvalTraceId(queryHash),
  };
}

export async function logIntentEvalEvent(event: Omit<IntentEvalEvent, 'durationMs'> & { durationMs?: number }): Promise<void> {
  try {
    await logEvent({
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
    });
  } catch {
    // Never break the main flow for analytics
  }
}
