import { describe, expect, it } from 'vitest';
import { CANDIDATE_FEATURE_NAMES } from '../contracts/feature-extraction-v1.js';
import {
  CANDIDATE_FEATURE_REGISTRY_REVISION,
  CANDIDATE_FEATURE_REGISTRY_V1,
  assertCandidateFeatureRegistryComplete,
} from './candidate-feature-registry-v1.js';

describe('candidate feature registry', () => {
  it('covers the exact canonical 25-feature order', () => {
    expect(() => assertCandidateFeatureRegistryComplete()).not.toThrow();
    expect(CANDIDATE_FEATURE_REGISTRY_V1.map((entry) => entry.featureName))
      .toEqual([...CANDIDATE_FEATURE_NAMES]);
  });

  it('pins every feature to the same mapping revision and a nonempty compiler', () => {
    for (const entry of CANDIDATE_FEATURE_REGISTRY_V1) {
      expect(entry.featureMappingRevision).toBe(CANDIDATE_FEATURE_REGISTRY_REVISION);
      expect(entry.compilerId.length).toBeGreaterThan(0);
      expect(entry.compilerRevision.length).toBeGreaterThan(0);
      expect(entry.allowedEvidenceKinds.length).toBeGreaterThan(0);
      expect(entry.canonicalWritesAllowed).toBe(false);
    }
  });

  it('keeps execution utility tied to observed execution/human evidence', () => {
    const entry = CANDIDATE_FEATURE_REGISTRY_V1.find((item) => item.featureName === 'execution_utility');
    expect(entry?.allowedEvidenceKinds).toEqual(['EXECUTION', 'HUMAN']);
  });

  it('keeps structural evidence distinguishable from classifier evidence', () => {
    const ast = CANDIDATE_FEATURE_REGISTRY_V1.find((item) => item.featureName === 'ast_signal');
    const domain = CANDIDATE_FEATURE_REGISTRY_V1.find((item) => item.featureName === 'domain_fit_query');
    expect(ast?.allowedEvidenceKinds).toEqual(['AST']);
    expect(domain?.allowedEvidenceKinds).toContain('CLASSIFIER');
  });
});
