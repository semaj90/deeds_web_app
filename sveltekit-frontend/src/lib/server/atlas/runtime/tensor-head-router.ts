import { createHash } from 'node:crypto';
import { stableSoftmax, sparsemax, topK } from '../functions/decision-function-module.js';

export type TensorHeadTaskClass =
  | 'POS_TAGGING'
  | 'DOMAIN_CLASSIFICATION'
  | 'RERANKING'
  | 'HYPERGRAPH_RAG'
  | 'PREFILL'
  | 'DECODE'
  | 'INFERENCE'
  | 'INDEX_ENRICHMENT';

export type TensorHeadRoutingMode =
  | 'DETERMINISTIC_RULES'
  | 'LINEAR_LOGISTIC'
  | 'XGBOOST'
  | 'PYTORCH_DENSE'
  | 'PYTORCH_MOE_SHADOW';

export type TensorHeadDecisionFunction = 'ARGMAX' | 'TOPK' | 'SOFTMAX' | 'SPARSEMAX';
export type GeometrySignal =
  | 'SIGNED_S3'
  | 'QUATERNION_ROTATION'
  | 'SPHERICAL_HARMONICS'
  | 'JACOBIAN_DIAGNOSTIC'
  | 'HILBERT_PROJECTION';

export interface TensorHeadCandidate {
  headId: string;
  executor: string;
  modelRevision?: string | null;
  requiredSignals: string[];
  optionalSignals?: string[];
  taskClasses: TensorHeadTaskClass[];
  basePrior: number;
}

export interface TensorHeadRouteInput {
  requestId: string;
  taskClass: TensorHeadTaskClass;
  featureSnapshotRef: string;
  featureRevision: string;
  representationRevision: string;
  graphRevision?: string | null;
  ontologyRevision?: string | null;
  routerRevision: string;
  routingMode: TensorHeadRoutingMode;
  decisionFunction: TensorHeadDecisionFunction;
  topK: number;
  signals: Record<string, number | null | undefined>;
  geometrySignals?: GeometrySignal[];
  candidates: TensorHeadCandidate[];
  seed: string;
  exactPromotionRequired?: boolean;
  environmentReceiptId?: string | null;
  gpuLeaseId?: string | null;
  producerRevision?: string;
}

export interface TensorHeadRouteV1 {
  schema: 'atlas.tensor-head-route.v1';
  routeId: string;
  requestId: string;
  taskClass: TensorHeadTaskClass;
  featureSnapshotRef: string;
  featureRevision: string;
  representationRevision: string;
  graphRevision: string | null;
  ontologyRevision: string | null;
  routerRevision: string;
  routingMode: TensorHeadRoutingMode;
  decisionFunction: TensorHeadDecisionFunction;
  topK: number;
  selectedHeads: Array<{ headId: string; score: number; normalizedWeight: number; executor: string; modelRevision: string | null }>;
  shadowHeads: Array<{ headId: string; score: number; reason: string }>;
  consumedSignals: string[];
  missingSignals: string[];
  geometrySignals: GeometrySignal[];
  exactPromotionRequired: boolean;
  canonicalWrites: false;
  seed: string;
  environmentReceiptId: string | null;
  gpuLeaseId: string | null;
  producerRevision: string;
  checksum: string;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const stableHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function headScore(head: TensorHeadCandidate, signals: Record<string, number | null | undefined>): { score: number; missing: string[]; used: string[] } {
  const missing = head.requiredSignals.filter((name) => !Number.isFinite(signals[name]));
  if (missing.length > 0) return { score: Number.NEGATIVE_INFINITY, missing, used: [] };
  const names = [...head.requiredSignals, ...(head.optionalSignals ?? []).filter((name) => Number.isFinite(signals[name]))];
  const values = names.map((name) => clamp01(Number(signals[name])));
  const mean = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  return { score: clamp01(0.25 * clamp01(head.basePrior) + 0.75 * mean), missing: [], used: names };
}

function normalize(scores: number[], fn: TensorHeadDecisionFunction): number[] {
  if (scores.length === 0) return [];
  if (fn === 'SOFTMAX') return stableSoftmax(scores);
  if (fn === 'SPARSEMAX') return sparsemax(scores);
  if (fn === 'ARGMAX') {
    const best = topK(scores, 1)[0]!.index;
    return scores.map((_, i) => i === best ? 1 : 0);
  }
  const selected = new Set(topK(scores, Math.max(1, scores.length)).map((x) => x.index));
  const active = scores.map((score, i) => selected.has(i) ? Math.max(0, score) : 0);
  const sum = active.reduce((a, b) => a + b, 0);
  return sum > 0 ? active.map((x) => x / sum) : active.map(() => 1 / active.length);
}

/**
 * Builds an observable route from revision-qualified features.
 * PYTORCH_MOE_SHADOW is intentionally emitted only as shadowHeads until a
 * promotion receipt allows it into the live scorer.
 */
export function buildTensorHeadRoute(input: TensorHeadRouteInput): TensorHeadRouteV1 {
  if (!Number.isInteger(input.topK) || input.topK < 1) throw new Error('topK must be >= 1');
  const eligible = input.candidates.filter((head) => head.taskClasses.includes(input.taskClass));
  if (eligible.length === 0) throw new Error(`no heads support taskClass=${input.taskClass}`);

  const scored = eligible.map((head) => ({ head, ...headScore(head, input.signals) }));
  const viable = scored.filter((row) => Number.isFinite(row.score));
  if (viable.length === 0) throw new Error('no tensor head has all required observed signals');

  viable.sort((a, b) => b.score - a.score || a.head.headId.localeCompare(b.head.headId));
  const selectedRows = viable.slice(0, Math.min(input.topK, viable.length));
  const weights = normalize(selectedRows.map((row) => row.score), input.decisionFunction);
  const consumedSignals = [...new Set(selectedRows.flatMap((row) => row.used))].sort();
  const missingSignals = [...new Set(scored.flatMap((row) => row.missing))].sort();

  const shadowMode = input.routingMode === 'PYTORCH_MOE_SHADOW';
  const body = {
    schema: 'atlas.tensor-head-route.v1' as const,
    routeId: `head-route:${input.requestId}:${input.featureRevision}:${input.routerRevision}`,
    requestId: input.requestId,
    taskClass: input.taskClass,
    featureSnapshotRef: input.featureSnapshotRef,
    featureRevision: input.featureRevision,
    representationRevision: input.representationRevision,
    graphRevision: input.graphRevision ?? null,
    ontologyRevision: input.ontologyRevision ?? null,
    routerRevision: input.routerRevision,
    routingMode: input.routingMode,
    decisionFunction: input.decisionFunction,
    topK: input.topK,
    selectedHeads: shadowMode ? [] : selectedRows.map((row, i) => ({
      headId: row.head.headId,
      score: Number(row.score.toFixed(8)),
      normalizedWeight: Number((weights[i] ?? 0).toFixed(8)),
      executor: row.head.executor,
      modelRevision: row.head.modelRevision ?? null,
    })),
    shadowHeads: shadowMode ? selectedRows.map((row) => ({
      headId: row.head.headId,
      score: Number(row.score.toFixed(8)),
      reason: 'PYTORCH_MOE_SHADOW cannot affect canonical ranking before promotion',
    })) : [],
    consumedSignals,
    missingSignals,
    geometrySignals: [...new Set(input.geometrySignals ?? [])].sort() as GeometrySignal[],
    exactPromotionRequired: input.exactPromotionRequired ?? true,
    canonicalWrites: false as const,
    seed: input.seed,
    environmentReceiptId: input.environmentReceiptId ?? null,
    gpuLeaseId: input.gpuLeaseId ?? null,
    producerRevision: input.producerRevision ?? 'tensor-head-router-v1',
  };
  return { ...body, checksum: stableHash(body) };
}
