import { z } from 'zod';

/**
 * GRAPHIFY-DAILY-COORDINATOR-01 (parent-atlas-retrieval-lineage-dag-convergence).
 *
 * Control-plane wrapper around the graphify_executions / graphify_execution_files /
 * graphify_execution_stages ledger (sveltekit-frontend/drizzle/manual/20260903_graphify_execution_ledger_v1.sql).
 * This module does NOT reimplement the Graphify pipeline (AST parse, structural extract, semantic
 * enrich, graph build) -- it owns execution IDENTITY and STAGE TRANSITIONS only. A caller supplies
 * already-computed source bindings (e.g. from the existing read-only producer behind
 * graphify-lifecycle-entrypoint-v1.json) and calls these functions in order.
 *
 * Every function requires a caller-supplied `client` that MUST be a single dedicated connection
 * (never a pool that may hand out a different connection per query) -- PostgreSQL session-level
 * advisory locks are scoped to the connection that acquired them, so acquireCoordinatorLock() and
 * releaseCoordinatorLock() are meaningless unless every call in one coordinator run shares the
 * SAME connection. This module never constructs its own connection/pool -- that is the caller's
 * responsibility (see the integration spec for the reference pattern using node-postgres's Client).
 *
 * Do NOT use graphify_runs.run_id as attempt identity anywhere in this module -- execution_id from
 * graphify_executions is the only attempt identity.
 */

export const GRAPHIFY_DAILY_COORDINATOR_V1 = 'atlas.graphify-daily-coordinator.v1' as const;

/** Frozen in docs/reports/graphify-execution-ledger-coordinator-plan-v1.json -- do not change
 * without re-freezing that plan; a live-verified reentrancy note is recorded in tasks.md under
 * GRAPHIFY-EXECUTION-LEDGER-SCHEMA-02's "Freeze the coordinator session advisory-lock contract"
 * item: session-level advisory locks are re-entrant/stacked per session, so
 * acquireCoordinatorLock() must be called at most ONCE per execution attempt on a given
 * connection, and releaseCoordinatorLock() must be called exactly once to match it (never more,
 * never less) or the lock will not actually clear. */
export const GRAPHIFY_COORDINATOR_ADVISORY_LOCK = {
  namespace: 119041,
  key: 641934821,
} as const;

export const GRAPHIFY_EXECUTION_STAGES_V1 = [
  'OPEN',
  'SOURCE_SELECTION',
  'INVENTORY',
  'AST_PARSE',
  'STRUCTURAL_EXTRACT',
  'SEMANTIC_ENRICH',
  'GRAPH_BUILD',
  'PROJECT',
  'VALIDATE',
  'CLOSE',
] as const;
export type GraphifyExecutionStageV1 = (typeof GRAPHIFY_EXECUTION_STAGES_V1)[number];

export const GRAPHIFY_EXECUTION_TERMINAL_STATUSES_V1 = [
  'COMPLETED',
  'COMPLETED_REUSED',
  'FAILED',
  'ABANDONED',
] as const;
export type GraphifyExecutionTerminalStatusV1 = (typeof GRAPHIFY_EXECUTION_TERMINAL_STATUSES_V1)[number];

export interface GraphifyCoordinatorSqlClientV1 {
  query: (text: string, values?: readonly unknown[]) => Promise<{
    rowCount: number | null;
    rows: Array<Record<string, unknown>>;
  }>;
}

const contentRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const uuid = z.string().uuid();

export const openExecutionInputV1Schema = z.object({
  workspaceId: uuid,
  workspaceRevision: contentRevision,
  parserContractVersion: z.string().min(1),
  extractionContractVersion: z.string().min(1),
  graphAlgorithmRevision: z.string().min(1).optional(),
  triggerKind: z.string().min(1),
  schedulerRevision: z.string().min(1).optional(),
  environmentRevision: z.string().min(1).optional(),
  legacyGraphifyRunId: uuid.optional(),
}).strict();
export type OpenExecutionInputV1 = z.infer<typeof openExecutionInputV1Schema>;

/** Acquires the coordinator's session advisory lock. Throws (never silently proceeds) if another
 * coordinator already holds it -- the caller must not begin any ledger writes without this. */
export async function acquireCoordinatorLock(client: GraphifyCoordinatorSqlClientV1): Promise<void> {
  const result = await client.query(
    'SELECT pg_try_advisory_lock($1, $2) AS acquired',
    [GRAPHIFY_COORDINATOR_ADVISORY_LOCK.namespace, GRAPHIFY_COORDINATOR_ADVISORY_LOCK.key],
  );
  const acquired = result.rows[0]?.acquired;
  if (acquired !== true) {
    throw new Error('GRAPHIFY_COORDINATOR_LOCK_ALREADY_HELD');
  }
}

/** Releases the coordinator's session advisory lock. Caller MUST call this in a `finally` block
 * matched 1:1 with a successful acquireCoordinatorLock() call -- never call it speculatively or
 * more than once, since a stray extra release can silently report success (`true`) even when
 * nothing was actually held, masking a real double-unlock bug. */
export async function releaseCoordinatorLock(client: GraphifyCoordinatorSqlClientV1): Promise<void> {
  const result = await client.query(
    'SELECT pg_advisory_unlock($1, $2) AS released',
    [GRAPHIFY_COORDINATOR_ADVISORY_LOCK.namespace, GRAPHIFY_COORDINATOR_ADVISORY_LOCK.key],
  );
  const released = result.rows[0]?.released;
  if (released !== true) {
    throw new Error('GRAPHIFY_COORDINATOR_LOCK_RELEASE_FAILED_NOTHING_HELD');
  }
}

/** Inserts a fresh execution row (status RUNNING) and marks the OPEN stage COMPLETED. Always
 * produces a NEW execution_id, even when workspaceRevision matches a prior execution's -- this is
 * the frozen identity separation this whole gate exists to enforce (see the migration file's own
 * header comment). */
export async function openExecution(
  client: GraphifyCoordinatorSqlClientV1,
  input: OpenExecutionInputV1,
): Promise<{ executionId: string }> {
  const args = openExecutionInputV1Schema.parse(input);

  const insertResult = await client.query(
    `INSERT INTO public.graphify_executions
       (workspace_id, workspace_revision, legacy_graphify_run_id, parser_contract_version,
        extraction_contract_version, graph_algorithm_revision, trigger_kind, scheduler_revision,
        environment_revision, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'RUNNING')
     RETURNING execution_id`,
    [
      args.workspaceId,
      args.workspaceRevision,
      args.legacyGraphifyRunId ?? null,
      args.parserContractVersion,
      args.extractionContractVersion,
      args.graphAlgorithmRevision ?? null,
      args.triggerKind,
      args.schedulerRevision ?? null,
      args.environmentRevision ?? null,
    ],
  );
  const executionId = insertResult.rows[0]?.execution_id as string | undefined;
  if (!executionId) {
    throw new Error('GRAPHIFY_COORDINATOR_OPEN_EXECUTION_INSERT_RETURNED_NO_ID');
  }

  await client.query(
    `INSERT INTO public.graphify_execution_stages (execution_id, stage, status, started_at, completed_at)
     VALUES ($1, 'OPEN', 'COMPLETED', now(), now())`,
    [executionId],
  );

  return { executionId };
}

export const sourceSelectionBindingV1Schema = z.object({
  sourceRef: z.string().min(1),
  codeSourceRevision: contentRevision,
  contentHash: z.string().regex(/^(sha256:)?[a-f0-9]{64}$/),
  byteLength: z.number().int().nonnegative(),
  legacyFileId: uuid.optional(),
}).strict();
export type SourceSelectionBindingV1 = z.infer<typeof sourceSelectionBindingV1Schema>;

/** Identifies which selection policy chose this execution's source cohort (e.g.
 * "full-corpus-v1", "incremental-changed-since-v1", "bounded-canary-v1") -- distinct from
 * workspaceRevision (identifies the BYTES selected) and outputChecksum (identifies the exact SET
 * selected). Optional: older/simpler callers that don't yet track policy identity may omit it,
 * matching this field's own gap note ("no field exists at all... left open rather than silently
 * satisfied by the existing checksum") -- omitting it does not silently satisfy the freeze, it
 * stores NULL and is visible as such on readback. No fixed enum of policy names is imposed here;
 * this module is a ledger, not the policy registry. */
const selectionPolicyRevisionSchema = z.string().min(1).optional();

/** Runs the SOURCE_SELECTION stage: bulk-appends the frozen source cohort into
 * graphify_execution_files under this execution_id, then marks the stage COMPLETED with an
 * outputChecksum binding the exact ordered set of sourceRefs written, and (when supplied) the
 * selection-policy revision that chose this cohort, stored in the stage's existing (previously
 * unused) receipt_ref column -- no migration required, that column already exists for exactly
 * this kind of free-text stage provenance reference. Bindings must already be fully computed by
 * the caller (this function performs no scanning/hashing itself) -- this keeps the coordinator's
 * own SQL bounded and independent of however the source cohort was produced. */
export async function recordSourceSelectionStage(
  client: GraphifyCoordinatorSqlClientV1,
  executionId: string,
  workspaceRevision: string,
  bindings: readonly SourceSelectionBindingV1[],
  options?: { selectionPolicyRevision?: string },
): Promise<{ sourceCount: number; outputChecksum: string; selectionPolicyRevision: string | null }> {
  uuid.parse(executionId);
  contentRevision.parse(workspaceRevision);
  const parsedBindings = bindings.map((b) => sourceSelectionBindingV1Schema.parse(b));
  if (parsedBindings.length === 0) {
    throw new Error('GRAPHIFY_COORDINATOR_SOURCE_SELECTION_REQUIRES_AT_LEAST_ONE_BINDING');
  }
  const parsedSelectionPolicyRevision =
    selectionPolicyRevisionSchema.parse(options?.selectionPolicyRevision) ?? null;

  await client.query(
    `INSERT INTO public.graphify_execution_stages (execution_id, stage, status, started_at)
     VALUES ($1, 'SOURCE_SELECTION', 'RUNNING', now())`,
    [executionId],
  );

  for (const binding of parsedBindings) {
    await client.query(
      `INSERT INTO public.graphify_execution_files
         (execution_id, legacy_file_id, workspace_revision, source_ref, code_source_revision,
          content_hash, byte_length)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        executionId,
        binding.legacyFileId ?? null,
        workspaceRevision,
        binding.sourceRef,
        binding.codeSourceRevision,
        binding.contentHash,
        binding.byteLength,
      ],
    );
  }

  const outputChecksum = await computeSourceRefSetChecksum(
    parsedBindings.map((b) => b.sourceRef),
  );

  await client.query(
    `UPDATE public.graphify_execution_stages
     SET status = 'COMPLETED', completed_at = now(), output_checksum = $3, receipt_ref = $4
     WHERE execution_id = $1 AND stage = $2`,
    [executionId, 'SOURCE_SELECTION', outputChecksum, parsedSelectionPolicyRevision],
  );

  return {
    sourceCount: parsedBindings.length,
    outputChecksum,
    selectionPolicyRevision: parsedSelectionPolicyRevision,
  };
}

async function computeSourceRefSetChecksum(sourceRefs: readonly string[]): Promise<string> {
  const { createHash } = await import('node:crypto');
  const digest = createHash('sha256');
  for (const ref of [...sourceRefs].sort()) digest.update(ref);
  return `sha256:${digest.digest('hex')}`;
}

/** Updates last_heartbeat_at. No-ops (rowCount 0) rather than throwing when the execution is no
 * longer RUNNING -- a heartbeat racing a terminal transition is expected, not an error. */
export async function heartbeat(
  client: GraphifyCoordinatorSqlClientV1,
  executionId: string,
): Promise<{ updated: boolean }> {
  uuid.parse(executionId);
  const result = await client.query(
    `UPDATE public.graphify_executions SET last_heartbeat_at = now()
     WHERE execution_id = $1 AND status = 'RUNNING'`,
    [executionId],
  );
  return { updated: (result.rowCount ?? 0) > 0 };
}

export const completeExecutionInputV1Schema = z.object({
  status: z.enum(GRAPHIFY_EXECUTION_TERMINAL_STATUSES_V1),
  reusedGraphRevision: z.string().min(1).optional(),
  errorCode: z.string().min(1).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.status === 'COMPLETED_REUSED' && value.reusedGraphRevision === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reusedGraphRevision'], message: 'COMPLETED_REUSED_REQUIRES_REUSED_GRAPH_REVISION' });
  }
  if (value.status !== 'COMPLETED_REUSED' && value.reusedGraphRevision !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reusedGraphRevision'], message: 'REUSED_GRAPH_REVISION_ONLY_VALID_FOR_COMPLETED_REUSED' });
  }
});
export type CompleteExecutionInputV1 = z.infer<typeof completeExecutionInputV1Schema>;

/** Transitions the execution to a terminal status. Throws if the execution was not found in
 * RUNNING status (never infers COMPLETED from a missing row -- matches this gate's own "Dead
 * coordinator may later be explicitly reconciled to ABANDONED. Never infer COMPLETED" rule). */
export async function completeExecution(
  client: GraphifyCoordinatorSqlClientV1,
  executionId: string,
  input: CompleteExecutionInputV1,
): Promise<void> {
  uuid.parse(executionId);
  const args = completeExecutionInputV1Schema.parse(input);

  const result = await client.query(
    `UPDATE public.graphify_executions
     SET status = $2, completed_at = now(), reused_graph_revision = $3, error_code = $4
     WHERE execution_id = $1 AND status = 'RUNNING'`,
    [executionId, args.status, args.reusedGraphRevision ?? null, args.errorCode ?? null],
  );
  if ((result.rowCount ?? 0) !== 1) {
    throw new Error('GRAPHIFY_COORDINATOR_COMPLETE_EXECUTION_NOT_IN_RUNNING_STATUS');
  }
}

/** Default staleness window for reconcileAbandonedExecutions -- 30 minutes with no heartbeat.
 * No existing heartbeat-cadence convention was found elsewhere in this repo to derive this from;
 * chosen as a conservative multiple of a plausible minutes-scale heartbeat interval, not measured
 * against a real production heartbeat frequency. Callers with a known cadence should pass an
 * explicit staleAfterMs rather than relying on this default. */
export const GRAPHIFY_COORDINATOR_RECONCILE_DEFAULT_STALE_MS = 30 * 60 * 1000;

/** Explicit reconciliation only -- this function is never called automatically by openExecution,
 * heartbeat, or completeExecution. It must be invoked deliberately (e.g. by a scheduled sweep) and
 * NEVER infers COMPLETED for a stale row -- only ABANDONED, matching this gate's own "Dead
 * coordinator may later be explicitly reconciled to ABANDONED. Never infer COMPLETED" rule.
 * Transitions every RUNNING execution whose last_heartbeat_at is older than staleAfterMs to
 * ABANDONED with completed_at = now() and error_code = 'RECONCILED_STALE_HEARTBEAT'. Idempotent:
 * re-running finds nothing to transition once a row is already terminal. */
export async function reconcileAbandonedExecutions(
  client: GraphifyCoordinatorSqlClientV1,
  staleAfterMs: number = GRAPHIFY_COORDINATOR_RECONCILE_DEFAULT_STALE_MS,
): Promise<{ abandonedExecutionIds: string[] }> {
  if (!Number.isFinite(staleAfterMs) || staleAfterMs <= 0) {
    throw new Error('GRAPHIFY_COORDINATOR_RECONCILE_INVALID_STALE_AFTER_MS');
  }

  const result = await client.query(
    `UPDATE public.graphify_executions
     SET status = 'ABANDONED', completed_at = now(), error_code = 'RECONCILED_STALE_HEARTBEAT'
     WHERE status = 'RUNNING'
       AND last_heartbeat_at < now() - make_interval(secs => $1::double precision / 1000)
     RETURNING execution_id`,
    [staleAfterMs],
  );

  return {
    abandonedExecutionIds: result.rows.map((row) => row.execution_id as string),
  };
}
