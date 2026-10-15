/**
 * atlas-action-dag-v1.ts — Contract and Finite-State Machine for Action DAGs (RETRIEVAL-DAG-01 & AGENT-WORK-01).
 *
 * Enforces the bounded workflow:
 *   1. Retrieve: AST + semantic + lexical + graph candidates
 *   2. Qualify: Canonical identity, source revision, ContextManifest
 *   3. Plan: DAG of proposed file and test actions
 *   4. Authorize: Workspace boundaries and permitted mutations
 *   5. Execute: Bounded workers and existing tool owners
 *   6. Verify: Typecheck, test shards, source checksums
 *   7. Record: Append-only execution and outcome receipts
 *
 * State Machine:
 *   PROPOSED → QUALIFIED → QUEUED → LEASED → RUNNING → VERIFIED
 *   Terminal failures: FAILED, REJECTED, STALE_REVISION_REQUALIFY
 *
 * Graph traversals and retrieval hits are NEVER direct permission to mutate files (writes: 0 guardrail).
 */

import { z } from 'zod';

export const ACTION_STATE_VALUES = [
  'PROPOSED',
  'QUALIFIED',
  'QUEUED',
  'LEASED',
  'RUNNING',
  'VERIFIED',
  'FAILED',
  'REJECTED',
  'STALE_REVISION_REQUALIFY',
] as const;

export type ActionState = (typeof ACTION_STATE_VALUES)[number];

export const ACTION_KIND_VALUES = [
  'GENERATE_FILES',
  'EDIT_FILES',
  'RUN_TESTS',
  'REBUILD_INDEX',
  'EVALUATE_CHECKPOINT',
] as const;

export type ActionKind = (typeof ACTION_KIND_VALUES)[number];

export const ACTION_PERMISSION_VALUES = [
  'READ_ONLY',
  'EXECUTE_TESTS',
  'MUTATE_WORKSPACE',
  'PROMOTE_ARTIFACT',
] as const;

export type ActionPermission = (typeof ACTION_PERMISSION_VALUES)[number];

/** Valid forward state transitions in the action lifecycle */
export const VALID_TRANSITIONS: Record<ActionState, readonly ActionState[]> = {
  PROPOSED: ['QUALIFIED', 'REJECTED'],
  QUALIFIED: ['QUEUED', 'REJECTED', 'STALE_REVISION_REQUALIFY'],
  QUEUED: ['LEASED', 'STALE_REVISION_REQUALIFY', 'REJECTED'],
  LEASED: ['RUNNING', 'QUEUED', 'FAILED'], // Timeout or worker release returns to QUEUED
  RUNNING: ['VERIFIED', 'FAILED', 'STALE_REVISION_REQUALIFY'],
  VERIFIED: [], // Terminal success
  FAILED: ['PROPOSED', 'REJECTED'], // Retry requires re-proposing
  REJECTED: [], // Terminal rejection
  STALE_REVISION_REQUALIFY: ['PROPOSED', 'REJECTED'], // Requires requalification
};

export const ActionTransitionSchema = z.object({
  from: z.enum(ACTION_STATE_VALUES),
  to: z.enum(ACTION_STATE_VALUES),
  timestamp: z.string().datetime(),
  receiptRef: z.string().optional(),
  reason: z.string().optional(),
});

export const AtlasActionV1Schema = z
  .object({
    schema: z.literal('atlas.action.v1').default('atlas.action.v1'),
    actionId: z.string().min(1),
    requestId: z.string().min(1),
    kind: z.enum(ACTION_KIND_VALUES),
    dependsOn: z.array(z.string()).default([]),
    evidenceRefs: z.array(z.string()).min(1, 'Action requires at least one qualified evidence reference'),
    expectedSourceRevision: z.string().min(1),
    permission: z.enum(ACTION_PERMISSION_VALUES),
    idempotencyKey: z.string().min(1),
    state: z.enum(ACTION_STATE_VALUES).default('PROPOSED'),
    history: z.array(ActionTransitionSchema).default([]),
    canonicalAuthority: z.literal(false).default(false),
  })
  .strict();

export type AtlasActionV1 = z.infer<typeof AtlasActionV1Schema>;

/**
 * Validate and transition an action to a new lifecycle state.
 */
export function transitionAction(
  action: AtlasActionV1,
  nextState: ActionState,
  options: { receiptRef?: string; reason?: string; timestamp?: string } = {}
): AtlasActionV1 {
  const allowed = VALID_TRANSITIONS[action.state];
  if (!allowed.includes(nextState)) {
    throw new Error(
      `INVALID_ACTION_STATE_TRANSITION: Cannot transition action ${action.actionId} from ${action.state} to ${nextState}`
    );
  }

  const timestamp = options.timestamp ?? new Date().toISOString();
  const transition = {
    from: action.state,
    to: nextState,
    timestamp,
    receiptRef: options.receiptRef,
    reason: options.reason,
  };

  return {
    ...action,
    state: nextState,
    history: [...action.history, transition],
  };
}
