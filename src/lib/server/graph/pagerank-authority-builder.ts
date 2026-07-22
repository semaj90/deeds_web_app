import {
  PageRankAuthorityBatch,
  PageRankAuthorityBatchSchema,
  AuthorityBandSchema,
  L1NormalizationSchema
} from './pagerank-authority-contract.js';

interface RawPageRankRow {
  nodeKey: string;
  pagerankRaw: number;
}

interface NormalizedPageRankRow {
  nodeKey: string;
  pagerankL1: number;
}

export function mergePageRankRows(
  rawRows: RawPageRankRow[],
  normalizedRows: NormalizedPageRankRow[]
): Array<{
  nodeKey: string;
  pagerankRaw: number;
  pagerankL1: number;
}> {
  const normalizedByNode = new Map(
    normalizedRows.map((row) => [
      row.nodeKey,
      row.pagerankL1
    ])
  );

  return rawRows.map((raw) => {
    const pagerankL1 =
      normalizedByNode.get(raw.nodeKey);

    if (pagerankL1 === undefined) {
      throw new Error(
        `Missing L1 PageRank for ${raw.nodeKey}`
      );
    }

    return {
      nodeKey: raw.nodeKey,
      pagerankRaw: raw.pagerankRaw,
      pagerankL1
    };
  });
}

export function calculatePercentiles(
  rows: Array<{
    nodeKey: string;
    pagerankL1: number;
  }>
): Map<string, number> {
  const ordered = [...rows].sort(
    (a, b) =>
      a.pagerankL1 - b.pagerankL1
  );

  const denominator = Math.max(
    ordered.length - 1,
    1
  );
  return new Map(
    ordered.map((row, index) => [
      row.nodeKey,
      index / denominator
    ])
  );
}

export function authorityBand(
  percentile: number
): 'very-low' | 'low' | 'medium' | 'high' | 'very-high' {
  if (percentile >= 0.99) return 'very-high';
  if (percentile >= 0.90) return 'high';
  if (percentile >= 0.50) return 'medium';
  if (percentile >= 0.10) return 'low';
  return 'very-low';
}

export interface BuildPageRankAuthorityBatchInput {
  graphSnapshotId: string;
  runId: string;
  createdAt: string;
  rawRows: RawPageRankRow[];
  normalizedRows: NormalizedPageRankRow[];
  didConverge: boolean;
  ranIterations: number;

  dampingFactor: number;
  maxIterations: number;
  tolerance: number;
}

export function buildPageRankAuthorityBatch(
  input: BuildPageRankAuthorityBatchInput
): PageRankAuthorityBatch {
  const merged = mergePageRankRows(
    input.rawRows,
    input.normalizedRows
  );
  const percentiles = calculatePercentiles(
    merged
  );
  const records = merged.map((row) => {
    const percentile =
      percentiles.get(row.nodeKey);
    if (percentile === undefined) {
      throw new Error(
        `Missing percentile for ${row.nodeKey}`
      );
    }
    return {
      contractVersion:
        'atlas.pagerank-authority.v1' as const,
      graphSnapshotId:
        input.graphSnapshotId,
      nodeKey: row.nodeKey,
      packetKey: null,
      sourceRef: null,
      algorithm: {
        name: 'pagerank' as const,
        implementation: 'neo4j-gds' as const,
        dampingFactor:
          input.dampingFactor,
        maxIterations:
          input.maxIterations,
        tolerance:
          input.tolerance,
        weighted: false,
        relationshipWeightProperty: null
      },
      normalization: {
        method: 'L1Norm' as const,
        appliedBy:
          'neo4j-gds-pagerank-scaler' as const,
        expectedAbsoluteSum: 1 as const,
        tolerance: 1e-6
      },

      pagerankRaw:
        row.pagerankRaw,

      pagerankL1:
        row.pagerankL1,
      authorityPercentile:
        percentile,
      authorityBand:
        authorityBand(percentile),
      run: {
        runId: input.runId,
        didConverge:
          input.didConverge,
        ranIterations:
          input.ranIterations,
        nodeCount:
          merged.length,
        createdAt:
          input.createdAt
      }
    };
  });
  return PageRankAuthorityBatchSchema.parse({
    contractVersion:
      'atlas.pagerank-authority-batch.v1',
    graphSnapshotId:
      input.graphSnapshotId,
    runId:
      input.runId,
    normalization: {
      method: 'L1Norm',
      appliedBy:
        'neo4j-gds-pagerank-scaler',
      expectedAbsoluteSum: 1,
      tolerance: 1e-6
    },

    records
  });
}
