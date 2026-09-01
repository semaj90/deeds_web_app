import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { KernelConstraintV2 } from './ontology-kernel-constraint-v2.js';
import { kernelConstraintSchemaV2 } from './ontology-kernel-constraint-v2.js';

const id = z.string().min(1);

export const ontologyShaclProjectionV1ReceiptSchema = z.object({
  schema: z.literal('atlas.ontology-shacl-projection-receipt.v1'),
  shaclSpecRevision: z.literal('W3C-SHACL-20170720'),
  schemaId: id,
  schemaChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  shaclDocument: z.string().min(1),
  shaclChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  projectionStatus: z.enum(['COMPLETE', 'INCOMPLETE']),
  shapesEmitted: z.array(id),
  constraintsNotEmitted: z.array(id),
  unsupportedMappings: z.array(id),
  canonicalAuthority: z.literal(false),
}).strict();

export type OntologyShaclProjectionV1Receipt = z.infer<typeof ontologyShaclProjectionV1ReceiptSchema>;

const SH = 'http://www.w3.org/ns/shacl#';
const ATLAS = 'http://parent-atlas.local/ontology-kernel#';

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Emits SHACL only for DATA_SHAPE/BOTH intent; OWL-only constraints are not shapes. */
export function projectStructuredConstraintsToShaclV1(input: {
  schemaId: string;
  schemaChecksum: string;
  entityTypeIds: readonly string[];
  relationTypeIds: readonly string[];
  constraints: readonly KernelConstraintV2[];
}): OntologyShaclProjectionV1Receipt {
  const declared = new Set([...input.entityTypeIds, ...input.relationTypeIds]);
  const lines = [
    '<?xml version="1.0"?>',
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:sh="${SH}" xmlns:atlas="${ATLAS}">`,
  ];
  const shapesEmitted: string[] = [];
  const constraintsNotEmitted: string[] = [];
  const unsupportedMappings: string[] = [];

  for (const raw of input.constraints) {
    const constraint = kernelConstraintSchemaV2.parse(raw);
    if (constraint.semantics === 'ONTOLOGICAL') {
      constraintsNotEmitted.push(constraint.constraintId);
      continue;
    }
    const targetClass = (() => {
      switch (constraint.kind) {
        case 'CARDINALITY':
        case 'PROPERTY_RESTRICTION': return constraint.subjectClassId;
        case 'DOMAIN_RANGE': return constraint.domainClassId;
        case 'NARY_PARTICIPANT_ROLE': return constraint.relationTypeId;
        case 'DISJOINT_CLASSES': return constraint.classIds[0];
      }
    })();
    if (!declared.has(targetClass)) {
      unsupportedMappings.push(constraint.constraintId);
      continue;
    }
    if (constraint.kind === 'CARDINALITY') {
      const shape = `${ATLAS}${esc(constraint.constraintId)}`;
      lines.push(`  <sh:NodeShape rdf:about="${shape}"><sh:targetClass rdf:resource="${ATLAS}${esc(targetClass)}"/><sh:property><sh:PropertyShape><sh:path rdf:resource="${ATLAS}${esc(constraint.propertyId)}"/>`);
      if (constraint.cardinalityKind === 'MIN' || constraint.cardinalityKind === 'EXACT') lines.push(`      <sh:minCount>${constraint.cardinality}</sh:minCount>`);
      if (constraint.cardinalityKind === 'MAX' || constraint.cardinalityKind === 'EXACT') lines.push(`      <sh:maxCount>${constraint.cardinality}</sh:maxCount>`);
      lines.push('    </sh:PropertyShape></sh:property></sh:NodeShape>');
      shapesEmitted.push(constraint.constraintId);
    } else if (constraint.kind === 'DOMAIN_RANGE' || constraint.kind === 'PROPERTY_RESTRICTION') {
      // These can be compiled to SHACL, but remain explicit unsupported work
      // until the target property/node shape vocabulary is frozen.
      unsupportedMappings.push(constraint.constraintId);
    } else {
      unsupportedMappings.push(constraint.constraintId);
    }
  }
  lines.push('</rdf:RDF>');
  const shaclDocument = lines.join('\n');
  return ontologyShaclProjectionV1ReceiptSchema.parse({
    schema: 'atlas.ontology-shacl-projection-receipt.v1',
    shaclSpecRevision: 'W3C-SHACL-20170720',
    schemaId: input.schemaId,
    schemaChecksum: input.schemaChecksum,
    shaclDocument,
    shaclChecksum: hash(shaclDocument),
    projectionStatus: unsupportedMappings.length === 0 ? 'COMPLETE' : 'INCOMPLETE',
    shapesEmitted,
    constraintsNotEmitted,
    unsupportedMappings,
    canonicalAuthority: false,
  });
}
