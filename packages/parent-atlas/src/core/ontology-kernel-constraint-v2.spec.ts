import { describe, expect, it } from 'vitest';
import { buildOntologyConstraintCompilationIntentV1, kernelConstraintSchemaV2 } from './ontology-kernel-constraint-v2.js';

describe('kernelConstraintSchemaV2', () => {
  it('accepts structured OWL domain/range data', () => {
    const constraint = kernelConstraintSchemaV2.parse({
      constraintId: 'constraint:evidence-domain',
      kind: 'DOMAIN_RANGE',
      semantics: 'ONTOLOGICAL',
      propertyId: 'relation:hasEvidence',
      propertyKind: 'OBJECT',
      domainClassId: 'entity:analysis',
      range: { kind: 'CLASS', classId: 'entity:evidence' },
      description: 'Analysis has evidence',
    });
    expect(buildOntologyConstraintCompilationIntentV1(constraint)).toMatchObject({ emitOwl: true, emitShacl: false });
  });

  it('requires explicit targets for property restrictions', () => {
    expect(() => kernelConstraintSchemaV2.parse({
      constraintId: 'constraint:missing-target',
      kind: 'PROPERTY_RESTRICTION',
      semantics: 'BOTH',
      subjectClassId: 'entity:analysis',
      propertyId: 'relation:hasEvidence',
      restriction: 'SOME_VALUES_FROM',
      description: 'Missing target',
    })).toThrow();
  });

  it('routes data-shape intent to SHACL without inventing OWL meaning', () => {
    const constraint = kernelConstraintSchemaV2.parse({
      constraintId: 'constraint:one-source',
      kind: 'CARDINALITY',
      semantics: 'DATA_SHAPE',
      subjectClassId: 'entity:packet',
      propertyId: 'relation:sourceRevision',
      cardinalityKind: 'EXACT',
      cardinality: 1,
      description: 'Exactly one source revision',
    });
    expect(buildOntologyConstraintCompilationIntentV1(constraint)).toMatchObject({ emitOwl: false, emitShacl: true });
  });
});
