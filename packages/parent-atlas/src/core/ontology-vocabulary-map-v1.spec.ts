import { describe, expect, it } from 'vitest';
import { buildOntologyVocabularyMapReceiptV1 } from './ontology-vocabulary-map-v1.js';

const mapping = {
  schema: 'atlas.ontology-vocabulary-mapping.v1' as const,
  sourceVocabulary: 'EXTERNAL_DOC_DOMAIN' as const,
  sourceLabel: 'retrieval',
  targetClassId: 'atlas:RetrievalDomain',
  mappingRevision: 'mapping:v1',
  ontologyRevision: 'ontology:v1',
  evidenceRefs: ['contract:external-doc'],
  canonicalAuthority: false as const,
};

describe('ontology vocabulary mapping', () => {
  it('seals an explicit cross-vocabulary mapping', () => {
    const receipt = buildOntologyVocabularyMapReceiptV1({
      sourceVocabulary: 'EXTERNAL_DOC_DOMAIN',
      mappingRevision: 'mapping:v1',
      ontologyRevision: 'ontology:v1',
      mappings: [mapping],
    });
    expect(receipt.mappingCount).toBe(1);
    expect(receipt.mappingChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.writesPerformed).toBe(false);
  });

  it('rejects mixed source vocabularies', () => {
    expect(() => buildOntologyVocabularyMapReceiptV1({
      sourceVocabulary: 'EXTERNAL_DOC_DOMAIN',
      mappingRevision: 'mapping:v1',
      ontologyRevision: 'ontology:v1',
      mappings: [{ ...mapping, sourceVocabulary: 'EXTERNAL_DOC_ONTOLOGY' }],
    })).toThrow('ONTOLOGY_VOCABULARY_MISMATCH');
  });
});
