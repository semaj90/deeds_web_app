import { describe, expect, it } from 'vitest';
import { kernelConstraintSchemaV2 } from './ontology-kernel-constraint-v2.js';
import { projectStructuredConstraintsToOwlV2 } from './ontology-owl-projection-v2.js';

describe('projectStructuredConstraintsToOwlV2', () => {
  const base = { schemaId: 'schema:test:v2', schemaChecksum: 'a'.repeat(64), entityTypeIds: ['entity:analysis', 'entity:evidence'], relationTypeIds: ['relation:hasEvidence'] };

  it('emits real domain/range and restriction axioms', () => {
    const receipt = projectStructuredConstraintsToOwlV2({ ...base, constraints: [
      { constraintId: 'c:domain', kind: 'DOMAIN_RANGE', semantics: 'ONTOLOGICAL', propertyId: 'relation:hasEvidence', propertyKind: 'OBJECT', domainClassId: 'entity:analysis', range: { kind: 'CLASS', classId: 'entity:evidence' }, description: 'domain range' },
      { constraintId: 'c:some', kind: 'PROPERTY_RESTRICTION', semantics: 'ONTOLOGICAL', subjectClassId: 'entity:analysis', propertyId: 'relation:hasEvidence', restriction: 'SOME_VALUES_FROM', targetClassId: 'entity:evidence', description: 'some evidence' },
    ] });
    expect(receipt.projectionStatus).toBe('COMPLETE');
    expect(receipt.annotationOnlyLogicalConstraints).toBe(0);
    expect(receipt.owlDocument).toContain('rdfs:domain');
    expect(receipt.owlDocument).toContain('owl:someValuesFrom');
  });

  it('keeps DATA_SHAPE constraints out of OWL without treating them as missing axioms', () => {
    const constraint = kernelConstraintSchemaV2.parse({ constraintId: 'c:shape', kind: 'CARDINALITY', semantics: 'DATA_SHAPE', subjectClassId: 'entity:analysis', propertyId: 'relation:hasEvidence', cardinalityKind: 'EXACT', cardinality: 1, description: 'shape' });
    const receipt = projectStructuredConstraintsToOwlV2({ ...base, constraints: [constraint] });
    expect(receipt.projectionStatus).toBe('COMPLETE');
    expect(receipt.constraintsNotEmitted).toEqual(['c:shape']);
    expect(receipt.owlProfile).toBe('OWL2_EL');
  });
});
