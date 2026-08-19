import { z } from 'zod';

export const RepresentationDeclarationV1Schema = z.object({
  sourceId: z.string().min(1),
  representationId: z.string().min(1),
  dimension: z.number().int().positive(),
  canonicalClaim: z.boolean(),
  revision: z.string().min(1),
  notes: z.array(z.string().min(1)).max(8).default([]),
}).strict();
export type RepresentationDeclarationV1 = z.infer<typeof RepresentationDeclarationV1Schema>;

export const RepresentationDimensionAuditV1Schema = z.object({
  schema: z.literal('atlas.representation-dimension-audit.v1'),
  representationFamily: z.string().min(1),
  declarations: z.array(RepresentationDeclarationV1Schema).min(1),
  observedDimensions: z.array(z.number().int().positive()).min(1),
  canonicalClaimCount: z.number().int().nonnegative(),
  conflict: z.boolean(),
  status: z.enum(['CONSISTENT', 'CONFLICT_REQUIRES_EXPLICIT_EXECUTION_IDENTITY']),
  reasonCodes: z.array(z.string().min(1)).min(1),
  producerRevision: z.string().min(1),
}).strict();
export type RepresentationDimensionAuditV1 = z.infer<typeof RepresentationDimensionAuditV1Schema>;

/**
 * This audit does not choose a winner. It exposes stale/global canonical claims
 * so each execution manifest must pin the representation revision/dimension it
 * actually consumed.
 */
export function auditRepresentationDimensions(input: {
  representationFamily: string;
  declarations: readonly RepresentationDeclarationV1[];
  producerRevision: string;
}): RepresentationDimensionAuditV1 {
  if (input.declarations.length === 0) throw new Error('representation declarations are required');
  const declarations = input.declarations.map((value) => RepresentationDeclarationV1Schema.parse(value));
  const observedDimensions = [...new Set(declarations.map((value) => value.dimension))].sort((a, b) => a - b);
  const canonicalClaims = declarations.filter((value) => value.canonicalClaim);
  const canonicalDimensions = [...new Set(canonicalClaims.map((value) => value.dimension))];
  const conflict = observedDimensions.length > 1 && (canonicalDimensions.length > 1 || canonicalClaims.length > 0);

  return RepresentationDimensionAuditV1Schema.parse({
    schema: 'atlas.representation-dimension-audit.v1',
    representationFamily: input.representationFamily,
    declarations,
    observedDimensions,
    canonicalClaimCount: canonicalClaims.length,
    conflict,
    status: conflict ? 'CONFLICT_REQUIRES_EXPLICIT_EXECUTION_IDENTITY' : 'CONSISTENT',
    reasonCodes: conflict
      ? ['MULTIPLE_DIMENSIONS_OBSERVED', 'CANONICAL_CLAIM_PRESENT', 'DO_NOT_RESOLVE_BY_GLOBAL_CONSTANT']
      : ['DECLARATIONS_DIMENSIONALLY_CONSISTENT'],
    producerRevision: input.producerRevision,
  });
}
