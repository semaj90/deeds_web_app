import { z } from 'zod';

export const RelatedFileRelationKindV1Schema = z.enum([
  'IMPORT_RELATED',
  'CALL_RELATED',
  'TEST_RELATED',
  'CHANGE_RELATED',
  'FEATURE_RELATED',
  'DOMAIN_RELATED',
  'PROCESS_RELATED',
  'SEMANTIC_NEIGHBOR',
]);
export type RelatedFileRelationKindV1 = z.infer<typeof RelatedFileRelationKindV1Schema>;

export const RelatedFileRelationV1Schema = z.object({
  schema: z.literal('atlas.related-file-relation.v1'),
  relationId: z.string().min(1),
  fromCanonicalId: z.string().min(1),
  toCanonicalId: z.string().min(1),
  relation: RelatedFileRelationKindV1Schema,
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  confidence: z.number().finite().min(0).max(1),
  evidenceRefs: z.array(z.string().min(1)).min(1).max(128),
  producerId: z.string().min(1),
  producerRevision: z.string().min(1),
  derivedSimilarity: z.boolean(),
  canonicalFact: z.boolean(),
  canonicalWrites: z.literal(false),
}).strict().superRefine((value, ctx) => {
  if (value.relation === 'SEMANTIC_NEIGHBOR' && (!value.derivedSimilarity || value.canonicalFact)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['canonicalFact'], message: 'semantic neighbors must remain derived similarities' });
  }
  if (value.relation !== 'SEMANTIC_NEIGHBOR' && value.derivedSimilarity && value.canonicalFact) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['derivedSimilarity'], message: 'canonical relations cannot also be derived similarities' });
  }
});
export type RelatedFileRelationV1 = z.infer<typeof RelatedFileRelationV1Schema>;
