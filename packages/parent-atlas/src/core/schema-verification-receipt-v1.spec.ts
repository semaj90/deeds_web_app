import { describe, expect, it } from 'vitest';
import { buildSchemaVerificationReceiptV1, selectReasonerForOwlProfile, schemaVerificationReceiptV1Schema } from './schema-verification-receipt-v1.js';

const sha = 'a'.repeat(64);

const baseInput = {
  schemaId: 'schema:test:v0',
  ontologyChecksum: sha,
  ontologyRevision: 'rev:1',
  owlProfile: 'OWL2_EL' as const,
  reasoner: 'ELK' as const,
  reasonerVersion: '0.6.0',
  reasonerArtifactChecksum: sha,
  classificationChecksum: sha,
  outputArtifactChecksum: sha,
  invocationRevision: 'adapter:v0',
  elapsedMs: 42,
};

describe('buildSchemaVerificationReceiptV1', () => {
  it('builds a valid, checksum-sealed consistent receipt with zero writes', () => {
    const receipt = buildSchemaVerificationReceiptV1({ ...baseInput, consistent: true });
    expect(schemaVerificationReceiptV1Schema.parse(receipt)).toEqual(receipt);
    expect(receipt.writesPerformed).toBe(false);
    expect(receipt.canonicalAuthority).toBe(false);
    expect(receipt.receiptChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('refuses consistent=false with zero named unsatisfiable classes', () => {
    expect(() => buildSchemaVerificationReceiptV1({ ...baseInput, consistent: false })).toThrow();
  });

  it('refuses consistent=true with a non-empty unsatisfiableClasses list', () => {
    expect(() => buildSchemaVerificationReceiptV1({ ...baseInput, consistent: true, unsatisfiableClasses: ['entity:x'] })).toThrow();
  });

  it('accepts consistent=false with a named unsatisfiable class', () => {
    const receipt = buildSchemaVerificationReceiptV1({ ...baseInput, consistent: false, unsatisfiableClasses: ['entity:x'] });
    expect(receipt.consistent).toBe(false);
    expect(receipt.unsatisfiableClasses).toEqual(['entity:x']);
  });

  it('is deterministic — identical input yields identical receiptChecksum', () => {
    const a = buildSchemaVerificationReceiptV1({ ...baseInput, consistent: true });
    const b = buildSchemaVerificationReceiptV1({ ...baseInput, consistent: true });
    expect(a.receiptChecksum).toBe(b.receiptChecksum);
  });
});

describe('selectReasonerForOwlProfile', () => {
  it('routes OWL2_EL_LIKELY to ELK per the frozen reasoner policy', () => {
    expect(selectReasonerForOwlProfile('OWL2_EL_LIKELY')).toBe('ELK');
  });

  it('routes OWL2_DL_REQUIRED to HERMIT per the frozen reasoner policy', () => {
    expect(selectReasonerForOwlProfile('OWL2_DL_REQUIRED')).toBe('HERMIT');
  });

  it('routes UNKNOWN to NONE until a real profile result exists', () => {
    expect(selectReasonerForOwlProfile('UNKNOWN')).toBe('NONE');
  });
});
