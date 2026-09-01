import { describe, expect, it } from 'vitest';
import { projectStructuredConstraintsToOwlV2 } from './ontology-owl-projection-v2.js';
import { projectStructuredConstraintsToShaclV1 } from './ontology-shacl-projection-v1.js';
import { buildOntologyProjectionCompletenessV1 } from './ontology-projection-completeness-v1.js';

describe('buildOntologyProjectionCompletenessV1', () => {
  it('accounts for both logical axioms and data shapes without selecting a reasoner', () => {
    const constraints = [
      { constraintId: 'c:domain', kind: 'DOMAIN_RANGE' as const, semantics: 'ONTOLOGICAL' as const, propertyId: 'relation:evidence', propertyKind: 'OBJECT' as const, domainClassId: 'entity:analysis', range: { kind: 'CLASS' as const, classId: 'entity:evidence' }, description: 'domain' },
      { constraintId: 'c:count', kind: 'CARDINALITY' as const, semantics: 'DATA_SHAPE' as const, subjectClassId: 'entity:analysis', propertyId: 'relation:evidence', cardinalityKind: 'EXACT' as const, cardinality: 1, description: 'count' },
    ];
    const common = { schemaId: 'schema:complete', schemaChecksum: 'c'.repeat(64), entityTypeIds: ['entity:analysis', 'entity:evidence'], relationTypeIds: ['relation:evidence'] };
    const receipt = buildOntologyProjectionCompletenessV1({ ...common, constraints, owlReceipt: projectStructuredConstraintsToOwlV2({ ...common, constraints }), shaclReceipt: projectStructuredConstraintsToShaclV1({ ...common, constraints }) });
    expect(receipt.projectionComplete).toBe(true);
    expect(receipt.profileChecked).toBe(false);
    expect(receipt.reasonerRoute).toBe('NONE');
  });
});
