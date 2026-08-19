import { describe, expect, it } from 'vitest';
import { buildTrainingTournament, paretoTrainingResults } from '../src/lib/server/atlas/learning/training-execution-policy.js';

describe('training execution policy', () => {
  it('keeps ZeRO stages categorical and places parameter offload only on stage 3', () => {
    const rows = buildTrainingTournament({
      envelope: {
        trainableParameterCount: 10_000_000,
        estimatedActivationBytes: 1_000_000_000,
        freeGpuBytes: 3_000_000_000,
        hostRamAvailableBytes: 64_000_000_000,
        nvmeAvailableBytes: 100_000_000_000,
        deepspeedAvailable: true,
        bitsandbytesAvailable: true,
        bf16Supported: true,
      },
      targetModuleSetId: 'all-linear-v1',
      targetModules: ['all-linear'],
      ranks: [8],
      learningRates: [1e-4],
      microBatches: [1],
      gradientAccumulations: [8],
    });
    expect(new Set(rows.map((row) => row.zeroStage))).toEqual(new Set([0, 2, 3]));
    expect(rows.filter((row) => row.parameterPlacement !== 'GPU').every((row) => row.zeroStage === 3)).toBe(true);
    expect(rows.some((row) => row.optimizer === 'PAGED_ADAMW_8BIT')).toBe(true);
    expect(rows.some((row) => row.optimizer === 'DEEPSPEED_CPU_ADAM' && row.optimizerPlacement === 'CPU')).toBe(true);
    expect(rows.some((row) => row.optimizerPlacement === 'NVME' && row.parameterPlacement === 'NVME')).toBe(true);
  });

  it('returns non-dominated observed configurations instead of lowest-VRAM-only', () => {
    const pareto = paretoTrainingResults([
      { candidateId: 'fast-quality', heldoutQuality: .82, samplesPerSecond: 4, peakGpuBytes: 5, peakHostBytes: 10, nvmeOffloadBytes: 0, stepTimeMs: 250 },
      { candidateId: 'tiny-slow', heldoutQuality: .80, samplesPerSecond: 2, peakGpuBytes: 3, peakHostBytes: 20, nvmeOffloadBytes: 40, stepTimeMs: 500 },
      { candidateId: 'dominated', heldoutQuality: .70, samplesPerSecond: 1, peakGpuBytes: 6, peakHostBytes: 30, nvmeOffloadBytes: 50, stepTimeMs: 900 },
    ]);
    expect(pareto.map((x) => x.candidateId)).toContain('fast-quality');
    expect(pareto.map((x) => x.candidateId)).toContain('tiny-slow');
    expect(pareto.map((x) => x.candidateId)).not.toContain('dominated');
  });
});
