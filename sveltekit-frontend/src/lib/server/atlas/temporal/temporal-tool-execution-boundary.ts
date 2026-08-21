import { z } from 'zod';

import {
  actionExecutionDescriptorSchema,
  buildActionExecutionKey,
  createTemporalActionPostgresRepository,
  decideExecutionReuse,
  executionRetryPolicySchema,
  temporalActionChecksum,
  type ActionCurrentProjectionV1,
  type ExecutionReuseDecisionV1,
} from '@deeds/parent-atlas';

const id = z.string().min(1);

export const temporalToolExecutionContextSchema = z.object({
  schema: z.literal('atlas.temporal-tool-execution-context.v1').default('atlas.temporal-tool-execution-context.v1'),
  expected_tool: id,
  descriptor: actionExecutionDescriptorSchema,
  retry_policy: executionRetryPolicySchema,
  producer_revision: id,
}).strict();
export type TemporalToolExecutionContextV1 = z.infer<typeof temporalToolExecutionContextSchema>;

export const temporalToolBoundaryDecisionSchema = z.object({
  schema: z.literal('atlas.temporal-tool-boundary-decision.v1'),
  execution_key: z.string().regex(/^[a-f0-9]{64}$/),
  tool: id,
  disposition: z.enum([
    'REUSE_RESULT',
    'SELECT_ALTERNATIVE',
    'DISPATCH_RETRY',
    'DISPATCH_RECOMPUTE',
    'DISPATCH_EXECUTE',
  ]),
  reused_result_ref: id.nullable(),
  prior_event_id: id.nullable(),
  lookup_event_count: z.number().int().nonnegative(),
  reuse_decision: z.enum(['HIT', 'RETRY', 'INVALIDATE', 'EXECUTE']),
  reason: id,
  boundary_checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type TemporalToolBoundaryDecisionV1 = z.infer<typeof temporalToolBoundaryDecisionSchema>;

export type TemporalActionCurrentLookup = (executionKey: string) => Promise<{
  current: ActionCurrentProjectionV1 | null;
  eventCount: number;
}>;

function canonicalToolCall(call: { tool: string; args: unknown }) {
  return {
    tool: String(call.tool).trim(),
    args: call.args ?? {},
  };
}

/**
 * Hashes the exact tool name + arguments that are about to cross the side-effect
 * boundary. Callers should place this value in ActionExecutionDescriptorV1.input_hash.
 */
export function buildTemporalToolInputHash(call: { tool: string; args: unknown }): string {
  return temporalActionChecksum(canonicalToolCall(call));
}

function dispositionForDecision(decision: ExecutionReuseDecisionV1): TemporalToolBoundaryDecisionV1['disposition'] {
  if (decision.decision === 'HIT' && decision.hit_kind === 'SUCCESS') return 'REUSE_RESULT';
  if (decision.decision === 'HIT' && decision.hit_kind === 'FAILURE') return 'SELECT_ALTERNATIVE';
  if (decision.decision === 'RETRY') return 'DISPATCH_RETRY';
  if (decision.decision === 'INVALIDATE') return 'DISPATCH_RECOMPUTE';
  return 'DISPATCH_EXECUTE';
}

/**
 * Pure pre-dispatch policy seam. It never executes the tool.
 *
 * The descriptor is bound to the concrete tool call by both expected_tool and
 * input_hash. This prevents a reusable result for one call from being applied to
 * a different tool/argument payload that happened to carry the same workflow ID.
 */
export async function decideTemporalToolExecution(input: {
  call: { tool: string; args: unknown };
  temporal: z.input<typeof temporalToolExecutionContextSchema>;
  lookupCurrent: TemporalActionCurrentLookup;
}): Promise<TemporalToolBoundaryDecisionV1> {
  const temporal = temporalToolExecutionContextSchema.parse(input.temporal);
  const call = canonicalToolCall(input.call);
  if (!call.tool) throw new Error('TEMPORAL_TOOL_NAME_REQUIRED');
  if (temporal.expected_tool !== call.tool) {
    throw new Error(`TEMPORAL_TOOL_IDENTITY_MISMATCH:expected=${temporal.expected_tool}:actual=${call.tool}`);
  }

  const actualInputHash = buildTemporalToolInputHash(call);
  if (temporal.descriptor.input_hash !== actualInputHash) {
    throw new Error(
      `TEMPORAL_TOOL_INPUT_HASH_MISMATCH:expected=${temporal.descriptor.input_hash}:actual=${actualInputHash}`,
    );
  }

  const executionKey = buildActionExecutionKey(temporal.descriptor);
  const lookup = await input.lookupCurrent(executionKey);
  const reuse = decideExecutionReuse({
    descriptor: temporal.descriptor,
    current: lookup.current,
    retry_policy: temporal.retry_policy,
    producer_revision: temporal.producer_revision,
  });
  const disposition = dispositionForDecision(reuse);
  if (disposition === 'REUSE_RESULT' && !reuse.reused_result_ref) {
    throw new Error(`TEMPORAL_REUSE_RESULT_REF_MISSING:${reuse.prior_event_id ?? executionKey}`);
  }

  const raw = {
    schema: 'atlas.temporal-tool-boundary-decision.v1' as const,
    execution_key: executionKey,
    tool: call.tool,
    disposition,
    reused_result_ref: reuse.reused_result_ref,
    prior_event_id: reuse.prior_event_id,
    lookup_event_count: lookup.eventCount,
    reuse_decision: reuse.decision,
    reason: reuse.reason,
  };
  return temporalToolBoundaryDecisionSchema.parse({
    ...raw,
    boundary_checksum: temporalActionChecksum(raw),
  });
}

/**
 * Live Postgres-backed lookup used only when a caller explicitly supplies
 * temporalAction context. Legacy tool callers do not touch the temporal ledger.
 *
 * Once temporal execution is opted in, lookup failure is intentionally fatal:
 * silently executing after a history-store failure would violate DRY semantics.
 */
export async function decideTemporalToolExecutionFromPostgres(input: {
  call: { tool: string; args: unknown };
  temporal: z.input<typeof temporalToolExecutionContextSchema>;
}): Promise<TemporalToolBoundaryDecisionV1> {
  const temporal = temporalToolExecutionContextSchema.parse(input.temporal);
  const { pool } = await import('$lib/server/db/client.js');
  const repository = createTemporalActionPostgresRepository(pool);
  return decideTemporalToolExecution({
    ...input,
    temporal,
    lookupCurrent: async (executionKey) => {
      const lookup = await repository.currentByExecutionKey(executionKey, temporal.producer_revision);
      return {
        current: lookup.current,
        eventCount: lookup.receipt.event_count,
      };
    },
  });
}

export function temporalBoundaryAllowsDispatch(decision: TemporalToolBoundaryDecisionV1): boolean {
  return decision.disposition.startsWith('DISPATCH_');
}
