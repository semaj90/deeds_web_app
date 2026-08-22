/**
 * Coding task envelope — the payload carried by WorkCommands routed to
 * atlas.worker.opencode.v1 (and atlas.worker.code-analysis.v1 for read-only).
 *
 * The OpenCodeWorker adapter (not OpenCode itself) consumes this envelope,
 * builds a bounded prompt packet, spawns the opencode process with enforced
 * constraints, captures outputs, validates, and persists.
 *
 * Hard constraints enforced by the adapter:
 *   - Workspace path must be in workspaceAllowlist
 *   - File paths must be inside allowedPaths (no escaping to .env, secrets, CI)
 *   - No git push, no production deploy
 *   - Process killed at timeoutSeconds
 *   - stdout/stderr captured and size-bounded
 *   - Git diff captured for audit trail
 *   - Mutations only when mutationAllowed === true
 */

import { z } from 'zod';

export const codingTaskSchema = z.object({
  schemaVersion: z.literal('1.0'),

  /** Matches workflow_tasks.id in Postgres — existence verified before execute */
  taskId: z.string().uuid(),

  /** Matches agent_runs.id in Postgres */
  runId: z.string().uuid(),

  traceId: z.string().optional(),

  taskType: z.enum(['code.inspect', 'code.patch', 'code.test']),

  // ── Workspace ──────────────────────────────────────────────────────────

  /** Registered workspace identifier — validated against server-side allowlist */
  workspaceId: z.string().min(1),

  /** Absolute path to repository root — resolved by worker, not passed raw */
  repositoryRoot: z.string().min(1),

  // ── Scope ─────────────────────────────────────────────────────────────

  /** What the agent should accomplish — bounded, no raw SQL or shell commands */
  objective: z.string().min(1).max(4000),

  /** Glob patterns the agent may read/write — worker enforces via path.resolve checks */
  allowedPaths: z.array(z.string()).min(1),

  /** Explicit deny list (e.g. .env, *.pem, drizzle/migrations/**) */
  prohibitedPaths: z.array(z.string()).default([]),

  // ── Evidence ──────────────────────────────────────────────────────────

  /** IDs of Postgres artifact rows the agent may read as context */
  evidenceRefs: z.array(z.string()).default([]),

  /** Checks that MUST pass before the WorkCommand is ACKed (e.g. "npm run check") */
  requiredChecks: z.array(z.string()).default([]),

  // ── Safety ────────────────────────────────────────────────────────────

  /** If false, agent may only read — any write attempt is a hard failure */
  mutationAllowed: z.boolean(),

  /** Worker kills the spawned process at this wall-clock limit */
  timeoutSeconds: z.number().int().positive().max(1800),

  /** 0-based; incremented by the retry lane */
  attempt: z.number().int().nonnegative(),

  /**
   * Dedup key checked in Postgres before execution.
   * SHA-256(taskId + attempt + taskType + stablePayloadHash).
   * The worker rejects duplicates by looking this up in workflow_task_attempts.
   */
  idempotencyKey: z.string().min(1),
});

export type CodingTask = z.infer<typeof codingTaskSchema>;

// ---------------------------------------------------------------------------
// Worker execution policy (enforced by the adapter layer, not the agent)
// ---------------------------------------------------------------------------

export interface CodingTaskResult {
  taskId: string;
  runId: string;
  attempt: number;
  idempotencyKey: string;

  /** exit code of the spawned opencode process */
  exitCode: number;

  /** Bounded git diff produced after mutations (empty if read-only) */
  gitDiff: string;

  /** Output of each requiredCheck — all must be 0 to ACK */
  checkResults: Array<{ check: string; exitCode: number; stdout: string }>;

  /** Structured findings if taskType === 'code.inspect' */
  findings: Array<{
    file: string;
    line?: number;
    severity: 'info' | 'warning' | 'error';
    message: string;
    rule?: string;
  }>;

  /** Total wall-clock ms */
  durationMs: number;

  /** Postgres artifact ID written by the worker — referenced in LangGraph state */
  artifactId?: string;

  outcome: 'success' | 'failure' | 'timeout' | 'validation_failed';
  errorMessage?: string;
}
