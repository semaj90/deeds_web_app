import { createHash } from 'node:crypto';

export type FeatureSignalState = 'OBSERVED' | 'UNKNOWN' | 'UNAVAILABLE' | 'REJECTED_STALE' | 'REJECTED_IDENTITY' | 'NOT_APPLICABLE';
export type FeatureSignalExecutor =
  | 'deterministic_ts' | 'postgres' | 'qdrant' | 'cuvs_exact' | 'cagra' | 'diskann' | 'turbovec'
  | 'networkx' | 'cugraph' | 'neo4j_gds' | 'treesitter' | 'ast_grep' | 'langextract'
  | 'xgboost_cpu' | 'xgboost_cuda' | 'pytorch_cpu' | 'pytorch_cuda' | 'libtorch_cpu' | 'libtorch_cuda'
  | 'heuristic' | 'unknown';

export interface FeatureSignalV1 {
  label: string;
  state: FeatureSignalState;
  value: number | null;
  logicalOwner: string;
  executor: FeatureSignalExecutor;
  evidenceRefs: string[];
  modelRevision?: string | null;
  producerRevision: string;
  observedAt?: string | null;
}

export interface CandidateFeatureViewV1 {
  schema: 'atlas.candidate-feature-view.v1';
  requestId: string;
  candidateOrdinal: number;
  canonicalId: string;
  packetKey?: string | null;
  sourceRef: string;
  sourceFeatureRowRef?: string | null;
  sourceCandidateMatrixRef?: string | null;
  featureRevision: string;
  workspaceRevision: string;
  graphRevision?: string | null;
  representationRevision: string;
  signals: FeatureSignalV1[];
  observedLabels: string[];
  missingLabels: string[];
  checksum: string;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function makeFeatureSignal(input: Omit<FeatureSignalV1, 'value' | 'evidenceRefs'> & {
  value?: number | null;
  evidenceRefs?: string[];
}): FeatureSignalV1 {
  const value = input.state === 'OBSERVED' && Number.isFinite(input.value) ? Number(input.value) : null;
  return { ...input, value, evidenceRefs: [...new Set(input.evidenceRefs ?? [])].sort() };
}

/**
 * Compile a request-scoped view. This function never writes feature truth.
 * FeatureMatrixRowV1 and the existing CandidateFeatureMatrix remain upstream owners.
 */
export function compileCandidateFeatureView(input: Omit<CandidateFeatureViewV1, 'schema' | 'observedLabels' | 'missingLabels' | 'checksum'>): CandidateFeatureViewV1 {
  const byLabel = new Map<string, FeatureSignalV1>();
  for (const signal of input.signals) {
    if (byLabel.has(signal.label)) throw new Error(`duplicate logical feature signal: ${signal.label}`);
    byLabel.set(signal.label, makeFeatureSignal(signal));
  }
  const signals = [...byLabel.values()].sort((a,b)=>a.label.localeCompare(b.label));
  const observedLabels = signals.filter((s)=>s.state === 'OBSERVED').map((s)=>s.label);
  const missingLabels = signals.filter((s)=>s.state !== 'OBSERVED').map((s)=>s.label);
  const body = {
    schema: 'atlas.candidate-feature-view.v1' as const,
    ...input,
    signals,
    observedLabels,
    missingLabels,
  };
  return { ...body, checksum: createHash('sha256').update(stable(body)).digest('hex') };
}

export function observedSignalMap(view: CandidateFeatureViewV1): ReadonlyMap<string, number> {
  return new Map(view.signals.filter((s)=>s.state === 'OBSERVED' && s.value !== null).map((s)=>[s.label, s.value!]));
}
