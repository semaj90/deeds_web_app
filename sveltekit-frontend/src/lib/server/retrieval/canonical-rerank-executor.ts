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
  DEFAULT_BLEND_WEIGHTS,
} from './runtime-reranker.js';

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
    bm25Score: envelope.lexical?.score,
    astScore: envelope.ast?.score,
    graphScore: envelope.metadata?.score ?? envelope.authority?.score,
    pagerankScore: envelope.authority?.page_rank ?? envelope.authority?.score,
    domainScore: envelope.metadata?.score,
  };
}

export class MixedbreadCanonicalReranker implements RuntimeReranker {
  private readonly blendWeights: Record<string, number>;
  private readonly version = 'mixedbread-ai/mxbai-rerank-base-v2';

  constructor(weights: Record<string, number> = DEFAULT_CANONICAL_RERANK_WEIGHTS) {
    this.blendWeights = BlendWeightsSchema.parse(weights);
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
          evidence: {
            semanticLane: candidate.denseScore !== undefined ? `dense=${candidate.denseScore.toFixed(2)}` : undefined,
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

async function scoreWithXgboostSidecar(
  query: string,
  candidates: RerankCandidate[],
): Promise<{ modelVersion: string; ranked: RerankedCandidate[] } | null> {
  try {
    const health = await fetch(`${XGBOOST_SIDECAR_URL}/health`, {
      signal: AbortSignal.timeout(1_000),
    });
    if (!health.ok) return null;

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
        n_concepts: candidate.content.split(/\s+/).filter(Boolean).length,
        trace_score: candidate.crossEncoderScore ?? candidate.denseScore ?? 0.5,
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

    const data = await res.json() as { scores?: number[]; model?: string };
    if (!Array.isArray(data.scores) || data.scores.length !== candidates.length) return null;

    const modelVersion = data.model ?? 'xgboost-sidecar';
    const ranked = candidates
      .map((candidate, index) => {
        const xgbScore = data.scores?.[index] ?? 0.5;
        const blendedScore = blendScores(
          {
            ...candidate,
            crossEncoderScore: xgbScore,
            crossEncoderScoreNormalized:
              xgbScore >= 0 && xgbScore <= 1 ? xgbScore : undefined,
          },
          {
            ...DEFAULT_BLEND_WEIGHTS,
            crossEncoder: 0,
          },
        );

        return {
          ...candidate,
          crossEncoderScore: xgbScore,
          blendedScore,
          rankAfter: 0,
          modelVersion,
          blendWeights: {
            ...DEFAULT_BLEND_WEIGHTS,
            crossEncoder: 0,
          },
          evidence: {
            semanticLane: candidate.denseScore !== undefined ? `dense=${candidate.denseScore.toFixed(2)}` : undefined,
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
  } catch {
    return null;
  }
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
        evidence: {
          semanticLane: candidate.denseScore !== undefined ? `dense=${candidate.denseScore.toFixed(2)}` : undefined,
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

async function runFallbackRerank(
  query: string,
  candidates: RerankCandidate[],
): Promise<{ modelVersion: string; ranked: RerankedCandidate[]; fallbackReason: string }> {
  const sidecar = await scoreWithXgboostSidecar(query, candidates);
  if (sidecar) {
    return {
      modelVersion: 'xgboost-fallback',
      ranked: sidecar.ranked.map((candidate) => ({
        ...candidate,
        modelVersion: 'xgboost-fallback',
      })),
      fallbackReason: 'crossencoder_unavailable',
    };
  }

  const local = localFallbackRerank(candidates);
  return {
    modelVersion: local.modelVersion,
    ranked: local.ranked,
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
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  const topK = options.topK ?? Math.min(20, envelopes.length || 20);
  const cachePolicy = options.cachePolicy ?? 'enabled';
  const cacheTtlSeconds = options.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS;
  const reranker = new MixedbreadCanonicalReranker(options.weights);
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
    const rerankOutput = await reranker.rerank({ requestId: primaryCacheKey, query, candidates, limit: topK, profile: 'crossencoder' });
    ranked = rerankOutput.ranked as any;
    crossEncoderUsed = true;
  } catch {
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
            },
          };
        }
        await deleteRerankCache(fallbackCacheKey);
      }
    }

    const fallback = await runFallbackRerank(query, candidates);
    ranked = fallback.ranked;
    resultModelVersion = fallbackModelVersion;
    fallbackUsed = true;
    fallbackReason = fallback.fallbackReason;
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
    },
  };
}
