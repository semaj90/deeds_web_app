import { z } from 'zod';

const NonEmptyStringArraySchema = z.array(z.string().min(1)).max(64);

export const OkfDomainSubjectKindSchema = z.enum([
  'document',
  'file',
  'feature',
  'symbol',
  'task',
]);

export const OkfEvidenceLifecycleSchema = z.enum([
  'OBSERVED',
  'DERIVED',
  'SUPERSEDED',
]);

/**
 * Domain labels are navigation evidence. They never become Atlas identity.
 */
export const DomainClassificationV1Schema = z.object({
  schemaVersion: z.literal('atlas.okf.domain-classification.v1'),
  classificationId: z.string().min(1),
  subjectRef: z.string().min(1),
  subjectKind: OkfDomainSubjectKindSchema,
  domainId: z.string().min(1),
  taxonomyRevision: z.string().min(1),
  confidence: z.number().finite().min(0).max(1),
  evidenceRefs: NonEmptyStringArraySchema,
  sourceRevision: z.string().min(1),
  producerId: z.string().min(1),
  producerRevision: z.string().min(1),
  lifecycle: OkfEvidenceLifecycleSchema,
}).strict();

export type DomainClassificationV1 = z.infer<typeof DomainClassificationV1Schema>;

export const OkfFeatureValueV1Schema = z.object({
  featureId: z.string().min(1),
  featureRevision: z.string().min(1),
  subjectRef: z.string().min(1),
  ontologyRefs: NonEmptyStringArraySchema,
  value: z.number().finite(),
  coverage: z.number().finite().min(0).max(1),
  provenanceRefs: NonEmptyStringArraySchema,
}).strict();

export const OkfFeatureFamilySchema = z.enum([
  'semantic',
  'structural',
  'domain',
  'operational',
]);

/**
 * Derived planning envelope only. The existing FeatureMatrix5 and
 * FeatureMatrixRowV1 remain the production feature owners.
 */
export const OkfFeatureMatrix4x6V1Schema = z.object({
  schemaVersion: z.literal('atlas.okf.feature-matrix-4x6.v1'),
  matrixId: z.string().min(1),
  subjectRef: z.string().min(1),
  workspaceRevision: z.string().min(1),
  representationRevision: z.string().min(1),
  families: z.array(z.object({
    family: OkfFeatureFamilySchema,
    values: z.array(OkfFeatureValueV1Schema).length(6),
  }).strict()).length(4),
  lifecycle: OkfEvidenceLifecycleSchema,
}).strict().superRefine((matrix, ctx) => {
  const families = matrix.families.map((entry) => entry.family);
  if (new Set(families).size !== 4) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['families'],
      message: '4x6 matrix must contain four distinct feature families',
    });
  }

  for (const [familyIndex, family] of matrix.families.entries()) {
    for (const [valueIndex, value] of family.values.entries()) {
      if (value.subjectRef !== matrix.subjectRef) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['families', familyIndex, 'values', valueIndex, 'subjectRef'],
          message: 'feature value subjectRef must match matrix subjectRef',
        });
      }
    }
  }
});

export type OkfFeatureMatrix4x6V1 = z.infer<typeof OkfFeatureMatrix4x6V1Schema>;

export const OkfRecommendationStatusSchema = z.enum([
  'RECOMMENDED',
  'APPROVED',
  'IN_PROGRESS',
  'VALIDATING',
  'PROVEN',
  'REJECTED',
]);

export const OkfRecommendationV1Schema = z.object({
  schemaVersion: z.literal('atlas.okf.recommendation.v1'),
  recommendationId: z.string().min(1),
  category: z.string().min(1),
  severity: z.enum(['BLOCKER', 'HIGH', 'MEDIUM', 'LOW']),
  subjectRefs: NonEmptyStringArraySchema,
  evidenceRefs: NonEmptyStringArraySchema,
  graphifyReceiptRefs: z.array(z.string().min(1)).max(32).default([]),
  featureRowRefs: z.array(z.string().min(1)).max(32).default([]),
  acceptanceGates: NonEmptyStringArraySchema,
  prohibitedMutations: z.array(z.string().min(1)).max(32).default([]),
  status: OkfRecommendationStatusSchema,
  sourceRevision: z.string().min(1),
  producerId: z.string().min(1),
  producerRevision: z.string().min(1),
}).strict();

export type OkfRecommendationV1 = z.infer<typeof OkfRecommendationV1Schema>;
