import { describe, expect, it } from 'vitest';
import { buildOntologyProfileCheckV1 } from './ontology-profile-check-v1.js';

describe('buildOntologyProfileCheckV1', () => {
  it('fails closed when the isolated OWLAPI checker is unavailable', () => {
    const receipt = buildOntologyProfileCheckV1({ owlChecksum: 'd'.repeat(64) });
    expect(receipt.status).toBe('UNAVAILABLE');
    expect(receipt.parseStatus).toBe('UNAVAILABLE');
    expect(receipt.detectedProfile).toBe('UNKNOWN');
    expect(receipt.reasonerRoute).toBe('NONE');
  });

  it('routes only an injected standards-check result, never the old heuristic', () => {
    const receipt = buildOntologyProfileCheckV1({ owlChecksum: 'd'.repeat(64), result: {
      checkerRevision: 'owlapi-profile-checker:test',
      owl2El: { passed: true, violations: [] },
      owl2Dl: { passed: true, violations: [] },
    } });
    expect(receipt.status).toBe('PROVEN');
    expect(receipt.parseStatus).toBe('PROVEN');
    expect(receipt.detectedProfile).toBe('OWL2_EL');
    expect(receipt.reasonerRoute).toBe('ELK');
  });
});
