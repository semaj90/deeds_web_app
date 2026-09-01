import { createHash } from 'node:crypto';
import { z } from 'zod';
import { kernelConstraintSchemaV2, type KernelConstraintV2 } from './ontology-kernel-constraint-v2.js';

const id = z.string().min(1);
const status = z.enum(['COMPLETE', 'INCOMPLETE']);
const profile = z.enum(['OWL2_EL', 'OWL2_DL', 'UNKNOWN', 'UNSUPPORTED']);

export const ontologyOwlProjectionV2ReceiptSchema = z.object({
  schema: z.literal('atlas.ontology-owl-projection-receipt.v2'),
  schemaId: id,
  schemaChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  owlDocument: z.string().min(1),
  owlChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  projectionStatus: status,
  owlProfile: profile,
  axiomsEmitted: z.array(id),
  constraintsNotEmitted: z.array(id),
  unsupportedMappings: z.array(id),
  annotationOnlyLogicalConstraints: z.number().int().nonnegative(),
  canonicalAuthority: z.literal(false),
}).strict();

export type OntologyOwlProjectionV2Receipt = z.infer<typeof ontologyOwlProjectionV2ReceiptSchema>;

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

const NS = 'http://parent-atlas.local/ontology-kernel#';

/**
 * Structured V2 OWL projection. DATA_SHAPE-only constraints are intentionally
 * omitted because they belong to SHACL. ONTOLOGICAL/BOTH constraints must be
 * emitted as axioms or are reported as unsupported; they are never downgraded
 * to comments.
 */
export function projectStructuredConstraintsToOwlV2(input: {
  schemaId: string;
  schemaChecksum: string;
  entityTypeIds: readonly string[];
  relationTypeIds: readonly string[];
  constraints: readonly KernelConstraintV2[];
}): OntologyOwlProjectionV2Receipt {
  const declared = new Set([...input.entityTypeIds, ...input.relationTypeIds]);
  const lines = [
    '<?xml version="1.0"?>',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"',
    '         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"',
    '         xmlns:owl="http://www.w3.org/2002/07/owl#"',
    `         xmlns:atlas="${NS}" xml:base="${NS.replace(/#$/, '')}">`,
  ];
  const axiomsEmitted: string[] = [];
  const constraintsNotEmitted: string[] = [];
  const unsupportedMappings: string[] = [];

  for (const raw of input.constraints) {
    const constraint = kernelConstraintSchemaV2.parse(raw);
    if (constraint.semantics === 'DATA_SHAPE') {
      constraintsNotEmitted.push(constraint.constraintId);
      continue;
    }
    const typeRefs = (() => {
      switch (constraint.kind) {
        case 'DISJOINT_CLASSES': return constraint.classIds;
        case 'DOMAIN_RANGE': return [constraint.domainClassId, constraint.range.kind === 'CLASS' ? constraint.range.classId : undefined].filter((v): v is string => Boolean(v));
        case 'PROPERTY_RESTRICTION': return [constraint.subjectClassId, constraint.targetClassId].filter((v): v is string => Boolean(v));
        case 'CARDINALITY': return [constraint.subjectClassId, constraint.fillerClassId].filter((v): v is string => Boolean(v));
        case 'NARY_PARTICIPANT_ROLE': return [constraint.relationTypeId, constraint.targetClassId];
      }
    })();
    if (typeRefs.some((ref) => !declared.has(ref))) {
      unsupportedMappings.push(constraint.constraintId);
      continue;
    }
    const iriFor = (value: string) => `${NS}${escapeXml(value)}`;
    switch (constraint.kind) {
      case 'DISJOINT_CLASSES':
        for (const left of constraint.classIds) for (const right of constraint.classIds) if (left < right) {
          lines.push(`  <rdf:Description rdf:about="${iriFor(left)}"><owl:disjointWith rdf:resource="${iriFor(right)}"/></rdf:Description>`);
        }
        axiomsEmitted.push(constraint.constraintId);
        break;
      case 'DOMAIN_RANGE':
        lines.push(`  <rdf:Description rdf:about="${iriFor(constraint.propertyId)}"><rdfs:domain rdf:resource="${iriFor(constraint.domainClassId)}"/>`);
        lines.push(constraint.range.kind === 'CLASS'
          ? `    <rdfs:range rdf:resource="${iriFor(constraint.range.classId)}"/></rdf:Description>`
          : `    <rdfs:range rdf:resource="${escapeXml(constraint.range.datatypeIri)}"/></rdf:Description>`);
        axiomsEmitted.push(constraint.constraintId);
        break;
      case 'PROPERTY_RESTRICTION':
        lines.push(`  <owl:Class rdf:about="${iriFor(constraint.subjectClassId)}"><rdfs:subClassOf><owl:Restriction><owl:onProperty rdf:resource="${iriFor(constraint.propertyId)}"/>`);
        if (constraint.restriction === 'HAS_VALUE') lines.push(`      <owl:hasValue>${escapeXml(constraint.targetValue!)}</owl:hasValue>`);
        else lines.push(`      <owl:${constraint.restriction === 'SOME_VALUES_FROM' ? 'someValuesFrom' : 'allValuesFrom'} rdf:resource="${iriFor(constraint.targetClassId!)}"/>`);
        lines.push('    </owl:Restriction></rdfs:subClassOf></owl:Class>');
        axiomsEmitted.push(constraint.constraintId);
        break;
      case 'CARDINALITY':
        lines.push(`  <owl:Class rdf:about="${iriFor(constraint.subjectClassId)}"><rdfs:subClassOf><owl:Restriction><owl:onProperty rdf:resource="${iriFor(constraint.propertyId)}"/>`);
        const cardinalityTag = constraint.cardinalityKind === 'MIN' ? 'minCardinality' : constraint.cardinalityKind === 'MAX' ? 'maxCardinality' : 'cardinality';
        lines.push(`      <owl:${cardinalityTag} rdf:datatype="http://www.w3.org/2001/XMLSchema#nonNegativeInteger">${constraint.cardinality}</owl:${cardinalityTag}>`);
        lines.push('    </owl:Restriction></rdfs:subClassOf></owl:Class>');
        axiomsEmitted.push(constraint.constraintId);
        break;
      case 'NARY_PARTICIPANT_ROLE':
        lines.push(`  <rdf:Description rdf:about="${iriFor(constraint.propertyId)}"><rdfs:domain rdf:resource="${iriFor(constraint.relationTypeId)}"/><rdfs:range rdf:resource="${iriFor(constraint.targetClassId)}"/></rdf:Description>`);
        axiomsEmitted.push(constraint.constraintId);
        break;
    }
  }
  lines.push('</rdf:RDF>');
  const owlDocument = lines.join('\n');
  const body = {
    schema: 'atlas.ontology-owl-projection-receipt.v2' as const,
    schemaId: input.schemaId,
    schemaChecksum: input.schemaChecksum,
    owlDocument,
    projectionStatus: unsupportedMappings.length === 0 ? 'COMPLETE' as const : 'INCOMPLETE' as const,
    owlProfile: axiomsEmitted.some((id) => input.constraints.find((c) => c.constraintId === id)?.kind === 'CARDINALITY') ? 'OWL2_DL' as const : 'OWL2_EL' as const,
    axiomsEmitted,
    constraintsNotEmitted,
    unsupportedMappings,
    annotationOnlyLogicalConstraints: 0,
    canonicalAuthority: false as const,
  };
  return ontologyOwlProjectionV2ReceiptSchema.parse({ ...body, owlChecksum: checksum(owlDocument) });
}
