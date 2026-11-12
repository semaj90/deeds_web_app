import type { Fidelity } from './latent-lod-contract.js';
import type { GpuAdmissionDecision } from './gpu-memory-admission-v1.js';

/**
 * PRECISION-TIER-POLICY-01
 *
 * A pure, deterministic selector: given a recall target and the current lane state, pick the cheapest
 * MEASURED storage fidelity and fp32 rescore K that meets the target. It reuses the existing fidelity
 * names (`latent-lod-contract.ts`: FP16_HOT / INT8_WARM / INT4_COLD) and the existing GPU admission
 * decision (`gpu-memory-admission-v1.ts`); it adds no VRAM thresholds and does no hardware probing.
 *
 * Only MEASURED (fidelity, K) points are eligible. There is no interpolation: an unmeasured point is
 * unavailable, and when nothing cheaper qualifies the answer is FP32_REFERENCE (exact by definition).
 *
 * Evidence (tie-aware recall@10 vs fp32 exact, 274,428 canonical content_embedding_768 vectors,
 * 1,000 frozen queries, `python/atlas_retrieval_canary_v1.py run-precision`):
 *   docs/reports/precision-tiers-v1-20261111.json       sha256 bd834b83a4379e6164dd62868d4a8485d4d544178680d42efae36ff1b2a2f70f
 *   docs/reports/precision-tiers-v1-k1000-20261111.json sha256 30931f3403e7283a1b3ce8f02c5aeedf1e87272d38d6ea7c8fe99112ac6c70cf
 *   docs/reports/pg-rescore-latency-v1-20261111.json   sha256 ec30e27601a72532d2c06ec4299bc44596055ff56f67964f3a2854cd406134ac
 * Rescore latency is NOT linear in K (a large fixed cost dominates), so the policy uses measured latency per K,
 * not a per-row cost. Those figures are warm-cache loopback wall clock to the Docker PostgreSQL 18.4; a colder
 * first run was much slower (p95 over 2 s) and is not receipt-backed, so a budget is a warm-cache budget.
 * The measurement is valid for THIS corpus and metric only; `measurementStale` flags a corpus that has
 * drifted. INT8/INT4 are software storage formats here, not hardware execution claims.
 */

export const PRECISION_TIER_POLICY_SCHEMA = 'atlas.precision-tier-policy.v1' as const;
export const MEASURED_CORPUS_ROWS = 274_428;
/** Corpus size drift beyond this fraction marks the measurements stale (unmeasured default, conservative). */
export const STALE_CORPUS_FRACTION = 0.2;

export type TierFidelity = Fidelity | 'BITSET16_LOD0';
/** Rescore candidate counts that were actually measured. 0 = direct ranking, no rescore. */
export const MEASURED_RESCORE_KS = [0, 100, 1000] as const;
export type RescoreK = (typeof MEASURED_RESCORE_KS)[number];

interface MeasuredTier {
  readonly fidelity: TierFidelity;
  readonly bytesPerVector: number;
  /** Measured recall@10 by rescore K; a missing key means NOT measured. */
  readonly recall: Readonly<Partial<Record<RescoreK, number>>>;
}

/** Ordered by bytes ascending. K=1000 was measured for the bitset and INT4 only; fp16/int8 K=1000 are NOT measured. */
export const MEASURED_TIERS: readonly MeasuredTier[] = Object.freeze([
  { fidelity: 'BITSET16_LOD0', bytesPerVector: 16, recall: { 0: 0.4391, 100: 0.7703, 1000: 0.9362 } },
  { fidelity: 'INT4_COLD', bytesPerVector: 388, recall: { 0: 0.8309, 100: 0.9986, 1000: 1.0 } },
  { fidelity: 'INT8_WARM', bytesPerVector: 772, recall: { 0: 0.9526, 100: 1.0 } },
  { fidelity: 'FP16_HOT', bytesPerVector: 1536, recall: { 0: 0.9974, 100: 1.0 } },
  { fidelity: 'FP32_REFERENCE', bytesPerVector: 3072, recall: { 0: 1.0 } }, // exact by definition; rescore K is irrelevant
]);

export type RescoreMethod = 'server_side_scores' | 'client_fetch_vectors';
export type LatencyStat = 'p50' | 'p95';

/** Measured fp32 rescore latency in ms by method and K (K=0 costs nothing). Missing K = not measured. */
export const MEASURED_RESCORE_LATENCY_MS: Readonly<
  Record<RescoreMethod, Readonly<Partial<Record<100 | 1000, Readonly<Record<LatencyStat, number>>>>>>
> = Object.freeze({
  server_side_scores: { 100: { p50: 48.04, p95: 77.7 }, 1000: { p50: 76.4, p95: 90.96 } },
  client_fetch_vectors: { 100: { p50: 11.78, p95: 17.67 }, 1000: { p50: 143.13, p95: 211.19 } },
});

export type TierExecutor = 'gpu' | 'cpu-pool' | 'cpu-main';

export interface TierRequestV1 {
  /** Required recall@10 after the chosen rescore, in (0, 1]. */
  readonly recallTarget: number;
  /** Existing GPU admission decision for the dense-scoring job; anything but ADMIT keeps work off the GPU. */
  readonly gpuAdmission: GpuAdmissionDecision | 'UNKNOWN';
  readonly cpuWorkersFree: number;
  /** Latency budget for the fp32 rescore in ms. Omit for no budget. K=0 (no rescore) always fits. */
  readonly rescoreBudgetMs?: number;
  /** Which measured rescore path the budget refers to. Default 'server_side_scores' (scores only, no vector transfer). */
  readonly rescoreMethod?: RescoreMethod;
  /** Which measured statistic is compared with the budget. Default 'p95' (conservative). */
  readonly latencyStat?: LatencyStat;
  /** Serve the 16-byte LOD0 bitset first and rescore later. Allowed to return approximate results. */
  readonly quickHit?: boolean;
  /** Current corpus size, used only to flag stale measurements. */
  readonly corpusRows?: number;
}

export interface TierDecisionV1 {
  readonly schema: typeof PRECISION_TIER_POLICY_SCHEMA;
  readonly fidelity: TierFidelity;
  readonly rescoreK: RescoreK;
  readonly executor: TierExecutor;
  readonly bytesPerVector: number;
  readonly expectedRecall: number;
  /** True when the measured recall at this point is exactly 1 (rescored to fp32 exactness on the frozen set). */
  readonly exactOnMeasuredSet: boolean;
  readonly approximate: boolean;
  /** Measured rescore latency for this point under the requested method and statistic; 0 when no rescore. */
  readonly expectedRescoreLatencyMs: number;
  readonly measurementStale: boolean;
  readonly reason: string;
}

function assertFinite(name: string, value: number, min: number, max = Number.POSITIVE_INFINITY): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`PRECISION_TIER_INVALID_${name.toUpperCase()}`);
  }
}

function chooseExecutor(req: TierRequestV1): TierExecutor {
  if (req.gpuAdmission === 'ADMIT') return 'gpu';
  return req.cpuWorkersFree > 0 ? 'cpu-pool' : 'cpu-main';
}

export function selectPrecisionTierV1(req: TierRequestV1): TierDecisionV1 {
  assertFinite('recall_target', req.recallTarget, Number.MIN_VALUE, 1);
  assertFinite('cpu_workers_free', req.cpuWorkersFree, 0);
  if (req.rescoreBudgetMs !== undefined) {
    assertFinite('rescore_budget_ms', req.rescoreBudgetMs, 0);
  }
  if (req.corpusRows !== undefined) assertFinite('corpus_rows', req.corpusRows, 1);

  const stale =
    req.corpusRows !== undefined &&
    Math.abs(req.corpusRows - MEASURED_CORPUS_ROWS) / MEASURED_CORPUS_ROWS > STALE_CORPUS_FRACTION;
  const executor = chooseExecutor(req);
  const method: RescoreMethod = req.rescoreMethod ?? 'server_side_scores';
  const stat: LatencyStat = req.latencyStat ?? 'p95';
  const latencyOf = (k: RescoreK): number | undefined =>
    k === 0 ? 0 : MEASURED_RESCORE_LATENCY_MS[method][k as 100 | 1000]?.[stat];
  // A budget only admits points whose latency was measured; an unmeasured latency is never assumed to fit.
  const within = (k: RescoreK): boolean => {
    if (req.rescoreBudgetMs === undefined) return true;
    const ms = latencyOf(k);
    return ms !== undefined && ms <= req.rescoreBudgetMs;
  };

  const make = (tier: MeasuredTier, k: RescoreK, reason: string): TierDecisionV1 => {
    const recall = tier.recall[k] as number;
    return Object.freeze({
      schema: PRECISION_TIER_POLICY_SCHEMA,
      fidelity: tier.fidelity,
      rescoreK: k,
      executor,
      bytesPerVector: tier.bytesPerVector,
      expectedRecall: recall,
      exactOnMeasuredSet: recall === 1,
      approximate: recall < 1,
      expectedRescoreLatencyMs: latencyOf(k) ?? 0,
      measurementStale: stale,
      reason,
    });
  };

  if (req.quickHit) {
    const lod0 = MEASURED_TIERS[0];
    const k = ([1000, 100, 0] as const).find((candidate) => lod0.recall[candidate] !== undefined && within(candidate));
    if (k === undefined) throw new Error('PRECISION_TIER_QUICK_HIT_EXCEEDS_BUDGET');
    return make(lod0, k, 'QUICK_HIT_LOD0_THEN_RESCORE_LATER');
  }

  for (const tier of MEASURED_TIERS) {
    if (tier.fidelity === 'BITSET16_LOD0') continue; // only reachable through quickHit
    for (const k of MEASURED_RESCORE_KS) {
      const recall = tier.recall[k];
      if (recall === undefined || recall < req.recallTarget || !within(k)) continue;
      return make(tier, k, 'CHEAPEST_MEASURED_POINT_MEETING_TARGET');
    }
  }

  // Unreachable by construction: FP32_REFERENCE at K=0 has recall 1 and costs no rescore, so it always qualifies.
  throw new Error('PRECISION_TIER_INVARIANT_FP32_REFERENCE_MISSING');
}
