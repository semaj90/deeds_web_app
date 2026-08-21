import { z } from 'zod';
import { AgentActionEventV1Schema, type AgentActionEventV1 } from './agent-action-event-v1.js';

const S = z.string().min(1);

export const ActionCurrentProjectionV1Schema = z.object({
  schema: z.literal('atlas.action-current.v1'),
  executionKey: S,
  actionId: S,
  latestEventId: S,
  latestObservedAt: z.string().datetime(),
  latestState: AgentActionEventV1Schema.shape.lifecycleState,
  latestOutcome: AgentActionEventV1Schema.shape.outcome,
  lastSuccessEventId: S.nullable(),
  lastFailureEventId: S.nullable(),
  retryCount: z.number().int().min(0),
  stale: z.boolean(),
  workspaceRevision: S,
  sourceRevisions: z.array(S),
  graphRevision: S.nullable(),
  representationRevision: S.nullable(),
  producerRevision: S,
  resultRef: S.nullable(),
}).strict();
export type ActionCurrentProjectionV1 = z.infer<typeof ActionCurrentProjectionV1Schema>;

export const ExecutionReuseDecisionV1Schema = z.object({
  schema: z.literal('atlas.execution-reuse-decision.v1'),
  executionKey: S,
  decision: z.enum(['HIT','RETRY','INVALIDATE','EXECUTE','BLOCK']),
  reasonCodes: z.array(S).min(1),
  reusableResultRef: S.nullable(),
  priorEventId: S.nullable(),
}).strict();
export type ExecutionReuseDecisionV1 = z.infer<typeof ExecutionReuseDecisionV1Schema>;

const FAILURE_OUTCOMES = new Set([
  'NO_RESULT','STALE_RESULT','INVALID_IDENTITY','PARSE_ERROR','TOOL_ERROR','TIMEOUT','TEST_FAILED',
  'TYPECHECK_FAILED','MUTATION_REJECTED','POLICY_REJECTED',
]);
const SUCCESS_OUTCOMES = new Set(['SUCCESS_EXACT','SUCCESS_PARTIAL','CACHE_HIT']);

export function buildActionCurrentProjection(events: AgentActionEventV1[]): ActionCurrentProjectionV1[] {
  const parsed = events.map((event) => AgentActionEventV1Schema.parse(event));
  const byExecution = new Map<string, AgentActionEventV1[]>();
  for (const event of parsed) {
    const list = byExecution.get(event.executionKey) ?? [];
    list.push(event);
    byExecution.set(event.executionKey, list);
  }

  return [...byExecution.entries()].map(([executionKey, group]) => {
    const ordered = [...group].sort((a, b) => a.applicability.observedAt.localeCompare(b.applicability.observedAt) || a.eventId.localeCompare(b.eventId));
    const latest = ordered.at(-1)!;
    const lastSuccess = [...ordered].reverse().find((event) => event.outcome && SUCCESS_OUTCOMES.has(event.outcome));
    const lastFailure = [...ordered].reverse().find((event) => event.outcome && FAILURE_OUTCOMES.has(event.outcome));
    return ActionCurrentProjectionV1Schema.parse({
      schema: 'atlas.action-current.v1',
      executionKey,
      actionId: latest.actionId,
      latestEventId: latest.eventId,
      latestObservedAt: latest.applicability.observedAt,
      latestState: latest.lifecycleState,
      latestOutcome: latest.outcome,
      lastSuccessEventId: lastSuccess?.eventId ?? null,
      lastFailureEventId: lastFailure?.eventId ?? null,
      retryCount: ordered.filter((event) => event.lifecycleState === 'RETRIED').length,
      stale: latest.lifecycleState === 'INVALIDATED' || latest.outcome === 'STALE_RESULT',
      workspaceRevision: latest.applicability.workspaceRevision,
      sourceRevisions: latest.applicability.sourceRevisions,
      graphRevision: latest.applicability.graphRevision,
      representationRevision: latest.applicability.representationRevision,
      producerRevision: latest.applicability.producerRevision,
      resultRef: latest.resultRef,
    });
  }).sort((a, b) => a.executionKey.localeCompare(b.executionKey));
}

export function decideExecutionReuse(input: {
  executionKey: string;
  current?: ActionCurrentProjectionV1 | null;
  allowRetry?: boolean;
  evidenceFrontierChanged?: boolean;
}): ExecutionReuseDecisionV1 {
  const current = input.current ?? null;
  if (!current) return ExecutionReuseDecisionV1Schema.parse({
    schema: 'atlas.execution-reuse-decision.v1', executionKey: input.executionKey, decision: 'EXECUTE',
    reasonCodes: ['NO_PRIOR_EXECUTION'], reusableResultRef: null, priorEventId: null,
  });
  if (current.executionKey !== input.executionKey) throw new Error('executionKey mismatch');
  if (current.stale || current.latestState === 'INVALIDATED') return ExecutionReuseDecisionV1Schema.parse({
    schema: 'atlas.execution-reuse-decision.v1', executionKey: input.executionKey, decision: 'INVALIDATE',
    reasonCodes: ['PRIOR_RESULT_STALE'], reusableResultRef: null, priorEventId: current.latestEventId,
  });
  if ((current.latestOutcome === 'SUCCESS_EXACT' || current.latestOutcome === 'CACHE_HIT') && current.latestState === 'FINALIZED') {
    return ExecutionReuseDecisionV1Schema.parse({
      schema: 'atlas.execution-reuse-decision.v1', executionKey: input.executionKey, decision: 'HIT',
      reasonCodes: ['EXACT_EXECUTION_KEY_FINALIZED_SUCCESS','DRY_DO_NOT_REPEAT'], reusableResultRef: current.resultRef,
      priorEventId: current.latestEventId,
    });
  }
  if (current.latestOutcome && FAILURE_OUTCOMES.has(current.latestOutcome)) {
    const retry = Boolean(input.allowRetry || input.evidenceFrontierChanged);
    return ExecutionReuseDecisionV1Schema.parse({
      schema: 'atlas.execution-reuse-decision.v1', executionKey: input.executionKey, decision: retry ? 'RETRY' : 'BLOCK',
      reasonCodes: retry ? ['PRIOR_FAILURE','RETRY_POLICY_OR_NEW_EVIDENCE'] : ['PRIOR_FAILURE','NO_INVALIDATING_CHANGE'],
      reusableResultRef: null, priorEventId: current.latestEventId,
    });
  }
  return ExecutionReuseDecisionV1Schema.parse({
    schema: 'atlas.execution-reuse-decision.v1', executionKey: input.executionKey, decision: 'EXECUTE',
    reasonCodes: ['NO_REUSABLE_FINAL_RESULT'], reusableResultRef: null, priorEventId: current.latestEventId,
  });
}
