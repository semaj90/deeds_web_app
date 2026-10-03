// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { RESEARCH_EVIDENCE_SCHEMA_V1, researchEvidenceV1JsonSchema, researchEvidenceV1Schema } from './research-evidence-v1.js';

const D = 'sha256:' + 'a'.repeat(64);
const code = {
  schema: RESEARCH_EVIDENCE_SCHEMA_V1, evidenceId: 'e1', sourceKind: 'CODE', sourceRef: 'src/a.ts', sourceRevision: 'sha256:' + 'b'.repeat(64),
  contentDigest: D, proposition: 'a.ts exports foo', confidence: 0.9, evidenceRefs: ['ast:1'], webProvenance: null, producerRevision: 'r1', canonicalAuthority: false,
};
const web = { ...code, sourceKind: 'WEB', sourceRef: 'https://example.org/x', sourceRevision: null, webProvenance: { url: 'https://example.org/x', fetchedAt: '2026-09-26T12:00:00Z', responseDigest: D } };

describe('ResearchEvidenceV1', () => {
  it('accepts revisioned code and web-with-provenance', () => {
    expect(researchEvidenceV1Schema.safeParse(code).success).toBe(true);
    expect(researchEvidenceV1Schema.safeParse(web).success).toBe(true);
  });
  it('requires a revision for revisioned sources and provenance for web, and forbids provenance elsewhere', () => {
    expect(() => researchEvidenceV1Schema.parse({ ...code, sourceRevision: null })).toThrow('SOURCE_REVISION_REQUIRED');
    expect(() => researchEvidenceV1Schema.parse({ ...web, webProvenance: null })).toThrow('WEB_PROVENANCE_REQUIRED');
    expect(() => researchEvidenceV1Schema.parse({ ...code, webProvenance: web.webProvenance })).toThrow('WEB_PROVENANCE_FORBIDDEN');
  });
  it('is strict, never canonical, and confidence-bounded', () => {
    expect(researchEvidenceV1Schema.safeParse({ ...code, extra: 1 }).success).toBe(false);
    expect(researchEvidenceV1Schema.safeParse({ ...code, canonicalAuthority: true }).success).toBe(false);
    expect(researchEvidenceV1Schema.safeParse({ ...code, confidence: 1.01 }).success).toBe(false);
    expect(researchEvidenceV1Schema.safeParse({ ...code, contentDigest: 'A'.repeat(64) }).success).toBe(false);
  });
  it('exports a closed JSON Schema', () => {
    expect((researchEvidenceV1JsonSchema() as any).additionalProperties).toBe(false);
  });
});
