import { describe, expect, it } from 'vitest';
import { buildOntologyRevisionManifestV1 } from './ontology-revision-manifest-v1.js';

const checksum = 'a'.repeat(64);
const mappingRevision = `sha256:${'b'.repeat(64)}`;

describe('ontology revision manifest v1', () => {
  it('derives a deterministic declared revision from explicit inputs', () => {
    const input = {
      ontologyId: 'parent-atlas-domain-ontology', schemaId: 'atlas-ontology-kernel-schema',
      schemaChecksum: checksum, mappingRevision,
      admittedClassIds: ['atlas:RetrievalDomain', 'atlas:DatabaseDomain'],
      producerRevision: 'ontology-manifest-producer-v1',
    };
    const first = buildOntologyRevisionManifestV1(input);
    const second = buildOntologyRevisionManifestV1({ ...input, admittedClassIds: [...input.admittedClassIds].reverse() });
    expect(first.ontologyRevision).toBe(second.ontologyRevision);
    expect(first.status).toBe('DECLARED');
    expect(first.canonicalAuthority).toBe(false);
  });

  it('changes revision when an admitted class changes', () => {
    const base = buildOntologyRevisionManifestV1({
      ontologyId: 'parent-atlas-domain-ontology', schemaId: 'atlas-ontology-kernel-schema',
      schemaChecksum: checksum, mappingRevision, admittedClassIds: ['atlas:RetrievalDomain'],
      producerRevision: 'ontology-manifest-producer-v1',
    });
    const changed = buildOntologyRevisionManifestV1({
      ontologyId: 'parent-atlas-domain-ontology', schemaId: 'atlas-ontology-kernel-schema',
      schemaChecksum: checksum, mappingRevision, admittedClassIds: ['atlas:DatabaseDomain'],
      producerRevision: 'ontology-manifest-producer-v1',
    });
    expect(base.ontologyRevision).not.toBe(changed.ontologyRevision);
  });
});
