// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  CodeEvidenceExtractionV1Schema,
  CodeEvidenceGroundedEntryV1Schema,
  assertCodeEvidenceExtractionGrounded,
} from './code-evidence-extraction-v1.js';

const validExtraction = {
  identity: {
    canonicalId: 'cand:1',
    packetKey: 'packet:abc123',
    workspaceRevision: 'ws-r1',
    sourceRevision: 'src-r1',
  },
  grounded: [
    {
      class: 'INVARIANT' as const,
      exactText: 'sums duplicate-identity scores',
      startByte: 10,
      endByte: 41,
      confidence: 0.9,
      attributes: {},
    },
  ],
  structuralRefs: ['ast:service.ts#mergeDuplicateIdentityScores'],
  ontologyRefs: [],
  checksum: 'a'.repeat(64),
};

describe('CodeEvidenceExtractionV1', () => {
  it('accepts a valid extraction', () => {
    const parsed = CodeEvidenceExtractionV1Schema.parse(validExtraction);
    expect(parsed.grounded).toHaveLength(1);
    expect(parsed.grounded[0].class).toBe('INVARIANT');
  });

  it('rejects unknown top-level fields (strict)', () => {
    expect(() => CodeEvidenceExtractionV1Schema.parse({ ...validExtraction, extra: true })).toThrow();
  });

  it('rejects a malformed checksum (not 64-hex)', () => {
    expect(() =>
      CodeEvidenceExtractionV1Schema.parse({ ...validExtraction, checksum: 'not-a-hash' })
    ).toThrow();
  });

  it('rejects an unknown grounded class', () => {
    expect(() =>
      CodeEvidenceExtractionV1Schema.parse({
        ...validExtraction,
        grounded: [{ ...validExtraction.grounded[0], class: 'NOT_A_CLASS' }],
      })
    ).toThrow();
  });
});

describe('CodeEvidenceGroundedEntryV1 — must resolve to a real byte span', () => {
  it('accepts an entry with endByte > startByte', () => {
    expect(() =>
      CodeEvidenceGroundedEntryV1Schema.parse({
        class: 'SYMBOL',
        exactText: 'x',
        startByte: 0,
        endByte: 10,
        confidence: 1,
        attributes: {},
      })
    ).not.toThrow();
  });

  it('rejects an entry where endByte <= startByte (no real span)', () => {
    expect(() =>
      CodeEvidenceGroundedEntryV1Schema.parse({
        class: 'SYMBOL',
        exactText: 'x',
        startByte: 10,
        endByte: 10,
        confidence: 1,
        attributes: {},
      })
    ).toThrow();
  });
});

describe('assertCodeEvidenceExtractionGrounded — round-trip byte-span verification', () => {
  const sourceText = 'const x = 1; // sums duplicate-identity scores here';
  // "sums duplicate-identity scores" starts at byte 17, ends at 48 in the string above
  const startByte = sourceText.indexOf('sums duplicate-identity scores');
  const endByte = startByte + 'sums duplicate-identity scores'.length;

  const extraction = {
    identity: { canonicalId: 'cand:1', packetKey: 'packet:abc123', workspaceRevision: 'ws-r1', sourceRevision: 'src-r1' },
    grounded: [
      { class: 'INVARIANT' as const, exactText: 'sums duplicate-identity scores', startByte, endByte, confidence: 0.9, attributes: {} },
    ],
    structuralRefs: [],
    ontologyRefs: [],
    checksum: 'a'.repeat(64),
    schema: 'atlas.code-evidence-extraction.v1' as const,
  };

  it('passes when exactText matches sourceText at the claimed span and identity matches', () => {
    expect(() =>
      assertCodeEvidenceExtractionGrounded(extraction, sourceText, { canonicalId: 'cand:1', sourceRevision: 'src-r1' })
    ).not.toThrow();
  });

  it('throws when exactText does not match sourceText at the claimed span', () => {
    const corrupted = { ...extraction, grounded: [{ ...extraction.grounded[0], exactText: 'something else entirely' }] };
    expect(() =>
      assertCodeEvidenceExtractionGrounded(corrupted, sourceText, { canonicalId: 'cand:1', sourceRevision: 'src-r1' })
    ).toThrow(/exactText does not match/);
  });

  it('throws when canonicalId does not match the expected identity', () => {
    expect(() =>
      assertCodeEvidenceExtractionGrounded(extraction, sourceText, { canonicalId: 'cand:WRONG', sourceRevision: 'src-r1' })
    ).toThrow(/identity mismatch/);
  });

  it('throws when sourceRevision does not match the expected identity', () => {
    expect(() =>
      assertCodeEvidenceExtractionGrounded(extraction, sourceText, { canonicalId: 'cand:1', sourceRevision: 'WRONG-REV' })
    ).toThrow(/identity mismatch/);
  });
});
