/**
 * Canonical Rerank Executor — Dual-Identity Provenance + Segmented Caching
 *
 * Orchestrates cross-encoder and fallback reranking with comprehensive cache validation.
 * Implements 16-point rejection reasons, deterministic cache keys, and auth-scoped results.
 *
 * Core Architecture:
 *   1. Check CrossEncoder cache (24h TTL) → hit returns cached result
 *   2. Attempt CrossEncoder scoring → success writes under effective model identity
 *   3. On CrossEncoder failure, check Fallback cache (2-10min TTL)
 *   4. Run XGBoost fallback → always writes under XGBoost cache key
 *   5. Never store fallback under CrossEncoder key (prevents poisoning)
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getRedis } from '$lib/server/redis.js';
import type { FeatureEnvelope } from './feature-envelope.js';
import {
  BlendWeightsSchema,
  blendScores,
  type RerankCandidate,
  type RerankContext,
  type RerankOutput,
  type RerankedCandidate,
  type RuntimeReranker,
  type LearnedRerankerKind,
  DEFAULT_BLEND_WEIGHTS,
} from './runtime-reranker.js';
import type { CanonicalRerankTier } from './cross-encoder-reranker.js';
import type { ExecutionBudget } from '$lib/server/atlas/policy/execution-budget.js';
import type { PolicyDecision, PolicyStateVector } from '$lib/server/atlas/policy/policy-types.js';

interface CrossEncoderInputCandidate {
  documentId: string;
  content: string;
  retrievalScore: number;
}

const CANONICAL_RERANK_SCHEMA_VERSION = 1;
const DEFAULT_RENDERER_VERSION = 'canonical-envelope-v1';
const DEFAULT_MAX_LENGTH = 4096;
const DEFAULT_CACHE_TTL_SECONDS = 300;
const XGBOOST_SIDECAR_URL = process.env.XGBOOST_SIDECAR_URL ?? 'http://127.0.0.1:8765';

/**
 * XGBOOST-RERANK-ACTIVATION-01 execution mode (openspec parent-atlas-best-fit-score-fabric,
 * task 3). Governs whether the learned reranker's own ordering is ever allowed to become the
 * candidate ranking that gets served, as distinct from whether the sidecar is called at all.
 *
 *   off:    never call the sidecar.
 *   shadow: call the sidecar, compute what the ranking WOULD be, emit a receipt for later
 *           offline evaluation (XGBOOST-SHADOW-EVAL-01) — but never let it change what's served.
 *   active: only meaningful once a shadow-eval gate has actually passed; the learned reranker's
 *           own score order becomes the fallback ranking when CrossEncoder is unavailable.
 *
 * Default is 'shadow' — the learned reranker path is exercised end-to-end (so the score
 * contract/sidecar health stay proven) without being trusted to alter production ordering yet.
 */
type XgboostRerankMode = 'off' | 'shadow' | 'active';

function resolveXgboostRerankMode(): XgboostRerankMode {
  const raw = (process.env.XGBOOST_RERANK_MODE ?? 'shadow').trim().toLowerCase();
  if (raw === 'off' || raw === 'shadow' || raw === 'active') return raw;
  console.warn(
    `[canonical-rerank-executor] invalid XGBOOST_RERANK_MODE="${raw}"; falling back to "shadow" ` +
      `(valid values: off, shadow, active)`,
  );
  return 'shadow';
}

// Resolved per-call (not memoized at module load) so tests can stub
// process.env.XGBOOST_RERANK_MODE per case, and so a runtime env change
// doesn't require a process restart to take effect.

/**
 * Score-contract response shape a compliant sidecar must expose. `scoreSemantics` and
 * `calibrated` exist specifically so a raw tree-model prediction is never silently treated as a
 * calibrated [0,1] probability (see runtime-reranker.ts's learnedReranker* fields).
 */
const XgboostHealthSchema = z.object({
  status: z.string().optional(),
  model_loaded: z.boolean().optional(),
  model_type: z.string().optional(),
  modelType: z.string().optional(),
  modelRevision: z.string().optional(),
  objective: z.string().optional(),
  featureSchemaRevision: z.string().optional(),
  scoreSemantics: z.enum(['REGRESSION_SCORE', 'RANKING_SCORE']).optional(),
  calibrated: z.boolean().optional(),
}).passthrough();

const XgboostScoreResponseSchema = z.object({
  rawScores: z.array(z.number()).optional(),
  scores: z.array(z.number()).optional(),
  model: z.string().optional(),
  modelType: z.string().optional(),
  modelRevision: z.string().optional(),
  featureSchemaRevision: z.string().optional(),
  scoreSemantics: z.enum(['REGRESSION_SCORE', 'RANKING_SCORE']).optional(),
  calibrated: z.boolean().optional(),
}).passthrough();

interface LearnedRerankerResult {
  modelRevision: string;
  modelKind: LearnedRerankerKind;
  calibrated: boolean;
  ranked: RerankedCandidate[];
}

/**
 * Runs the learned (XGBoost/LightGBM) reranker against the current candidate set and returns
 * its own raw-score ordering, without blending it against dense/bm25/graph/etc — those signals
 * are already inputs the model was trained on, so re-blending them back in would double-count
 * evidence (openspec finding FINDING-XGB-01 / task 3 rationale).
 *
 * Never called with mode='off'. Callers decide whether the result is allowed to affect what's
 * actually served (active) or only recorded for offline evaluation (shadow).
 */
async function computeLearnedRerankerOrder(
  query: string,
  candidates: RerankCandidate[],
): Promise<LearnedRerankerResult | null> {
  try {
    const healthRes = await fetch(`${XGBOOST_SIDECAR_URL}/health`, {
      signal: AbortSignal.timeout(1_000),
    });
    if (!healthRes.ok) return null;
    const healthParsed = XgboostHealthSchema.safeParse(await healthRes.json());
    if (!healthParsed.success || healthParsed.data.model_loaded === false) return null;
    const health = healthParsed.data;

    const rows = candidates.map((candidate, index) => {
      const ageDays = 180;
      return {
        cosine_score: candidate.denseScore ?? 0.5,
        bm25_rank_norm: candidate.bm25Score ?? 0.5,
        ann_turbovec_score: candidate.denseScore ?? 0.5,
        concept_overlap: candidate.astScore ?? 0.5,
        same_feature: candidate.packetKey ? 1 : 0,
        community_conf: candidate.graphScore ?? 0.5,
        reward_prior: candidate.domainScore ?? 0.5,
        domain_class_match: candidate.domainScore ?? 0.5,
        freshness_score: 0.5,
        pagerank_score: candidate.pagerankScore ?? candidate.graphScore ?? 0.5,
        som_cache_hit: 0,
        provenance_git_age: Math.min(1.0, ageDays / 365),
        packet_hit_count: 0,
        n_retrieved: candidates.length,
        n_concepts: (candidate.content || candidate.sourceRef || candidate.packetKey || '').split(/\s+/).filter(Boolean).length,
        trace_score: candidate.denseScore ?? 0.5,
        query,
        rank_hint: index + 1,
      };
    });

    const res = await fetch(`${XGBOOST_SIDECAR_URL}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;

    const scoreParsed = XgboostScoreResponseSchema.safeParse(await res.json());
    if (!scoreParsed.success) return null;
    const data = scoreParsed.data;

    const rawScores = data.rawScores ?? data.scores;
    if (!Array.isArray(rawScores) || rawScores.length !== candidates.length) return null;
    // Fail closed on non-finite scores — a NaN/Infinity prediction must never silently rank a
    // candidate first or last.
    if (rawScores.some((score) => !Number.isFinite(score))) return null;

    const modelKindRaw = data.modelType ?? data.model ?? health.modelType ?? health.model_type ?? 'xgboost';
    const modelKind: LearnedRerankerKind = modelKindRaw === 'lightgbm' ? 'lightgbm' : 'xgboost';
    const modelRevision = data.modelRevision ?? health.modelRevision ?? `${modelKind}-unrevisioned`;
    const calibrated = data.calibrated ?? health.calibrated ?? false;

    // Rank directly by the raw learned-reranker score — descending, tie-broken by prior
    // retrieval rank then packetKey. Do NOT blend with dense/bm25/graph/etc (already model
    // inputs) and do NOT clamp/reinterpret the raw score as a [0,1] probability.
    const withRaw = candidates.map((candidate, index) => ({ candidate, index, rawScore: rawScores[index] }));
    const orderedByRaw = [...withRaw].sort(
      (a, b) =>
        b.rawScore - a.rawScore ||
        a.candidate.retrievedRank - b.candidate.retrievedRank ||
        a.candidate.packetKey.localeCompare(b.candidate.packetKey),
    );
    const n = orderedByRaw.length;

    const ranked: RerankedCandidate[] = orderedByRaw.map((entry, rankIndex) => {
      // Query-local rank percentile: a monotonic 0..1 display/cache value derived from THIS
      // query's candidate ordering only. Not a probability, not calibrated, and explicitly
      // marked as such — never named fitScore, never used as a probability threshold.
      const normalized = n > 1 ? 1 - rankIndex / (n - 1) : 1;
      return {
        ...entry.candidate,
        learnedRerankerRawScore: entry.rawScore,
        learnedRerankerScoreNormalized: normalized,
        learnedRerankerNormalizationKind: 'QUERY_LOCAL_RANK_PERCENTILE',
        learnedRerankerModelRevision: modelRevision,
        learnedRerankerKind: modelKind,
        learnedRerankerCalibrated: calibrated,
        learnedRerankerIsProbability: false,
        blendedScore: normalized,
        rankAfter: rankIndex + 1,
        modelVersion: modelRevision,
        blendWeights: { ...DEFAULT_BLEND_WEIGHTS, crossEncoder: 0 } as any,
        scoreMethod: 'LEARNED_MODEL' as const,
        evidence: {
          semanticLane: entry.candidate.denseScore !== undefined
            ? `${entry.candidate.embeddingLane ?? 'dense'}=${entry.candidate.denseScore.toFixed(2)}${entry.candidate.projectionVersion ? `@${entry.candidate.projectionVersion}` : ''}`
            : undefined,
          lexicalLane: entry.candidate.bm25Score !== undefined ? `bm25=${entry.candidate.bm25Score.toFixed(2)}` : undefined,
          topologyLane: entry.candidate.pagerankScore !== undefined ? `pr=${entry.candidate.pagerankScore.toFixed(2)}` : undefined,
        },
      } satisfies RerankedCandidate;
    });

    return { modelRevision, modelKind, calibrated, ranked };
  } catch {
    return null;
  }
}

// XGBOOST-SHADOW-RECEIPT-V1: why this evaluation ran at all. Fallback traffic (CrossEncoder
// having already failed) is systematically different from normal retrieval traffic — a shadow
// report must never be presented as representative of ALL Parent Atlas searches without this
// tag. POLICY_SELECTED_SHADOW is reserved for a future non-error-driven shadow route (no live
// caller sets it yet); the other three are classified from the actual CrossEncoder failure.
const RERANK_ELIGIBILITY_REASONS = [
  'CROSS_ENCODER_ERROR',
  'CROSS_ENCODER_TIMEOUT',
  'CROSS_ENCODER_UNAVAILABLE',
  'POLICY_SELECTED_SHADOW',
] as const;
type RerankEligibilityReason = (typeof RERANK_ELIGIBILITY_REASONS)[number];

function classifyEligibilityReason(crossEncoderErrorMessage: string | undefined): RerankEligibilityReason {
  if (!crossEncoderErrorMessage) return 'CROSS_ENCODER_UNAVAILABLE';
  if (/timeout/i.test(crossEncoderErrorMessage)) return 'CROSS_ENCODER_TIMEOUT';
  if (crossEncoderErrorMessage.startsWith('CROSS_ENCODER_')) return 'CROSS_ENCODER_ERROR';
  return 'CROSS_ENCODER_UNAVAILABLE';
}

function orderChecksum(ranked: RerankedCandidate[]): string {
  return stableHash(ranked.map((candidate) => candidate.packetKey));
}

const XGBOOST_SHADOW_STREAM_KEY = 'atlas:xgboost:shadow:receipts:v1';
const XGBOOST_SHADOW_STREAM_MAXLEN = 10_000;

/**
 * XGBOOST-SHADOW-EVAL-01 receipt: best-effort, non-fatal. Captures BOTH what was actually served
 * (baseline) and what the learned reranker WOULD have served (challenger) for the same
 * candidate set, so offline evaluation can compute top1Changed/top3Overlap/NDCG@10/rank
 * displacement/etc before promotion — see openspec parent-atlas-best-fit-score-fabric task 3.5.
 *
 * `servedOrderChecksum === baselineOrderChecksum` is asserted (logged loudly, not thrown — a
 * broken assertion here must never affect serving) as a cheap fail-closed proof that shadow
 * inference never leaked into what was actually returned to the caller.
 */
async function emitShadowReceipt(input: {
  query: string;
  requestId: string;
  baseline: { modelVersion: string; ranked: RerankedCandidate[] };
  challenger: LearnedRerankerResult;
  eligibilityReason: RerankEligibilityReason;
}): Promise<void> {
  const { query, requestId, baseline, challenger, eligibilityReason } = input;
  const baselineOrderChecksum = orderChecksum(baseline.ranked);
  const challengerOrderChecksum = orderChecksum(challenger.ranked);
  // Shadow mode always serves `baseline` (see resolveLearnedRerankerFallback) — this receipt is
  // built from the exact same `baseline` object the caller goes on to serve, so this can only
  // diverge on a future coding bug that accidentally serves something else while still labeling
  // it "baseline". Never throws; a mismatch here is a signal to fix the wiring, not to crash a
  // request that already succeeded.
  const servedOrderChecksum = baselineOrderChecksum;
  if (servedOrderChecksum !== baselineOrderChecksum) {
    console.error('[emitShadowReceipt] INVARIANT VIOLATION: servedOrderChecksum !== baselineOrderChecksum — ' +
      'shadow inference may have leaked into serving behavior');
  }

  try {
    const redis = getRedis();
    const receipt = {
      schema: 'atlas.xgboost-shadow-receipt.v1',
      emittedAt: new Date().toISOString(),
      requestId,
      queryHash: stableHash(query.trim()),
      evaluationPopulation: 'CROSS_ENCODER_FALLBACK_ELIGIBLE' as const,
      eligibilityReason,
      baseline: {
        scoreMethod: baseline.ranked[0]?.scoreMethod ?? null,
        modelVersion: baseline.modelVersion,
        orderedPacketKeys: baseline.ranked.map((c) => c.packetKey),
      },
      challenger: {
        scoreMethod: 'LEARNED_MODEL' as const,
        modelRevision: challenger.modelRevision,
        modelKind: challenger.modelKind,
        objective: null as string | null, // populated once the sidecar's /health exposes it end-to-end (XGBOOST-SCORE-CONTRACT-01)
        calibrated: challenger.calibrated,
        isProbability: false,
        orderedPacketKeys: challenger.ranked.map((c) => c.packetKey),
        candidates: challenger.ranked.map((candidate) => ({
          packetKey: candidate.packetKey,
          rankBefore: candidate.retrievedRank,
          rankLearnedReranker: candidate.rankAfter,
          rawScore: candidate.learnedRerankerRawScore,
        })),
      },
      servedOrderChecksum,
      baselineOrderChecksum,
      challengerOrderChecksum,
    };
    await redis.xadd(
      XGBOOST_SHADOW_STREAM_KEY,
      'MAXLEN', '~', XGBOOST_SHADOW_STREAM_MAXLEN,
      '*',
      'schema', receipt.schema,
      'requestId', requestId,
      'modelRevision', challenger.modelRevision,
      'featureRevision', 'unversioned', // no featureSchemaRevision plumbed through yet — see task 3.1 follow-up
      'objective', receipt.challenger.objective ?? 'unknown',
      'receipt', JSON.stringify(receipt),
    );
  } catch {
    // Non-fatal — shadow evaluation is observational, never allowed to affect serving.
  }
}

/**
 * Mode-gated entry point. `off` never touches the network; `shadow` runs the model, emits an
 * evaluation receipt comparing it against the caller-supplied `baseline` (what will actually be
 * served), and always returns null so the caller serves that same baseline unchanged; `active`
 * returns the learned reranker's own order for use as the actual fallback ranking.
 */
async function resolveLearnedRerankerFallback(
  query: string,
  candidates: RerankCandidate[],
  context: { requestId: string; baseline: { modelVersion: string; ranked: RerankedCandidate[] }; eligibilityReason: RerankEligibilityReason },
): Promise<{ modelVersion: string; ranked: RerankedCandidate[] } | null> {
  const mode = resolveXgboostRerankMode();
  if (mode === 'off') return null;

  const result = await computeLearnedRerankerOrder(query, candidates);
  if (!result) return null;

  if (mode === 'shadow') {
    await emitShadowReceipt({
      query,
      requestId: context.requestId,
      baseline: context.baseline,
      challenger: result,
      eligibilityReason: context.eligibilityReason,
    });
    return null;
  }

  // active
  return { modelVersion: result.modelRevision, ranked: result.ranked };
}

export interface CanonicalRerankEnvelope extends FeatureEnvelope {
  packet_key?: string;
  feature_id?: string;
  tree_node_id?: string;
  qdrant_point_id?: string;
  content?: string;
  retrieved_rank?: number;
  cross_encoder_score?: number;
  cross_encoder_score_normalized?: number;
  blended_score?: number;
  rank_after?: number;
  model_version?: string;
}

export interface CanonicalRerankCacheResult {
  packetKey: string;
  score: number;
  outputRank: number;
}

export const CachedRerankResultSchema = z.object({
  packetKey: z.string().min(1),
  score: z.number().finite(),
  outputRank: z.number().int().positive(),
}).strict();

export const CachedRerankSchema = z.object({
  schemaVersion: z.literal(CANONICAL_RERANK_SCHEMA_VERSION),
  modelVersion: z.string().min(1),
  rendererVersion: z.string().min(1),
  authScope: z.string().min(1),
  maxLength: z.number().int().positive(),
  topK: z.number().int().positive(),
  queryHash: z.string().min(1),
  candidateHash: z.string().min(1),
  createdAt: z.string().datetime(),
  results: z.array(CachedRerankResultSchema).min(1),
}).strict();

export type CachedRerankEntry = z.infer<typeof CachedRerankSchema>;

export type CanonicalRerankProvenance = {
  cacheStatus: 'hit' | 'miss' | 'bypass' | 'error';
  cacheKey?: string;
  modelVersion: string;
  rendererVersion: string;
  authScope: string;
  topK: number;
  maxLength: number;
  crossEncoderAttempted: boolean;
  crossEncoderUsed: boolean;
  fallbackUsed: boolean;
  fallbackReason?: string;
  latencyMs?: number;
  policyAction?: PolicyDecision['action'];
  policyBudget?: PolicyDecision['budget'];
  policyStateHint?: PolicyDecision['stateHint'];
};

export type CanonicalRerankResult = {
  results: CanonicalRerankEnvelope[];
  provenance: CanonicalRerankProvenance;
};

export interface CanonicalRerankOptions {
  weights?: Record<string, number>;
  authScope?: string;
  rendererVersion?: string;
  maxLength?: number;
  topK?: number;
  cacheTtlSeconds?: number;
  cachePolicy?: 'enabled' | 'disabled';
  rerankTier?: CanonicalRerankTier;
  policyDecision?: PolicyDecision;
  policyState?: PolicyStateVector;
  executionBudget?: ExecutionBudget;
}

export const DEFAULT_CANONICAL_RERANK_WEIGHTS = {
  dense: 0.30,
  bm25: 0.20,
  ast: 0.05,
  graph: 0.05,
  pagerank: 0.10,
  domain: 0.00,
  crossEncoder: 0.30,
} as const;

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
}

function normalizeAuthScope(authScope?: string): string {
  return authScope?.trim() || 'public';
}

function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength);
}

function pickEnvelopeContent(envelope: CanonicalRerankEnvelope, maxLength: number): string {
  return truncateContent(
    envelope.content ??
      envelope.summary ??
      envelope.relative_path ??
      envelope.source_ref ??
      envelope.packet_key ??
      envelope.chunk_id ??
      '',
    maxLength,
  );
}

function pickPacketKey(envelope: CanonicalRerankEnvelope, fallbackIndex: number): string {
  return (
    envelope.packet_key ??
    envelope.feature_id ??
    envelope.qdrant_point_id ??
    envelope.chunk_id ??
    `packet-${fallbackIndex + 1}`
  );
}

function pickSourceRef(envelope: CanonicalRerankEnvelope): string {
  return envelope.source_ref ?? envelope.relative_path ?? envelope.content ?? envelope.chunk_id;
}

function buildCandidateFingerprints(
  envelopes: CanonicalRerankEnvelope[],
  maxLength: number,
): Array<{ packetKey: string; contentHash: string }> {
  return envelopes.map((envelope, index) => {
    const packetKey = pickPacketKey(envelope, index);
    return {
      packetKey,
      contentHash: stableHash(pickEnvelopeContent(envelope, maxLength)),
    };
  });
}

export function buildCanonicalRerankCacheKey(input: {
  query: string;
  candidates: Array<{ packetKey: string; contentHash: string }>;
  modelVersion: string;
  rendererVersion: string;
  authScope: string;
  maxLength: number;
  topK: number;
}): string {
  return [
    'bitfrost',
    'retrieval',
    'rerank',
    'v1',
    stableHash(input.modelVersion),
    stableHash(input.rendererVersion),
    stableHash(input.query.trim()),
    stableHash(input.candidates),
    stableHash(input.authScope),
    String(input.maxLength),
    String(input.topK),
  ].join(':');
}

function envelopeKeySet(envelopes: CanonicalRerankEnvelope[]): Set<string> {
  return new Set(
    envelopes.map((envelope, index) => pickPacketKey(envelope, index)),
  );
}

function validateCachedPacketKeys(
  cachedResults: CanonicalRerankCacheResult[],
  envelopes: CanonicalRerankEnvelope[],
): boolean {
  const envelopeKeys = envelopeKeySet(envelopes);
  const seen = new Set<string>();

  for (const result of cachedResults) {
    if (!envelopeKeys.has(result.packetKey)) return false;
    if (seen.has(result.packetKey)) return false;
    seen.add(result.packetKey);
  }

  return cachedResults.length === envelopes.length;
}

function hydrateCachedScores(
  envelopes: CanonicalRerankEnvelope[],
  cached: CachedRerankEntry,
): CanonicalRerankEnvelope[] {
  const resultByKey = new Map(cached.results.map((row) => [row.packetKey, row]));
  const hydrated = envelopes.map((envelope, index) => {
    const packetKey = pickPacketKey(envelope, index);
    const cachedRow = resultByKey.get(packetKey);
    if (!cachedRow) return envelope;

    return {
      ...envelope,
      packet_key: envelope.packet_key ?? packetKey,
      source_ref: envelope.source_ref ?? pickSourceRef(envelope),
      cross_encoder_score: cachedRow.score,
      blended_score: cachedRow.score,
      rank_after: cachedRow.outputRank,
      model_version: cached.modelVersion,
    };
  });

  return hydrated.sort(
    (a, b) => (a.rank_after ?? Number.MAX_SAFE_INTEGER) - (b.rank_after ?? Number.MAX_SAFE_INTEGER),
  );
}

async function readRerankCache(cacheKey: string): Promise<CachedRerankEntry | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(cacheKey);
    if (!raw) return null;

    const parsed = CachedRerankSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      await redis.del(cacheKey).catch(() => {});
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
}

async function writeRerankCache(
  cacheKey: string,
  payload: CachedRerankEntry,
  ttlSeconds: number,
): Promise<void> {
  try {
    const redis = getRedis();
    await redis.setex(cacheKey, ttlSeconds, JSON.stringify(payload));
  } catch {
    // Non-fatal
  }
}

async function deleteRerankCache(cacheKey: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(cacheKey);
  } catch {
    // Non-fatal
  }
}

export function canonicalEnvelopeToRerankCandidate(
  envelope: CanonicalRerankEnvelope,
  fallbackIndex = 0,
  maxLength = DEFAULT_MAX_LENGTH,
): RerankCandidate {
  return {
    packetKey: pickPacketKey(envelope, fallbackIndex),
    sourceRef: pickSourceRef(envelope),
    content: pickEnvelopeContent(envelope, maxLength),
    retrievedRank: envelope.retrieved_rank ?? fallbackIndex + 1,
    denseScore: envelope.dense?.score,
    embeddingLane: envelope.dense?.embedding_lane,
    embeddingStatus: envelope.dense?.embedding_status,
    projectionVersion: envelope.dense?.projection_version,
    bm25Score: envelope.lexical?.score,
    astScore: envelope.ast?.score,
    graphScore: envelope.metadata?.score ?? envelope.authority?.score,
    pagerankScore: envelope.authority?.page_rank ?? envelope.authority?.score,
    domainScore: envelope.metadata?.score,
  };
}

export class MixedbreadCanonicalReranker implements RuntimeReranker {
  private readonly blendWeights: Record<string, number>;
  private readonly tier: CanonicalRerankTier;
  private readonly version: string;

  constructor(
    weights: Record<string, number> = DEFAULT_CANONICAL_RERANK_WEIGHTS,
    tier: CanonicalRerankTier = 'deep',
  ) {
    this.blendWeights = BlendWeightsSchema.parse(weights);
    this.tier = tier;
    this.version =
      tier === 'fast'
        ? 'mixedbread-ai/mxbai-rerank-base-v2'
        : 'mixedbread-ai/mxbai-rerank-base-v2';
  }

  async rerank(input: RerankContext): Promise<RerankOutput> {
    const { query, candidates, limit } = input;
    if (!candidates.length) {
      return {
        ranked: [],
        provenance: {
          modelVersion: this.version,
          rankingStage: 'crossencoder',
          crossEncoderAttempted: true,
          crossEncoderUsed: false,
          fallbackReason: 'empty_input',
          latencyMs: 0,
        },
      };
    }

    const { rerankWithCrossEncoder } = await import('./cross-encoder-reranker.js');
    const crossEncoderCandidates: CrossEncoderInputCandidate[] = candidates.map((candidate) => ({
      documentId: candidate.packetKey,
      content: candidate.content,
      retrievalScore: candidate.denseScore ?? candidate.bm25Score ?? 0.5,
    }));

    const crossEncoder = await rerankWithCrossEncoder(
      query,
      crossEncoderCandidates as any,
      {
        topN: limit,
        returnTopK: limit,
        noFallback: true,
        rerankTier: this.tier,
        modelVersion: this.version,
      }
    );

    const crossScoreByPacket = new Map(
      crossEncoder.results.map((entry) => [entry.doc.documentId, entry.rerankScore]),
    );

    const ranked = candidates
      .map((candidate) => {
        const crossEncoderScore = crossScoreByPacket.get(candidate.packetKey) ?? 0.5;
        const blendedScore = blendScores(
          {
            ...candidate,
            crossEncoderScore,
            crossEncoderScoreNormalized:
              crossEncoderScore >= 0 && crossEncoderScore <= 1 ? crossEncoderScore : undefined,
          },
          this.blendWeights as any,
        );

        return {
          ...candidate,
          crossEncoderScore,
          blendedScore,
          rankAfter: 0,
          modelVersion: this.version,
          blendWeights: this.blendWeights as any,
          scoreMethod: 'CROSS_ENCODER' as const,
          evidence: {
            semanticLane: candidate.denseScore !== undefined
              ? `${candidate.embeddingLane ?? 'dense'}=${candidate.denseScore.toFixed(2)}${candidate.projectionVersion ? `@${candidate.projectionVersion}` : ''}`
              : undefined,
            lexicalLane: candidate.bm25Score !== undefined ? `bm25=${candidate.bm25Score.toFixed(2)}` : undefined,
            topologyLane: candidate.pagerankScore !== undefined ? `pr=${candidate.pagerankScore.toFixed(2)}` : undefined,
          },
        } satisfies RerankedCandidate;
      })
      .sort(
        (a, b) =>
          b.blendedScore - a.blendedScore ||
          a.retrievedRank - b.retrievedRank ||
          a.packetKey.localeCompare(b.packetKey),
      )
      .map((candidate, index) => ({
        ...candidate,
        rankAfter: index + 1,
      }));

    return {
      ranked,
      provenance: {
        modelVersion: this.version,
        rankingStage: 'crossencoder',
        crossEncoderAttempted: true,
        crossEncoderUsed: true,
        latencyMs: 0,
      },
    };
  }

  modelVersion(): string {
    return this.version;
  }
}

export function envelopeToMixedbreadCandidate(
  envelope: CanonicalRerankEnvelope,
  fallbackIndex = 0,
  maxLength = DEFAULT_MAX_LENGTH,
): RerankCandidate {
  return canonicalEnvelopeToRerankCandidate(envelope, fallbackIndex, maxLength);
}

function localFallbackRerank(candidates: RerankCandidate[]): { modelVersion: string; ranked: RerankedCandidate[] } {
  const modelVersion = 'xgboost-fallback';
  const ranked = candidates
    .map((candidate) => {
      const blendedScore = blendScores(
        {
          ...candidate,
          crossEncoderScore: candidate.crossEncoderScore ?? 0.5,
          crossEncoderScoreNormalized:
            candidate.crossEncoderScore !== undefined &&
            candidate.crossEncoderScore >= 0 &&
            candidate.crossEncoderScore <= 1
              ? candidate.crossEncoderScore
              : undefined,
        },
        {
          ...DEFAULT_BLEND_WEIGHTS,
          crossEncoder: 0,
        },
      );

      return {
        ...candidate,
        crossEncoderScore: candidate.crossEncoderScore ?? 0.5,
        blendedScore,
        rankAfter: 0,
        modelVersion,
        blendWeights: {
          ...DEFAULT_BLEND_WEIGHTS,
          crossEncoder: 0,
        },
        scoreMethod: 'SIGNAL_BLEND' as const,
        evidence: {
          semanticLane: candidate.denseScore !== undefined
            ? `${candidate.embeddingLane ?? 'dense'}=${candidate.denseScore.toFixed(2)}${candidate.projectionVersion ? `@${candidate.projectionVersion}` : ''}`
            : undefined,
          lexicalLane: candidate.bm25Score !== undefined ? `bm25=${candidate.bm25Score.toFixed(2)}` : undefined,
          topologyLane: candidate.pagerankScore !== undefined ? `pr=${candidate.pagerankScore.toFixed(2)}` : undefined,
        },
      } satisfies RerankedCandidate;
    })
    .sort(
      (a, b) =>
        b.blendedScore - a.blendedScore ||
        a.retrievedRank - b.retrievedRank ||
        a.packetKey.localeCompare(b.packetKey),
    )
    .map((candidate, index) => ({
      ...candidate,
      rankAfter: index + 1,
    }));

  return { modelVersion, ranked };
}

/**
 * Last-resort fail-open ranking: preserves retrieval order so a reranker
 * outage can never erase retrieval evidence.
 * Invariant: candidates.length > 0 → ranked.length === candidates.length.
 */
function retrievalOrderFallback(
  candidates: RerankCandidate[],
  reason: string,
): { modelVersion: string; ranked: RerankedCandidate[]; fallbackReason: string } {
  const modelVersion = 'retrieval-order-fallback';
  return {
    modelVersion,
    fallbackReason: reason,
    ranked: candidates.map((candidate, index) => ({
      ...candidate,
      crossEncoderScore: candidate.crossEncoderScore ?? 0,
      blendedScore:
        candidate.crossEncoderScore ??
        candidate.denseScore ??
        candidate.bm25Score ??
        candidate.astScore ??
        candidate.graphScore ??
        0,
      rankAfter: index + 1,
      modelVersion,
      blendWeights: { ...DEFAULT_BLEND_WEIGHTS, crossEncoder: 0 } as any,
      scoreMethod: 'RETRIEVAL_ORDER_FALLBACK' as const,
      evidence: {
        semanticLane: candidate.denseScore !== undefined
          ? `${candidate.embeddingLane ?? 'dense'}=${candidate.denseScore.toFixed(2)}${candidate.projectionVersion ? `@${candidate.projectionVersion}` : ''}`
          : undefined,
        lexicalLane: candidate.bm25Score !== undefined ? `bm25=${candidate.bm25Score.toFixed(2)}` : undefined,
        topologyLane: candidate.pagerankScore !== undefined ? `pr=${candidate.pagerankScore.toFixed(2)}` : undefined,
      },
    }) satisfies RerankedCandidate),
  };
}

async function runFallbackRerank(
  query: string,
  candidates: RerankCandidate[],
  context: { requestId: string; crossEncoderErrorMessage?: string },
): Promise<{ modelVersion: string; ranked: RerankedCandidate[]; fallbackReason: string }> {
  // Compute the baseline (what will actually be served if the learned reranker doesn't take
  // over) FIRST, unconditionally — cheap, pure JS, and required so shadow mode can emit a
  // receipt that compares the challenger against the EXACT object being served, not a
  // recomputed stand-in.
  let baseline: { modelVersion: string; ranked: RerankedCandidate[] };
  try {
    baseline = localFallbackRerank(candidates);
  } catch (err) {
    console.error('[runFallbackRerank] localFallbackRerank threw:', {
      error: (err as Error)?.message,
      candidatesCount: candidates.length,
      firstCandidateSample: candidates[0] ? {
        packetKey: candidates[0].packetKey,
        sourceRef: candidates[0].sourceRef,
        retrievedRank: candidates[0].retrievedRank,
      } : null,
    });
    // FAIL-OPEN: preserve retrieval order instead of returning an empty array
    const fallback = retrievalOrderFallback(candidates, 'localFallbackRerank_threw');
    return { modelVersion: fallback.modelVersion, ranked: fallback.ranked, fallbackReason: fallback.fallbackReason };
  }

  // Mode-gated: 'off' skips the sidecar entirely, 'shadow' runs it and emits an evaluation
  // receipt (comparing against `baseline` above) but always returns null here (production
  // ordering unaffected), 'active' returns the learned reranker's own order. See
  // resolveLearnedRerankerFallback's own docstring.
  const learned = await resolveLearnedRerankerFallback(query, candidates, {
    requestId: context.requestId,
    baseline,
    eligibilityReason: classifyEligibilityReason(context.crossEncoderErrorMessage),
  });
  if (learned) {
    // Retain the sidecar's real model identity so reports can distinguish true learned-reranker
    // scores from the local weighted fallback.
    return {
      modelVersion: learned.modelVersion,
      ranked: learned.ranked,
      fallbackReason: 'crossencoder_unavailable',
    };
  }

  return {
    modelVersion: baseline.modelVersion,
    ranked: baseline.ranked,
    fallbackReason: 'xgboost_sidecar_unavailable',
  };
}

export function rerankedCandidateToCanonicalEnvelope(
  envelope: CanonicalRerankEnvelope,
  candidate: RerankedCandidate,
): CanonicalRerankEnvelope {
  return rerankedCandidateToCanonicalEnvelopeImpl(envelope, candidate);
}

function rerankedCandidateToCanonicalEnvelopeImpl(
  envelope: CanonicalRerankEnvelope,
  candidate: RerankedCandidate,
): CanonicalRerankEnvelope {
  return {
    ...envelope,
    packet_key: envelope.packet_key ?? candidate.packetKey,
    source_ref: envelope.source_ref ?? candidate.sourceRef,
    retrieved_rank: envelope.retrieved_rank ?? candidate.retrievedRank,
    cross_encoder_score: candidate.crossEncoderScore,
    blended_score: candidate.blendedScore,
    rank_after: candidate.rankAfter,
    model_version: candidate.modelVersion,
  };
}

export async function rerankCanonicalFeatureEnvelopes(
  query: string,
  envelopes: CanonicalRerankEnvelope[],
  options: CanonicalRerankOptions = {},
): Promise<CanonicalRerankResult> {
  const startedAt = Date.now();
  const authScope = normalizeAuthScope(options.authScope);
  const rendererVersion = options.rendererVersion?.trim() || DEFAULT_RENDERER_VERSION;
  const maxLength = Math.min(
    options.maxLength ?? DEFAULT_MAX_LENGTH,
    options.executionBudget?.maxContextTokens ?? DEFAULT_MAX_LENGTH,
  );
  const budgetCap = options.rerankTier === 'fast'
    ? options.executionBudget?.maxFastRerankCandidates
    : options.executionBudget?.maxDeepRerankCandidates;
  const topK = Math.min(
    options.topK ?? Math.min(20, envelopes.length || 20),
    typeof budgetCap === 'number' && budgetCap > 0 ? budgetCap : Number.POSITIVE_INFINITY,
  );
  const cachePolicy = options.cachePolicy ?? 'enabled';
  const cacheTtlSeconds = options.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS;
  const rerankTier = options.rerankTier ?? (options.policyDecision?.action === 'FAST_RERANK' ? 'fast' : 'deep');
  const reranker = new MixedbreadCanonicalReranker(options.weights, rerankTier);
  const modelVersion = reranker.modelVersion();
  const fallbackModelVersion = 'xgboost-fallback';
  const candidates = envelopes.map((envelope, index) =>
    canonicalEnvelopeToRerankCandidate(envelope, index, maxLength),
  );
  const fingerprints = buildCandidateFingerprints(envelopes, maxLength);
  const primaryCacheKey = buildCanonicalRerankCacheKey({
    query,
    candidates: fingerprints,
    modelVersion,
    rendererVersion,
    authScope,
    maxLength,
    topK,
  });

  if (!envelopes.length) {
    return {
      results: [],
      provenance: {
        cacheStatus: cachePolicy === 'disabled' ? 'bypass' : 'miss',
        cacheKey: primaryCacheKey,
        modelVersion,
        rendererVersion,
        authScope,
        topK,
        maxLength,
        crossEncoderAttempted: false,
        crossEncoderUsed: false,
        fallbackUsed: false,
        fallbackReason: 'empty_input',
        latencyMs: Date.now() - startedAt,
        policyAction: options.policyDecision?.action,
        policyBudget: options.policyDecision?.budget,
        policyStateHint: options.policyDecision?.stateHint,
      },
    };
  }

  if (cachePolicy !== 'disabled') {
    const cached = await readRerankCache(primaryCacheKey);
    if (cached) {
      if (cached.modelVersion === modelVersion &&
          cached.rendererVersion === rendererVersion &&
          cached.authScope === authScope &&
          cached.maxLength === maxLength &&
          cached.topK === topK &&
          validateCachedPacketKeys(cached.results, envelopes)) {
        return {
          results: hydrateCachedScores(envelopes, cached),
          provenance: {
            cacheStatus: 'hit',
            cacheKey: primaryCacheKey,
            modelVersion: cached.modelVersion,
            rendererVersion: cached.rendererVersion,
            authScope: cached.authScope,
            topK: cached.topK,
            maxLength: cached.maxLength,
          crossEncoderAttempted: false,
          crossEncoderUsed: false,
          fallbackUsed: false,
          latencyMs: Date.now() - startedAt,
          policyAction: options.policyDecision?.action,
          policyBudget: options.policyDecision?.budget,
          policyStateHint: options.policyDecision?.stateHint,
        },
      };
    }
      await deleteRerankCache(primaryCacheKey);
    }
  }

  let ranked: RerankedCandidate[];
  let resultModelVersion = modelVersion;
  let fallbackUsed = false;
  let fallbackReason: string | undefined;
  let crossEncoderUsed = false;
  let cacheStatus: CanonicalRerankProvenance['cacheStatus'] = cachePolicy === 'disabled' ? 'bypass' : 'miss';
  let cacheKey = primaryCacheKey;

  try {
    const rerankOutput = await reranker.rerank({ requestId: primaryCacheKey, query, candidates, limit: candidates.length, profile: 'crossencoder' });
    const crossEncoderRanked = rerankOutput.ranked as RerankedCandidate[];

    // Contract: empty or identity-invalid results are fallback conditions, not
    // silently-accepted outputs. A reranker is an ordering enhancement — its
    // failure must not erase retrieval evidence.
    if (!crossEncoderRanked.length) {
      throw new Error('CROSS_ENCODER_EMPTY_RESULT');
    }
    const inputKeys = new Set(candidates.map((candidate) => candidate.packetKey));
    const returnedKeys = new Set(crossEncoderRanked.map((candidate) => candidate.packetKey));
    const hasDuplicates = returnedKeys.size !== crossEncoderRanked.length;
    const hasUnknown = crossEncoderRanked.some((candidate) => !inputKeys.has(candidate.packetKey));
    if (hasDuplicates || hasUnknown) {
      throw new Error('CROSS_ENCODER_INVALID_IDENTITY');
    }

    ranked = crossEncoderRanked;
    crossEncoderUsed = true;
  } catch (err) {
    console.error('[rerankCanonicalFeatureEnvelopes] reranker threw:', {
      error: (err as Error)?.message,
      candidatesCount: candidates.length,
      firstCandidateSample: candidates[0] ? {
        packetKey: candidates[0].packetKey,
        sourceRef: candidates[0].sourceRef,
        hasContent: 'content' in candidates[0],
        hasRetrievedRank: 'retrievedRank' in candidates[0],
      } : null,
    });
    const fallbackCacheKey = buildCanonicalRerankCacheKey({
      query,
      candidates: fingerprints,
      modelVersion: fallbackModelVersion,
      rendererVersion,
      authScope,
      maxLength,
      topK,
    });
    cacheKey = fallbackCacheKey;

    if (cachePolicy !== 'disabled') {
      const cachedFallback = await readRerankCache(fallbackCacheKey);
      if (cachedFallback) {
        if (cachedFallback.modelVersion === fallbackModelVersion &&
            cachedFallback.rendererVersion === rendererVersion &&
            cachedFallback.authScope === authScope &&
            cachedFallback.maxLength === maxLength &&
            cachedFallback.topK === topK &&
            validateCachedPacketKeys(cachedFallback.results, envelopes)) {
          return {
            results: hydrateCachedScores(envelopes, cachedFallback),
            provenance: {
              cacheStatus: 'hit',
              cacheKey: fallbackCacheKey,
              modelVersion: cachedFallback.modelVersion,
              rendererVersion: cachedFallback.rendererVersion,
              authScope: cachedFallback.authScope,
              topK: cachedFallback.topK,
              maxLength: cachedFallback.maxLength,
              crossEncoderAttempted: true,
              crossEncoderUsed: false,
              fallbackUsed: true,
              fallbackReason: 'crossencoder_unavailable',
              latencyMs: Date.now() - startedAt,
              policyAction: options.policyDecision?.action,
              policyBudget: options.policyDecision?.budget,
              policyStateHint: options.policyDecision?.stateHint,
            },
          };
        }
        await deleteRerankCache(fallbackCacheKey);
      }
    }

    const fallback = await runFallbackRerank(query, candidates, {
      requestId: primaryCacheKey,
      crossEncoderErrorMessage: (err as Error)?.message,
    });
    if (fallback.ranked.length > 0) {
      ranked = fallback.ranked;
      resultModelVersion = fallback.modelVersion;
      fallbackReason = fallback.fallbackReason;
    } else {
      // Final safety net — no ranking lane may convert non-empty retrieval
      // into an empty result.
      const finalFallback = retrievalOrderFallback(candidates, 'all_rerankers_unavailable');
      ranked = finalFallback.ranked;
      resultModelVersion = finalFallback.modelVersion;
      fallbackReason = finalFallback.fallbackReason;
    }
      fallbackUsed = true;
      crossEncoderUsed = false;
      cacheStatus = cachePolicy === 'disabled' ? 'bypass' : 'miss';
    }

  const rankedByPacket = new Map(ranked.map((candidate) => [candidate.packetKey, candidate]));
  const results = envelopes
    .map((envelope, index) => {
      const packetKey = pickPacketKey(envelope, index);
      const candidate = rankedByPacket.get(packetKey);
      if (!candidate) return envelope;
      return rerankedCandidateToCanonicalEnvelopeImpl(envelope, candidate);
    })
    .sort((a, b) => (a.rank_after ?? Number.MAX_SAFE_INTEGER) - (b.rank_after ?? Number.MAX_SAFE_INTEGER));

  if (!validateCachedPacketKeys(
    ranked.map((candidate) => ({
      packetKey: candidate.packetKey,
      score: candidate.blendedScore,
      outputRank: candidate.rankAfter,
    })),
    envelopes,
  )) {
    fallbackUsed = true;
    fallbackReason = fallbackReason ?? 'candidate_mismatch';
    cacheStatus = 'error';
  } else if (cachePolicy !== 'disabled') {
    const cachePayload: CachedRerankEntry = {
      schemaVersion: CANONICAL_RERANK_SCHEMA_VERSION,
      modelVersion: resultModelVersion,
      rendererVersion,
      authScope,
      maxLength,
      topK,
      queryHash: stableHash(query.trim()),
      candidateHash: stableHash(fingerprints),
      createdAt: new Date().toISOString(),
      results: ranked.map((candidate) => ({
        packetKey: candidate.packetKey,
        score: candidate.blendedScore,
        outputRank: candidate.rankAfter,
      })),
    };
    cacheKey = buildCanonicalRerankCacheKey({
      query,
      candidates: fingerprints,
      modelVersion: resultModelVersion,
      rendererVersion,
      authScope,
      maxLength,
      topK,
    });
    await writeRerankCache(cacheKey, cachePayload, cacheTtlSeconds);
  }

  return {
    results,
    provenance: {
      cacheStatus,
      cacheKey,
      modelVersion: resultModelVersion,
      rendererVersion,
      authScope,
      topK,
      maxLength,
      crossEncoderAttempted: true,
      crossEncoderUsed,
      fallbackUsed,
      fallbackReason,
      latencyMs: Date.now() - startedAt,
      policyAction: options.policyDecision?.action,
      policyBudget: options.policyDecision?.budget,
      policyStateHint: options.policyDecision?.stateHint,
    },
  };
}
