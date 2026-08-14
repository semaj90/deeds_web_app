import { describe, expect, it } from 'vitest';
import { assertLodTransition, buildLodPromotionDecision } from './lod-promotion-contract.js';

const input = {
  packetKey: 'packet:example',
  workspaceRevision: 'workspace:r1',
  sourceRevision: 'source:r1',
  representationRevision: 'semantic_768:r1',
  ordinalMapRevision: 'ordinal:r1',
  artifactId: 'semantic-snapshot:r1',
  artifactRevision: 'artifact:r1',
  from: { residency: 'WARM' as const, representation: 'TURBO_4BIT' as const },
  to: { residency: 'HOT' as const, representation: 'FP16' as const },
  reason: 'QUERY_REUSE' as const,
  utility: 0.87,
  vectorPayloadBytesBefore: 384,
  vectorPayloadBytesAfter: 1536,
  residentBytesBefore: 4096,
  residentBytesAfter: 3072,
  policyRevision: 'bitfrost:r3',
  timestamp: '2026-08-14T00:00:00.000Z',
};

describe('LodPromotionDecisionV1', () => {
  it('builds a deterministic revision-qualified promotion receipt', () => {
    const first = buildLodPromotionDecision(input);
    const second = buildLodPromotionDecision(input);
    expect(first).toEqual(second);
    expect(first.schema).toBe('atlas.lod-promotion.v1');
    expect(first.decisionId).toMatch(/^lod:/);
  });

  it('accepts ordinal identity when packetKey is not available', () => {
    const decision = buildLodPromotionDecision({ ...input, packetKey: undefined, ordinal: 9123 });
    expect(decision.ordinal).toBe(9123);
  });

  it('rejects an invalid transition or missing identity', () => {
    expect(() => buildLodPromotionDecision({
      ...input,
      from: { residency: 'COLD', representation: 'FP32_MMAP' },
      to: { residency: 'HOT', representation: 'FP32' },
    })).toThrow(
      'unsupported LOD transition COLD -> HOT',
    );
    expect(() => buildLodPromotionDecision({ ...input, packetKey: undefined })).toThrow('packetKey or ordinal is required');
  });

  it('rejects invalid utility and byte accounting', () => {
    expect(() => buildLodPromotionDecision({ ...input, utility: 1.1 })).toThrow();
    expect(() => buildLodPromotionDecision({ ...input, residentBytesAfter: -1 })).toThrow();
  });

  it('keeps the decision pure and does not imply cache or canonical writes', () => {
    const decision = buildLodPromotionDecision(input);
    expect(() => assertLodTransition(decision)).not.toThrow();
    expect(Object.keys(decision)).not.toContain('vector');
    expect(Object.keys(decision)).not.toContain('symbolVersionId');
    expect(decision).toMatchObject({
      from: { residency: 'WARM', representation: 'TURBO_4BIT' },
      to: { residency: 'HOT', representation: 'FP16' },
    });
  });
});
