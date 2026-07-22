/**
 * PageRank Authority Computation Types
 *
 * Separates raw PageRank scores from derived authority metrics.
 * All values versioned by computation run for audit trail.
 */

export type AuthorityBand = 'none' | 'low' | 'medium' | 'high' | 'critical';

export type GraphAlgorithmStatus =
  | 'started'
  | 'computed'
  | 'validated'
  | 'materialized'
  | 'failed'
  | 'rejected';

export interface DerivedAuthorityScore {
  packetKey: string;
  rawPageRank: number;
  percentile: number;
  authorityScore: number;
  authorityBand: AuthorityBand;
  runId: string;
  contractVersion: string;
  graphSnapshotHash: string;
}

export interface PageRankEvaluation {
  status: 'pass' | 'fail';
  convergenceIteration: number;
  maxIterationDelta: number;
  rawScoreSumInvariant: number;
  nonFiniteCount: number;
  negativeCount: number;
  messages: string[];
}

export interface GraphAlgorithmRun {
  runId: string;
  algorithm: 'pagerank';
  implementation: string;
  contractVersion: string;
  graphSnapshotId: string;
  graphSnapshotHash: string;
  nodeCount: number;
  edgeCount: number;
  parameters: {
    damping: number;
    tolerance: number;
    maxIterations: number;
  };
  relationshipPolicy: {
    directions: string[];
    weights: Record<string, number>;
  };
  converged: boolean;
  actualIterations: number;
  evaluation: PageRankEvaluation;
  status: GraphAlgorithmStatus;
  startedAt: Date;
  completedAt: Date | null;
}

export interface PageRankParityResult {
  maximumAbsoluteError: number;
  meanAbsoluteError: number;
  spearmanCorrelation: number;
  topKOverlap: number;
  passed: boolean;
  details: {
    nodeCount: number;
    allNodesWithinTolerance: boolean;
    failedNodes: Array<{ node: string; expectedScore: number; actualScore: number }>;
  };
}
