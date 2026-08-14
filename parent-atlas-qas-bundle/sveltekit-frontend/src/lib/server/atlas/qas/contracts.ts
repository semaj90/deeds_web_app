export type QasTaskKind =
  | 'EXPLAIN'
  | 'DEBUG'
  | 'IMPLEMENT'
  | 'PLAN'
  | 'COMPARE'
  | 'REFACTOR'
  | 'VERIFY';

export type QasEvidenceState =
  | 'EXACT_PROMOTED'
  | 'APPROXIMATE_ONLY'
  | 'REJECTED';

export interface QueryIntentEnvelopeV1 {
  schema: 'parent-atlas.qas.query-intent.v1';
  requestId: string;
  queryText: string;
  task: { kind: QasTaskKind; confidence: number };
  domainAffinities: Record<string, number>;
  som?: {
    width: 20;
    height: 20;
    winnerCell: number;
    x: number;
    y: number;
    topologyRevision?: string;
    neighborhood: Array<{ cell: number; affinity: number }>;
  };
  requestedEvidence: {
    source: boolean;
    graph: boolean;
    execution: boolean;
    history: boolean;
    externalDocs: boolean;
  };
  budgets: {
    candidateBudget: 128 | 512 | 2048;
    contextTokenBudget: number;
    gpuBytes?: number;
    latencyMs?: number;
  };
  policyRevision: string;
}

export interface QasCandidateFeatureV1 {
  canonicalId: string;
  sourceRef?: string;
  semanticAffinity?: number;
  lexicalAffinity?: number;
  graphAffinity?: number;
  astAffinity?: number;
  processAffinity?: number;
  domainAffinity?: number;
  executionPrior?: number;
  reuseProbability?: number;
  recency?: number;
  memoryCost?: number;
  promotionCost?: number;
  evidenceRefs: string[];
}

export interface QasSampledCandidateV1 {
  canonicalId: string;
  proposalWeight: number;
  proposalProbability: number;
  sampled: boolean;
  evidenceState: QasEvidenceState;
}

export interface QasSamplingReceiptV1 {
  schema: 'parent-atlas.qas.sampling-receipt.v1';
  requestId: string;
  policyRevision: string;
  featureRevision: string;
  seed: number;
  baselineCount: number;
  sampleBudget: number;
  sampledCount: number;
  overlapAtK?: number;
  recallAtK?: number;
  candidates: QasSampledCandidateV1[];
}

export interface QasPlanCandidateV1 {
  planId: string;
  requestId: string;
  kind:
    | 'MINIMAL_PATCH'
    | 'ARCHITECTURAL_FIX'
    | 'TEST_FIRST'
    | 'DATA_MIGRATION'
    | 'SUPERSEDE_OWNER'
    | 'DEFER_INSUFFICIENT_EVIDENCE';
  exactEvidenceRefs: string[];
  proposedTargets: string[];
  scores: {
    correctness: number;
    evidence: number;
    testability: number;
    minimality: number;
    risk: number;
    cost: number;
    total: number;
  };
}
