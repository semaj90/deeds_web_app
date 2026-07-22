import { z } from 'zod';

const finiteNonNegative = z
  .number()
  .finite()
  .nonnegative();

export const PageRankAlgorithmSchema = z
  .object({
    name: z.literal('pagerank'),
    implementation: z.literal('neo4j-gds'),

    dampingFactor: z
      .number()
      .finite()
      .min(0)
      .lt(1),

    maxIterations: z
      .number()
      .int()
      .positive(),

    tolerance: z
      .number()
      .finite()
      .positive(),

    weighted: z.boolean(),

    relationshipWeightProperty: z
      .string()
      .min(1)
      .nullable()
      .optional()
  })
  .strict();

export const L1NormalizationSchema = z
  .object({
    method: z.literal('L1Norm'),

    appliedBy: z.enum([
      'neo4j-gds-pagerank-scaler',
      'atlas-postprocess'
    ]),

    expectedAbsoluteSum: z.literal(1),

    tolerance: z
      .number()
      .finite()
      .positive()
      .max(0.01)
      .default(1e-6)
  })
  .strict();

export const AuthorityBandSchema = z.enum([
  'very-low',
  'low',
  'medium',
  'high',
  'very-high'
]);

export const PageRankRunSchema = z
  .object({
    runId: z.string().min(1),

    didConverge: z.boolean(),

    ranIterations: z
      .number()
      .int()
      .positive(),

    nodeCount: z
      .number()
      .int()
      .positive(),

    createdAt: z
      .string()
      .datetime()
  })
  .strict();

export const PageRankAuthorityRecordSchema = z
  .object({
    contractVersion: z.literal(
      'atlas.pagerank-authority.v1'
    ),

    graphSnapshotId: z.string().min(1),
    nodeKey: z.string().min(1),

    packetKey: z.string().min(1).nullable().optional(),
    sourceRef: z.string().min(1).nullable().optional(),

    algorithm: PageRankAlgorithmSchema,
    normalization: L1NormalizationSchema,

    pagerankRaw: finiteNonNegative,

    pagerankL1: z
      .number()
      .finite()
      .min(0)
      .max(1),

    authorityPercentile: z
      .number()
      .finite()
      .min(0)
      .max(1),

    authorityBand: AuthorityBandSchema,

    run: PageRankRunSchema
  })
  .strict();

export type PageRankAuthorityRecord =
  z.infer<typeof PageRankAuthorityRecordSchema>;

export const PageRankAuthorityBatchSchema = z
  .object({
    contractVersion: z.literal(
      'atlas.pagerank-authority-batch.v1'
    ),

    graphSnapshotId: z.string().min(1),
    runId: z.string().min(1),

    normalization: L1NormalizationSchema,

    records: z
      .array(PageRankAuthorityRecordSchema)
      .min(1)
  })
  .strict()
  .superRefine((batch, ctx) => {
    const snapshotIds = new Set(
      batch.records.map(
        (record) => record.graphSnapshotId
      )
    );

    if (
      snapshotIds.size !== 1 ||
      !snapshotIds.has(batch.graphSnapshotId)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['records'],
        message:
          'Every record must use the batch graphSnapshotId'
      });
    }

    const runIds = new Set(
      batch.records.map(
        (record) => record.run.runId
      )
    );

    if (
      runIds.size !== 1 ||
      !runIds.has(batch.runId)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['records'],
        message:
          'Every record must use the batch runId'
      });
    }

    const nodeKeys = new Set<string>();

    for (
      const [index, record]
      of batch.records.entries()
    ) {
      if (nodeKeys.has(record.nodeKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['records', index, 'nodeKey'],
          message:
            `Duplicate nodeKey: ${record.nodeKey}`
        });
      }

      nodeKeys.add(record.nodeKey);
    }

    const l1Sum = batch.records.reduce(
      (sum, record) =>
        sum + Math.abs(record.pagerankL1),
      0
    );

    const difference = Math.abs(
      l1Sum -
        batch.normalization.expectedAbsoluteSum
    );

    if (
      difference >
      batch.normalization.tolerance
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['records'],
        message:
          `L1-normalized scores sum to ${l1Sum}; ` +
          `expected 1 ± ${batch.normalization.tolerance}`
      });
    }

    if (
      batch.records.some(
        (record) => !record.run.didConverge
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['records'],
        message:
          'PageRank run did not converge'
      });
    }
  });

export type PageRankAuthorityBatch =
  z.infer<typeof PageRankAuthorityBatchSchema>;

export const QdrantAuthorityPayloadSchema = z
  .object({
    graph_snapshot_id: z.string().min(1),

    pagerank_raw: finiteNonNegative,

    pagerank_l1: z
      .number()
      .finite()
      .min(0)
      .max(1),
    authority_percentile: z
      .number()
      .finite()
      .min(0)
      .max(1),

    authority_band:
      AuthorityBandSchema,

    authority_contract:
      z.literal(
        'atlas.pagerank-authority.v1'
      ),

    authority_normalization:
      z.literal('L1Norm')
  })
  .strict();

export type QdrantAuthorityPayload =
  z.infer<typeof QdrantAuthorityPayloadSchema>;

export const PageRankValidationReportSchema = z
  .object({
    contractVersion: z.literal(
      'atlas.pagerank-validation-report.v1'
    ),
    graphSnapshotId: z.string().min(1),
    runId: z.string().min(1),
    algorithm: z.literal('pagerank'),
    scaler: z.literal('L1Norm'),
    didConverge: z.boolean(),
    ranIterations: z.number().int().positive(),
    nodeCount: z.number().int().positive(),
    rawFiniteCoverage: z.number().min(0).max(1),
    normalizedFiniteCoverage: z.number().min(0).max(1),
    observedL1Sum: z.number().finite().nonnegative(),
    expectedL1Sum: z.literal(1),
    tolerance: z.number().finite().positive().max(0.01),
    nodeParity: z.number().min(0).max(1),
    duplicateNodeCount: z.number().int().nonnegative(),
    status: z.enum(['pass', 'fail'])
  })
  .strict();

export type PageRankValidationReport =
  z.infer<typeof PageRankValidationReportSchema>;
