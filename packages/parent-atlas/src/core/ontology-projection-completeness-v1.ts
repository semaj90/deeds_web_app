import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { KernelConstraintV2 } from './ontology-kernel-constraint-v2.js';
import type { OntologyOwlProjectionV2Receipt } from './ontology-owl-projection-v2.js';
import type { OntologyShaclProjectionV1Receipt } from './ontology-shacl-projection-v1.js';

export const ontologyProjectionCompletenessV1ReceiptSchema = z.object({
  schema: z.literal('atlas.ontology-projection-completeness-receipt.v1'),
  schemaId: z.string().min(1),
  schemaChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  intendedLogicalConstraintCount: z.number().int().nonnegative(),
  emittedLogicalAxiomConstraintCount: z.number().int().nonnegative(),
  intendedDataShapeConstraintCount: z.number().int().nonnegative(),
  emittedDataShapeConstraintCount: z.number().int().nonnegative(),
  annotationOnlyLogicalConstraints: z.number().int().nonnegative(),
  unknownConstraintMappings: z.number().int().nonnegative(),
  projectionComplete: z.boolean(),
  owlProfile: z.enum(['OWL2_EL', 'OWL2_DL', 'UNKNOWN', 'UNSUPPORTED']),
  profileChecked: z.literal(false),
  reasonerRoute: z.literal('NONE'),
  canonicalAuthority: z.literal(false),
  receiptChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type OntologyProjectionCompletenessV1Receipt = z.infer<typeof ontologyProjectionCompletenessV1ReceiptSchema>;

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

export function buildOntologyProjectionCompletenessV1(input: {
  schemaId: string;
  schemaChecksum: string;
  constraints: readonly KernelConstraintV2[];
  owlReceipt: OntologyOwlProjectionV2Receipt;
  shaclReceipt: OntologyShaclProjectionV1Receipt;
}): OntologyProjectionCompletenessV1Receipt {
  const logical = input.constraints.filter((c) => c.semantics !== 'DATA_SHAPE');
  const shapes = input.constraints.filter((c) => c.semantics !== 'ONTOLOGICAL');
  const emittedLogical = new Set(input.owlReceipt.axiomsEmitted);
  const emittedShapes = new Set(input.shaclReceipt.shapesEmitted);
  const unknown = new Set([...input.owlReceipt.unsupportedMappings, ...input.shaclReceipt.unsupportedMappings]);
  const body = {
    schema: 'atlas.ontology-projection-completeness-receipt.v1' as const,
    schemaId: input.schemaId,
    schemaChecksum: input.schemaChecksum,
    intendedLogicalConstraintCount: logical.length,
    emittedLogicalAxiomConstraintCount: logical.filter((c) => emittedLogical.has(c.constraintId)).length,
    intendedDataShapeConstraintCount: shapes.length,
    emittedDataShapeConstraintCount: shapes.filter((c) => emittedShapes.has(c.constraintId)).length,
    annotationOnlyLogicalConstraints: input.owlReceipt.annotationOnlyLogicalConstraints,
    unknownConstraintMappings: unknown.size,
    projectionComplete: logical.every((c) => emittedLogical.has(c.constraintId)) && shapes.every((c) => emittedShapes.has(c.constraintId)) && unknown.size === 0,
    owlProfile: input.owlReceipt.owlProfile,
    profileChecked: false as const,
    reasonerRoute: 'NONE' as const,
    canonicalAuthority: false as const,
  };
  return ontologyProjectionCompletenessV1ReceiptSchema.parse({ ...body, receiptChecksum: hash(body) });
}
