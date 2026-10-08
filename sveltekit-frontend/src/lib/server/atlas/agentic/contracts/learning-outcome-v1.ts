import { z } from 'zod';

/**
 * LearningOutcomeV1 (RL-DATA-02B/02C): observable, deterministic outcome of one tool execution / repair attempt.
 * Transport results (`answer`, `candidates`, `tool_error`, ...) stay in `transportResultClass`; `resultClass` is the
 * learning-level class. `reward` is derived ONLY from validator evidence under a frozen recipe revision; without a
 * validator it stays null (UNDERIVED) so a transport-level success is never mistaken for a verified repair.
 * Persisted to `outcome_ledger.metadata.learningOutcome` (the `reward` column mirrors `reward.value`).
 */
export const LEARNING_OUTCOME_V1 = 'atlas.learning-outcome.v1' as const;
export const LEARNING_REWARD_RECIPE_REVISION = 'learning-reward-v1' as const;
export const LEARNING_OUTCOME_PRODUCER_REVISION = 'learning-outcome-v1.producer-1' as const;

export const OUTCOME_CLASSES_V1 = ['SUCCESS', 'FAILURE', 'RECOVERED', 'REGRESSED', 'NO_EFFECT'] as const;
export type OutcomeClassV1 = (typeof OUTCOME_CLASSES_V1)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runtime/orchestrator identities for one attempt. `taskId` stays the stable Kanban identity; everything here may
 * change per attempt. `externalExecutionRef` (e.g. an OpenCode session id) is a pointer, never a replacement for taskId.
 */
export const TaskEpisodeIdentityV1Schema = z.object({
  agentRuntime: z.enum(['OPENCODE', 'CODEX', 'CLAUDE_CODE', 'MASTRA', 'OTHER', 'FAKE']),
  workflowRunId: z.string().min(1).nullable(),
  agentSessionId: z.string().min(1).nullable(),
  agentRunId: z.string().min(1).nullable(),
  externalExecutionRef: z.string().min(1).nullable(),
  validatorReceiptId: z.string().min(1).nullable(),
}).strict();
export type TaskEpisodeIdentityV1 = z.infer<typeof TaskEpisodeIdentityV1Schema>;

export const LearningOutcomeV1Schema = z.object({
  schema: z.literal(LEARNING_OUTCOME_V1),
  taskId: z.string().min(1).nullable(),
  executionId: z.string().min(1),
  /** Stable id of one repair attempt (all rows of the same attempt share it). Null for non-repair executions. */
  repairAttemptId: z.string().min(1).nullable(),
  retryOf: z.string().min(1).nullable(),
  retryCount: z.number().int().nonnegative(),
  episode: TaskEpisodeIdentityV1Schema.nullable(),
  toolName: z.string().min(1),
  transportResultClass: z.string().min(1),
  resultClass: z.enum(OUTCOME_CLASSES_V1),
  recoveryAttempted: z.boolean(),
  validator: z.object({ passed: z.boolean(), validatorRevision: z.string().min(1) }).strict().nullable(),
  reward: z.object({
    // learning-reward-v1 bounds: worst = -1 (validator) -1 (regression) -0.5 (5 retries) -0.2 (latency) = -2.7; best = +3 + 0 penalties.
    value: z.number().min(-3).max(3),
    /** Frozen with the recipe so a later learning-reward-v2 can change bounds without making historical values ambiguous. */
    bounds: z.object({ min: z.literal(-3), max: z.literal(3) }).strict(),
    recipeRevision: z.literal(LEARNING_REWARD_RECIPE_REVISION),
    components: z.record(z.string(), z.number()),
  }).strict().nullable(),
  rewardStatus: z.enum(['DERIVED', 'UNDERIVED_NO_VALIDATOR']),
  previousStateChecksum: z.string().min(1).nullable(),
  nextStateChecksum: z.string().min(1).nullable(),
  evidenceRefs: z.array(z.string().min(1)),
  producerRevision: z.string().min(1),
  canonicalAuthority: z.literal(false),
}).strict();
export type LearningOutcomeV1 = z.infer<typeof LearningOutcomeV1Schema>;

const FAILURE_CLASSES = new Set(['validation_error', 'transport_error', 'tool_error', 'timeout']);
const NO_EFFECT_CLASSES = new Set(['empty', 'partial']);

export interface DeriveOutcomeInput {
  taskId?: string | null;
  executionId: string;
  repairAttemptId?: string | null;
  retryOf?: string | null;
  retryCount?: number;
  episode?: TaskEpisodeIdentityV1 | null;
  toolName: string;
  transportResultClass: string;
  success: boolean;
  recoveryAttempted: boolean;
  previousStateChecksum?: string | null;
  nextStateChecksum?: string | null;
  validator?: { passed: boolean; validatorRevision: string } | null;
  taskCompleted?: boolean | null;
  regressionIntroduced?: boolean | null;
  latencyMs?: number | null;
  evidenceRefs?: string[];
}

export function deriveOutcomeClass(i: Pick<DeriveOutcomeInput, 'transportResultClass' | 'success' | 'validator' | 'regressionIntroduced' | 'retryOf'>): OutcomeClassV1 {
  if (i.regressionIntroduced === true) return 'REGRESSED';
  if (!i.success || FAILURE_CLASSES.has(i.transportResultClass)) return 'FAILURE';
  if (i.validator?.passed === true && i.retryOf) return 'RECOVERED';
  if (NO_EFFECT_CLASSES.has(i.transportResultClass)) return 'NO_EFFECT';
  return 'SUCCESS';
}

/**
 * learning-reward-v1: validator +1/-1, task completed +1, successful repair +1, regression -1,
 * retry cost -0.1 each (max 5), latency penalty -0.2 * min(ms/30000, 1). Null without validator evidence.
 * Human acceptance is intentionally not part of v1 (no explicit signal exists yet).
 */
export function deriveReward(
  i: Pick<DeriveOutcomeInput, 'validator' | 'taskCompleted' | 'regressionIntroduced' | 'retryCount' | 'latencyMs'>,
  resultClass: OutcomeClassV1,
): LearningOutcomeV1['reward'] {
  if (!i.validator) return null;
  const components: Record<string, number> = {
    validator: i.validator.passed ? 1 : -1,
    taskCompleted: i.taskCompleted ? 1 : 0,
    successfulRepair: resultClass === 'RECOVERED' ? 1 : 0,
    regression: i.regressionIntroduced ? -1 : 0,
    retryCost: -0.1 * Math.min(i.retryCount ?? 0, 5),
    latencyPenalty: -0.2 * Math.min(Math.max(i.latencyMs ?? 0, 0) / 30000, 1),
  };
  for (const k of Object.keys(components)) components[k] = Math.round(components[k] * 1000) / 1000;
  const value = Math.round(Object.values(components).reduce((a, b) => a + b, 0) * 1000) / 1000;
  return { value, bounds: { min: -3, max: 3 }, recipeRevision: LEARNING_REWARD_RECIPE_REVISION, components };
}

export function buildLearningOutcomeV1(i: DeriveOutcomeInput): LearningOutcomeV1 {
  const resultClass = deriveOutcomeClass(i);
  const reward = deriveReward(i, resultClass);
  return LearningOutcomeV1Schema.parse({
    schema: LEARNING_OUTCOME_V1,
    taskId: i.taskId ?? null,
    executionId: i.executionId,
    repairAttemptId: i.repairAttemptId ?? null,
    retryOf: i.retryOf ?? null,
    retryCount: i.retryCount ?? 0,
    episode: i.episode ?? null,
    toolName: i.toolName,
    transportResultClass: i.transportResultClass,
    resultClass,
    recoveryAttempted: i.recoveryAttempted,
    validator: i.validator ?? null,
    reward,
    rewardStatus: reward === null ? 'UNDERIVED_NO_VALIDATOR' : 'DERIVED',
    previousStateChecksum: i.previousStateChecksum ?? null,
    nextStateChecksum: i.nextStateChecksum ?? null,
    evidenceRefs: i.evidenceRefs ?? [],
    producerRevision: LEARNING_OUTCOME_PRODUCER_REVISION,
    canonicalAuthority: false as const,
  });
}

/** Pre-training gate: counts only rows carrying every field the gate requires. */
export function isTrainingEligible(o: LearningOutcomeV1): boolean {
  return o.taskId !== null && o.repairAttemptId !== null && o.validator !== null && o.reward !== null && o.evidenceRefs.length > 0;
}

export interface OutcomeLedgerInsertV1 {
  trace_id: string;
  previous_state: string;
  next_state: string;
  tool_name: string;
  execution_id: string;
  result_class: string;
  recovery_attempted: boolean;
  final_state: string;
  final_outcome: 'success' | 'failed';
  total_duration_ms: number;
  outcome_type: 'learning_outcome';
  reward: number | null;
  metadata: { learningOutcome: LearningOutcomeV1 };
}

/**
 * RL-DATA-02A: pure builder + validation of the exact `outcome_ledger` row. Executes nothing. `trace_id` and
 * `execution_id` are uuid columns, so non-UUID values are rejected here instead of failing silently in the INSERT.
 */
export function buildOutcomeLedgerInsertV1(input: {
  traceId: string;
  previousState: string;
  nextState: string;
  durationMs: number;
  outcome: LearningOutcomeV1;
}): OutcomeLedgerInsertV1 {
  if (!UUID_RE.test(input.traceId)) throw new Error('OUTCOME_LEDGER_TRACE_ID_NOT_UUID');
  if (!UUID_RE.test(input.outcome.executionId)) throw new Error('OUTCOME_LEDGER_EXECUTION_ID_NOT_UUID');
  if (!Number.isFinite(input.durationMs) || input.durationMs < 0) throw new Error('OUTCOME_LEDGER_DURATION_INVALID');
  const o = LearningOutcomeV1Schema.parse(input.outcome);
  return {
    trace_id: input.traceId,
    previous_state: input.previousState,
    next_state: input.nextState,
    tool_name: o.toolName,
    execution_id: o.executionId,
    result_class: o.transportResultClass,
    recovery_attempted: o.recoveryAttempted,
    final_state: input.nextState,
    final_outcome: o.resultClass === 'FAILURE' || o.resultClass === 'REGRESSED' ? 'failed' : 'success',
    total_duration_ms: Math.round(input.durationMs),
    outcome_type: 'learning_outcome',
    reward: o.reward?.value ?? null,
    metadata: { learningOutcome: o },
  };
}
