import { createHash } from 'node:crypto';

export interface TensorHeadFeatureInput {
  requestId: string;
  featureRevision: string;
  representationRevision: string;
  graphRevision?: string | null;
  ontologyRevision?: string | null;
  semanticSimilarity?: number | null;
  lexicalRelevance?: number | null;
  astStructuralMatch?: number | null;
  pagerankGlobal?: number | null;
  pagerankPersonalized?: number | null;
  hyperedgeActivation?: number | null;
  posConfidence?: number | null;
  domainConfidence?: number | null;
  ontologyMatch?: number | null;
  conceptMatch?: number | null;
  entityMatch?: number | null;
  signedS3Similarity?: number | null;
  jacobian2x2?: [[number, number], [number, number]] | null;
  hilbertProjectionNorm?: number | null;
  priorExecutionSuccess?: number | null;
  reuseProbability?: number | null;
  latencyCost?: number | null;
  gpuByteCost?: number | null;
  evidenceRefs?: string[];
  producerRevision?: string;
}

export interface TensorHeadFeatureSnapshotV1 {
  schema: 'atlas.tensor-head-feature-snapshot.v1';
  snapshotId: string;
  requestId: string;
  featureRevision: string;
  representationRevision: string;
  graphRevision: string | null;
  ontologyRevision: string | null;
  signals: Record<string, number | null>;
  diagnostics: {
    jacobian2x2: [[number, number], [number, number]] | null;
    jacobianDeterminant: number | null;
    jacobianFrobeniusNorm: number | null;
  };
  observedLabels: string[];
  missingLabels: string[];
  evidenceRefs: string[];
  producerRevision: string;
  checksum: string;
}

const finite01 = (value: number | null | undefined): number | null => Number.isFinite(value) ? Math.max(0, Math.min(1, Number(value))) : null;
const finiteCost = (value: number | null | undefined): number | null => Number.isFinite(value) ? Math.max(0, Number(value)) : null;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function jacobianDiagnostics(j: [[number, number], [number, number]] | null | undefined) {
  if (!j) return { jacobian2x2: null, jacobianDeterminant: null, jacobianFrobeniusNorm: null };
  const flat = j.flat();
  if (!flat.every(Number.isFinite)) throw new Error('jacobian2x2 entries must be finite');
  const [[a, b], [c, d]] = j;
  return {
    jacobian2x2: j,
    jacobianDeterminant: a * d - b * c,
    jacobianFrobeniusNorm: Math.sqrt(a * a + b * b + c * c + d * d),
  };
}

/**
 * Compile already-derived evidence into a request-scoped head-routing snapshot.
 * A 2x2 Jacobian is carried only as a diagnostic of a local R2->R2 map; it is
 * never converted into a magic head selector.
 */
export function compileTensorHeadFeatureSnapshot(input: TensorHeadFeatureInput): TensorHeadFeatureSnapshotV1 {
  const signals: Record<string, number | null> = {
    semantic: finite01(input.semanticSimilarity),
    lexical: finite01(input.lexicalRelevance),
    ast: finite01(input.astStructuralMatch),
    pagerank: finite01(input.pagerankGlobal),
    ppr: finite01(input.pagerankPersonalized),
    hypergraph: finite01(input.hyperedgeActivation),
    pos: finite01(input.posConfidence),
    domain: finite01(input.domainConfidence),
    ontology: finite01(input.ontologyMatch),
    concept: finite01(input.conceptMatch),
    entity: finite01(input.entityMatch),
    signedS3: finite01(input.signedS3Similarity),
    hilbert: finiteCost(input.hilbertProjectionNorm),
    execution: finite01(input.priorExecutionSuccess),
    reuse: finite01(input.reuseProbability),
    latencyCost: finiteCost(input.latencyCost),
    gpuByteCost: finiteCost(input.gpuByteCost),
  };
  const observedLabels = Object.entries(signals).filter(([, value]) => value !== null).map(([name]) => name).sort();
  const missingLabels = Object.entries(signals).filter(([, value]) => value === null).map(([name]) => name).sort();
  const diagnostics = jacobianDiagnostics(input.jacobian2x2);
  const body = {
    schema: 'atlas.tensor-head-feature-snapshot.v1' as const,
    snapshotId: `tensor-head-features:${input.requestId}:${input.featureRevision}`,
    requestId: input.requestId,
    featureRevision: input.featureRevision,
    representationRevision: input.representationRevision,
    graphRevision: input.graphRevision ?? null,
    ontologyRevision: input.ontologyRevision ?? null,
    signals,
    diagnostics,
    observedLabels,
    missingLabels,
    evidenceRefs: [...new Set(input.evidenceRefs ?? [])].sort(),
    producerRevision: input.producerRevision ?? 'tensor-head-feature-compiler-v1',
  };
  return { ...body, checksum: hash(body) };
}
