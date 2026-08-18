import { recommendationHash } from './recommendation-receipt.js';

export interface ExistingDomainPrediction {
  packet_key: string;
  predicted_domain: string;
  top_score: number;
  score_margin: number;
  status: 'PREDICTED' | 'UNCERTAIN' | 'REJECTED';
}

export interface PrefillRerankFeatureRowV1 {
  schema: 'atlas.prefill-rerank-feature-row.v1';
  requestId: string;
  candidateOrdinal: number;
  canonicalId: string;
  packetKey: string | null;
  sourceRef: string;
  semanticScore: number;
  semanticExecutor: string;
  pagerankScore: number | null;
  graphAuthorityReceiptRef: string | null;
  hypergraphScore: number | null;
  hyperedgeRefs: string[];
  astScore: number | null;
  somScore: number | null;
  hypersphereScore: number | null;
  domainScore: number | null;
  predictedDomain: string | null;
  domainPredictionRef: string | null;
  observedSignals: string[];
  missingSignals: string[];
  tokenCost: number;
  latencyCostMs: number;
  workspaceRevision: string;
  graphRevision: string | null;
  featureRevision: string;
  representationRevision: string;
  checksum: string;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function adaptDomainPrediction(
  prediction: ExistingDomainPrediction | null | undefined,
  predictionRef?: string,
): Pick<PrefillRerankFeatureRowV1, 'domainScore' | 'predictedDomain' | 'domainPredictionRef'> {
  if (!prediction || prediction.status !== 'PREDICTED') {
    return { domainScore: null, predictedDomain: null, domainPredictionRef: predictionRef ?? null };
  }
  return {
    domainScore: clamp01(prediction.top_score),
    predictedDomain: prediction.predicted_domain,
    domainPredictionRef: predictionRef ?? null,
  };
}

export function buildPrefillRerankFeatureRow(input: Omit<PrefillRerankFeatureRowV1, 'schema' | 'observedSignals' | 'missingSignals' | 'checksum'>): PrefillRerankFeatureRowV1 {
  const optional = {
    pagerank: input.pagerankScore,
    hypergraph: input.hypergraphScore,
    ast: input.astScore,
    som: input.somScore,
    hypersphere: input.hypersphereScore,
    domain: input.domainScore,
  };
  const observedSignals = ['semantic', ...Object.entries(optional).filter(([, value]) => Number.isFinite(value)).map(([key]) => key)].sort();
  const missingSignals = Object.entries(optional).filter(([, value]) => !Number.isFinite(value)).map(([key]) => key).sort();
  const body = {
    schema: 'atlas.prefill-rerank-feature-row.v1' as const,
    ...input,
    semanticScore: clamp01(input.semanticScore),
    hyperedgeRefs: [...new Set(input.hyperedgeRefs)].sort(),
    observedSignals,
    missingSignals,
  };
  return { ...body, checksum: recommendationHash(body) };
}
