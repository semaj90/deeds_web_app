import { describe, expect, it } from 'vitest';
import { buildAtlasOntologyKernelSchemaV1 } from './ontology-kernel-schema-v1.js';
import { projectAtlasOntologyKernelSchemaToOwlV1, ontologyProfileReceiptV1Schema } from './ontology-owl-projection-v1.js';

function buildTestSchema() {
  return buildAtlasOntologyKernelSchemaV1({
    schemaId: 'schema:test:v0',
    taskClass: 'test_task_class',
    entityTypes: [
      { entityTypeId: 'entity:symbol', label: 'Symbol', sourceContract: 'symbol-registry', identityFields: ['stableSymbolId'] },
      { entityTypeId: 'entity:packet', label: 'Packet', sourceContract: 'other', identityFields: ['packetKey'] },
    ],
    relationTypes: [
      { relationTypeId: 'relation:calls', label: 'Calls', arity: 'binary', sourceContract: 'other', participantRoles: ['caller', 'callee'] },
      { relationTypeId: 'relation:coOccurs', label: 'Co-occurs', arity: 'n-ary', sourceContract: 'hyperedge-contract', participantRoles: ['a', 'b', 'c'] },
    ],
    constraints: [
      { constraintId: 'constraint:disjoint', kind: 'DISJOINT_CLASSES', appliesTo: ['entity:symbol', 'entity:packet'], description: 'Symbol and Packet are disjoint' },
      { constraintId: 'constraint:cardinality', kind: 'CARDINALITY', appliesTo: ['relation:calls'], description: 'At most one callee per call site' },
    ],
    producerRevision: 'test:v0',
  });
}

describe('projectAtlasOntologyKernelSchemaToOwlV1', () => {
  it('produces a schema-valid, checksum-sealed receipt', () => {
    const receipt = projectAtlasOntologyKernelSchemaToOwlV1(buildTestSchema());
    expect(ontologyProfileReceiptV1Schema.parse(receipt)).toEqual(receipt);
    expect(receipt.owlChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.canonicalAuthority).toBe(false);
  });

  it('counts entity classes and relation properties correctly', () => {
    const receipt = projectAtlasOntologyKernelSchemaToOwlV1(buildTestSchema());
    expect(receipt.entityClassCount).toBe(2);
    expect(receipt.relationPropertyCount).toBe(2);
  });

  it('classifies DISJOINT_CLASSES (exactly 2 members) as a real covered axiom', () => {
    const receipt = projectAtlasOntologyKernelSchemaToOwlV1(buildTestSchema());
    expect(receipt.axiomsCovered).toContain('constraint:disjoint');
    expect(receipt.owlDocument).toContain('owl:disjointWith');
  });

  it('classifies CARDINALITY as annotation-only, not a real axiom, and downgrades the profile heuristic', () => {
    const receipt = projectAtlasOntologyKernelSchemaToOwlV1(buildTestSchema());
    expect(receipt.axiomsAnnotatedOnly).toContain('constraint:cardinality');
    expect(receipt.owlProfileHeuristic).toBe('OWL2_DL_REQUIRED');
  });

  it('reifies n-ary relations as owl:Class, not owl:ObjectProperty', () => {
    const receipt = projectAtlasOntologyKernelSchemaToOwlV1(buildTestSchema());
    expect(receipt.owlDocument).toMatch(/owl:Class rdf:about="[^"]*relation:coOccurs"/);
  });

  it('projects binary relations as owl:ObjectProperty', () => {
    const receipt = projectAtlasOntologyKernelSchemaToOwlV1(buildTestSchema());
    expect(receipt.owlDocument).toMatch(/owl:ObjectProperty rdf:about="[^"]*relation:calls"/);
  });

  it('is deterministic — same schema input produces byte-identical OWL and checksum', () => {
    const schema = buildTestSchema();
    const a = projectAtlasOntologyKernelSchemaToOwlV1(schema);
    const b = projectAtlasOntologyKernelSchemaToOwlV1(schema);
    expect(a.owlDocument).toBe(b.owlDocument);
    expect(a.owlChecksum).toBe(b.owlChecksum);
  });

  it('a schema with only DISJOINT_CLASSES constraints yields OWL2_EL_LIKELY', () => {
    const schema = buildAtlasOntologyKernelSchemaV1({
      schemaId: 'schema:el-only:v0',
      taskClass: 'test_task_class',
      entityTypes: [
        { entityTypeId: 'entity:a', label: 'A', sourceContract: 'other', identityFields: ['id'] },
        { entityTypeId: 'entity:b', label: 'B', sourceContract: 'other', identityFields: ['id'] },
      ],
      constraints: [
        { constraintId: 'constraint:disjoint', kind: 'DISJOINT_CLASSES', appliesTo: ['entity:a', 'entity:b'], description: 'A and B are disjoint' },
      ],
      producerRevision: 'test:v0',
    });
    const receipt = projectAtlasOntologyKernelSchemaToOwlV1(schema);
    expect(receipt.owlProfileHeuristic).toBe('OWL2_EL_LIKELY');
    expect(receipt.axiomsAnnotatedOnly).toHaveLength(0);
  });
});
