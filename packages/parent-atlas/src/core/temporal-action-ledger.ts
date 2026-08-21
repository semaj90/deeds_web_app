import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const ACTION_OUTCOMES = [
  'SUCCESS_EXACT',
  'SUCCESS_PARTIAL',
  'NO_RESULT',
  'STALE_RESULT',
  'INVALID_IDENTITY',
  'PARSE_ERROR',
  'TOOL_ERROR',
  'TIMEOUT',
  'TEST_FAILED',
  'TYPECHECK_FAILED',
  'MUTATION_REJECTED',
  'SUPERSEDED',
  'POLICY_REJECTED',
  'CACHE_HIT',
] as const;
export const actionOutcomeSchema = z.enum(ACTION_OUTCOMES);
export type ActionOutcomeV1 = z.infer<typeof actionOutcomeSchema>;

export const ACTION_LEDGER_STATES = [
  'SCHEDULED',
  'STARTED',
  'PROGRESS',
  'FINALIZED',
  'INVALIDATED',
  'RETRIED',
  'SUPERSEDED',
] as const;
export const actionLedgerStateSchema = z.enum(ACTION_LEDGER_STATES);

export const TEMPORAL_REVISION_DIMENSIONS = ['workspace', 'source', 'graph'] as const;
export const temporalRevisionDimensionSchema = z.enum(TEMPORAL_REVISION_DIMENSIONS);
export const temporalRevisionAuthoritySchema = z.enum(['PROVEN', 'UNPROVEN', 'NOT_APPLICABLE']);

export const temporalRevisionCoordinateSchema = z.object({
  value: revision.nullable().default(null),
  authority: temporalRevisionAuthoritySchema,
  evidence_refs: z.array(id).default([]),
}).strict().superRefine((value, ctx) => {
  if (value.authority === 'PROVEN' && value.value === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'PROVEN revision coordinate requires a value' });
  }
  if (value.authority === 'NOT_APPLICABLE' && value.value !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'NOT_APPLICABLE revision coordinate must not carry a value' });
  }
});

export const temporalApplicabilitySchema = z.object({
  schema: z.literal('atlas.temporal-applicability.v1').default('atlas.temporal-applicability.v1'),
  observed_at: z.string().datetime(),
  valid_time: z.object({
    from: z.string().datetime().nullable().default(null),
    to: z.string().datetime().nullable().default(null),
  }).strict().default({ from: null, to: null }),
  workspace_revision: temporalRevisionCoordinateSchema,
  source_revision: temporalRevisionCoordinateSchema,
  graph_revision: temporalRevisionCoordinateSchema,
  relevant_dimensions: z.array(temporalRevisionDimensionSchema).default([]),
  evidence_frontier_hash: checksum.nullable().default(null),
}).strict().superRefine((value, ctx) => {
  if (value.valid_time.from && value.valid_time.to && value.valid_time.to < value.valid_time.from) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['valid_time'], message: 'valid_time.to must not precede valid_time.from' });
  }
  const unique = new Set(value.relevant_dimensions);
  if (unique.size !== value.relevant_dimensions.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['relevant_dimensions'], message: 'relevant_dimensions must be unique' });
  }
});
export type TemporalApplicabilityV1 = z.infer<typeof temporalApplicabilitySchema>;

export const actionTargetSchema = z.object({
  canonical_id: id.nullable().default(null),
  resource: z.string().min(1).nullable().default(null),
  target_class: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (!value.canonical_id && !value.resource) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'action target requires canonical_id or resource' });
  }
});

export const actionExecutionDescriptorSchema = z.object({
  schema: z.literal('atlas.action-execution-descriptor.v1').default('atlas.action-execution-descriptor.v1'),
  opcode: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  query_class: z.string().min(1).nullable().default(null),
  target: actionTargetSchema,
  input_hash: checksum,
  implementation_revision: revision,
  parameter_revision: revision,
  context_manifest_hash: checksum.nullable().default(null),
  applicability: temporalApplicabilitySchema,
}).strict();
export type ActionExecutionDescriptorV1 = z.infer<typeof actionExecutionDescriptorSchema>;

export const workflowActionRefSchema = z.object({
  workflow_id: id,
  workflow_revision: z.number().int().nonnegative(),
  action_id: id,
  sequence: z.number().int().nonnegative(),
}).strict();

export const actionCostSchema = z.object({
  latency_ms: z.number().finite().nonnegative().nullable().default(null),
  gpu_bytes: z.number().int().nonnegative().nullable().default(null),
  tokens: z.number().int().nonnegative().nullable().default(null),
  tool_calls: z.number().int().nonnegative().nullable().default(null),
}).strict().default({ latency_ms: null, gpu_bytes: null, tokens: null, tool_calls: null });

export const agentActionEventSchema = z.object({
  schema: z.literal('atlas.agent-action-event.v1').default('atlas.agent-action-event.v1'),
  event_id: id,
  ledger_sequence: z.number().int().positive(),
  workflow_action: workflowActionRefSchema,
  execution_key: checksum,
  descriptor: actionExecutionDescriptorSchema,
  state: actionLedgerStateSchema,
  outcome: actionOutcomeSchema.nullable().default(null),
  result_ref: id.nullable().default(null),
  error_code: z.string().min(1).nullable().default(null),
  evidence_refs: z.array(id).default([]),
  artifact_refs: z.array(id).default([]),
  cost: actionCostSchema,
  observed_at: z.string().datetime(),
  producer_revision: revision,
  event_checksum: checksum,
}).strict().superRefine((value, ctx) => {
  if (value.observed_at !== value.descriptor.applicability.observed_at) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['observed_at'], message: 'event observed_at must equal descriptor applicability observed_at' });
  }
  if (value.state === 'FINALIZED' && value.outcome === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['outcome'], message: 'FINALIZED event requires an outcome' });
  }
  if (value.state !== 'FINALIZED' && value.outcome !== null && value.state !== 'SUPERSEDED') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['outcome'], message: 'outcome is admitted only on FINALIZED or SUPERSEDED events' });
  }
  if (isSuccessfulOutcome(value.outcome) && value.result_ref === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['result_ref'], message: 'successful outcome requires result_ref' });
  }
});
export type AgentActionEventV1 = z.infer<typeof agentActionEventSchema>;

export const actionCurrentProjectionSchema = z.object({
  schema: z.literal('atlas.action-current-projection.v1').default('atlas.action-current-projection.v1'),
  execution_key: checksum,
  action_id: id,
  latest_event_id: id,
  latest_ledger_sequence: z.number().int().positive(),
  latest_state: actionLedgerStateSchema,
  latest_outcome: actionOutcomeSchema.nullable(),
  latest_result_ref: id.nullable(),
  latest_error_code: z.string().min(1).nullable(),
  latest_observed_at: z.string().datetime(),
  descriptor: actionExecutionDescriptorSchema,
  last_success_event_id: id.nullable(),
  last_failure_event_id: id.nullable(),
  retry_count: z.number().int().nonnegative(),
  event_count: z.number().int().positive(),
  stale: z.boolean(),
  projection_checksum: checksum,
}).strict();
export type ActionCurrentProjectionV1 = z.infer<typeof actionCurrentProjectionSchema>;

export const executionRetryPolicySchema = z.object({
  policy_revision: revision,
  allow_transient_retry: z.boolean().default(false),
  max_retries: z.number().int().nonnegative().default(0),
  retryable_outcomes: z.array(actionOutcomeSchema).default(['TOOL_ERROR', 'TIMEOUT']),
}).strict();

export const EXECUTION_REUSE_DECISIONS = ['HIT', 'RETRY', 'INVALIDATE', 'EXECUTE'] as const;
export const executionReuseDecisionSchema = z.object({
  schema: z.literal('atlas.execution-reuse-decision.v1').default('atlas.execution-reuse-decision.v1'),
  execution_key: checksum,
  decision: z.enum(EXECUTION_REUSE_DECISIONS),
  hit_kind: z.enum(['SUCCESS', 'FAILURE']).nullable().default(null),
  disposition: z.enum(['REUSE_RESULT', 'SELECT_ALTERNATIVE', 'RETRY_PROPOSED', 'EXECUTE_PROPOSED', 'RECOMPUTE_AFTER_INVALIDATION']),
  prior_event_id: id.nullable().default(null),
  reused_result_ref: id.nullable().default(null),
  world_state_applicable: z.boolean(),
  reason: z.enum([
    'NO_HISTORY',
    'EXACT_SUCCESS_REUSE',
    'EXACT_FAILURE_DO_NOT_REPEAT',
    'TRANSIENT_RETRY_ALLOWED',
    'EXECUTION_KEY_CHANGED',
    'REVISION_AUTHORITY_UNPROVEN',
    'HISTORY_INVALIDATED',
    'INCOMPLETE_PRIOR_EXECUTION',
  ]),
  dry_policy_enforced: z.literal(true).default(true),
  producer_revision: revision,
  decision_checksum: checksum,
}).strict();
export type ExecutionReuseDecisionV1 = z.infer<typeof executionReuseDecisionSchema>;

export const ACTION_TEMPORAL_RELATIONS = [
  'PRECEDES',
  'DEPENDS_ON',
  'RETRIED_AS',
  'SUPERSEDED_BY',
  'INVALIDATED_BY',
  'PRODUCED',
  'CONSUMED',
  'VERIFIED_BY',
  'FAILED_BECAUSE',
] as const;
export const actionTemporalRelationSchema = z.object({
  schema: z.literal('atlas.action-temporal-relation.v1').default('atlas.action-temporal-relation.v1'),
  relation_id: id,
  relation: z.enum(ACTION_TEMPORAL_RELATIONS),
  from_ref: id,
  to_ref: id,
  observed_at: z.string().datetime(),
  evidence_refs: z.array(id).default([]),
  producer_revision: revision,
}).strict();

export const OPENSPEC_ACTION_RELATIONS = ['EXECUTED_BY', 'VERIFIED_BY', 'FAILED_BY', 'SUPERSEDED_BY'] as const;
export const openSpecActionLinkSchema = z.object({
  schema: z.literal('atlas.openspec-action-link.v1').default('atlas.openspec-action-link.v1'),
  change_id: id,
  task_id: id,
  task_revision: revision,
  relation: z.enum(OPENSPEC_ACTION_RELATIONS),
  action_id: id,
  execution_key: checksum,
  evidence_refs: z.array(id).default([]),
  producer_revision: revision,
}).strict();
export type OpenSpecActionLinkV1 = z.infer<typeof openSpecActionLinkSchema>;

export const actionFeatureRowSchema = z.object({
  schema: z.literal('atlas.action-feature-row.v1').default('atlas.action-feature-row.v1'),
  candidate_action_id: id,
  opcode: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  query_class: z.string().min(1).nullable().default(null),
  semantic_affinity: z.number().finite().min(0).max(1),
  structural_affinity: z.number().finite().min(0).max(1),
  query_class_affinity: z.number().finite().min(0).max(1),
  historical_success_rate: z.number().finite().min(0).max(1),
  last_failure_similarity: z.number().finite().min(0).max(1),
  cache_hit_probability: z.number().finite().min(0).max(1),
  expected_information_gain: z.number().finite().min(0).max(1),
  execution_cost: z.number().finite().min(0).max(1),
  latency: z.number().finite().min(0).max(1),
  mutation_risk: z.number().finite().min(0).max(1),
  token_savings: z.number().finite().min(0).max(1),
  dependency_readiness: z.number().finite().min(0).max(1),
  downstream_utility: z.number().finite().min(0).max(1),
  evidence_refs: z.array(id).default([]),
  feature_revision: revision,
}).strict();
export type ActionFeatureRowV1 = z.infer<typeof actionFeatureRowSchema>;

export const nextActionRecommendationSchema = z.object({
  schema: z.literal('atlas.next-action-recommendation.v1').default('atlas.next-action-recommendation.v1'),
  recommendation_id: id,
  workflow_id: id,
  workflow_revision: z.number().int().nonnegative(),
  policy_family: z.enum(['DETERMINISTIC_FULL_SCAN', 'TANG_INSPIRED_LOW_RANK_SHORTLIST']),
  tang_claim: z.literal('INSPIRED_ONLY_NOT_TANG_ALGORITHM').nullable().default(null),
  feature_revision: revision,
  candidates: z.array(z.object({
    candidate_action_id: id,
    rank: z.number().int().positive(),
    score: z.number().finite(),
    execution_key: checksum.nullable().default(null),
    evidence_refs: z.array(id).default([]),
  }).strict()).min(1),
  created_at: z.string().datetime(),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.policy_family === 'TANG_INSPIRED_LOW_RANK_SHORTLIST' && value.tang_claim !== 'INSPIRED_ONLY_NOT_TANG_ALGORITHM') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tang_claim'], message: 'Tang-inspired shortlist must explicitly disclaim implementing Tang\'s algorithm' });
  }
  const ranks = value.candidates.map((candidate) => candidate.rank);
  if (new Set(ranks).size !== ranks.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['candidates'], message: 'recommendation candidate ranks must be unique' });
  }
}).transform((value) => value);
export type NextActionRecommendationV1 = z.infer<typeof nextActionRecommendationSchema>;

export const recommendationOutcomeReceiptSchema = z.object({
  schema: z.literal('atlas.recommendation-outcome-receipt.v1').default('atlas.recommendation-outcome-receipt.v1'),
  recommendation_id: id,
  selected_action_id: id.nullable().default(null),
  followed_recommendation: z.boolean(),
  resulting_execution_key: checksum.nullable().default(null),
  outcome: actionOutcomeSchema.nullable().default(null),
  downstream_success: z.boolean().nullable().default(null),
  evidence_refs: z.array(id).default([]),
  observed_at: z.string().datetime(),
  producer_revision: revision,
}).strict();

export const temporalActionIndexManifestSchema = z.object({
  schema: z.literal('atlas.temporal-action-index-manifest.v1').default('atlas.temporal-action-index-manifest.v1'),
  workspace_id: id,
  ledger_revision: revision,
  event_log_jsonl_ref: id,
  action_latest_arrow_ref: id.nullable().default(null),
  action_by_target_arrow_ref: id.nullable().default(null),
  action_by_opcode_arrow_ref: id.nullable().default(null),
  action_by_outcome_arrow_ref: id.nullable().default(null),
  action_by_error_arrow_ref: id.nullable().default(null),
  workspace_snapshot_map_arrow_ref: id.nullable().default(null),
  receipt_ref: id,
  event_count: z.number().int().nonnegative(),
  event_log_checksum: checksum,
  projection_checksum: checksum.nullable().default(null),
  canonical_event_owner: z.literal('WORKFLOW_RUNTIME').default('WORKFLOW_RUNTIME'),
  projection_authority: z.literal('DERIVED').default('DERIVED'),
  producer_revision: revision,
}).strict();

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function temporalActionChecksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function relevantCoordinate(applicability: TemporalApplicabilityV1, dimension: z.infer<typeof temporalRevisionDimensionSchema>) {
  if (dimension === 'workspace') return applicability.workspace_revision;
  if (dimension === 'source') return applicability.source_revision;
  return applicability.graph_revision;
}

export function temporalApplicabilityIsReusable(input: z.input<typeof temporalApplicabilitySchema>): boolean {
  const value = temporalApplicabilitySchema.parse(input);
  return value.relevant_dimensions.every((dimension) => {
    const coordinate = relevantCoordinate(value, dimension);
    return coordinate.authority === 'PROVEN' && coordinate.value !== null;
  });
}

export function buildActionExecutionKey(input: z.input<typeof actionExecutionDescriptorSchema>): string {
  const descriptor = actionExecutionDescriptorSchema.parse(input);
  const revisions = descriptor.applicability.relevant_dimensions.map((dimension) => {
    const coordinate = relevantCoordinate(descriptor.applicability, dimension);
    return { dimension, value: coordinate.value, authority: coordinate.authority };
  });
  return temporalActionChecksum({
    opcode: descriptor.opcode,
    query_class: descriptor.query_class,
    target: descriptor.target,
    input_hash: descriptor.input_hash,
    implementation_revision: descriptor.implementation_revision,
    parameter_revision: descriptor.parameter_revision,
    context_manifest_hash: descriptor.context_manifest_hash,
    evidence_frontier_hash: descriptor.applicability.evidence_frontier_hash,
    revisions,
  });
}

export function buildAgentActionEvent(
  input: Omit<z.input<typeof agentActionEventSchema>, 'schema' | 'execution_key' | 'event_checksum'>,
): AgentActionEventV1 {
  const descriptor = actionExecutionDescriptorSchema.parse(input.descriptor);
  const executionKey = buildActionExecutionKey(descriptor);
  const raw = {
    schema: 'atlas.agent-action-event.v1' as const,
    ...input,
    descriptor,
    execution_key: executionKey,
  };
  return agentActionEventSchema.parse({ ...raw, event_checksum: temporalActionChecksum(raw) });
}

const SUCCESS_OUTCOMES = new Set<ActionOutcomeV1>(['SUCCESS_EXACT', 'SUCCESS_PARTIAL', 'CACHE_HIT']);
export function isSuccessfulOutcome(outcome: ActionOutcomeV1 | null): boolean {
  return outcome !== null && SUCCESS_OUTCOMES.has(outcome);
}

export function projectActionCurrent(eventsInput: readonly z.input<typeof agentActionEventSchema>[]): ActionCurrentProjectionV1 {
  if (eventsInput.length === 0) throw new Error('ACTION_EVENTS_REQUIRED');
  const events = eventsInput.map((event) => agentActionEventSchema.parse(event));
  const executionKeys = new Set(events.map((event) => event.execution_key));
  if (executionKeys.size !== 1) throw new Error('ACTION_CURRENT_REQUIRES_ONE_EXECUTION_KEY');
  const sequences = events.map((event) => event.ledger_sequence);
  if (new Set(sequences).size !== sequences.length) throw new Error('ACTION_LEDGER_SEQUENCE_DUPLICATE');
  const ordered = [...events].sort((a, b) => a.ledger_sequence - b.ledger_sequence);
  const latest = ordered.at(-1)!;
  let lastSuccess: AgentActionEventV1 | null = null;
  let lastFailure: AgentActionEventV1 | null = null;
  let retryCount = 0;
  for (const event of ordered) {
    if (event.state === 'RETRIED') retryCount += 1;
    if (event.state === 'FINALIZED' && isSuccessfulOutcome(event.outcome)) lastSuccess = event;
    if (event.state === 'FINALIZED' && event.outcome !== null && !isSuccessfulOutcome(event.outcome)) lastFailure = event;
  }
  const raw = {
    schema: 'atlas.action-current-projection.v1' as const,
    execution_key: latest.execution_key,
    action_id: latest.workflow_action.action_id,
    latest_event_id: latest.event_id,
    latest_ledger_sequence: latest.ledger_sequence,
    latest_state: latest.state,
    latest_outcome: latest.outcome,
    latest_result_ref: latest.result_ref,
    latest_error_code: latest.error_code,
    latest_observed_at: latest.observed_at,
    descriptor: latest.descriptor,
    last_success_event_id: lastSuccess?.event_id ?? null,
    last_failure_event_id: lastFailure?.event_id ?? null,
    retry_count: retryCount,
    event_count: ordered.length,
    stale: latest.state === 'INVALIDATED' || latest.state === 'SUPERSEDED',
  };
  return actionCurrentProjectionSchema.parse({ ...raw, projection_checksum: temporalActionChecksum(raw) });
}

export function decideExecutionReuse(input: {
  descriptor: z.input<typeof actionExecutionDescriptorSchema>;
  current: z.input<typeof actionCurrentProjectionSchema> | null;
  retry_policy: z.input<typeof executionRetryPolicySchema>;
  producer_revision: string;
}): ExecutionReuseDecisionV1 {
  const descriptor = actionExecutionDescriptorSchema.parse(input.descriptor);
  const current = input.current ? actionCurrentProjectionSchema.parse(input.current) : null;
  const retryPolicy = executionRetryPolicySchema.parse(input.retry_policy);
  const executionKey = buildActionExecutionKey(descriptor);
  const worldStateApplicable = temporalApplicabilityIsReusable(descriptor.applicability);

  let payload: Omit<ExecutionReuseDecisionV1, 'decision_checksum' | 'schema'>;
  if (!current) {
    payload = {
      execution_key: executionKey,
      decision: 'EXECUTE',
      hit_kind: null,
      disposition: 'EXECUTE_PROPOSED',
      prior_event_id: null,
      reused_result_ref: null,
      world_state_applicable: worldStateApplicable,
      reason: worldStateApplicable ? 'NO_HISTORY' : 'REVISION_AUTHORITY_UNPROVEN',
      dry_policy_enforced: true,
      producer_revision: input.producer_revision,
    };
  } else if (current.execution_key !== executionKey) {
    payload = {
      execution_key: executionKey,
      decision: 'INVALIDATE',
      hit_kind: null,
      disposition: 'RECOMPUTE_AFTER_INVALIDATION',
      prior_event_id: current.latest_event_id,
      reused_result_ref: null,
      world_state_applicable: worldStateApplicable,
      reason: 'EXECUTION_KEY_CHANGED',
      dry_policy_enforced: true,
      producer_revision: input.producer_revision,
    };
  } else if (!worldStateApplicable) {
    payload = {
      execution_key: executionKey,
      decision: 'INVALIDATE',
      hit_kind: null,
      disposition: 'RECOMPUTE_AFTER_INVALIDATION',
      prior_event_id: current.latest_event_id,
      reused_result_ref: null,
      world_state_applicable: false,
      reason: 'REVISION_AUTHORITY_UNPROVEN',
      dry_policy_enforced: true,
      producer_revision: input.producer_revision,
    };
  } else if (current.stale) {
    payload = {
      execution_key: executionKey,
      decision: 'INVALIDATE',
      hit_kind: null,
      disposition: 'RECOMPUTE_AFTER_INVALIDATION',
      prior_event_id: current.latest_event_id,
      reused_result_ref: null,
      world_state_applicable: true,
      reason: 'HISTORY_INVALIDATED',
      dry_policy_enforced: true,
      producer_revision: input.producer_revision,
    };
  } else if (current.latest_state === 'FINALIZED' && isSuccessfulOutcome(current.latest_outcome)) {
    payload = {
      execution_key: executionKey,
      decision: 'HIT',
      hit_kind: 'SUCCESS',
      disposition: 'REUSE_RESULT',
      prior_event_id: current.latest_event_id,
      reused_result_ref: current.latest_result_ref,
      world_state_applicable: true,
      reason: 'EXACT_SUCCESS_REUSE',
      dry_policy_enforced: true,
      producer_revision: input.producer_revision,
    };
  } else if (current.latest_state === 'FINALIZED' && current.latest_outcome !== null) {
    const retryable = retryPolicy.allow_transient_retry
      && retryPolicy.retryable_outcomes.includes(current.latest_outcome)
      && current.retry_count < retryPolicy.max_retries;
    payload = retryable ? {
      execution_key: executionKey,
      decision: 'RETRY',
      hit_kind: 'FAILURE',
      disposition: 'RETRY_PROPOSED',
      prior_event_id: current.latest_event_id,
      reused_result_ref: null,
      world_state_applicable: true,
      reason: 'TRANSIENT_RETRY_ALLOWED',
      dry_policy_enforced: true,
      producer_revision: input.producer_revision,
    } : {
      execution_key: executionKey,
      decision: 'HIT',
      hit_kind: 'FAILURE',
      disposition: 'SELECT_ALTERNATIVE',
      prior_event_id: current.latest_event_id,
      reused_result_ref: null,
      world_state_applicable: true,
      reason: 'EXACT_FAILURE_DO_NOT_REPEAT',
      dry_policy_enforced: true,
      producer_revision: input.producer_revision,
    };
  } else {
    payload = {
      execution_key: executionKey,
      decision: 'EXECUTE',
      hit_kind: null,
      disposition: 'EXECUTE_PROPOSED',
      prior_event_id: current.latest_event_id,
      reused_result_ref: null,
      world_state_applicable: true,
      reason: 'INCOMPLETE_PRIOR_EXECUTION',
      dry_policy_enforced: true,
      producer_revision: input.producer_revision,
    };
  }

  const raw = { schema: 'atlas.execution-reuse-decision.v1' as const, ...payload };
  return executionReuseDecisionSchema.parse({ ...raw, decision_checksum: temporalActionChecksum(raw) });
}

export function describeTemporalActionLedger(): string {
  return [
    'WorkflowActionEventV1 remains the canonical workflow/action identity owner; AgentActionEventV1 is an immutable execution-history envelope keyed by deterministic ActionExecutionKey.',
    'The action ledger is append-only. ActionCurrentProjectionV1 is derived state and may be rebuilt from events; it is not canonical history.',
    'DRY reuse is revision-aware: exact successful execution keys are reused only when every relevant revision coordinate is PROVEN. Exact failures are also hits so the executor can select an alternative instead of repeating a known failure.',
    'Action results live in content-addressed artifacts referenced by result_ref/artifact_refs; the temporal index maps execution identity to history and does not become the artifact store.',
    'OpenSpec describes intended work. OpenSpecActionLinkV1 connects task revisions to observed action history without turning tasks.md into an execution log.',
    'Tang-inspired action recommendation is only a shortlist policy label. Atlas does not claim Ewin Tang\'s recommendation algorithm unless its length-square sampling/data-structure assumptions are actually implemented and proven.',
  ].join(' ');
}
