import { z } from 'zod';

export const PAGERANK_CONTRACT_VERSION =
  'atlas.pagerank-authority.v1' as const;

export const PAGERANK_BATCH_CONTRACT_VERSION =
  'atlas.pagerank-authority-batch.v1' as const;

export type PageRankImplementation =
  | 'nodejs-power-iteration'
  | 'networkx'
  | 'neo4j-gds'
  | 'cugraph';

export type PageRankNormalizationMethod = 'L1Norm';

export type PageRankAuthorityBand =
  | 'very-low'
  | 'low'
  | 'medium'
  | 'high'
  | 'very-high';

export const PageRankAlgorithmSchema = z
  .object({
    name: z.literal('pagerank'),
    implementation: z.literal('neo4j-gds'),
    dampingFactor: z.number().finite().min(0).lt(1),
    maxIterations: z.number().int().positive(),
    tolerance: z.number().finite().positive(),
    weighted: z.boolean(),
    relationshipWeightProperty: z.string().min(1).nullable().optional(),
  })
  .strict();

export const L1NormalizationSchema = z
  .object({
    method: z.literal('L1Norm'),
    appliedBy: z.enum([
      'neo4j-gds-pagerank-scaler',
      'atlas-postprocess',
    ]),
    expectedAbsoluteSum: z.literal(1),
    tolerance: z.number().finite().positive().max(0.01).default(1e-6),
  })
  .strict();

export const PageRankRunSchema = z
  .object({
    runId: z.string().min(1),
    didConverge: z.boolean(),
    ranIterations: z.number().int().positive(),
    nodeCount: z.number().int().positive(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const PageRankAuthorityRecordSchema = z
  .object({
    contractVersion: z.literal(PAGERANK_CONTRACT_VERSION),
    graphSnapshotId: z.string().min(1),
    nodeKey: z.string().min(1),
    packetKey: z.string().min(1).nullable().optional(),
    sourceRef: z.string().min(1).nullable().optional(),
    algorithm: PageRankAlgorithmSchema,
    normalization: L1NormalizationSchema,
    pagerankRaw: z.number().finite().nonnegative(),
    pagerankL1: z.number().finite().min(0).max(1),
    authorityPercentile: z.number().finite().min(0).max(1),
    authorityBand: z.enum([
      'very-low',
      'low',
      'medium',
      'high',
      'very-high',
    ]),
    run: PageRankRunSchema,
  })
  .strict();

export const PageRankAuthorityBatchSchema = z
  .object({
    contractVersion: z.literal(PAGERANK_BATCH_CONTRACT_VERSION),
    graphSnapshotId: z.string().min(1),
    runId: z.string().min(1),
    normalization: L1NormalizationSchema,
    records: z.array(PageRankAuthorityRecordSchema).min(1),
  })
  .strict()
  .superRefine((batch, ctx) => {
    const snapshotIds = new Set(
      batch.records.map((record) => record.graphSnapshotId),
    );
    if (
      snapshotIds.size !== 1 ||
      !snapshotIds.has(batch.graphSnapshotId)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['records'],
        message: 'Every record must use the batch graphSnapshotId',
      });
    }

    const runIds = new Set(
      batch.records.map((record) => record.run.runId),
    );
    if (runIds.size !== 1 || !runIds.has(batch.runId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['records'],
        message: 'Every record must use the batch runId',
      });
    }

    const nodeKeys = new Set<string>();
    for (const [index, record] of batch.records.entries()) {
      if (nodeKeys.has(record.nodeKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['records', index, 'nodeKey'],
          message: `Duplicate nodeKey: ${record.nodeKey}`,
        });
      }
      nodeKeys.add(record.nodeKey);
    }

    const l1Sum = batch.records.reduce(
      (sum, record) => sum + Math.abs(record.pagerankL1),
      0,
    );
    const delta = Math.abs(
      l1Sum - batch.normalization.expectedAbsoluteSum,
    );
    if (delta > batch.normalization.tolerance) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['records'],
        message:
          `L1-normalized scores sum to ${l1Sum}; expected 1 ± ${batch.normalization.tolerance}`,
      });
    }

    if (batch.records.some((record) => !record.run.didConverge)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['records'],
        message: 'PageRank run did not converge',
      });
    }
  });

export type PageRankAuthorityRecord =
  z.infer<typeof PageRankAuthorityRecordSchema>;

export type PageRankAuthorityBatch =
  z.infer<typeof PageRankAuthorityBatchSchema>;

export interface PageRankRunContract {
  contractVersion: typeof PAGERANK_CONTRACT_VERSION;
  graphSnapshotId: string;
  algorithm: {
    name: 'pagerank';
    implementation: 'neo4j-gds';
    dampingFactor: number;
    maxIterations: number;
    tolerance: number;
    weighted: boolean;
    relationshipWeightProperty: string | null;
  };
  normalization: {
    method: 'L1Norm';
    appliedBy: 'neo4j-gds-pagerank-scaler' | 'atlas-postprocess';
    expectedAbsoluteSum: 1;
    tolerance: number;
  };
  run: {
    runId: string;
    didConverge: boolean;
    ranIterations: number;
    nodeCount: number;
    createdAt: string;
  };
}

export function deriveAuthorityPercentiles(
  rows: Array<{
    nodeKey: string;
    pagerankL1: number;
  }>,
): Map<string, number> {
  const ordered = [...rows].sort(
    (a, b) => a.pagerankL1 - b.pagerankL1,
  );
  const denominator = Math.max(ordered.length - 1, 1);
  return new Map(
    ordered.map((row, index) => [row.nodeKey, index / denominator]),
  );
}

export function deriveAuthorityBand(
  percentile: number,
): PageRankAuthorityBand {
  if (percentile >= 0.99) return 'very-high';
  if (percentile >= 0.9) return 'high';
  if (percentile >= 0.5) return 'medium';
  if (percentile >= 0.1) return 'low';
  return 'very-low';
}

export function mergePageRankRows(
  rawRows: Array<{ nodeKey: string; pagerankRaw: number }>,
  normalizedRows: Array<{ nodeKey: string; pagerankL1: number }>,
): Array<{ nodeKey: string; pagerankRaw: number; pagerankL1: number }> {
  const normalizedByNode = new Map(
    normalizedRows.map((row) => [row.nodeKey, row.pagerankL1]),
  );

  return rawRows.map((raw) => {
    const pagerankL1 = normalizedByNode.get(raw.nodeKey);
    if (pagerankL1 === undefined) {
      throw new Error(`Missing L1 PageRank for ${raw.nodeKey}`);
    }
    return {
      nodeKey: raw.nodeKey,
      pagerankRaw: raw.pagerankRaw,
      pagerankL1,
    };
  });
}

export function buildPageRankAuthorityBatch(input: {
  graphSnapshotId: string;
  runId: string;
  createdAt: string;
  rawRows: Array<{ nodeKey: string; pagerankRaw: number }>;
  normalizedRows: Array<{ nodeKey: string; pagerankL1: number }>;
  didConverge: boolean;
  ranIterations: number;
  dampingFactor: number;
  maxIterations: number;
  tolerance: number;
  appliedBy?: 'neo4j-gds-pagerank-scaler' | 'atlas-postprocess';
}): PageRankAuthorityBatch {
  const merged = mergePageRankRows(input.rawRows, input.normalizedRows);
  const percentiles = deriveAuthorityPercentiles(merged);
  const appliedBy = input.appliedBy ?? 'neo4j-gds-pagerank-scaler';

  const records = merged.map((row) => {
    const percentile = percentiles.get(row.nodeKey);
    if (percentile === undefined) {
      throw new Error(`Missing percentile for ${row.nodeKey}`);
    }

    return {
      contractVersion: PAGERANK_CONTRACT_VERSION as const,
      graphSnapshotId: input.graphSnapshotId,
      nodeKey: row.nodeKey,
      algorithm: {
        name: 'pagerank' as const,
        implementation: 'neo4j-gds' as const,
        dampingFactor: input.dampingFactor,
        maxIterations: input.maxIterations,
        tolerance: input.tolerance,
        weighted: false,
        relationshipWeightProperty: null,
      },
      normalization: {
        method: 'L1Norm' as const,
        appliedBy,
        expectedAbsoluteSum: 1 as const,
        tolerance: 1e-6,
      },
      pagerankRaw: row.pagerankRaw,
      pagerankL1: row.pagerankL1,
      authorityPercentile: percentile,
      authorityBand: deriveAuthorityBand(percentile),
      run: {
        runId: input.runId,
        didConverge: input.didConverge,
        ranIterations: input.ranIterations,
        nodeCount: merged.length,
        createdAt: input.createdAt,
      },
    };
  });

  return PageRankAuthorityBatchSchema.parse({
    contractVersion: PAGERANK_BATCH_CONTRACT_VERSION,
    graphSnapshotId: input.graphSnapshotId,
    runId: input.runId,
    normalization: {
      method: 'L1Norm',
      appliedBy,
      expectedAbsoluteSum: 1,
      tolerance: 1e-6,
    },
    records,
  });
}

