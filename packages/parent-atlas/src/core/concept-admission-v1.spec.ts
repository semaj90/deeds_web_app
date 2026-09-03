import { describe, expect, it } from 'vitest';
import { buildConceptIntegrationReceiptV1, conceptAdmissionDecisionV1Schema } from './concept-admission-v1.js';

const base = {
  schema: 'atlas.concept-admission-decision.v1' as const,
  normalizedLabel: 'rag_retrieval',
  classId: 'atlas:RetrievalDomain',
  status: 'ADMITTED' as const,
  mappingRevision: 'mapping:v1',
  ontologyRevision: 'ontology:v1',
  sourceRevision: 'source:v1',
  evidenceRefs: ['packet:p1'],
  canonicalAuthority: false as const,
  writesPerformed: false as const,
};

describe('concept admission contract', () => {
  it('admits only revision-qualified explicit classes', () => {
    expect(conceptAdmissionDecisionV1Schema.parse(base).classId).toBe('atlas:RetrievalDomain');
    expect(() => conceptAdmissionDecisionV1Schema.parse({ ...base, sourceRevision: null })).toThrow();
  });

  it('keeps rejected concepts out of projection/cache authority', () => {
    const rejected = conceptAdmissionDecisionV1Schema.parse({ ...base, classId: null, status: 'UNMAPPED', ontologyRevision: null, sourceRevision: null });
    const receipt = buildConceptIntegrationReceiptV1({ mappingRevision: 'mapping:v1', decisions: [rejected] });
    expect(receipt.admittedCount).toBe(0);
    expect(receipt.neo4jProjectionAllowed).toBe(false);
    expect(receipt.valkeyPopulationAllowed).toBe(false);
    expect(receipt.writesPerformed).toBe(false);
  });
});
