import { describe, expect, it } from 'vitest';
import { buildAceResidencyAdmissionV1 } from './ace-bitfrost-cache-identity-v1.js';

const identity = {
  cacheKind: 'ACE_PACKET' as const,
  artifactKind: 'candidate-set',
  representationId: 'semantic_768',
  representationRevision: 'semantic_768:v1',
  candidateSnapshotRevision: 'snapshot:v1',
  ordinalMapChecksum: 'ordinal:v1',
  graphRevision: 'graph:v1',
  featureRevision: 'features:v1',
  producerRevision: 'ace-admission:v1',
  normalizationPolicyRevision: 'normalization:v1',
  artifactChecksum: 'artifact:v1',
};

describe('ACE-BITFROST-RESIDENCY-ADMISSION-01', () => {
  it('derives a revisioned cache key without claiming persistence or authority', () => {
    const result = buildAceResidencyAdmissionV1({ identity, status: 'ADMITTED', reason: null });
    expect(result.cacheKey).toContain('atlas:bitfrost:v1');
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
  });

  it('requires a reason when identity admission is blocked', () => {
    expect(() => buildAceResidencyAdmissionV1({ identity, status: 'BLOCKED_IDENTITY', reason: null })).toThrow();
    expect(buildAceResidencyAdmissionV1({ identity, status: 'BLOCKED_IDENTITY', reason: 'CURRENT_COHORT_UNPROVEN' }).status)
      .toBe('BLOCKED_IDENTITY');
  });
});
