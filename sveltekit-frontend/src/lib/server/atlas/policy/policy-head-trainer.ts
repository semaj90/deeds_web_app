import { createHash } from 'node:crypto';
import type { RouteTraceTrainingRow } from './policy-training.js';
import { POLICY_ACTIONS, MODEL_TARGETS, BUDGET_TIERS, type PolicyAction, type ModelTarget, type BudgetTier } from './policy-types.js';

export interface LinearHeadModel {
  revision: string;
  classes: readonly string[];
  featureCount: number;
  weights: number[][];
  bias: number[];
}

export interface HeldOutMetrics {
  total: number;
  correct: number;
  accuracy: number;
}

export interface PolicyHeadTrainingMetrics {
  actionBaseline: HeldOutMetrics;
  actionLearned: HeldOutMetrics;
  modelLearned: HeldOutMetrics;
  budgetLearned: HeldOutMetrics;
  repairSuccessBaseline: HeldOutMetrics;
  repairSuccessLearned: HeldOutMetrics;
}

export interface PolicyHeadTrainingResult {
  revision: string;
  holdoutFraction: number;
  trainCount: number;
  holdoutCount: number;
  actionHead: LinearHeadModel;
  modelHead: LinearHeadModel;
  budgetHead: LinearHeadModel;
  metrics: PolicyHeadTrainingMetrics;
}

export interface PolicyHeadTrainingOptions {
  holdoutFraction?: number;
  learningRate?: number;
  epochs?: number;
  l2?: number;
  seed?: string;
}

const TRAINER_REVISION = 'parent-atlas.policy-head-trainer.v1' as const;

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function deterministicShuffle<T>(values: readonly T[], seed: string): T[] {
  const indexed = values.map((value, index) => ({
    value,
    key: createHash('sha256').update(`${seed}:${index}:${JSON.stringify(value)}`).digest('hex'),
  }));
  return indexed.sort((a, b) => a.key.localeCompare(b.key)).map((entry) => entry.value);
}

function splitHoldout<T>(values: readonly T[], holdoutFraction: number, seed: string): { train: T[]; holdout: T[] } {
  const shuffled = deterministicShuffle(values, seed);
  const holdoutCount = Math.max(1, Math.floor(shuffled.length * holdoutFraction));
  return {
    train: shuffled.slice(0, Math.max(0, shuffled.length - holdoutCount)),
    holdout: shuffled.slice(Math.max(0, shuffled.length - holdoutCount)),
  };
}

function softmax(scores: number[]): number[] {
  const max = Math.max(...scores);
  const exps = scores.map((score) => Math.exp(score - max));
  const sum = exps.reduce((acc, value) => acc + value, 0) || 1;
  return exps.map((value) => value / sum);
}

function argMax(values: readonly number[]): number {
  let bestIndex = 0;
  let bestValue = values[0] ?? Number.NEGATIVE_INFINITY;
  for (let i = 1; i < values.length; i += 1) {
    const value = values[i] ?? Number.NEGATIVE_INFINITY;
    if (value > bestValue) {
      bestIndex = i;
      bestValue = value;
    }
  }
  return bestIndex;
}

function oneHotIndex(classes: readonly string[], label: string): number {
  const index = classes.indexOf(label);
  if (index < 0) throw new Error(`Unknown class "${label}" for trainer.`);
  return index;
}

function dot(weights: number[], values: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += (weights[i] ?? 0) * (values[i] ?? 0);
  }
  return sum;
}

function predictWithHead(head: LinearHeadModel, values: readonly number[]): { label: string; probabilities: Record<string, number> } {
  const scores = head.weights.map((weights, index) => dot(weights, values) + (head.bias[index] ?? 0));
  const probabilities = softmax(scores);
  const bestIndex = argMax(probabilities);
  return {
    label: head.classes[bestIndex] ?? head.classes[0] ?? '',
    probabilities: Object.fromEntries(head.classes.map((label, index) => [label, probabilities[index] ?? 0])),
  };
}

function trainHead(
  rows: readonly RouteTraceTrainingRow[],
  classes: readonly string[],
  labelOf: (row: RouteTraceTrainingRow) => string,
  options: Required<Pick<PolicyHeadTrainingOptions, 'learningRate' | 'epochs' | 'l2'>>,
): LinearHeadModel {
  const featureCount = rows[0]?.values.length ?? 0;
  const weights = classes.map(() => new Array(featureCount).fill(0));
  const bias = new Array(classes.length).fill(0);

  for (let epoch = 0; epoch < options.epochs; epoch += 1) {
    for (const row of rows) {
      const x = row.values;
      const targetIndex = oneHotIndex(classes, labelOf(row));
      const scores = weights.map((classWeights, index) => dot(classWeights, x) + bias[index]);
      const probabilities = softmax(scores);

      for (let classIndex = 0; classIndex < classes.length; classIndex += 1) {
        const target = classIndex === targetIndex ? 1 : 0;
        const error = probabilities[classIndex] - target;
        for (let featureIndex = 0; featureIndex < featureCount; featureIndex += 1) {
          const gradient = error * (x[featureIndex] ?? 0) + options.l2 * weights[classIndex][featureIndex];
          weights[classIndex][featureIndex] -= options.learningRate * gradient;
        }
        bias[classIndex] -= options.learningRate * error;
      }
    }
  }

  return {
    revision: TRAINER_REVISION,
    classes,
    featureCount,
    weights,
    bias,
  };
}

function evaluateHead(
  head: LinearHeadModel,
  rows: readonly RouteTraceTrainingRow[],
  labelOf: (row: RouteTraceTrainingRow) => string,
): HeldOutMetrics {
  if (rows.length === 0) {
    return { total: 0, correct: 0, accuracy: 0 };
  }
  let correct = 0;
  for (const row of rows) {
    if (predictWithHead(head, row.values).label === labelOf(row)) {
      correct += 1;
    }
  }
  return { total: rows.length, correct, accuracy: correct / rows.length };
}

function evaluateBooleanMetric(
  rows: readonly RouteTraceTrainingRow[],
  predicate: (row: RouteTraceTrainingRow) => boolean,
): HeldOutMetrics {
  if (rows.length === 0) {
    return { total: 0, correct: 0, accuracy: 0 };
  }
  let correct = 0;
  for (const row of rows) {
    if (predicate(row)) {
      correct += 1;
    }
  }
  return { total: rows.length, correct, accuracy: correct / rows.length };
}

function evaluateLabelMetric(
  rows: readonly RouteTraceTrainingRow[],
  predictor: (row: RouteTraceTrainingRow) => string,
  labelOf: (row: RouteTraceTrainingRow) => string,
): HeldOutMetrics {
  if (rows.length === 0) {
    return { total: 0, correct: 0, accuracy: 0 };
  }
  let correct = 0;
  for (const row of rows) {
    if (predictor(row) === labelOf(row)) {
      correct += 1;
    }
  }
  return { total: rows.length, correct, accuracy: correct / rows.length };
}

function deterministicActionBaseline(row: RouteTraceTrainingRow): PolicyAction {
  switch (row.stateHint) {
    case 'LOCATE':
      return 'LEXICAL_SEARCH';
    case 'UNDERSTAND':
      return 'SEMANTIC_SEARCH';
    case 'TRACE':
      return 'GRAPH_TRACE';
    case 'REPAIR':
      return 'PATCH';
    case 'VALIDATE':
      return 'TEST';
    case 'RECOVER':
      return 'RECOVER';
    default:
      return 'TERMINATE';
  }
}

function deterministicModelBaseline(row: RouteTraceTrainingRow): ModelTarget {
  if (row.finalOutcome === 'success' && row.policyBudget === 'DEEP') return 'ORNITH';
  if (row.policyAction === 'DEEP_RERANK' || row.policyAction === 'PATCH') return 'ORNITH';
  return 'NO_LLM';
}

function deterministicBudgetBaseline(row: RouteTraceTrainingRow): BudgetTier {
  if (row.stateHint === 'TRACE' || row.stateHint === 'REPAIR') return 'MEDIUM';
  if (row.policyAction === 'DEEP_RERANK' || row.policyAction === 'PATCH') return 'DEEP';
  return 'SMALL';
}

export function trainPolicyHeads(
  rows: readonly RouteTraceTrainingRow[],
  options: PolicyHeadTrainingOptions = {},
): PolicyHeadTrainingResult {
  if (rows.length < 4) {
    throw new Error('Need at least 4 policy rows to train held-out heads.');
  }

  const holdoutFraction = options.holdoutFraction ?? 0.25;
  const learningRate = options.learningRate ?? 0.2;
  const epochs = options.epochs ?? 120;
  const l2 = options.l2 ?? 1e-4;
  const seed = options.seed ?? stableHash(rows.map((row) => row.trainingDigest));

  const { train, holdout } = splitHoldout(rows, holdoutFraction, seed);

  const actionHead = trainHead(train, POLICY_ACTIONS, (row) => row.policyAction, { learningRate, epochs, l2 });
  const modelHead = trainHead(train, MODEL_TARGETS, (row) => row.policyModel, { learningRate, epochs, l2 });
  const budgetHead = trainHead(train, BUDGET_TIERS, (row) => row.policyBudget, { learningRate, epochs, l2 });

  const actionBaseline = evaluateLabelMetric(holdout, deterministicActionBaseline, (row) => row.policyAction);
  const actionLearned = evaluateHead(actionHead, holdout, (row) => row.policyAction);
  const modelLearned = evaluateHead(modelHead, holdout, (row) => row.policyModel);
  const budgetLearned = evaluateHead(budgetHead, holdout, (row) => row.policyBudget);
  const repairSuccessBaseline = evaluateBooleanMetric(
    holdout,
    (row) => deterministicActionBaseline(row) === row.policyAction && row.finalOutcome === 'success',
  );
  const repairSuccessLearned = evaluateBooleanMetric(
    holdout,
    (row) => predictWithHead(actionHead, row.values).label === row.policyAction && row.finalOutcome === 'success',
  );

  return {
    revision: TRAINER_REVISION,
    holdoutFraction,
    trainCount: train.length,
    holdoutCount: holdout.length,
    actionHead,
    modelHead,
    budgetHead,
    metrics: {
      actionBaseline,
      actionLearned,
      modelLearned,
      budgetLearned,
      repairSuccessBaseline,
      repairSuccessLearned,
    },
  };
}

function evaluateHeadByLabel(
  rows: readonly RouteTraceTrainingRow[],
  predictor: (row: RouteTraceTrainingRow) => string,
): HeldOutMetrics {
  if (rows.length === 0) {
    return { total: 0, correct: 0, accuracy: 0 };
  }
  let correct = 0;
  for (const row of rows) {
    if (predictor(row) === row.policyAction) {
      correct += 1;
    }
  }
  return { total: rows.length, correct, accuracy: correct / rows.length };
}
