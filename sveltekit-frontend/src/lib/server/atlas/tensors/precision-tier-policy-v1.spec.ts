// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MEASURED_CORPUS_ROWS,
  MEASURED_TIERS,
  selectPrecisionTierV1,
  type TierRequestV1,
} from './precision-tier-policy-v1';

const base: TierRequestV1 = { recallTarget: 0.95, gpuAdmission: 'ADMIT', cpuWorkersFree: 4 };

describe('measured table matches the committed receipts', () => {
  const root = resolve(process.cwd(), '..', 'docs', 'reports');
  const read = (name: string) => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
  const k100 = read('precision-tiers-v1-20261111.json');
  const k1000 = read('precision-tiers-v1-k1000-20261111.json');
  const byVariant = (r: { results: Array<Record<string, number | string>> }, v: string) => r.results.find((x) => x.variant === v)!;
  const names: Record<string, string> = {
    sign128_lod0: 'BITSET16_LOD0',
    int4_per_vector: 'INT4_COLD',
    int8_per_vector: 'INT8_WARM',
    fp16: 'FP16_HOT',
    fp32: 'FP32_REFERENCE',
  };

  it('every K=0 and K=100 value and the bytes per vector equal the saved receipt', () => {
    for (const [variant, fidelity] of Object.entries(names)) {
      const tier = MEASURED_TIERS.find((t) => t.fidelity === fidelity)!;
      const row = byVariant(k100, variant);
      expect(tier.bytesPerVector).toBe(row.bytes_per_vector);
      expect(tier.recall[0]).toBe(row.recall_top10_tie_aware);
      if (variant !== 'fp32') expect(tier.recall[100]).toBe(row.recall_top10_after_fp32_rescore_of_top100);
      else expect(tier.recall[0]).toBe(row.recall_top10_after_fp32_rescore_of_top100);
    }
    expect(k100.corpus_rows).toBe(MEASURED_CORPUS_ROWS);
  });

  it('the K=1000 values equal the saved receipt, and no other K=1000 point is claimed', () => {
    for (const variant of ['sign128_lod0', 'int4_per_vector']) {
      const tier = MEASURED_TIERS.find((t) => t.fidelity === names[variant])!;
      expect(tier.recall[1000]).toBe(byVariant(k1000, variant).recall_top10_after_fp32_rescore_of_top1000);
    }
    // Only the two variants in the K=1000 receipt may carry a K=1000 point.
    for (const tier of MEASURED_TIERS) {
      if (!['BITSET16_LOD0', 'INT4_COLD'].includes(tier.fidelity)) expect(tier.recall[1000]).toBeUndefined();
    }
    expect(k1000.corpus_rows).toBe(MEASURED_CORPUS_ROWS);
  });
});

describe('selectPrecisionTierV1 (pure, measured points only)', () => {
  it('picks the cheapest measured point that meets the target (int4 + top-100 rescore for 0.95)', () => {
    const d = selectPrecisionTierV1(base);
    expect(d).toMatchObject({ fidelity: 'INT4_COLD', rescoreK: 100, bytesPerVector: 388, expectedRecall: 0.9986 });
    expect(d.approximate).toBe(true);
    expect(d.exactOnMeasuredSet).toBe(false);
  });

  it('reaches exactness with int4 + top-1000 rescore when there is no budget', () => {
    const d = selectPrecisionTierV1({ ...base, recallTarget: 1 });
    expect(d).toMatchObject({ fidelity: 'INT4_COLD', rescoreK: 1000, expectedRecall: 1, exactOnMeasuredSet: true, approximate: false });
  });

  it('falls back to a cheaper-K point when the rescore budget excludes K=1000', () => {
    const d = selectPrecisionTierV1({ ...base, recallTarget: 1, rescoreBudgetMs: 100, rescoreCostMsPerRow: 0.5 });
    // 1000 rows cost 500 ms > 100 ms; int4 K=100 is 0.9986 < 1; int8 K=100 is 1.0 and costs 50 ms
    expect(d).toMatchObject({ fidelity: 'INT8_WARM', rescoreK: 100, expectedRecall: 1 });
  });

  it('uses direct fp16 ranking (K=0) when no rescore fits the budget and the target allows it', () => {
    const d = selectPrecisionTierV1({ ...base, recallTarget: 0.99, rescoreBudgetMs: 1, rescoreCostMsPerRow: 5 });
    expect(d).toMatchObject({ fidelity: 'FP16_HOT', rescoreK: 0, expectedRecall: 0.9974 });
  });

  it('never interpolates: an unmeasured int8 K=1000 point is not offered', () => {
    const int8 = MEASURED_TIERS.find((t) => t.fidelity === 'INT8_WARM')!;
    expect(int8.recall[1000]).toBeUndefined();
    // target 1 with a budget that only allows K<=100 must not pick int8 at an unmeasured K
    const d = selectPrecisionTierV1({ ...base, recallTarget: 1, rescoreBudgetMs: 60, rescoreCostMsPerRow: 0.5 });
    expect([d.fidelity, d.rescoreK]).toEqual(['INT8_WARM', 100]);
  });

  it('falls back to fp32 exact when no cheaper measured point qualifies', () => {
    const d = selectPrecisionTierV1({ ...base, recallTarget: 1, rescoreBudgetMs: 0, rescoreCostMsPerRow: 1 });
    expect(d).toMatchObject({ fidelity: 'FP32_REFERENCE', rescoreK: 0, exactOnMeasuredSet: true });
  });

  it('quick hit serves the 16-byte LOD0 bitset with the largest affordable rescore K and flags it approximate', () => {
    const d = selectPrecisionTierV1({ ...base, quickHit: true });
    expect(d).toMatchObject({ fidelity: 'BITSET16_LOD0', rescoreK: 1000, bytesPerVector: 16, expectedRecall: 0.9362, approximate: true });
    const tight = selectPrecisionTierV1({ ...base, quickHit: true, rescoreBudgetMs: 60, rescoreCostMsPerRow: 0.5 });
    expect(tight).toMatchObject({ fidelity: 'BITSET16_LOD0', rescoreK: 100, expectedRecall: 0.7703 });
  });

  it('refuses a quick hit whose cheapest rescore still exceeds the budget only when even K=0 does not fit', () => {
    // K=0 costs nothing, so a quick hit always has a legal point; verify it degrades to direct LOD0
    const d = selectPrecisionTierV1({ ...base, quickHit: true, rescoreBudgetMs: 0, rescoreCostMsPerRow: 1 });
    expect(d).toMatchObject({ fidelity: 'BITSET16_LOD0', rescoreK: 0, expectedRecall: 0.4391 });
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
    expect(() => selectPrecisionTierV1({ ...base, rescoreBudgetMs: 10 })).toThrow('PRECISION_TIER_RESCORE_COST_REQUIRED_WITH_BUDGET');
  });

  it('is deterministic and returns a frozen decision', () => {
    const a = selectPrecisionTierV1(base);
    const b = selectPrecisionTierV1(base);
    expect(a).toEqual(b);
    expect(Object.isFrozen(a)).toBe(true);
  });
});
