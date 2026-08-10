import { describe, expect, it } from 'vitest';
import {
  ACE_RESIDENCY_MANIFEST_REVISION,
  buildResidencyPlan,
  chooseResidency,
  utilityPerByte,
  validateResidencyManifest,
} from './ace-residency';

const candidates = [
  {
    objectId: 'token-tensors',
    representationId: 'semantic_768',
    representationRevision: 'semantic-768-v1',
    fidelity: 'TOKEN_TENSORS' as const,
    residency: 'VERY_HOT' as const,
    bytes: 1200,
    utility: 0.95,
    transferCostMs: 4,
    recomputeCostMs: 12,
    preemptible: true,
  },
  {
    objectId: 'semantic-card',
    representationId: 'semantic_768',
    representationRevision: 'semantic-768-v1',
    fidelity: 'SOURCE_CARD' as const,
    residency: 'HOT' as const,
    bytes: 400,
    utility: 0.72,
    transferCostMs: 1,
    recomputeCostMs: 8,
    preemptible: true,
  },
  {
    objectId: 'feature-row',
    representationId: 'semantic_768',
    representationRevision: 'semantic-768-v1',
    fidelity: 'FEATURE_ROW' as const,
    residency: 'WARM' as const,
    bytes: 200,
    utility: 0.4,
    transferCostMs: 1,
    recomputeCostMs: 2,
    preemptible: false,
  },
];

describe('ace-residency', () => {
  it('validates the versioned residency manifest', () => {
    const manifest = validateResidencyManifest({ ...candidates[0] });
    expect(manifest.revision).toBe(ACE_RESIDENCY_MANIFEST_REVISION);
    expect(manifest.fidelity).toBe('TOKEN_TENSORS');
  });

  it('ranks by utility per byte and respects byte budgets', () => {
    expect(utilityPerByte(candidates[1] as any)).toBeGreaterThan(utilityPerByte(candidates[0] as any));

    const selected = chooseResidency(
      candidates.map((candidate) => validateResidencyManifest(candidate)),
      { maxBytes: 700 },
    );

    expect(selected.map((item) => item.objectId)).toEqual(['feature-row', 'semantic-card']);
  });

  it('builds a deterministic residency plan with deferred items', () => {
    const plan = buildResidencyPlan(candidates, { maxBytes: 700, promoteAbovePressure: 0.8, demoteAbovePressure: 0.9 });

    expect(plan.revision).toBe(ACE_RESIDENCY_MANIFEST_REVISION);
    expect(plan.usedBytes).toBe(600);
    expect(plan.selected.map((item) => item.objectId)).toEqual(['feature-row', 'semantic-card']);
    expect(plan.deferred.map((item) => item.objectId)).toEqual(['token-tensors']);
  });
});
