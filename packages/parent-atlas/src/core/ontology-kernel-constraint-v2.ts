import { z } from 'zod';

const id = z.string().min(1);
const iri = z.string().min(1);

export const constraintSemanticsSchema = z.enum(['ONTOLOGICAL', 'DATA_SHAPE', 'BOTH']);
export type ConstraintSemantics = z.infer<typeof constraintSemanticsSchema>;

const base = {
  constraintId: id,
  semantics: constraintSemanticsSchema,
  description: z.string().min(1),
} as const;

export const kernelConstraintSchemaV2 = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('DISJOINT_CLASSES'), classIds: z.array(id).min(2) }).strict(),
  z.object({
    ...base,
    kind: z.literal('DOMAIN_RANGE'),
    propertyId: id,
    propertyKind: z.enum(['OBJECT', 'DATA']),
    domainClassId: id,
    range: z.union([
      z.object({ kind: z.literal('CLASS'), classId: id }).strict(),
      z.object({ kind: z.literal('DATATYPE'), datatypeIri: iri }).strict(),
    ]),
  }).strict(),
  z.object({
    ...base,
    kind: z.literal('PROPERTY_RESTRICTION'),
    subjectClassId: id,
    propertyId: id,
    restriction: z.enum(['SOME_VALUES_FROM', 'ALL_VALUES_FROM', 'HAS_VALUE']),
    targetClassId: id.optional(),
    targetValue: z.string().min(1).optional(),
  }).strict().superRefine((value, ctx) => {
    if (value.restriction !== 'HAS_VALUE' && !value.targetClassId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targetClassId'], message: 'Class target required for this restriction' });
    }
    if (value.restriction === 'HAS_VALUE' && !value.targetValue) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targetValue'], message: 'Value target required for HAS_VALUE' });
    }
  }),
  z.object({
    ...base,
    kind: z.literal('CARDINALITY'),
    subjectClassId: id,
    propertyId: id,
    cardinalityKind: z.enum(['MIN', 'MAX', 'EXACT']),
    cardinality: z.number().int().nonnegative(),
    fillerClassId: id.optional(),
  }).strict(),
  z.object({
    ...base,
    kind: z.literal('NARY_PARTICIPANT_ROLE'),
    relationTypeId: id,
    role: id,
    propertyId: id,
    targetClassId: id,
  }).strict(),
]);

export type KernelConstraintV2 = z.infer<typeof kernelConstraintSchemaV2>;

export const ontologyConstraintCompilationIntentV1Schema = z.object({
  schema: z.literal('atlas.ontology-constraint-compilation-intent.v1'),
  constraintId: id,
  semantics: constraintSemanticsSchema,
  emitOwl: z.boolean(),
  emitShacl: z.boolean(),
  canonicalAuthority: z.literal(false),
}).strict();

export type OntologyConstraintCompilationIntentV1 = z.infer<typeof ontologyConstraintCompilationIntentV1Schema>;

export function buildOntologyConstraintCompilationIntentV1(constraint: KernelConstraintV2): OntologyConstraintCompilationIntentV1 {
  return ontologyConstraintCompilationIntentV1Schema.parse({
    schema: 'atlas.ontology-constraint-compilation-intent.v1',
    constraintId: constraint.constraintId,
    semantics: constraint.semantics,
    emitOwl: constraint.semantics === 'ONTOLOGICAL' || constraint.semantics === 'BOTH',
    emitShacl: constraint.semantics === 'DATA_SHAPE' || constraint.semantics === 'BOTH',
    canonicalAuthority: false,
  });
}
