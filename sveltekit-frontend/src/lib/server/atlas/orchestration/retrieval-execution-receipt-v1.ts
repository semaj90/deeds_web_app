export const RETRIEVAL_EXECUTION_RECEIPT_V1_SCHEMA =
  'parent-atlas.retrieval-execution-receipt.v1' as const;

export interface CandidateReductionCountersV1 {
  input: number;
  metadata: number;
  lexical: number;
  structural: number;
  semantic: number;
  graph: number;
  fused: number;
  exactPromoted: number;
}

export interface RetrievalResourceUsageV1 {
  elapsedMs: number;
  fetchedBytes: number;
  cpuPeakBytes: number;
  gpuPeakBytes: number;
  contextTokenEstimate: number;
  postgresReads: number;
  sourceReads: number;
  graphExpansions: number;
}

export interface RetrievalExecutionReceiptV1 {
  schema: typeof RETRIEVAL_EXECUTION_RECEIPT_V1_SCHEMA;
  requestId: string;
  workspaceRevision: string;
  retrievalPlanRef: string;

  requestedLogicalLanes: readonly string[];
  selectedExecutors: readonly string[];

  semanticRepresentation: 'semantic_768';
  semanticLogicalVotes: 1;
  fusionOwner: 'SEARCH_RUNTIME';

  candidateCounts: CandidateReductionCountersV1;
  resourceUsage: RetrievalResourceUsageV1;

  residency: {
    hotHits: number;
    warmHits: number;
    coldHydrations: number;
    prefetchIssued: number;
    prefetchHits: number;
    gpuPromotions: number;
    demotions: number;
  };

  exactPromotionRequired: boolean;
  exactPromotionSatisfied: boolean;

  writes: false;
}
