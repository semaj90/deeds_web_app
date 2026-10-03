import { describe, expect, it } from 'vitest';
import { buildDomainClassifierParityReport, evaluateDomainClassifierTrainingReadinessV1 } from './domain-classifier-parity-v1.js';

describe('domain classifier parity v1', () => {
  it('compares both classifiers on checked-in real-corpus files with revision metadata', () => {
    const report = buildDomainClassifierParityReport();
    expect(report.evidenceClass).toBe('REAL_CORPUS_FIXTURE');
    expect(report.fixture.rowCount).toBeGreaterThanOrEqual(6);
    expect(report.rows.every((row) => /^sha256:[0-9a-f]{64}$/.test(row.sourceRevision))).toBe(true);
    expect(report.rows.every((row) => row.contentDigest === row.sourceRevision)).toBe(true);
    expect(report.exactMatches + report.disagreements.length).toBe(report.fixture.rowCount);
    expect(report.canonicalAuthority).toBe(false);
    expect(report.writesPerformed).toBe(false);
  });

  it('fails training readiness closed without an operator-approved minimum', () => {
    const result = evaluateDomainClassifierTrainingReadinessV1({ corpusRows: 35, observedClassCount: 6 });
    expect(result.status).toBe('DOMAIN_CLASSIFIER_TRAINING_READY_FALSE');
    expect(result.operatorApprovedRuleProvided).toBe(false);
    expect(result.canonicalAuthority).toBe(false);
  });
});
