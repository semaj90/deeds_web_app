import { z } from 'zod';

export const VectorLaneStatusSchema = z.enum([
  'canonical',
  'native',
  'derived',
  'accelerator',
  'legacy',
  'experimental',
  'retired'
]);

export const VectorLaneRoleSchema = z.enum([
  'retrieval',
  'fixer-memory',
  'reranking',
  'topology',
  'clustering',
  'som-training',
  'centroid-routing',
  'archive'
]);

export const VectorDimensionSchema = z.union([
  z.literal(64),
  z.literal(128),
  z.literal(384),
  z.literal(768)
]);

export const VectorLaneSchema = z
  .object({
    laneId: z.string().min(1),
    status: VectorLaneStatusSchema,
    role: VectorLaneRoleSchema,

    modelId: z.string().min(1),
    modelRevision: z.string().min(1),

    sourceDimensions: VectorDimensionSchema,
    outputDimensions: VectorDimensionSchema,

    projection: z.enum([
      'none',
      'direct-slice',
      'mrl',
      'autoencoder',
      'graph-projection'
    ]),

    normalization: z.enum([
      'none',
      'l2'
    ]),

    dtype: z.enum([
      'float32',
      'float16',
      'int8',
      'int4',
      'binary'
    ]),

    distance: z.enum([
      'cosine',
      'dot',
      'euclidean'
    ]),

    purpose: z.string().min(1),

    collection: z.string().min(1).nullable().optional(),
    artifactUri: z.string().min(1).nullable().optional(),

    quantization: z
      .object({
        method: z.enum([
          'scalar-int8',
          'scalar-int4',
          'binary',
          'product',
          'turboquant'
        ]),
        rescoring: z.boolean()
      })
      .strict()
      .nullable()
      .optional()
  })
  .strict()
  .superRefine((lane, ctx) => {
    if (
      lane.projection === 'none' &&
      lane.sourceDimensions !== lane.outputDimensions
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outputDimensions'],
        message:
          'A lane without projection must preserve dimensions'
      });
    }

    if (
      lane.projection === 'autoencoder' &&
      lane.outputDimensions >= lane.sourceDimensions
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outputDimensions'],
        message:
          'Autoencoder routing lane must reduce dimensions'
      });
    }

    if (
      lane.status === 'canonical' &&
      lane.role !== 'retrieval'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['role'],
        message:
          'Only the retrieval lane may be canonical'
      });
    }

    if (
      lane.distance === 'cosine' &&
      lane.normalization !== 'l2'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['normalization'],
        message:
          'Atlas cosine lanes must explicitly use L2 normalization'
      });
    }
  });

export type VectorLane = z.infer<typeof VectorLaneSchema>;

export const VectorLaneRegistrySchema = z
  .object({
    contractVersion: z.literal(
      'atlas.vector-lane-registry.v1'
    ),

    activeCanonicalLane: z.string().min(1),

    lanes: z
      .array(VectorLaneSchema)
      .min(1)
  })
  .strict()
  .superRefine((registry, ctx) => {
    const laneIds = new Set<string>();

    for (const [index, lane] of registry.lanes.entries()) {
      if (laneIds.has(lane.laneId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lanes', index, 'laneId'],
          message: `Duplicate lane ID: ${lane.laneId}`
        });
      }

      laneIds.add(lane.laneId);
    }

    const canonical = registry.lanes.filter(
      (lane) => lane.status === 'canonical'
    );

    if (canonical.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lanes'],
        message:
          'Exactly one canonical vector lane is required'
      });
    }

    if (
      canonical[0] &&
      canonical[0].laneId !==
        registry.activeCanonicalLane
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['activeCanonicalLane'],
        message:
          'activeCanonicalLane must reference the canonical lane'
      });
    }
  });

export type VectorLaneRegistry = z.infer<typeof VectorLaneRegistrySchema>;
