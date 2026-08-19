import { createHash } from 'node:crypto';

export type FunctionPurpose =
  | 'CLASSIFICATION'
  | 'MULTILABEL_CLASSIFICATION'
  | 'ATTENTION'
  | 'RANKING'
  | 'POLICY_SELECTION'
  | 'REWARD_MODEL'
  | 'VISUALIZATION';

export type ModelFamily =
  | 'NONE'
  | 'PYTORCH'
  | 'XGBOOST'
  | 'LOGISTIC_REGRESSION'
  | 'SVM'
  | 'ORDINAL_REGRESSION'
  | 'TRANSFORMER';

export type TrainingObjective = 'NONE' | 'SFT' | 'PEFT' | 'DPO' | 'PPO' | 'REWARD_MODELING';
export type DecisionFunctionName =
  | 'IDENTITY'
  | 'ARGMAX'
  | 'TOPK'
  | 'SOFTMAX'
  | 'LOG_SOFTMAX'
  | 'SIGMOID'
  | 'SPARSEMAX'
  | 'SQUAREMAX'
  | 'POLYNOMIAL'
  | 'MIXTURE_OF_SOFTMAXES'
  | 'LINEAR_ATTENTION';

export type DecisionExecutor =
  | 'typescript_cpu'
  | 'pytorch_cpu'
  | 'pytorch_cuda'
  | 'libtorch_cpu'
  | 'libtorch_cuda'
  | 'cublaslt'
  | 'tensorrt_rtx'
  | 'triton'
  | 'webgpu'
  | 'xgboost_cpu'
  | 'xgboost_cuda';

export interface DecisionFunctionRequest {
  purpose: FunctionPurpose;
  modelFamily: ModelFamily;
  trainingObjective?: TrainingObjective;
  decisionFunction?: DecisionFunctionName;
  classCount?: number;
  multiLabel?: boolean;
  sparseOutputPreferred?: boolean;
  hardwareFriendlyApproximation?: boolean;
  attentionReplacementExperiment?: boolean;
  topK?: number;
  inputRange?: { min: number; max: number };
  availableExecutors: DecisionExecutor[];
  qualityReceiptIds?: Partial<Record<DecisionFunctionName, string>>;
}

export interface DecisionFunctionPlan {
  schema: 'atlas.decision-function-plan.v1';
  purpose: FunctionPurpose;
  modelFamily: ModelFamily;
  trainingObjective: TrainingObjective;
  decisionFunction: DecisionFunctionName;
  executor: DecisionExecutor;
  topK: number | null;
  requiresRetraining: boolean;
  qualityReceiptId: string | null;
  notes: string[];
  checksum: string;
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function chooseFunction(req: DecisionFunctionRequest): DecisionFunctionName {
  if (req.decisionFunction) return req.decisionFunction;
  if (req.purpose === 'MULTILABEL_CLASSIFICATION' || req.multiLabel) return 'SIGMOID';
  if (req.purpose === 'CLASSIFICATION') {
    if (req.sparseOutputPreferred) return 'SPARSEMAX';
    return 'SOFTMAX';
  }
  if (req.purpose === 'POLICY_SELECTION' || req.purpose === 'RANKING') return req.topK && req.topK > 1 ? 'TOPK' : 'ARGMAX';
  if (req.purpose === 'ATTENTION') {
    if (req.attentionReplacementExperiment && req.hardwareFriendlyApproximation) return 'SQUAREMAX';
    return 'SOFTMAX';
  }
  return 'IDENTITY';
}

function supportedExecutors(fn: DecisionFunctionName, modelFamily: ModelFamily): DecisionExecutor[] {
  if (modelFamily === 'XGBOOST') return ['xgboost_cuda', 'xgboost_cpu'];
  switch (fn) {
    case 'SOFTMAX':
    case 'SIGMOID':
    case 'TOPK':
    case 'ARGMAX':
      return ['tensorrt_rtx', 'libtorch_cuda', 'pytorch_cuda', 'triton', 'webgpu', 'libtorch_cpu', 'pytorch_cpu', 'typescript_cpu'];
    case 'SPARSEMAX':
      return ['libtorch_cuda', 'pytorch_cuda', 'triton', 'webgpu', 'libtorch_cpu', 'pytorch_cpu', 'typescript_cpu'];
    case 'SQUAREMAX':
    case 'POLYNOMIAL':
    case 'LINEAR_ATTENTION':
      return ['triton', 'webgpu', 'libtorch_cuda', 'pytorch_cuda', 'libtorch_cpu', 'pytorch_cpu', 'typescript_cpu'];
    case 'LOG_SOFTMAX':
    case 'MIXTURE_OF_SOFTMAXES':
    case 'IDENTITY':
    default:
      return ['libtorch_cuda', 'pytorch_cuda', 'webgpu', 'libtorch_cpu', 'pytorch_cpu', 'typescript_cpu'];
  }
}

export function planDecisionFunction(req: DecisionFunctionRequest): DecisionFunctionPlan {
  const decisionFunction = chooseFunction(req);
  const experimental = decisionFunction === 'SQUAREMAX' || decisionFunction === 'POLYNOMIAL' || decisionFunction === 'LINEAR_ATTENTION';
  const qualityReceiptId = req.qualityReceiptIds?.[decisionFunction] ?? null;
  const requiresRetraining = experimental && req.purpose === 'ATTENTION';
  if (requiresRetraining && !qualityReceiptId) {
    throw new Error(`${decisionFunction} attention replacement requires a model-specific quality/training receipt`);
  }
  const supported = supportedExecutors(decisionFunction, req.modelFamily);
  const executor = supported.find((candidate) => req.availableExecutors.includes(candidate));
  if (!executor) throw new Error(`No available executor supports ${decisionFunction}/${req.modelFamily}`);

  const body = {
    schema: 'atlas.decision-function-plan.v1' as const,
    purpose: req.purpose,
    modelFamily: req.modelFamily,
    trainingObjective: req.trainingObjective ?? 'NONE',
    decisionFunction,
    executor,
    topK: decisionFunction === 'TOPK' ? Math.max(1, req.topK ?? 1) : null,
    requiresRetraining,
    qualityReceiptId,
    notes: [
      'PEFT/DPO/PPO describe training, not output normalization.',
      'Argmax/TopK choose indices and are not calibrated probability functions.',
      experimental ? 'Experimental approximation: compare against the exact/original function before promotion.' : 'Canonical/native function path.',
    ],
  };
  return { ...body, checksum: hash(body) };
}

export function stableSoftmax(logits: number[]): number[] {
  if (logits.length === 0) return [];
  const max = Math.max(...logits);
  const exp = logits.map((x) => Math.exp(x - max));
  const total = exp.reduce((a, b) => a + b, 0) || 1;
  return exp.map((x) => x / total);
}

export function sigmoid(logits: number[]): number[] {
  return logits.map((x) => x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x)));
}

export function argmax(values: number[]): number {
  if (values.length === 0) throw new Error('argmax requires at least one value');
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i]! > values[best]!) best = i;
  return best;
}

export function topK(values: number[], k: number): Array<{ index: number; value: number }> {
  return values.map((value, index) => ({ index, value })).sort((a, b) => b.value - a.value || a.index - b.index).slice(0, Math.max(1, k));
}

/** Sparsemax: Euclidean projection onto the probability simplex. */
export function sparsemax(logits: number[]): number[] {
  if (logits.length === 0) return [];
  const sorted = [...logits].sort((a, b) => b - a);
  let cumulative = 0;
  let k = 0;
  for (let i = 0; i < sorted.length; i++) {
    cumulative += sorted[i]!;
    if (1 + (i + 1) * sorted[i]! > cumulative) k = i + 1;
  }
  const tau = (sorted.slice(0, k).reduce((a, b) => a + b, 0) - 1) / Math.max(1, k);
  return logits.map((x) => Math.max(0, x - tau));
}

/**
 * Experimental squared normalization, not a canonical pretrained-attention substitute.
 * Shifting to non-negative values avoids sign cancellation; callers must carry a
 * model-specific quality receipt if used inside attention.
 */
export function squaremaxExperimental(logits: number[]): number[] {
  if (logits.length === 0) return [];
  const min = Math.min(...logits);
  const squared = logits.map((x) => (x - min) ** 2);
  const sum = squared.reduce((a, b) => a + b, 0);
  return sum > 0 ? squared.map((x) => x / sum) : logits.map(() => 1 / logits.length);
}

export function interpolateLinear(a: number, b: number, t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return a + (b - a) * u;
}
