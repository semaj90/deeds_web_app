import { describe, expect, it } from 'vitest';
import { projectStructuredConstraintsToShaclV1 } from './ontology-shacl-projection-v1.js';

describe('projectStructuredConstraintsToShaclV1', () => {
  it('emits a W3C SHACL cardinality shape for data-shape intent', () => {
    const receipt = projectStructuredConstraintsToShaclV1({
      schemaId: 'schema:shacl:test', schemaChecksum: 'b'.repeat(64),
      entityTypeIds: ['entity:packet'], relationTypeIds: [], constraints: [{
        constraintId: 'c:source-count', kind: 'CARDINALITY', semantics: 'DATA_SHAPE',
        subjectClassId: 'entity:packet', propertyId: 'relation:sourceRevision',
        cardinalityKind: 'EXACT', cardinality: 1, description: 'one source revision',
      }],
    });
    expect(receipt.projectionStatus).toBe('COMPLETE');
    expect(receipt.shaclSpecRevision).toBe('W3C-SHACL-20170720');
    expect(receipt.shaclDocument).toContain('sh:minCount>1');
    expect(receipt.shaclDocument).toContain('sh:maxCount>1');
  });

  it('does not convert OWL-only constraints into SHACL shapes', () => {
    const receipt = projectStructuredConstraintsToShaclV1({
      schemaId: 'schema:shacl:test', schemaChecksum: 'b'.repeat(64),
      entityTypeIds: ['entity:a', 'entity:b'], relationTypeIds: [], constraints: [{
        constraintId: 'c:disjoint', kind: 'DISJOINT_CLASSES', semantics: 'ONTOLOGICAL',
        classIds: ['entity:a', 'entity:b'], description: 'disjoint',
      }],
    });
    expect(receipt.constraintsNotEmitted).toEqual(['c:disjoint']);
    expect(receipt.shapesEmitted).toHaveLength(0);
  });
});
