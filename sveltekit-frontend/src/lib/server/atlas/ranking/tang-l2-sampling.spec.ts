import { describe, expect, it } from 'vitest';
import { MeasuredTangPolicyReceiptV1Schema, stableReceiptSha256 } from './measured-matrix-diagnostics.js';
import { executeTangL2Sampling, replayTangL2Sampling } from './tang-l2-sampling.js';

function tangPolicy() {
  return MeasuredTangPolicyReceiptV1Schema.parse({
    schema: 'atlas.measured-tang-policy-receipt.v1',
    requestId: 'req-1',
    matrixSha256: 'a'.repeat(64),
    diagnosticsReceiptSha256: 'b'.repeat(64),
    policy: {
      maxEffectiveRankRatio: 0.35,
      minRetainedEnergyPercent: 80,
      maxConditionNumber: 100,
      promotionCount: 4,
    },
    recommendation: {
      schema: 'atlas.tang-promotion-recommendation.v1',
      eligible: true,
      status: 'ELIGIBLE',
      diagnosticsMeasured: true,
      effectiveRankRatio: 0.1,
      reasonCodes: ['MEASURED_LOW_EFFECTIVE_RANK'],
      rows: [
        { packetKey: 'A', squaredNorm: 9, samplingProbability: 0.6, deterministicPriority: 1 },
        { packetKey: 'B', squaredNorm: 4, samplingProbability: 0.3, deterministicPriority: 2 },
        { packetKey: 'C', squaredNorm: 1, samplingProbability: 0.1, deterministicPriority: 3 },
      ],
      selectedPacketKeys: ['A', 'B', 'C'],
      stochasticSamplingStillRequiredForTangFaithfulExecution: true,
      canonicalWritesAllowed: false,
    },
    qualified: true,
    qualificationReasonCodes: ['MEASURED_TANG_POLICY_ELIGIBLE'],
    stochasticExecutionRequired: true,
    proposalOnly: true,
    canonicalWritesAllowed: false,
    producerRevision: 'test',
  });
}

describe('Tang l2 sampling primitive', () => {
  it('draws with replacement using the measured row norm probabilities', () => {
    const receipt = executeTangL2Sampling({
      tangPolicy: tangPolicy(),
      drawCount: 8,
      seedHex: '0x0000000000a71a5f',
      producerRevision: 'test',
    });
    expect(receipt.draws).toHaveLength(8);
    expect(receipt.sampledWithReplacement).toBe(true);
    expect(receipt.fullTangAlgorithmExecuted).toBe(false);
    expect(receipt.modFkvExecuted).toBe(false);
    expect(receipt.rejectionSamplingExecuted).toBe(false);
    expect(receipt.canonicalWritesAllowed).toBe(false);
    expect(receipt.tangPolicyReceiptSha256).toBe(stableReceiptSha256(tangPolicy()));
    for (const draw of receipt.draws) {
      expect(['A', 'B', 'C']).toContain(draw.packetKey);
      expect(draw.unitInterval).toBeGreaterThanOrEqual(0);
      expect(draw.unitInterval).toBeLessThan(1);
    }
  });

  it('replays the exact draw sequence from seed plus lineage', () => {
    const policy = tangPolicy();
    const receipt = executeTangL2Sampling({
      tangPolicy: policy,
      drawCount: 12,
      seedHex: '0x0000000000a71a5f',
      producerRevision: 'test',
    });
    const replayed = replayTangL2Sampling(policy, receipt, 'replay-test');
    expect(replayed.draws).toEqual(receipt.draws);
    expect(replayed.selectedPacketKeys).toEqual(receipt.selectedPacketKeys);
    expect(replayed.seedHex).toBe(receipt.seedHex);
  });

  it('derives the same seed from immutable receipt lineage', () => {
    const policy = tangPolicy();
    const first = executeTangL2Sampling({ tangPolicy: policy, producerRevision: 'test' });
    const second = executeTangL2Sampling({ tangPolicy: policy, producerRevision: 'test-2' });
    expect(first.seedSource).toBe('DERIVED_FROM_RECEIPT_LINEAGE');
    expect(first.seedHex).toBe(second.seedHex);
    expect(first.draws).toEqual(second.draws);
  });

  it('refuses to sample from an ineligible policy', () => {
    const policy = tangPolicy();
    const invalid = {
      ...policy,
      qualified: false,
      recommendation: { ...policy.recommendation, eligible: false, status: 'LOW_RANK_NOT_SUPPORTED' as const },
    };
    expect(() => executeTangL2Sampling({
      tangPolicy: invalid,
      producerRevision: 'test',
    })).toThrow(/REQUIRES_QUALIFIED_POLICY/);
  });
});
