import { describe, expect, it } from 'vitest';
import {
  compileCapabilityMoveEligibilityFrameV1,
  composeDomainMoveEligibilityEmissionV1,
  evaluateDomainMoveEligibilityV1,
} from './domain-classification-move-eligibility-v1.js';
import { buildCapabilityRegistryV1 } from './agent-execution-spine-v1.js';
import { decodeKBestViterbi } from '../../analysis/k-best-viterbi.js';

const policy = {
  schema: 'atlas.domain-move-eligibility-policy.v1',
  moveId: 'SEARCH_EXACT',
  capabilityId: 'RG_EXACT_SEARCH',
  policyRevision: 'move-policy:r1',
  classifierRevision: 'classifier:r1',
  workspaceRevision: 'workspace:r1',
  allowedDomainIds: ['retrieval'],
  confidenceFloor: 0.7,
};

const classification = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 'atlas.semantic_signal.v1',
  signal_type: 'domain_classification',
  subject_id: 'query:fixture',
  workspace_revision: 'workspace:r1',
  producer: 'domain-classifier',
  producer_revision: 'classifier:r1',
  evidence_refs: [{ source_ref: 'src/search.ts', evidence_kind: 'fixture' }],
  labels: [{ label: 'retrieval', score: 0.91, source: 'learned' }],
  primary_label: 'retrieval',
  secondary_labels: [],
  confidence: 0.91,
  model_revision_state: 'PROVEN',
  created_at: '2026-10-07T12:00:00.000Z',
  ...overrides,
});

describe('evaluateDomainMoveEligibilityV1', () => {
  it('marks a lineage-matched allowed domain eligible without granting authorization', () => {
    const result = evaluateDomainMoveEligibilityV1({ classification: classification(), policy });
    expect(result.status).toBe('ELIGIBLE');
    expect(result.authorizationGranted).toBe(false);
    expect(result.canonicalAuthority).toBe(false);
    expect(result.evidenceRefs).toEqual(['src/search.ts']);
    expect(result.decisionChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('fails closed for unproven or revision-mismatched classifications', () => {
    for (const candidate of [
      classification({ model_revision_state: 'NOT_PROVEN' }),
      classification({ producer_revision: 'classifier:stale' }),
      classification({ workspace_revision: 'workspace:stale' }),
      classification({ primary_label: null }),
    ]) {
      expect(evaluateDomainMoveEligibilityV1({ classification: candidate, policy }).status).toBe('NOT_PROVEN');
    }
  });

  it('keeps confidence and domain failures distinct', () => {
    expect(evaluateDomainMoveEligibilityV1({
      classification: classification({ confidence: 0.5 }), policy,
    }).status).toBe('BELOW_CONFIDENCE_FLOOR');
    expect(evaluateDomainMoveEligibilityV1({
      classification: classification({
        labels: [{ label: 'legal', score: 0.91, source: 'learned' }],
        primary_label: 'legal',
      }), policy,
    }).status).toBe('DOMAIN_NOT_ALLOWED');
  });

  it('returns NOT_PROVEN for malformed classifier or policy input', () => {
    expect(evaluateDomainMoveEligibilityV1({ classification: {}, policy }).status).toBe('NOT_PROVEN');
    expect(evaluateDomainMoveEligibilityV1({ classification: classification(), policy: {} }).status).toBe('NOT_PROVEN');
  });

  it('is deterministic for identical inputs', () => {
    const first = evaluateDomainMoveEligibilityV1({ classification: classification(), policy });
    const second = evaluateDomainMoveEligibilityV1({ classification: classification(), policy });
    expect(second).toEqual(first);
  });

  it('adds only a bounded emission feature for eligible moves and never authorizes them', () => {
    const decision = evaluateDomainMoveEligibilityV1({ classification: classification(), policy });
    const composed = composeDomainMoveEligibilityEmissionV1({ baseEmissionScore: 0.4, decision });
    expect(composed.emissionScore).toBeCloseTo(0.4455);
    expect(composed.featureAvailable).toBe(true);
    expect(composed.authorizationGranted).toBe(false);
    expect(composed.canonicalAuthority).toBe(false);
  });

  it('leaves the base emission unchanged when eligibility is unavailable', () => {
    const decision = evaluateDomainMoveEligibilityV1({
      classification: classification({ model_revision_state: 'NOT_PROVEN' }), policy,
    });
    const composed = composeDomainMoveEligibilityEmissionV1({ baseEmissionScore: 0.4, decision });
    expect(composed.emissionScore).toBe(0.4);
    expect(composed.featureAvailable).toBe(false);
    expect(composed.featureUnavailableReason).toBe('NOT_APPLICABLE');
  });

  it('rejects unbounded emission boosts', () => {
    const decision = evaluateDomainMoveEligibilityV1({ classification: classification(), policy });
    expect(() => composeDomainMoveEligibilityEmissionV1({
      baseEmissionScore: 0.4, decision, maximumBoost: 0.5,
    })).toThrow('VITERBI_DOMAIN_ELIGIBILITY_BOOST_OUT_OF_BOUNDS');
  });

  it('compiles the classifier signal onto the exact registry capability candidate', () => {
    const registry = buildCapabilityRegistryV1();
    const capabilityId = registry.entries[0]!.capabilityId;
    const decision = evaluateDomainMoveEligibilityV1({
      classification: classification(),
      policy: { ...policy, capabilityId },
    });
    const frame = compileCapabilityMoveEligibilityFrameV1({
      observationRevision: 'observation:r1',
      registry,
      baseEmissionScores: { [capabilityId]: 0.4 },
      decision,
    });
    const candidate = frame.candidates[0]!;

    expect(candidate.id).toBe(capabilityId);
    expect(candidate.value.capabilityRegistryRevision).toBe(registry.registryRevision);
    expect(candidate.value.eligibilityStatus).toBe('ELIGIBLE');
    expect(candidate.emissionScore).toBeCloseTo(0.4455);
    expect(candidate.value.authorizationGranted).toBe(false);
    expect(decodeKBestViterbi([frame], () => 0, { k: 1 })[0]?.values[0]?.capabilityId).toBe(capabilityId);
  });

  it('rejects decision tampering and decisions for capabilities outside the registry', () => {
    const registry = buildCapabilityRegistryV1();
    const capabilityId = registry.entries[0]!.capabilityId;
    const decision = evaluateDomainMoveEligibilityV1({
      classification: classification(), policy: { ...policy, capabilityId },
    });
    expect(() => compileCapabilityMoveEligibilityFrameV1({
      observationRevision: 'observation:r1', registry,
      baseEmissionScores: { [capabilityId]: 0.4 },
      decision: { ...decision, status: 'DOMAIN_NOT_ALLOWED' },
    })).toThrow('DOMAIN_MOVE_ELIGIBILITY_CHECKSUM_MISMATCH');
    expect(() => compileCapabilityMoveEligibilityFrameV1({
      observationRevision: 'observation:r1', registry,
      baseEmissionScores: { [capabilityId]: 0.4 },
      decision: evaluateDomainMoveEligibilityV1({
        classification: classification(), policy: { ...policy, capabilityId: 'OTHER_CAPABILITY' },
      }),
    })).toThrow('DOMAIN_MOVE_ELIGIBILITY_CAPABILITY_NOT_IN_REGISTRY');
  });
});
