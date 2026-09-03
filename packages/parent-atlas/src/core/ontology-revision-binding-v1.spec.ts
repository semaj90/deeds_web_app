import { describe, expect, it } from 'vitest';
import { buildOntologyRevisionBindingV1 } from './ontology-revision-binding-v1.js';

const checksum = 'a'.repeat(64);

describe('ontology revision binding v1', () => {
  it('requires explicit checksum-sealed revisions', () => {
    const binding = buildOntologyRevisionBindingV1({
      ontologyId: 'parent-atlas-domain-ontology',
      ontologyRevision: `sha256:${checksum}`,
      schemaId: 'atlas-ontology-kernel-schema',
      schemaChecksum: checksum,
      mappingRevision: `sha256:${'b'.repeat(64)}`,
      evidenceRefs: ['audit:ontology-revision-owner-v1'],
    });
    expect(binding.status).toBe('DECLARED');
    expect(binding.canonicalAuthority).toBe(false);
  });

  it('rejects producer labels as ontology revisions', () => {
    expect(() => buildOntologyRevisionBindingV1({
      ontologyId: 'parent-atlas-domain-ontology',
      ontologyRevision: 'okf-ontology-v1',
      schemaId: 'atlas-ontology-kernel-schema',
      schemaChecksum: checksum,
      mappingRevision: `sha256:${'b'.repeat(64)}`,
      evidenceRefs: ['audit:ontology-revision-owner-v1'],
    })).toThrow();
  });
});
