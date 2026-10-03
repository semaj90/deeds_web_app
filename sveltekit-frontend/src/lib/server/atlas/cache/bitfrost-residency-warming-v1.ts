/**
 * bitfrost-residency-warming-v1.ts — BITFROST-RESIDENCY-WARMING-01
 *
 * BitFrost stays a warmed resident cache tier (cache-aside + bounded
 * prewarming). It does NOT grow into a second retrieval index. This module
 * proves the bounded pieces of that contract:
 *
 *   1. `ResidencyScoreV1` — deterministic blend of frequency / breadth /
 *      recency / reconstruction-cost / latency-saved / byte-cost.
 *   2. `HotnessSnapshotV1` — deterministic top-N hot-artifact selection.
 *   3. `BucketWarmPlanV1` — a bounded warming plan (never "warm everything").
 *   4. Cache-aside promotion-on-miss, so canonical stores always reconstruct
 *      on cache loss. BitFrost never becomes identity-bearing: a reconstructor
 *      returning null is a real miss, never fabricated data.
 *   5. LFU-style bounded heat ZSETs (`bitfrost:heat:*`), mirroring the
 *      existing `reward:zset:*` pattern in atlas-reward-cache.ts.
 *
 * This module never queries Postgres/Qdrant/Neo4j itself — reconstruction is
 * always supplied by the caller as an injected function, matching this
 * repo's existing owner-composition discipline (BitFrost is a cache, not a
 * retrieval executor).
 */

import type Redis from 'ioredis';
import {
  admitCachedAcePacketV3,
  aceCacheExpectationV3Schema,
  verifyAcePacketV3,
  type AceCacheExpectationV3,
  type AcePacketV3,
} from '@deeds/parent-atlas';
import { bifrostKey } from '$lib/server/cache-keys.js';
import {
  AceBitfrostCacheIdentityV1Schema,
  buildAceBitfrostCacheKeyV1,
  type AceBitfrostCacheIdentityV1,
} from './ace-bitfrost-cache-identity-v1.js';

export type AcePacketV3BitfrostReadV1 =
  | { status: 'HIT'; cacheKey: string; packet: AcePacketV3 }
  | { status: 'MISS'; cacheKey: string; reason: string }
  | { status: 'BLOCKED'; cacheKey: null; reason: string };

export type AcePacketV3BitfrostWriteV1 =
  | { status: 'WRITTEN'; cacheKey: string }
  | { status: 'BLOCKED'; cacheKey: null; reason: string };

function acePacketV3CacheExpectation(packet: AcePacketV3): AceCacheExpectationV3 {
  return {
    packet_key: packet.identity.packet_key,
    source_ref: packet.identity.source_ref,
    source_revision: packet.identity.source_revision,
    workspace_revision: packet.identity.workspace_revision,
    representation_id: packet.identity.representation_id,
    representation_revision: packet.identity.representation_revision,
    feature_revision: packet.identity.feature_revision,
    graph_revision: packet.identity.graph_revision,
    producer_revision: packet.identity.producer_revision,
    packet_checksum: packet.integrity.packet_checksum,
  };
}

function validateAcePacketV3CacheIdentity(
  identityInput: AceBitfrostCacheIdentityV1,
  packet: AcePacketV3,
  embedAllowedPacketKeys: ReadonlySet<string>,
): { identity: AceBitfrostCacheIdentityV1; cacheKey: string } | { reason: string } {
  let identity: AceBitfrostCacheIdentityV1;
  try {
    identity = AceBitfrostCacheIdentityV1Schema.parse(identityInput);
  } catch {
    return { reason: 'CACHE_IDENTITY_INVALID' };
  }

  if (!embedAllowedPacketKeys.has(packet.identity.packet_key)) return { reason: 'PACKET_NOT_EMBED_ALLOWED' };
  if (identity.cacheKind !== 'ACE_PACKET' || identity.artifactKind !== 'ace_packet_v3') return { reason: 'CACHE_KIND_MISMATCH' };
  if (packet.source.status !== 'CURRENT' || packet.source.revision !== packet.identity.source_revision) return { reason: 'SOURCE_NOT_CURRENT' };
  const embedding = packet.semantic.data.embedding;
  if (embedding.status !== 'CURRENT' || embedding.revision !== packet.identity.representation_revision) return { reason: 'EMBEDDING_NOT_CURRENT' };
  if (!embedding.data.input_digest || !embedding.data.embedding_digest || !embedding.data.vector_ref) return { reason: 'EMBEDDING_LINEAGE_INCOMPLETE' };

  const comparisons: Array<[keyof AceBitfrostCacheIdentityV1, string | null]> = [
    ['artifactChecksum', packet.integrity.packet_checksum],
    ['workspaceRevision', packet.identity.workspace_revision],
    ['sourceRevision', packet.identity.source_revision],
    ['packetRevision', packet.identity.packet_revision],
    ['representationId', packet.identity.representation_id],
    ['representationRevision', packet.identity.representation_revision],
    ['featureRevision', packet.identity.feature_revision],
    ['graphRevision', packet.identity.graph_revision],
    ['producerRevision', packet.identity.producer_revision],
  ];
  for (const [field, actual] of comparisons) {
    if (actual === null || identity[field] !== actual) return { reason: `IDENTITY_MISMATCH:${field}` };
  }

  return { identity, cacheKey: buildAceBitfrostCacheKeyV1(identity) };
}

/** Read a v3 ACE packet only through the revision/checksum-aware cache identity owner. */
export async function readAcePacketV3FromBitfrostV1(
  redis: Pick<Redis, 'get'>,
  input: {
    cacheIdentity: AceBitfrostCacheIdentityV1;
    expected: AceCacheExpectationV3;
    embedAllowedPacketKeys: ReadonlySet<string>;
  },
): Promise<AcePacketV3BitfrostReadV1> {
  let identity: AceBitfrostCacheIdentityV1;
  let expected: AceCacheExpectationV3;
  try {
    identity = AceBitfrostCacheIdentityV1Schema.parse(input.cacheIdentity);
    expected = aceCacheExpectationV3Schema.parse(input.expected);
  } catch {
    return { status: 'BLOCKED', cacheKey: null, reason: 'CACHE_IDENTITY_INVALID' };
  }
  if (!expected.packet_checksum) return { status: 'BLOCKED', cacheKey: null, reason: 'EXPECTED_PACKET_CHECKSUM_REQUIRED' };
  const cacheKey = buildAceBitfrostCacheKeyV1(identity);
  if (!input.embedAllowedPacketKeys.has(expected.packet_key)) {
    return { status: 'BLOCKED', cacheKey: null, reason: 'PACKET_NOT_EMBED_ALLOWED' };
  }
  if (identity.cacheKind !== 'ACE_PACKET' || identity.artifactKind !== 'ace_packet_v3') {
    return { status: 'BLOCKED', cacheKey: null, reason: 'CACHE_KIND_MISMATCH' };
  }
  if (identity.artifactChecksum !== expected.packet_checksum) {
    return { status: 'BLOCKED', cacheKey: null, reason: 'EXPECTED_CHECKSUM_KEY_MISMATCH' };
  }
  for (const [field, expectedValue] of [
    ['source_revision', expected.source_revision],
    ['workspace_revision', expected.workspace_revision],
    ['representation_id', expected.representation_id],
    ['representation_revision', expected.representation_revision],
    ['feature_revision', expected.feature_revision],
    ['graph_revision', expected.graph_revision],
    ['producer_revision', expected.producer_revision],
  ] as const) {
    if (expectedValue === undefined) continue;
    const identityValue = ({
      source_revision: identity.sourceRevision,
      workspace_revision: identity.workspaceRevision,
      representation_id: identity.representationId,
      representation_revision: identity.representationRevision,
      feature_revision: identity.featureRevision,
      graph_revision: identity.graphRevision,
      producer_revision: identity.producerRevision,
    } as const)[field];
    if (identityValue !== expectedValue) return { status: 'BLOCKED', cacheKey: null, reason: `IDENTITY_MISMATCH:${field}` };
  }

  let raw: string | null;
  try {
    raw = await redis.get(cacheKey);
  } catch {
    return { status: 'MISS', cacheKey, reason: 'CACHE_READ_FAILED' };
  }
  if (raw === null) return { status: 'MISS', cacheKey, reason: 'CACHE_EMPTY' };
  const decision = admitCachedAcePacketV3(raw, expected);
  if (decision.decision === 'MISS') return { status: 'MISS', cacheKey, reason: decision.reason };
  const packetIdentity = validateAcePacketV3CacheIdentity(identity, decision.packet, input.embedAllowedPacketKeys);
  if ('reason' in packetIdentity) return { status: 'MISS', cacheKey, reason: packetIdentity.reason };
  return { status: 'HIT', cacheKey, packet: decision.packet };
}

/** Write a validated v3 packet to disposable BitFrost state; never writes canonical identity. */
export async function writeAcePacketV3ToBitfrostV1(
  redis: Pick<Redis, 'set'>,
  input: {
    packet: unknown;
    cacheIdentity: AceBitfrostCacheIdentityV1;
    embedAllowedPacketKeys: ReadonlySet<string>;
    ttlSeconds?: number;
  },
): Promise<AcePacketV3BitfrostWriteV1> {
  let packet: AcePacketV3;
  try {
    packet = verifyAcePacketV3(input.packet);
  } catch {
    return { status: 'BLOCKED', cacheKey: null, reason: 'PACKET_INVALID' };
  }
  const checked = validateAcePacketV3CacheIdentity(input.cacheIdentity, packet, input.embedAllowedPacketKeys);
  if ('reason' in checked) return { status: 'BLOCKED', cacheKey: null, reason: checked.reason };

  const ttlSeconds = input.ttlSeconds ?? 3600;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 86_400) {
    return { status: 'BLOCKED', cacheKey: null, reason: 'TTL_OUT_OF_BOUNDS' };
  }
  try {
    await redis.set(checked.cacheKey, JSON.stringify(packet), 'EX', ttlSeconds);
    return { status: 'WRITTEN', cacheKey: checked.cacheKey };
  } catch {
    return { status: 'BLOCKED', cacheKey: null, reason: 'CACHE_WRITE_FAILED' };
  }
}

// ── Residency score ───────────────────────────────────────────────────────

export type BitfrostArtifactKindV1 = 'packet' | 'query' | 'feature' | 'summary';

export interface ResidencyScoreInputV1 {
  /** Access count observed in the scoring window. */
  frequency: number;
  /** Distinct requesters/sessions/workspaces that touched this artifact. */
  breadth: number;
  /** Milliseconds since the artifact was last accessed (smaller = hotter). */
  recencyMs: number;
  /** Estimated/measured cost (ms) to reconstruct this artifact from canonical stores. */
  reconstructionCostMs: number;
  /** Estimated/measured latency (ms) saved by serving this from cache instead of reconstructing. */
  latencySavedMs: number;
  /** Serialized size in bytes — the residency cost of keeping this warm. */
  byteCost: number;
}

export interface ResidencyScoreWeightsV1 {
  frequency: number;
  breadth: number;
  recency: number;
  reconstructionCost: number;
  latencySaved: number;
  byteCost: number;
}

export const DEFAULT_RESIDENCY_SCORE_WEIGHTS_V1: ResidencyScoreWeightsV1 = {
  frequency: 1,
  breadth: 0.5,
  recency: 1,
  reconstructionCost: 0.5,
  latencySaved: 0.75,
  byteCost: -0.25,
};

/** Half-life (ms) used to decay recency into a [0,1] hotness factor. */
const RECENCY_HALF_LIFE_MS = 30 * 60 * 1000; // 30 minutes

export interface ResidencyScoreV1 {
  schema: 'atlas.bitfrost-residency-score.v1';
  score: number;
  components: ResidencyScoreInputV1;
  weights: ResidencyScoreWeightsV1;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Pure, deterministic blend. Given the same input and weights, always
 * returns the same score — no wall-clock reads, no I/O.
 */
export function computeResidencyScoreV1(
  input: ResidencyScoreInputV1,
  weights: ResidencyScoreWeightsV1 = DEFAULT_RESIDENCY_SCORE_WEIGHTS_V1,
): ResidencyScoreV1 {
  const recencyFactor = 1 / (1 + nonNegative(input.recencyMs) / RECENCY_HALF_LIFE_MS);
  const score =
    weights.frequency * Math.log1p(nonNegative(input.frequency)) +
    weights.breadth * Math.log1p(nonNegative(input.breadth)) +
    weights.recency * recencyFactor +
    weights.reconstructionCost * Math.log1p(nonNegative(input.reconstructionCostMs)) +
    weights.latencySaved * Math.log1p(nonNegative(input.latencySavedMs)) +
    weights.byteCost * Math.log1p(nonNegative(input.byteCost));

  return {
    schema: 'atlas.bitfrost-residency-score.v1',
    score,
    components: input,
    weights,
  };
}

// ── Hotness snapshot (deterministic top-N) ───────────────────────────────

export interface HotArtifactV1 {
  key: string;
  kind: BitfrostArtifactKindV1;
  residencyScore: ResidencyScoreV1;
}

export interface HotnessSnapshotV1 {
  schema: 'atlas.bitfrost-hotness-snapshot.v1';
  topN: number;
  candidateCount: number;
  artifacts: readonly HotArtifactV1[];
}

/** Hard ceiling — a warm plan must never target the whole corpus (~60K packets). */
export const MAX_HOTNESS_SNAPSHOT_TOP_N = 5_000;

/**
 * Selects the top-N candidates by score, deterministically breaking ties by
 * `key` ascending so re-running with identical input always yields an
 * identical, order-stable snapshot.
 */
export function buildHotnessSnapshotV1(
  candidates: readonly HotArtifactV1[],
  topN: number,
): HotnessSnapshotV1 {
  const boundedTopN = Math.max(0, Math.min(topN, MAX_HOTNESS_SNAPSHOT_TOP_N));
  const sorted = [...candidates].sort((a, b) => {
    if (b.residencyScore.score !== a.residencyScore.score) {
      return b.residencyScore.score - a.residencyScore.score;
    }
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  return {
    schema: 'atlas.bitfrost-hotness-snapshot.v1',
    topN: boundedTopN,
    candidateCount: candidates.length,
    artifacts: sorted.slice(0, boundedTopN),
  };
}

// ── Bounded warm plan ─────────────────────────────────────────────────────

export interface WarmPlanEntryV1 {
  key: string;
  kind: BitfrostArtifactKindV1;
  cacheKey: string;
}

export interface BucketWarmPlanV1 {
  schema: 'atlas.bitfrost-warm-plan.v1';
  bucket: number;
  bucketCount: number;
  entries: readonly WarmPlanEntryV1[];
}

function cacheKeyForArtifact(kind: BitfrostArtifactKindV1, key: string): string {
  switch (kind) {
    case 'packet':
      return bifrostKey.semantic.packet(key);
    case 'query':
      return bifrostKey.semantic.query(key);
    case 'feature':
      return bifrostKey.semantic.feature(key);
    case 'summary':
      return bifrostKey.semantic.packetSummary(key);
  }
}

/**
 * Splits a hotness snapshot into one of `bucketCount` staggered warm plans
 * (so a large hot set can be warmed over several passes/instances instead of
 * all at once), and applies a hard `maxEntries` bound on top of the
 * snapshot's own `topN` bound. This never produces a plan sized to the full
 * corpus.
 */
export function buildBucketWarmPlanV1(
  snapshot: HotnessSnapshotV1,
  options?: { bucket?: number; bucketCount?: number; maxEntries?: number },
): BucketWarmPlanV1 {
  const bucketCount = Math.max(1, options?.bucketCount ?? 1);
  const bucket = Math.max(0, Math.min(options?.bucket ?? 0, bucketCount - 1));
  const maxEntries = Math.max(0, Math.min(options?.maxEntries ?? MAX_HOTNESS_SNAPSHOT_TOP_N, MAX_HOTNESS_SNAPSHOT_TOP_N));

  const entries = snapshot.artifacts
    .filter((_, index) => index % bucketCount === bucket)
    .slice(0, maxEntries)
    .map((artifact) => ({
      key: artifact.key,
      kind: artifact.kind,
      cacheKey: cacheKeyForArtifact(artifact.kind, artifact.key),
    }));

  return {
    schema: 'atlas.bitfrost-warm-plan.v1',
    bucket,
    bucketCount,
    entries,
  };
}

// ── Bounded LFU-style heat ZSETs ──────────────────────────────────────────

/** Mirrors REWARD_ZSET_MAX in atlas-reward-cache.ts — bounds ZSET growth. */
const HEAT_ZSET_MAX = 10_000;

function heatZsetKey(kind: BitfrostArtifactKindV1): string {
  return bifrostKey.heat[kind];
}

/**
 * Record one access/heat signal for an artifact. Fire-and-forget, fail-open
 * (a Redis error here never blocks the caller's real work).
 */
export async function recordHeatSignalV1(
  redis: Redis,
  kind: BitfrostArtifactKindV1,
  key: string,
  score: number,
): Promise<void> {
  try {
    const zsetKey = heatZsetKey(kind);
    await redis.zadd(zsetKey, score, key);
    const size = await redis.zcard(zsetKey);
    if (size > HEAT_ZSET_MAX) {
      await redis.zremrangebyrank(zsetKey, 0, size - HEAT_ZSET_MAX - 1);
    }
  } catch {
    // non-fatal — heat tracking never blocks canonical work
  }
}

/** Top-N keys by recorded heat score, descending. Fails open to []. */
export async function getTopHeatKeysV1(
  redis: Redis,
  kind: BitfrostArtifactKindV1,
  topN = 100,
): Promise<Array<{ key: string; score: number }>> {
  try {
    const result = await redis.zrevrangebyscore(
      heatZsetKey(kind),
      '+inf',
      '-inf',
      'WITHSCORES',
      'LIMIT',
      0,
      topN,
    );
    const out: Array<{ key: string; score: number }> = [];
    for (let i = 0; i < result.length; i += 2) {
      out.push({ key: result[i], score: parseFloat(result[i + 1]) });
    }
    return out;
  } catch {
    return [];
  }
}

// ── Cache-aside promotion-on-miss ─────────────────────────────────────────

export type CacheAsideSourceV1 = 'cache' | 'reconstructed' | 'miss';

export interface CacheAsideResultV1<T> {
  value: T | null;
  source: CacheAsideSourceV1;
}

/**
 * Generic cache-aside primitive: read the raw cache key, and on miss call the
 * caller-supplied reconstructor (the ONLY thing allowed to touch canonical
 * stores). A reconstructor returning null is a genuine miss — this function
 * never fabricates a value, and BitFrost never becomes identity-bearing.
 */
export async function getOrWarmCacheAsideV1<T>(
  redis: Redis,
  cacheKey: string,
  reconstruct: () => Promise<T | null>,
  serialize: (value: T) => string,
  deserialize: (raw: string) => T,
  ttlSeconds: number,
): Promise<CacheAsideResultV1<T>> {
  try {
    const raw = await redis.get(cacheKey);
    if (raw !== null) {
      return { value: deserialize(raw), source: 'cache' };
    }
  } catch {
    // fall through to reconstruction on a read failure — never treat a
    // cache read error as evidence the artifact doesn't exist
  }

  const rebuilt = await reconstruct();
  if (rebuilt === null) {
    return { value: null, source: 'miss' };
  }

  try {
    await redis.set(cacheKey, serialize(rebuilt), 'EX', ttlSeconds);
  } catch {
    // non-fatal — the reconstructed value is still returned to the caller
    // even if warming the cache failed
  }

  return { value: rebuilt, source: 'reconstructed' };
}

// ── Bounded warm-plan execution ───────────────────────────────────────────

export interface WarmPlanReconstructorsV1<T> {
  reconstruct: (entry: WarmPlanEntryV1) => Promise<T | null>;
  serialize: (value: T) => string;
}

export interface WarmPlanExecutionResultV1 {
  bucket: number;
  bucketCount: number;
  attempted: number;
  warmed: number;
  missed: number;
  failed: number;
  /**
   * Always false: warming BitFrost is never a canonical write. Kept explicit
   * on the result type (rather than merely documented) so a caller cannot
   * mistake a successful warm pass for a canonical-store mutation.
   */
  writesPerformed: false;
}

/**
 * Executes a bounded warm plan against Valkey/Redis. Every value comes from
 * the caller-supplied reconstructor (never a store lookup owned by this
 * module) and every write is a plain cache-aside SET with a bounded TTL —
 * this never allocates identity, never blocks on a slow reconstructor beyond
 * the given concurrency bound, and always reports `writesPerformed: false`.
 */
export async function executeBucketWarmPlanV1<T>(
  redis: Redis,
  plan: BucketWarmPlanV1,
  reconstructors: WarmPlanReconstructorsV1<T>,
  options?: { ttlSeconds?: number; concurrency?: number },
): Promise<WarmPlanExecutionResultV1> {
  const ttlSeconds = options?.ttlSeconds ?? 3600;
  const concurrency = Math.max(1, options?.concurrency ?? 8);

  let warmed = 0;
  let missed = 0;
  let failed = 0;

  const queue = [...plan.entries];
  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const entry = queue.shift();
      if (!entry) return;
      try {
        const value = await reconstructors.reconstruct(entry);
        if (value === null) {
          missed += 1;
          continue;
        }
        await redis.set(entry.cacheKey, reconstructors.serialize(value), 'EX', ttlSeconds);
        warmed += 1;
      } catch {
        failed += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, plan.entries.length || 1) }, () => worker()));

  return {
    bucket: plan.bucket,
    bucketCount: plan.bucketCount,
    attempted: plan.entries.length,
    warmed,
    missed,
    failed,
    writesPerformed: false,
  };
}
