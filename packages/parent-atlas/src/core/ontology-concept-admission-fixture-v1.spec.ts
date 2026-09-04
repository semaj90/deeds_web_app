import { describe, expect, it } from 'vitest';
import { buildConceptIntegrationReceiptV1 } from './concept-admission-v1.js';
import { buildOntologyRevisionManifestV1 } from './ontology-revision-manifest-v1.js';

const sourceRevision = `sha256:${'c'.repeat(64)}`;
const schemaChecksum = 'a'.repeat(64);
const mappingRevision = `sha256:${'b'.repeat(64)}`;

describe('ontology concept admission fixture v1', () => {
  it('composes grounded admitted decisions under one declared revision', () => {
    const manifest = buildOntologyRevisionManifestV1({
      ontologyId: 'parent-atlas-domain-ontology',
      schemaId: 'atlas-ontology-kernel-schema',
      schemaChecksum,
      mappingRevision,
      admittedClassIds: ['atlas:DatabaseDomain', 'atlas:RetrievalDomain'],
      producerRevision: 'fixture-producer-v1',
    });
    const receipt = buildConceptIntegrationReceiptV1({
      mappingRevision,
      ontologyRevision: manifest.ontologyRevision,
      decisions: [
        {
          schema: 'atlas.concept-admission-decision.v1', normalizedLabel: 'retrieval',
          classId: 'atlas:RetrievalDomain', status: 'ADMITTED', mappingRevision,
          ontologyRevision: manifest.ontologyRevision, sourceRevision,
          evidenceRefs: ['fixture:source.ts#L1-L2'], canonicalAuthority: false, writesPerformed: false,
        },
        {
          schema: 'atlas.concept-admission-decision.v1', normalizedLabel: 'database',
          classId: 'atlas:DatabaseDomain', status: 'ADMITTED', mappingRevision,
          ontologyRevision: manifest.ontologyRevision, sourceRevision,
          evidenceRefs: ['fixture:source.ts#L3-L4'], canonicalAuthority: false, writesPerformed: false,
        },
      ],
    });
    expect(receipt.admittedCount).toBe(2);
    expect(receipt.ontologyRevision).toBe(manifest.ontologyRevision);
    expect(receipt.neo4jProjectionAllowed).toBe(false);
    expect(receipt.valkeyPopulationAllowed).toBe(false);
    expect(receipt.writesPerformed).toBe(false);
  });
});
