/**
 * Agent run service — single owner of all workflow_runs state mutations.
 *
 * Both the workflow router and agent router call these functions.
 * Neither router duplicates transition logic, outbox writes, or audit events.
 *
 * Invariants enforced here:
 *   - Transitions are validated against the allowed table in run-status.ts
 *   - The Postgres mutation and its outbox event commit in the same transaction
 *   - Cancellation uses status 'cancelled', not 'failed'
 *   - Approval is idempotent (UNIQUE run_id + approval_id enforced in DB)
 *
 * Transaction pattern:
 *   All public functions accept an optional `DbExecutor` so callers can
 *   compose multiple mutations in a single transaction.  When no executor is
 *   supplied the function opens its own transaction.
 *
 *   Callers that need atomicity:
 *     await db.transaction(async (tx) => {
 *       await cancelRun(runId, userId, tx as DbExecutor);
 *       await doSomethingElse(tx as DbExecutor);
 *     });
 *
 *   Standalone callers (most routers):
 *     await cancelRun(runId, userId);   // opens its own transaction
 */

import { TRPCError } from '@trpc/server';
import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import {
  type AgentRunStatus,
  agentRunStatusSchema,
  isTransitionAllowed,
  isTerminal,
} from './run-status.js';

// ---------------------------------------------------------------------------
// DbExecutor — the minimal interface both db and tx satisfy
// ---------------------------------------------------------------------------

// Drizzle's transaction callback receives an object with the same .execute()
// signature as the root db client.  Using `typeof db` for tx parameters is a
// common but fragile pattern because the Drizzle transaction type is narrower.
// We use Parameters<typeof db.transaction>[0] to extract what Drizzle actually
// passes into the callback, giving us the correct type without casting.
type DrizzleTxCallback = Parameters<typeof db.transaction>[0];
type DrizzleTx = Parameters<DrizzleTxCallback>[0];

// A DbExecutor is either the root db client or an active transaction handle.
export type DbExecutor = typeof db | DrizzleTx;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Fetch a run row and enforce ownership. Throws NOT_FOUND or FORBIDDEN. */
export async function assertRunOwner(
  runId: string,
  userId: number,
  executor: DbExecutor = db
): Promise<Record<string, unknown>> {
  const rows = await executor.execute(sql`
    SELECT id, user_id, status, trace_id, query, graph_id,
           last_error_code, started_at, updated_at
    FROM workflow_runs
    WHERE id = ${runId}::uuid
    LIMIT 1
  `);

  const run = rows.rows?.[0] as Record<string, unknown> | undefined;
  if (!run) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Run ${runId} not found` });
  }
  if (Number(run.user_id) !== userId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your run' });
  }
  return run;
}

/**
 * Transition a run to a new status atomically with an outbox event.
 *
 * Guards:
 *   - Source state must match `from` (WHERE status = from)
 *   - Transition must be allowed per run-status.ts table
 *   - Postgres update + outbox insert execute via the supplied executor
 *
 * The executor MUST already be inside a transaction when this is called so
 * the UPDATE and the outbox INSERT are atomic.  cancelRun and recordApproval
 * ensure this by opening a transaction before calling transitionRun.
 */
export async function transitionRun(opts: {
  runId: string;
  userId: number;
  from: AgentRunStatus;
  to: AgentRunStatus;
  reason: string;
  extraOutboxPayload?: Record<string, unknown>;
  lastErrorCode?: string;
  executor: DbExecutor;
}): Promise<void> {
  const { runId, userId, from, to, reason, extraOutboxPayload, lastErrorCode, executor } = opts;

  if (!isTransitionAllowed(from, to)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Transition ${from} → ${to} is not allowed`,
    });
  }

  const result = await executor.execute(sql`
    UPDATE workflow_runs
    SET status = ${to},
        last_error_code = ${lastErrorCode ?? null},
        updated_at = NOW()
    WHERE id = ${runId}::uuid
      AND user_id = ${userId}
      AND status = ${from}
    RETURNING id
  `);

  if (!result.rows?.length) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: `Run ${runId} was not in state '${from}' — concurrent modification?`,
    });
  }

  await executor.execute(sql`
    INSERT INTO workflow_outbox (
      id, run_id, task_id, event_type, payload,
      routing_key, exchange, attempt, created_at
    ) VALUES (
      gen_random_uuid(),
      ${runId}::uuid,
      NULL,
      ${'workflow.run.' + reason},
      ${JSON.stringify({
        runId,
        from,
        to,
        reason,
        ...extraOutboxPayload,
      })}::jsonb,
      ${'workflow.' + reason},
      'atlas.tasks.v1',
      0,
      NOW()
    )
  `);
}

// ---------------------------------------------------------------------------
// Public operations — called by both routers
// ---------------------------------------------------------------------------

/**
 * Cancel a run in any non-terminal state.
 * Uses 'cancelled' (not 'failed') and emits a cancellation event
 * so workers can observe the signal.
 *
 * @param executor  Optional — pass an active transaction to compose with other
 *                  mutations.  Omit to let cancelRun open its own transaction.
 */
export async function cancelRun(
  runId: string,
  userId: number,
  executor?: DbExecutor
): Promise<void> {
  const run = async (exec: DbExecutor) => {
    const rows = await exec.execute(sql`
      SELECT status FROM workflow_runs
      WHERE id = ${runId}::uuid AND user_id = ${userId}
      FOR UPDATE
    `);

    const row = rows.rows?.[0] as Record<string, unknown> | undefined;
    if (!row) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Run ${runId} not found or not yours`,
      });
    }

    const currentStatus = agentRunStatusSchema.parse(row.status);

    if (isTerminal(currentStatus)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Run ${runId} is already in terminal state '${currentStatus}'`,
      });
    }

    await transitionRun({
      runId,
      userId,
      from: currentStatus,
      to: 'cancelled',
      reason: 'cancel_requested',
      lastErrorCode: 'cancelled_by_user',
      executor: exec,
    });
  };

  if (executor) {
    await run(executor);
  } else {
    await db.transaction(async (tx) => run(tx as DbExecutor));
  }
}

/**
 * Record a human approval decision, idempotently.
 * The DB enforces UNIQUE(run_id, approval_id) — a duplicate call is silently
 * ignored (ON CONFLICT DO NOTHING). The run transition still executes; if
 * the run is no longer in 'blocked' state the transition guard rejects it.
 *
 * @param executor  Optional — pass an active transaction to compose with other
 *                  mutations.  Omit to let recordApproval open its own transaction.
 */
export async function recordApproval(
  opts: {
    runId: string;
    userId: number;
    approvalId: string;
    decision: 'approved' | 'rejected';
    note?: string;
  },
  executor?: DbExecutor
): Promise<{ decision: 'approved' | 'rejected' }> {
  const { runId, userId, approvalId, decision, note } = opts;

  const run = async (exec: DbExecutor) => {
    await assertRunOwner(runId, userId, exec);

    await exec.execute(sql`
      INSERT INTO workflow_approvals (
        id, run_id, approval_id, decision, note, decided_by, decided_at
      ) VALUES (
        gen_random_uuid(),
        ${runId}::uuid,
        ${approvalId}::uuid,
        ${decision},
        ${note ?? null},
        ${userId},
        NOW()
      )
      ON CONFLICT (run_id, approval_id) DO NOTHING
    `);

    const to: AgentRunStatus = decision === 'approved' ? 'executing' : 'cancelled';

    await transitionRun({
      runId,
      userId,
      from: 'blocked',
      to,
      reason: 'approval_recorded',
      extraOutboxPayload: { approvalId, decision },
      lastErrorCode: decision === 'rejected' ? 'rejected_by_approver' : undefined,
      executor: exec,
    });
  };

  if (executor) {
    await run(executor);
  } else {
    await db.transaction(async (tx) => run(tx as DbExecutor));
  }

  return { decision };
}
