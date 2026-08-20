import { z } from 'zod';

const canonicalIdSchema = z.string().min(1);
const revisionSchema = z.string().min(1);
const normalizedScoreSchema = z.number().finite().min(0).max(1);

export const featureMatrixRowSchema = z.object({
  schema: z.literal('atlas.feature-matrix-row.v1').default('atlas.feature-matrix-row.v1'),
  feature_ordinal: z.number().int().nonnegative(),
  feature_id: canonicalIdSchema,
  feature_revision: revisionSchema,
  snapshot_revision: revisionSchema,
  semantic_768_ref: z.string().min(1).nullable().optional(),
  lexical_count: z.number().int().nonnegative().default(0),
  ast_symbol_count: z.number().int().nonnegative().default(0),
  route_count: z.number().int().nonnegative().default(0),
  requirement_coverage: normalizedScoreSchema.default(0),
  schema_coverage: normalizedScoreSchema.default(0),
  test_coverage: normalizedScoreSchema.default(0),
  runtime_coverage: normalizedScoreSchema.default(0),
  graph_degree: z.number().finite().nonnegative().default(0),
  in_degree: z.number().finite().nonnegative().default(0),
  out_degree: z.number().finite().nonnegative().default(0),
  fanout: z.number().finite().nonnegative().default(0),
  pagerank: z.number().finite().nonnegative().default(0),
  ppr: z.number().finite().nonnegative().default(0),
  completion: z.number().finite().min(0).max(100).default(0),
  confidence: z.number().finite().min(0).max(100).default(0),
  uncertainty: normalizedScoreSchema.default(1),
  staleness: normalizedScoreSchema.default(0),
  domain_bits: z.array(z.number().int().nonnegative()).default([]),
  evidence_bits: z.array(z.number().int().nonnegative()).default([]),
  relationship_bits: z.array(z.number().int().nonnegative()).default([]),
  derived_signals: z.object({
    turbovec: normalizedScoreSchema.optional(),
    low_rank: normalizedScoreSchema.optional(),
    svd_component_norm: z.number().finite().nonnegative().optional(),
    kmeans_distance: z.number().finite().nonnegative().optional(),
    som_distance: z.number().finite().nonnegative().optional(),
    manifold_score: normalizedScoreSchema.optional(),
    xgboost_score: normalizedScoreSchema.optional(),
    crossencoder_score: normalizedScoreSchema.optional(),
  }).default({}),
}).strict();

export const multiViewVectorRefSchema = z.object({
  view: z.enum(['semantic', 'structural', 'requirement', 'runtime', 'relationship', 'token']),
  vector_ref: z.string().min(1),
  dimensions: z.number().int().positive(),
  model_revision: revisionSchema,
  projection_revision: revisionSchema,
  checksum: z.string().min(1),
}).strict();

export const multiViewFeatureProjectionSchema = z.object({
  schema: z.literal('atlas.multi-view-feature-projection.v1').default('atlas.multi-view-feature-projection.v1'),
  feature_id: canonicalIdSchema,
  feature_revision: revisionSchema,
  views: z.array(multiViewVectorRefSchema).min(1),
  fixed_dimensional_encoding_ref: z.string().min(1).nullable().optional(),
  fixed_dimensional_encoding_revision: revisionSchema.nullable().optional(),
  exact_multi_view_rerank_required: z.boolean().default(true),
}).strict();

export const lowRankAssociationCandidateSchema = z.object({
  schema: z.literal('atlas.low-rank-association-candidate.v1').default('atlas.low-rank-association-candidate.v1'),
  candidate_id: canonicalIdSchema,
  source_feature_id: canonicalIdSchema,
  target_canonical_id: canonicalIdSchema,
  target_entity_type: z.string().min(1),
  method: z.enum(['svd', 'leverage_sampling', 'randomized_low_rank', 'other']),
  score: normalizedScoreSchema,
  matrix_snapshot_revision: revisionSchema,
  evidence_refs: z.array(canonicalIdSchema).default([]),
  evidence_inspection_required: z.literal(true).default(true),
  canonical_relationship_created: z.literal(false).default(false),
}).strict();

export const manifold4CoordinateSchema = z.object({
  schema: z.literal('atlas.manifold4-coordinate.v1').default('atlas.manifold4-coordinate.v1'),
  canonical_id: canonicalIdSchema,
  snapshot_revision: revisionSchema,
  som_x: z.number().finite(),
  som_y: z.number().finite(),
  semantic_z: z.number().finite(),
  activity_w: z.number().finite(),
  derivation: z.string().min(1),
}).strict();

export const unitQuaternionSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]).superRefine((value, ctx) => {
  const norm = Math.hypot(...value);
  if (Math.abs(norm - 1) > 1e-6) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'quaternion must be unit length' });
  }
});

/**
 * General orientation-preserving 4-D rotations may be represented by a pair
 * of unit quaternions. This contract is derived routing/visualization state;
 * it cannot alter canonical identity, relationships, evidence, or completion.
 */
export const manifold4RotationSchema = z.object({
  schema: z.literal('atlas.manifold4-rotation.v1').default('atlas.manifold4-rotation.v1'),
  rotation_id: canonicalIdSchema,
  source_snapshot_revision: revisionSchema,
  left_quaternion: unitQuaternionSchema,
  right_quaternion: unitQuaternionSchema,
  purpose: z.enum(['routing', 'visualization', 'analysis']),
  canonical_authority: z.literal(false).default(false),
}).strict();

export type FeatureMatrixRowV1 = z.infer<typeof featureMatrixRowSchema>;
export type MultiViewFeatureProjectionV1 = z.infer<typeof multiViewFeatureProjectionSchema>;
export type LowRankAssociationCandidateV1 = z.infer<typeof lowRankAssociationCandidateSchema>;
export type Manifold4CoordinateV1 = z.infer<typeof manifold4CoordinateSchema>;
export type Manifold4RotationV1 = z.infer<typeof manifold4RotationSchema>;
export type QuaternionTuple = z.infer<typeof unitQuaternionSchema>;

function qMultiply(a: QuaternionTuple, b: QuaternionTuple): QuaternionTuple {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

function qConjugate(q: QuaternionTuple): QuaternionTuple {
  return [q[0], -q[1], -q[2], -q[3]];
}

/** Apply the SO(4) transform x -> q_left * x * conjugate(q_right). */
export function rotateManifold4(
  point: Manifold4CoordinateV1,
  rotation: Manifold4RotationV1,
): Manifold4CoordinateV1 {
  const parsedPoint = manifold4CoordinateSchema.parse(point);
  const parsedRotation = manifold4RotationSchema.parse(rotation);
  const x: QuaternionTuple = [
    parsedPoint.activity_w,
    parsedPoint.som_x,
    parsedPoint.som_y,
    parsedPoint.semantic_z,
  ];
  const rotated = qMultiply(
    qMultiply(parsedRotation.left_quaternion, x),
    qConjugate(parsedRotation.right_quaternion),
  );
  return manifold4CoordinateSchema.parse({
    ...parsedPoint,
    activity_w: rotated[0],
    som_x: rotated[1],
    som_y: rotated[2],
    semantic_z: rotated[3],
    derivation: `${parsedPoint.derivation}|so4:${parsedRotation.rotation_id}`,
  });
}

export function describeFeatureMatrixContract(): string {
  return [
    'The feature matrix is a revisioned derived projection keyed by canonical feature identity.',
    'PageRank, PPR, TurboVec, SVD/low-rank associations, clustering, SOM/manifold coordinates and learned rankers are signals, not truth.',
    'Multi-view vectors remain separate so fixed-dimensional encodings can nominate candidates before exact multi-view reranking.',
    'Low-rank associations always require evidence inspection before relationship promotion.',
    'SO(4) rotations are routing/visualization transforms only and cannot mutate canonical semantics.',
  ].join(' ');
}
