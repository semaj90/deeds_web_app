import { describe, expect, it } from 'vitest';
import {
  admitExperimentHypothesisV1,
  buildExperimentHypothesisV1,
  experimentHypothesisV1Schema,
  type BenchmarkMetric,
  type ChallengerProvider,
} from './experiment-hypothesis-v1.js';
import { buildDevWorkstationAmpereProfileV1 } from './hardware-profile-v1.js';

type HypothesisInput = Parameters<typeof buildExperimentHypothesisV1>[0];

function baseInput(overrides: Partial<HypothesisInput> = {}): HypothesisInput {
  const profile = buildDevWorkstationAmpereProfileV1();
  const defaults: HypothesisInput = {
    hypothesisId: 'exp-rmsnorm-001',
    targetOperation: 'RMSNormV1',
    hardwareProfileChecksum: profile.profileChecksum,
    referenceProvider: 'PYTORCH_ATEN',
    referenceRevision: 'torch==2.13.0+cu132',
    allowedChallengers: ['CUDA_SIMT', 'CUTILE'] as ChallengerProvider[],
    inputSpec: { dtype: 'bf16', shape: [4096, 768] },
    correctnessContract: {
      fixtureChecksum: 'a'.repeat(64),
      toleranceAbs: 0.001,
      toleranceRel: 0.0001,
      noOutOfBoundsAccess: true,
      deterministicReplayRequired: true,
    },
    benchmarkRequirements: {
      warmupIterations: 10,
      measuredIterations: 100,
      requiredMetrics: ['p50_latency_ms', 'p95_latency_ms', 'peak_vram_bytes', 'end_to_end_ms'] as BenchmarkMetric[],
      endToEndRequired: true,
    },
    promotionThreshold: {
      metric: 'end_to_end_ms',
      minImprovementPct: 5,
      zeroCorrectnessRegression: true,
    },
    createdAt: '2026-08-31T14:30:00.000Z',
    producerRevision: 'test.v1',
  };
  return { ...defaults, ...overrides };
}

describe('AUTORESEARCH-01: ExperimentHypothesisV1', () => {
  it('builds a valid hypothesis with a self-consistent checksum', () => {
    const hyp = buildExperimentHypothesisV1(baseInput());
    expect(experimentHypothesisV1Schema.parse(hyp)).toEqual(hyp);
    expect(hyp.identityAuthority).toBe(false);
    expect(hyp.referenceProvider).toBe('PYTORCH_ATEN');
  });

  it('is deterministic: identical input yields identical checksum', () => {
    const a = buildExperimentHypothesisV1(baseInput());
    const b = buildExperimentHypothesisV1(baseInput());
    expect(a.hypothesisChecksum).toBe(b.hypothesisChecksum);
  });

  it('changes checksum when the target operation changes', () => {
    const a = buildExperimentHypothesisV1(baseInput());
    const b = buildExperimentHypothesisV1(baseInput({ targetOperation: 'LayerNormV1', hypothesisId: 'exp-layernorm-001' }));
    expect(a.hypothesisChecksum).not.toBe(b.hypothesisChecksum);
  });

  it('rejects a tampered checksum on parse', () => {
    const hyp = buildExperimentHypothesisV1(baseInput());
    const tampered = { ...hyp, hypothesisChecksum: 'f'.repeat(64) };
    expect(() => experimentHypothesisV1Schema.parse(tampered)).toThrow();
  });

  it('rejects an empty allowedChallengers list', () => {
    expect(() => buildExperimentHypothesisV1(baseInput({ allowedChallengers: [] }))).toThrow();
  });

  it('rejects duplicate allowedChallengers', () => {
    expect(() =>
      buildExperimentHypothesisV1(baseInput({ allowedChallengers: ['CUDA_SIMT', 'CUDA_SIMT'] }))
    ).toThrow();
  });

  it('rejects benchmark requirements missing end_to_end_ms', () => {
    expect(() =>
      buildExperimentHypothesisV1(
        baseInput({
          benchmarkRequirements: {
            warmupIterations: 10,
            measuredIterations: 100,
            requiredMetrics: ['p50_latency_ms'],
            endToEndRequired: true,
          },
        })
      )
    ).toThrow();
  });

  it('rejects duplicate benchmark metrics', () => {
    expect(() =>
      buildExperimentHypothesisV1(
        baseInput({
          benchmarkRequirements: {
            warmupIterations: 10,
            measuredIterations: 100,
            requiredMetrics: ['end_to_end_ms', 'end_to_end_ms'],
            endToEndRequired: true,
          },
        })
      )
    ).toThrow();
  });

  it('reference provider is always PYTORCH_ATEN -- schema rejects anything else', () => {
    expect(() =>
      experimentHypothesisV1Schema.parse({
        ...buildExperimentHypothesisV1(baseInput()),
        referenceProvider: 'SOMETHING_ELSE',
      })
    ).toThrow();
  });

  describe('admitExperimentHypothesisV1', () => {
    it('admits the first hypothesis for a given (operation, hardware, reference, input) tuple', () => {
      const hyp = buildExperimentHypothesisV1(baseInput());
      const result = admitExperimentHypothesisV1(hyp, []);
      expect(result.status).toBe('ADMITTED');
      expect(result.reason).toBeNull();
    });

    it('rejects an exact duplicate of an already-admitted hypothesis', () => {
      const first = buildExperimentHypothesisV1(baseInput());
      const duplicate = buildExperimentHypothesisV1(baseInput({ hypothesisId: 'exp-rmsnorm-002' }));
      const result = admitExperimentHypothesisV1(duplicate, [first]);
      expect(result.status).toBe('REJECTED');
      expect(result.reason).toBe(`EXPERIMENT_HYPOTHESIS_DUPLICATE_OF:${first.hypothesisId}`);
    });

    it('admits a hypothesis with a different input shape even if everything else matches', () => {
      const first = buildExperimentHypothesisV1(baseInput());
      const differentShape = buildExperimentHypothesisV1(
        baseInput({ hypothesisId: 'exp-rmsnorm-003', inputSpec: { dtype: 'bf16', shape: [2048, 768] } })
      );
      const result = admitExperimentHypothesisV1(differentShape, [first]);
      expect(result.status).toBe('ADMITTED');
    });
  });
});
