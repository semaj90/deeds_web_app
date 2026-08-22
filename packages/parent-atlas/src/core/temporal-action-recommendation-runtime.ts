import { z } from 'zod';
import {
  actionFeatureRowSchema,
  agentActionEventSchema,
  isSuccessfulOutcome,
  nextActionRecommendationSchema,
  openSpecActionLinkSchema,
  temporalActionChecksum,
  type ActionFeatureRowV1,
  type AgentActionEventV1,
  type NextActionRecommendationV1,
  type OpenSpecActionLinkV1,
} from './temporal-action-ledger.js';

const id = z.string().min(1);
const revision = z.string().min(1);

export const historicalActionAggregateSchema = z.object({
  schema: z.literal('atlas.historical-action-aggregate.v1'),
  opcode: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  query_class: z.string().min(1).nullable(),
  target_class: z.string().min(1),
  finalized_attempts: z.number().int().nonnegative(),
  success_count: z.number().int().nonnegative(),
  exact_success_count: z.number().int().nonnegative(),
  failure_count: z.number().int().nonnegative(),
  no_result_count: z.number().int().nonnegative(),
  cache_hit_count: z.number().int().nonnegative(),
  historical_success_rate: z.number().finite().min(0).max(1),
  cache_hit_probability: z.number().finite().min(0).max(1),
  mean_latency_ms: z.number().finite().nonnegative().nullable(),
  mean_tokens: z.number().finite().nonnegative().nullable(),
  latest_outcome: z.string().min(1).nullable(),
  latest_failure_event_id: id.nullable(),
  latest_failure_error_code: z.string().min(1).nullable(),
  evidence_refs: z.array(id),
  aggregate_checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type HistoricalActionAggregateV1 = z.infer<typeof historicalActionAggregateSchema>;

export const actionFeatureCandidateInputSchema = z.object({
  candidate_action_id: id,
  opcode: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  query_class: z.string().min(1).nullable().default(null),
  target_class: z.string().min(1),
  semantic_affinity: z.number().finite().min(0).max(1),
  structural_affinity: z.number().finite().min(0).max(1),
  query_class_affinity: z.number().finite().min(0).max(1),
  expected_information_gain: z.number().finite().min(0).max(1),
  execution_cost: z.number().finite().min(0).max(1),
  estimated_latency: z.number().finite().min(0).max(1),
  mutation_risk: z.number().finite().min(0).max(1),
  token_savings: z.number().finite().min(0).max(1),
  dependency_readiness: z.number().finite().min(0).max(1),
  downstream_utility: z.number().finite().min(0).max(1),
  latency_budget_ms: z.number().finite().positive().default(5_000),
  prior_failure_error_code: z.string().min(1).nullable().default(null),
  evidence_refs: z.array(id).default([]),
  feature_revision: revision,
}).strict();
export type ActionFeatureCandidateInputV1 = z.infer<typeof actionFeatureCandidateInputSchema>;

function verifyEvent(eventInput: unknown): AgentActionEventV1 {
  const event = agentActionEventSchema.parse(eventInput);
  const { event_checksum, ...withoutChecksum } = event;
  const actual = temporalActionChecksum(withoutChecksum);
  if (actual !== event_checksum) throw new Error(`ACTION_EVENT_CHECKSUM_MISMATCH:${event.event_id}`);
  return event;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function aggregateHistoricalActions(input: {
  events: readonly unknown[];
  opcode: string;
  query_class: string | null;
  target_class: string;
}): HistoricalActionAggregateV1 {
  const finalized = input.events
    .map(verifyEvent)
    .filter((event) => event.state === 'FINALIZED')
    .filter((event) => event.descriptor.opcode === input.opcode)
    .filter((event) => event.descriptor.query_class === input.query_class)
    .filter((event) => event.descriptor.target.target_class === input.target_class)
    .sort((a, b) => a.ledger_sequence - b.ledger_sequence);

  const successes = finalized.filter((event) => isSuccessfulOutcome(event.outcome));
  const failures = finalized.filter((event) => event.outcome !== null && !isSuccessfulOutcome(event.outcome));
  const exactSuccesses = finalized.filter((event) => event.outcome === 'SUCCESS_EXACT');
  const noResults = finalized.filter((event) => event.outcome === 'NO_RESULT');
  const cacheHits = finalized.filter((event) => event.outcome === 'CACHE_HIT');
  const latencyValues = finalized.flatMap((event) => event.cost.latency_ms === null ? [] : [event.cost.latency_ms]);
  const tokenValues = finalized.flatMap((event) => event.cost.tokens === null ? [] : [event.cost.tokens]);
  const latest = finalized.at(-1) ?? null;
  const latestFailure = failures.at(-1) ?? null;
  const attempts = finalized.length;
  const raw = {
    schema: 'atlas.historical-action-aggregate.v1' as const,
    opcode: input.opcode,
    query_class: input.query_class,
    target_class: input.target_class,
    finalized_attempts: attempts,
    success_count: successes.length,
    exact_success_count: exactSuccesses.length,
    failure_count: failures.length,
    no_result_count: noResults.length,
    cache_hit_count: cacheHits.length,
    historical_success_rate: attempts === 0 ? 0 : successes.length / attempts,
    cache_hit_probability: attempts === 0 ? 0 : cacheHits.length / attempts,
    mean_latency_ms: mean(latencyValues),
    mean_tokens: mean(tokenValues),
    latest_outcome: latest?.outcome ?? null,
    latest_failure_event_id: latestFailure?.event_id ?? null,
    latest_failure_error_code: latestFailure?.error_code ?? null,
    evidence_refs: finalized.map((event) => event.event_id),
  };
  return historicalActionAggregateSchema.parse({
    ...raw,
    aggregate_checksum: temporalActionChecksum(raw),
  });
}

export function compileActionFeatureRowFromHistory(input: {
  candidate: z.input<typeof actionFeatureCandidateInputSchema>;
  events: readonly unknown[];
}): ActionFeatureRowV1 {
  const candidate = actionFeatureCandidateInputSchema.parse(input.candidate);
  const aggregate = aggregateHistoricalActions({
    events: input.events,
    opcode: candidate.opcode,
    query_class: candidate.query_class,
    target_class: candidate.target_class,
  });
  const historicalLatency = aggregate.mean_latency_ms === null
    ? candidate.estimated_latency
    : clamp01(aggregate.mean_latency_ms / candidate.latency_budget_ms);
  const failureSimilarity = candidate.prior_failure_error_code !== null
    && aggregate.latest_failure_error_code !== null
    && candidate.prior_failure_error_code === aggregate.latest_failure_error_code
    ? 1
    : 0;
  const evidenceRefs = [...new Set([...candidate.evidence_refs, ...aggregate.evidence_refs])].sort();

  return actionFeatureRowSchema.parse({
    schema: 'atlas.action-feature-row.v1',
    candidate_action_id: candidate.candidate_action_id,
    opcode: candidate.opcode,
    query_class: candidate.query_class,
    semantic_affinity: candidate.semantic_affinity,
    structural_affinity: candidate.structural_affinity,
    query_class_affinity: candidate.query_class_affinity,
    historical_success_rate: aggregate.historical_success_rate,
    last_failure_similarity: failureSimilarity,
    cache_hit_probability: aggregate.cache_hit_probability,
    expected_information_gain: candidate.expected_information_gain,
    execution_cost: candidate.execution_cost,
    latency: historicalLatency,
    mutation_risk: candidate.mutation_risk,
    token_savings: candidate.token_savings,
    dependency_readiness: candidate.dependency_readiness,
    downstream_utility: candidate.downstream_utility,
    evidence_refs: evidenceRefs,
    feature_revision: candidate.feature_revision,
  });
}

export function scoreActionFeatureRow(rowInput: z.input<typeof actionFeatureRowSchema>): number {
  const row = actionFeatureRowSchema.parse(rowInput);
  const positive =
    0.14 * row.semantic_affinity
    + 0.16 * row.structural_affinity
    + 0.08 * row.query_class_affinity
    + 0.16 * row.historical_success_rate
    + 0.08 * row.cache_hit_probability
    + 0.18 * row.expected_information_gain
    + 0.05 * row.token_savings
    + 0.08 * row.dependency_readiness
    + 0.07 * row.downstream_utility;
  const penalty =
    0.10 * row.execution_cost
    + 0.08 * row.latency
    + 0.14 * row.mutation_risk
    + 0.12 * row.last_failure_similarity;
  return Math.fround(positive - penalty);
}

export function recommendNextActionsDeterministic(input: {
  workflow_id: string;
  workflow_revision: number;
  rows: readonly z.input<typeof actionFeatureRowSchema>[];
  execution_keys?: Readonly<Record<string, string | null>>;
  created_at: string;
  producer_revision: string;
}): NextActionRecommendationV1 {
  if (input.rows.length === 0) throw new Error('ACTION_RECOMMENDATION_ROWS_REQUIRED');
  const parsedRows = input.rows.map((row) => actionFeatureRowSchema.parse(row));
  const featureRevisions = new Set(parsedRows.map((row) => row.feature_revision));
  if (featureRevisions.size !== 1) throw new Error('ACTION_RECOMMENDATION_MIXED_FEATURE_REVISION');
  const ranked = parsedRows
    .map((row) => ({ row, score: scoreActionFeatureRow(row) }))
    .sort((a, b) => b.score - a.score || a.row.candidate_action_id.localeCompare(b.row.candidate_action_id));
  const recommendationIdentity = {
    workflow_id: input.workflow_id,
    workflow_revision: input.workflow_revision,
    feature_revision: parsedRows[0]!.feature_revision,
    created_at: input.created_at,
    candidates: ranked.map(({ row, score }) => ({ candidate_action_id: row.candidate_action_id, score })),
  };
  return nextActionRecommendationSchema.parse({
    schema: 'atlas.next-action-recommendation.v1',
    recommendation_id: `rec:${temporalActionChecksum(recommendationIdentity).slice(0, 24)}`,
    workflow_id: input.workflow_id,
    workflow_revision: input.workflow_revision,
    policy_family: 'DETERMINISTIC_FULL_SCAN',
    tang_claim: null,
    feature_revision: parsedRows[0]!.feature_revision,
    candidates: ranked.map(({ row, score }, index) => ({
      candidate_action_id: row.candidate_action_id,
      rank: index + 1,
      score,
      execution_key: input.execution_keys?.[row.candidate_action_id] ?? null,
      evidence_refs: row.evidence_refs,
    })),
    created_at: input.created_at,
    producer_revision: input.producer_revision,
  });
}

export function compileOpenSpecActionLink(input: {
  change_id: string;
  task_id: string;
  task_revision: string;
  relation: OpenSpecActionLinkV1['relation'];
  event: unknown;
  producer_revision: string;
  evidence_refs?: readonly string[];
}): OpenSpecActionLinkV1 {
  const event = verifyEvent(input.event);
  const successful = event.state === 'FINALIZED' && isSuccessfulOutcome(event.outcome);
  const failed = event.state === 'FINALIZED' && event.outcome !== null && !isSuccessfulOutcome(event.outcome);
  const superseded = event.state === 'SUPERSEDED' || event.outcome === 'SUPERSEDED';

  if (input.relation === 'VERIFIED_BY' && !successful) {
    throw new Error(`OPENSPEC_ACTION_RELATION_INVALID:VERIFIED_BY:${event.event_id}`);
  }
  if (input.relation === 'FAILED_BY' && !failed) {
    throw new Error(`OPENSPEC_ACTION_RELATION_INVALID:FAILED_BY:${event.event_id}`);
  }
  if (input.relation === 'SUPERSEDED_BY' && !superseded) {
    throw new Error(`OPENSPEC_ACTION_RELATION_INVALID:SUPERSEDED_BY:${event.event_id}`);
  }

  return openSpecActionLinkSchema.parse({
    schema: 'atlas.openspec-action-link.v1',
    change_id: input.change_id,
    task_id: input.task_id,
    task_revision: input.task_revision,
    relation: input.relation,
    action_id: event.workflow_action.action_id,
    execution_key: event.execution_key,
    evidence_refs: [...new Set([event.event_id, ...event.evidence_refs, ...(input.evidence_refs ?? [])])].sort(),
    producer_revision: input.producer_revision,
  });
}
