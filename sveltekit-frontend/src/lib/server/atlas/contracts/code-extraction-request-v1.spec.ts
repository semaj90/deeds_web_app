// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  CodeExtractionRequestV1Schema,
  CODE_EXTRACTION_PROFILE_VALUES,
  CODE_EXTRACTION_TRIVIAL_TEXT_LENGTH,
  assertRequestHasStructuralFacts,
} from './code-extraction-request-v1.js';

const baseRequest = {
  candidateId: 'cand:1',
  sourceRevision: 'src-r1',
  language: 'typescript',
  sourceText: 'export function mergeDuplicateIdentityScores(results) { /* ... */ }',
  astFacts: [
    { symbol: 'mergeDuplicateIdentityScores', kind: 'function', calls: [], imports: [], exports: ['mergeDuplicateIdentityScores'] },
  ],
  symbolFacts: [],
  ontologyHints: [],
  profile: 'RERANK_EVIDENCE' as const,
};

describe('CodeExtractionRequestV1', () => {
  it('accepts a valid request', () => {
    const parsed = CodeExtractionRequestV1Schema.parse(baseRequest);
    expect(parsed.profile).toBe('RERANK_EVIDENCE');
  });

  it('rejects unknown top-level fields (strict)', () => {
    expect(() => CodeExtractionRequestV1Schema.parse({ ...baseRequest, extra: true })).toThrow();
  });

  it.each(CODE_EXTRACTION_PROFILE_VALUES)('accepts profile=%s', (profile) => {
    expect(() => CodeExtractionRequestV1Schema.parse({ ...baseRequest, profile })).not.toThrow();
  });

  it('rejects an unknown profile value', () => {
    expect(() => CodeExtractionRequestV1Schema.parse({ ...baseRequest, profile: 'NOT_A_PROFILE' })).toThrow();
  });

  it('rejects empty sourceText', () => {
    expect(() => CodeExtractionRequestV1Schema.parse({ ...baseRequest, sourceText: '' })).toThrow();
  });
});

describe('assertRequestHasStructuralFacts — never re-derive what AST already produces', () => {
  it('allows a non-trivial request with astFacts present', () => {
    const request = CodeExtractionRequestV1Schema.parse(baseRequest);
    expect(() => assertRequestHasStructuralFacts(request)).not.toThrow();
  });

  it('allows a non-trivial request with only symbolFacts present (no astFacts)', () => {
    const request = CodeExtractionRequestV1Schema.parse({
      ...baseRequest,
      astFacts: [],
      symbolFacts: [{ symbol: 'x', kind: 'function', calls: [], imports: [], exports: [] }],
    });
    expect(() => assertRequestHasStructuralFacts(request)).not.toThrow();
  });

  it('rejects a non-trivial request with both astFacts and symbolFacts empty', () => {
    const longText = 'a'.repeat(CODE_EXTRACTION_TRIVIAL_TEXT_LENGTH + 1);
    const request = CodeExtractionRequestV1Schema.parse({
      ...baseRequest,
      sourceText: longText,
      astFacts: [],
      symbolFacts: [],
    });
    expect(() => assertRequestHasStructuralFacts(request)).toThrow(/never be asked to rediscover/);
  });

  it('allows a trivial-length request with no structural facts', () => {
    const shortText = 'const x = 1;';
    expect(shortText.length).toBeLessThanOrEqual(CODE_EXTRACTION_TRIVIAL_TEXT_LENGTH);
    const request = CodeExtractionRequestV1Schema.parse({
      ...baseRequest,
      sourceText: shortText,
      astFacts: [],
      symbolFacts: [],
    });
    expect(() => assertRequestHasStructuralFacts(request)).not.toThrow();
  });
});
