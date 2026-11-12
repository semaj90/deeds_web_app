// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MEASURED_CORPUS_ROWS,
  MEASURED_RESCORE_LATENCY_MS,
  MEASURED_TIERS,
  selectPrecisionTierV1,
  type TierRequestV1,
} from './precision-tier-policy-v1';

const base: TierRequestV1 = { recallTarget: 0.95, gpuAdmission: 'ADMIT', cpuWorkersFree: 4 };

describe('measured tables match the committed receipts', () => {
  const root = resolve(process.cwd(), '..', 'docs', 'reports');
  const read = (name: string) => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
  const k100 = read('precision-tiers-v1-20261111.json');
  const k1000 = read('precision-tiers-v1-k1000-20261111.json');
  const latency = read('pg-rescore-latency-v1-20261111.json');
  const byVariant = (r: { results: Array<Record<string, number | string>> }, v: string) => r.results.find((x) => x.variant === v)!;
  const names: Record<string, string> = {
    sign128_lod0: 'BITSET16_LOD0',
    int4_per_vector: 'INT4_COLD',
    int8_per_vector: 'INT8_WARM',
    fp16: 'FP16_HOT',
    fp32: 'FP32_REFERENCE',
  };

  it('every K=0 and K=100 recall value and the bytes per vector equal the saved receipt', () => {
    for (const [variant, fidelity] of Object.entries(names)) {
      const tier = MEASURED_TIERS.find((t) => t.fidelity === fidelity)!;
      const row = byVariant(k100, variant);
      expect(tier.bytesPerVector).toBe(row.bytes_per_vector);
      expect(tier.recall[0]).toBe(row.recall_top10_tie_aware);
      if (variant !== 'fp32') expect(tier.recall[100]).toBe(row.recall_top10_after_fp32_rescore_of_top100);
    }
    expect(k100.corpus_rows).toBe(MEASURED_CORPUS_ROWS);
  });

  it('the K=1000 recall values equal the saved receipt, and no other K=1000 point is claimed', () => {
    for (const variant of ['sign128_lod0', 'int4_per_vector']) {
      const tier = MEASURED_TIERS.find((t) => t.fidelity === names[variant])!;
      expect(tier.recall[1000]).toBe(byVariant(k1000, variant).recall_top10_after_fp32_rescore_of_top1000);
    }
    for (const tier of MEASURED_TIERS) {
      if (!['BITSET16_LOD0', 'INT4_COLD'].includes(tier.fidelity)) expect(tier.recall[1000]).toBeUndefined();
    }
    expect(k1000.corpus_rows).toBe(MEASURED_CORPUS_ROWS);
  });

  it('the rescore latency table equals the saved latency receipt (both methods, both statistics)', () => {
    for (const k of [100, 1000] as const) {
      const fetch = latency.fetch[`k${k}`].fetch_only;
      expect(MEASURED_RESCORE_LATENCY_MS.client_fetch_vectors[k]).toEqual({ p50: fetch.p50_ms, p95: fetch.p95_ms });
      const server = latency.server_side_rescore[`k${k}`];
      expect(MEASURED_RESCORE_LATENCY_MS.server_side_scores[k]).toEqual({ p50: server.p50_ms, p95: server.p95_ms });
    }
    expect(latency.corpus_rows).toBe(MEASURED_CORPUS_ROWS);
    expect(latency.writesPerformed).toBe(false);
  });
});

describe('selectPrecisionTierV1 (pure, measured points only)', () => {
  it('picks the cheapest measured point that meets the target (int4 + top-100 rescore for 0.95)', () => {
    const d = selectPrecisionTierV1(base);
    expect(d).toMatchObject({ fidelity: 'INT4_COLD', rescoreK: 100, bytesPerVector: 388, expectedRecall: 0.9986 });
    expect(d.approximate).toBe(true);
    expect(d.exactOnMeasuredSet).toBe(false);
  });

  it('reaches exactness with int4 + top-1000 rescore when there is no budget, and reports its measured latency', () => {
    const d = selectPrecisionTierV1({ ...base, recallTarget: 1 });
    expect(d).toMatchObject({ fidelity: 'INT4_COLD', rescoreK: 1000, expectedRecall: 1, exactOnMeasuredSet: true, approximate: false });
    expect(d.expectedRescoreLatencyMs).toBe(90.96); // server-side p95 by default
  });

  it('uses the measured p95: an 80 ms budget excludes K=1000 (p95 90.96) but admits K=100 (p95 77.7)', () => {
    const d = selectPrecisionTierV1({ ...base, recallTarget: 1, rescoreBudgetMs: 80 });
    // int4 K=100 is 0.9986 < 1, so the cheapest exact point inside the budget is int8 at K=100
    expect(d).toMatchObject({ fidelity: 'INT8_WARM', rescoreK: 100, expectedRecall: 1, expectedRescoreLatencyMs: 77.7 });
  });

  it('can budget on p50 instead, which admits K=1000 at 80 ms (p50 76.4)', () => {
    const d = selectPrecisionTierV1({ ...base, recallTarget: 1, rescoreBudgetMs: 80, latencyStat: 'p50' });
    expect(d).toMatchObject({ fidelity: 'INT4_COLD', rescoreK: 1000, expectedRescoreLatencyMs: 76.4 });
  });

  it('honours the rescore method: client-fetch p95 at K=100 is 17.67 ms but K=1000 is 211.19 ms', () => {
    const d = selectPrecisionTierV1({ ...base, recallTarget: 1, rescoreBudgetMs: 100, rescoreMethod: 'client_fetch_vectors' });
    expect(d).toMatchObject({ fidelity: 'INT8_WARM', rescoreK: 100, expectedRescoreLatencyMs: 17.67 });
  });

  it('uses direct fp16 ranking (K=0) when no measured rescore fits the budget', () => {
    const d = selectPrecisionTierV1({ ...base, recallTarget: 0.99, rescoreBudgetMs: 10 });
    expect(d).toMatchObject({ fidelity: 'FP16_HOT', rescoreK: 0, expectedRecall: 0.9974, expectedRescoreLatencyMs: 0 });
  });

  it('a zero budget allows only no-rescore points, ending at fp32 exact for target 1', () => {
    const d = selectPrecisionTierV1({ ...base, recallTarget: 1, rescoreBudgetMs: 0 });
    expect(d).toMatchObject({ fidelity: 'FP32_REFERENCE', rescoreK: 0, exactOnMeasuredSet: true });
  });

  it('never interpolates: int8 has no measured K=1000 point, so it is not offered there', () => {
    const int8 = MEASURED_TIERS.find((t) => t.fidelity === 'INT8_WARM')!;
    expect(int8.recall[1000]).toBeUndefined();
    const d = selectPrecisionTierV1({ ...base, recallTarget: 1, rescoreBudgetMs: 100 });
    expect(d.fidelity === 'INT8_WARM' && d.rescoreK === 1000).toBe(false);
  });

  it('quick hit serves the 16-byte LOD0 bitset with the largest K that fits and flags it approximate', () => {
    const d = selectPrecisionTierV1({ ...base, quickHit: true });
    expect(d).toMatchObject({ fidelity: 'BITSET16_LOD0', rescoreK: 1000, bytesPerVector: 16, expectedRecall: 0.9362, approximate: true });
    const tight = selectPrecisionTierV1({ ...base, quickHit: true, rescoreBudgetMs: 80 });
    expect(tight).toMatchObject({ fidelity: 'BITSET16_LOD0', rescoreK: 100, expectedRecall: 0.7703 });
    const none = selectPrecisionTierV1({ ...base, quickHit: true, rescoreBudgetMs: 5 });
    expect(none).toMatchObject({ fidelity: 'BITSET16_LOD0', rescoreK: 0, expectedRecall: 0.4391 });
  });

  it('keeps work off the GPU unless the admission decision is ADMIT, and fails closed on UNKNOWN', () => {
    expect(selectPrecisionTierV1(base).executor).toBe('gpu');
    for (const gpuAdmission of ['DEFER', 'REJECT', 'EVICT_THEN_ADMIT', 'UNKNOWN'] as const) {
      expect(selectPrecisionTierV1({ ...base, gpuAdmission }).executor).toBe('cpu-pool');
    }
    expect(selectPrecisionTierV1({ ...base, gpuAdmission: 'DEFER', cpuWorkersFree: 0 }).executor).toBe('cpu-main');
  });

  it('flags measurements as stale when the corpus drifts more than 20%', () => {
    expect(selectPrecisionTierV1({ ...base, corpusRows: MEASURED_CORPUS_ROWS }).measurementStale).toBe(false);
    expect(selectPrecisionTierV1({ ...base, corpusRows: Math.round(MEASURED_CORPUS_ROWS * 1.25) }).measurementStale).toBe(true);
  });

  it('fails closed on invalid input', () => {
    expect(() => selectPrecisionTierV1({ ...base, recallTarget: 0 })).toThrow('PRECISION_TIER_INVALID_RECALL_TARGET');
    expect(() => selectPrecisionTierV1({ ...base, recallTarget: 1.1 })).toThrow('PRECISION_TIER_INVALID_RECALL_TARGET');
    expect(() => selectPrecisionTierV1({ ...base, recallTarget: Number.NaN })).toThrow('PRECISION_TIER_INVALID_RECALL_TARGET');
    expect(() => selectPrecisionTierV1({ ...base, cpuWorkersFree: -1 })).toThrow('PRECISION_TIER_INVALID_CPU_WORKERS_FREE');
    expect(() => selectPrecisionTierV1({ ...base, rescoreBudgetMs: -1 })).toThrow('PRECISION_TIER_INVALID_RESCORE_BUDGET_MS');
  });

  it('is deterministic and returns a frozen decision', () => {
    const a = selectPrecisionTierV1(base);
    const b = selectPrecisionTierV1(base);
    expect(a).toEqual(b);
    expect(Object.isFrozen(a)).toBe(true);
  });
});
