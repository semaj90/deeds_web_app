import { z } from 'zod';

export const FEATURE_STATE_VALUES = [
  'EVIDENCE_NEEDED',
  'MISSING',
  'SPECIFIED',
  'IMPLEMENTING',
  'VERIFY',
  'VERIFIED',
] as const;

export const RELATIONSHIP_DEGREE_KIND_VALUES = ['unary', 'binary', 'ternary', 'nary'] as const;
export const EVIDENCE_POLARITY_VALUES = ['supports', 'refutes', 'neutral'] as const;

const canonicalIdSchema = z.string().min(1);
const revisionSchema = z.string().min(1);
const normalizedScoreSchema = z.number().finite().min(0).max(1);
const percentSchema = z.number().finite().min(0).max(100);
const entityTypeSchema = z.string().regex(/^[a-z][a-z0-9_.-]*$/);

export const featureStateValueSchema = z.enum(FEATURE_STATE_VALUES);
export const relationshipDegreeKindSchema = z.enum(RELATIONSHIP_DEGREE_KIND_VALUES);
export const evidencePolaritySchema = z.enum(EVIDENCE_POLARITY_VALUES);

export const featureCandidateSchema = z.object({
  schema: z.literal('atlas.feature-candidate.v1').default('atlas.feature-candidate.v1'),
  candidate_id: canonicalIdSchema,
  feature_key_hint: z.string().min(1),
  feature_label_hint: z.string().min(1),
  domain: z.string().min(1),
  source_kind: z.string().min(1),
  source_ref: z.string().min(1),
  source_revision: revisionSchema,
  producer_revision: revisionSchema,
  evidence_refs: z.array(canonicalIdSchema).default([]),
  confidence: normalizedScoreSchema,
  structured_payload: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const featureSchema = z.object({
  schema: z.literal('atlas.feature.v1').default('atlas.feature.v1'),
  feature_id: canonicalIdSchema,
  feature_key: z.string().min(1),
  feature_label: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
  domain: z.string().min(1),
  parent_feature_id: canonicalIdSchema.nullable().optional(),
  feature_revision: revisionSchema,
  status: z.enum(['active', 'deprecated', 'superseded']).default('active'),
  created_from_evidence: z.array(canonicalIdSchema).default([]),
  created_from_candidate_ids: z.array(canonicalIdSchema).default([]),
  producer_revision: revisionSchema,
}).strict();

export const relationshipParticipantSchema = z.object({
  role: z.string().min(1),
  entity_type: entityTypeSchema,
  entity_id: canonicalIdSchema,
  entity_revision: revisionSchema.nullable().optional(),
  source_ref: z.string().min(1).nullable().optional(),
}).strict();

export const relationshipCardinalityConstraintSchema = z.object({
  role: z.string().min(1),
  min: z.number().int().nonnegative(),
  max: z.union([z.number().int().positive(), z.literal('many')]),
}).strict().superRefine((value, ctx) => {
  if (typeof value.max === 'number' && value.min > value.max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'cardinality min cannot exceed max',
      path: ['min'],
    });
  }
});

const featureRelationshipBaseSchema = z.object({
  schema: z.literal('atlas.feature-relationship.v1').default('atlas.feature-relationship.v1'),
  relationship_id: canonicalIdSchema,
  relationship_type: z.string().min(1),
  participants: z.array(relationshipParticipantSchema).min(1),
  cardinality: z.array(relationshipCardinalityConstraintSchema).default([]),
  source_ref: z.string().min(1),
  source_revision: revisionSchema,
  relationship_revision: revisionSchema,
  producer_revision: revisionSchema,
  evidence_refs: z.array(canonicalIdSchema).default([]),
  confidence: normalizedScoreSchema.default(1),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const featureRelationshipSchema = featureRelationshipBaseSchema.extend({
  participant_count: z.number().int().positive(),
  relationship_degree: z.number().int().positive(),
  relationship_degree_kind: relationshipDegreeKindSchema,
}).strict().superRefine((value, ctx) => {
  const participantCount = value.participants.length;
  const relationshipDegree = deriveRelationshipDegree(value.participants);
  const degreeKind = classifyRelationshipDegree(relationshipDegree);

  if (value.participant_count !== participantCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `participant_count must equal participants.length (${participantCount})`,
      path: ['participant_count'],
    });
  }

  if (value.relationship_degree !== relationshipDegree) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `relationship_degree must equal the number of distinct participating entity types (${relationshipDegree})`,
      path: ['relationship_degree'],
    });
  }

  if (value.relationship_degree_kind !== degreeKind) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `relationship_degree_kind must be ${degreeKind}`,
      path: ['relationship_degree_kind'],
    });
  }

  const roles = new Set(value.participants.map((participant) => participant.role));
  const seenCardinalityRoles = new Set<string>();
  for (const constraint of value.cardinality) {
    if (!roles.has(constraint.role)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `cardinality role ${constraint.role} is not a relationship participant`,
        path: ['cardinality'],
      });
    }
    if (seenCardinalityRoles.has(constraint.role)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `cardinality role ${constraint.role} is duplicated`,
        path: ['cardinality'],
      });
    }
    seenCardinalityRoles.add(constraint.role);
  }
});

export const featureEvidenceSchema = z.object({
  schema: z.literal('atlas.feature-evidence.v1').default('atlas.feature-evidence.v1'),
  evidence_id: canonicalIdSchema,
  feature_id: canonicalIdSchema,
  evidence_kind: z.string().min(1),
  relation_type: z.string().min(1),
  polarity: evidencePolaritySchema.default('supports'),
  source_ref: z.string().min(1),
  source_revision: revisionSchema,
  evidence_revision: revisionSchema,
  producer_revision: revisionSchema,
  confidence: normalizedScoreSchema,
  relationship_id: canonicalIdSchema.nullable().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const featureStateSchema = z.object({
  schema: z.literal('atlas.feature-state.v1').default('atlas.feature-state.v1'),
  feature_id: canonicalIdSchema,
  feature_revision: revisionSchema,
  evidence_snapshot_revision: revisionSchema,
  state_revision: revisionSchema,
  state: featureStateValueSchema,
  completion: percentSchema,
  confidence: percentSchema,
  priority: percentSchema,
  blockers: z.array(z.string().min(1)).default([]),
  recommendations: z.array(z.string().min(1)).default([]),
  satisfied_evidence: z.array(canonicalIdSchema).default([]),
  blocking_evidence: z.array(canonicalIdSchema).default([]),
  priority_signals: z.record(z.string(), z.number().finite()).default({}),
  producer_revision: revisionSchema,
  evaluated_at: z.string().datetime(),
}).strict();

export const featureStateReceiptSchema = z.object({
  schema: z.literal('atlas.feature-state-receipt.v1').default('atlas.feature-state-receipt.v1'),
  receipt_id: canonicalIdSchema,
  feature_id: canonicalIdSchema,
  feature_revision: revisionSchema,
  evidence_snapshot_revision: revisionSchema,
  state_revision: revisionSchema,
  input_evidence_hash: z.string().min(1),
  evaluator_revision: revisionSchema,
  state: featureStateSchema,
  emitted_at: z.string().datetime(),
}).strict();

export type FeatureCandidateV1 = z.infer<typeof featureCandidateSchema>;
export type FeatureV1 = z.infer<typeof featureSchema>;
export type RelationshipParticipantV1 = z.infer<typeof relationshipParticipantSchema>;
export type RelationshipCardinalityConstraintV1 = z.infer<typeof relationshipCardinalityConstraintSchema>;
export type FeatureRelationshipV1 = z.infer<typeof featureRelationshipSchema>;
export type FeatureRelationshipBuildInput = z.input<typeof featureRelationshipBaseSchema>;
export type FeatureEvidenceV1 = z.infer<typeof featureEvidenceSchema>;
export type FeatureStateV1 = z.infer<typeof featureStateSchema>;
export type FeatureStateReceiptV1 = z.infer<typeof featureStateReceiptSchema>;
export type RelationshipDegreeKind = z.infer<typeof relationshipDegreeKindSchema>;

/**
 * ER/DBMS relationship degree: number of distinct participating entity types.
 * This is deliberately different from participant count and graph-node degree.
 */
export function deriveRelationshipDegree(
  participants: readonly RelationshipParticipantV1[],
): number {
  return new Set(participants.map((participant) => participant.entity_type)).size;
}

export function classifyRelationshipDegree(degree: number): RelationshipDegreeKind {
  if (!Number.isInteger(degree) || degree < 1) {
    throw new RangeError('relationship degree must be a positive integer');
  }
  if (degree === 1) return 'unary';
  if (degree === 2) return 'binary';
  if (degree === 3) return 'ternary';
  return 'nary';
}

export function buildFeatureRelationship(input: FeatureRelationshipBuildInput): FeatureRelationshipV1 {
  const base = featureRelationshipBaseSchema.parse(input);
  const relationshipDegree = deriveRelationshipDegree(base.participants);
  return featureRelationshipSchema.parse({
    ...base,
    participant_count: base.participants.length,
    relationship_degree: relationshipDegree,
    relationship_degree_kind: classifyRelationshipDegree(relationshipDegree),
  });
}

export function describeFeatureIntelligenceContract(): string {
  return [
    'Feature identity is canonical and independent of graph/vector/tree projections.',
    'Relationship degree is the number of distinct participating entity types.',
    'Participant count is the number of roles/entities in the concrete fact.',
    'Cardinality constraints are stored separately from relationship degree.',
    'Graph degree and PageRank are derived topology metrics, never relationship arity or completion proof.',
  ].join(' ');
}
