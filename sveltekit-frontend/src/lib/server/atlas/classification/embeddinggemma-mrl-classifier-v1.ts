import {
  EMBEDDINGGEMMA_MODEL_ID,
  EMBEDDINGGEMMA_PROMPT_REVISION_V1,
  embeddingGemmaTaskRepresentationIdV1,
  projectEmbeddingGemmaMrlV1,
  type EmbeddingGemmaMrlDimension,
} from '../embedding/embeddinggemma-task-representation-v1.js';
import { buildClassificationObservationV1, type ClassificationObservationV1, type ClassificationTaskV1 } from './classification-observation-v1.js';

export type MrlDimension = EmbeddingGemmaMrlDimension;

export interface PrototypeLabel {
  label: string;
  vector: readonly number[] | Float32Array;
}

export interface MrlClassifierPolicyV1 {
  dimensions: readonly MrlDimension[];
  acceptThresholdByDimension: Partial<Record<MrlDimension, number>>;
  marginThreshold: number;
  modelId: string;
  modelRevision: string;
  representationRevision: string;
  promptRevision: string;
  classifierHeadRevision: string;
  calibrationRevision: string;
}

export const DEFAULT_EMBEDDINGGEMMA_MRL_CLASSIFIER_POLICY_V1: MrlClassifierPolicyV1 = {
  dimensions: [128, 256, 512, 768],
  acceptThresholdByDimension: {
    128: 0.92,
    256: 0.90,
    512: 0.88,
    768: 0.86,
  },
  marginThreshold: 0.08,
  modelId: EMBEDDINGGEMMA_MODEL_ID,
  modelRevision: 'UNBOUND',
  representationRevision: 'UNBOUND',
  promptRevision: EMBEDDINGGEMMA_PROMPT_REVISION_V1,
  classifierHeadRevision: 'atlas.prototype-cosine-head.v1',
  calibrationRevision: 'UNBOUND',
};

function norm(vector: readonly number[]): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

export function truncateAndRenormalizeMrl(
  vector: readonly number[] | Float32Array,
  dimension: MrlDimension,
): number[] {
  return Array.from(projectEmbeddingGemmaMrlV1(vector, dimension));
}

function cosineUnit(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length) throw new Error('CLASSIFIER_VECTOR_DIMENSION_MISMATCH');
  let dot = 0;
  for (let i = 0; i < left.length; i += 1) dot += left[i] * right[i];
  return Math.max(-1, Math.min(1, dot));
}

function softmax(values: readonly number[], temperature = 0.08): number[] {
  const scaled = values.map((value) => value / temperature);
  const max = Math.max(...scaled);
  const exp = scaled.map((value) => Math.exp(value - max));
  const total = exp.reduce((sum, value) => sum + value, 0);
  return exp.map((value) => value / total);
}

export function scorePrototypeLabelsMrl(
  query768: readonly number[] | Float32Array,
  prototypes: readonly PrototypeLabel[],
  dimension: MrlDimension,
): Array<{ label: string; cosine: number; probability: number }> {
  if (prototypes.length === 0) throw new Error('CLASSIFIER_PROTOTYPES_REQUIRED');
  const query = truncateAndRenormalizeMrl(query768, dimension);
  const cosines = prototypes.map((prototype) => {
    const proto = prototype.vector.length === 768
      ? truncateAndRenormalizeMrl(prototype.vector, dimension)
      : Array.from(prototype.vector);
    if (proto.length !== dimension) throw new Error(`CLASSIFIER_PROTOTYPE_DIMENSION_MISMATCH label=${prototype.label}`);
    const protoNorm = norm(proto);
    const normalized = Math.abs(protoNorm - 1) < 1e-5 ? proto : proto.map((value) => value / Math.max(protoNorm, 1e-12));
    return cosineUnit(query, normalized);
  });
  const probabilities = softmax(cosines);
  return prototypes
    .map((prototype, index) => ({ label: prototype.label, cosine: cosines[index], probability: probabilities[index] }))
    .sort((a, b) => b.probability - a.probability || b.cosine - a.cosine || a.label.localeCompare(b.label));
}

export function classifyEmbeddingGemmaMrlV1(input: {
  requestId: string;
  workspaceRevision: string;
  task: ClassificationTaskV1;
  queryVector768: readonly number[] | Float32Array;
  prototypes: readonly PrototypeLabel[];
  sourceRef?: string | null;
  sourceRevision?: string | null;
  packetKey?: string | null;
  treeNodeId?: string | null;
  symbolVersionId?: string | null;
  evidenceRefs?: readonly string[];
  policy?: MrlClassifierPolicyV1;
}): { observation: ClassificationObservationV1; dimension: MrlDimension; escalated: boolean; scores: ReturnType<typeof scorePrototypeLabelsMrl> } {
  const policy = input.policy ?? DEFAULT_EMBEDDINGGEMMA_MRL_CLASSIFIER_POLICY_V1;
  let last: ReturnType<typeof scorePrototypeLabelsMrl> = [];
  let chosen = policy.dimensions[policy.dimensions.length - 1] ?? 768;

  for (const dimension of policy.dimensions) {
    const scores = scorePrototypeLabelsMrl(input.queryVector768, input.prototypes, dimension);
    last = scores;
    chosen = dimension;
    const confidence = scores[0]?.probability ?? 0;
    const margin = confidence - (scores[1]?.probability ?? 0);
    const threshold = policy.acceptThresholdByDimension[dimension] ?? 1;
    if (confidence >= threshold && margin >= policy.marginThreshold) break;
  }

  const threshold = policy.acceptThresholdByDimension[chosen] ?? 1;
  const confidence = last[0]?.probability ?? 0;
  const margin = confidence - (last[1]?.probability ?? 0);
  const observation = buildClassificationObservationV1({
    requestId: input.requestId,
    workspaceRevision: input.workspaceRevision,
    task: input.task,
    labels: last.map(({ label, probability }) => ({ label, probability })),
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    packetKey: input.packetKey,
    treeNodeId: input.treeNodeId,
    symbolVersionId: input.symbolVersionId,
    representationId: embeddingGemmaTaskRepresentationIdV1('classification', chosen),
    representationRevision: policy.representationRevision,
    outputDimension: chosen,
    modelId: policy.modelId,
    modelRevision: policy.modelRevision,
    promptRevision: policy.promptRevision,
    classifierHeadRevision: policy.classifierHeadRevision,
    calibrationRevision: policy.calibrationRevision,
    evidenceRefs: input.evidenceRefs,
    abstainThreshold: threshold,
  });

  return {
    observation: {
      ...observation,
      abstained: observation.abstained || margin < policy.marginThreshold,
    },
    dimension: chosen,
    escalated: chosen !== policy.dimensions[0],
    scores: last,
  };
}
