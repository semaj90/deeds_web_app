/**
 * PARENT_ATLAS_MULTIRUNTIME_WORKER_RECEIPT_V1
 *
 * Multi-runtime worker contract separating worker computation from canonical database persistence.
 *
 * Workers (Python 3.13 CPU process pool or Python 3.14.6 RAPIDS GPU pool) emit COMPUTED/VALIDATED receipts.
 * Neither worker pool may write directly to PostgreSQL, Qdrant, Neo4j, or Valkey.
 *
 * Persistence requires the single authoritative Node.js/Drizzle coordinator to aggregate,
 * validate input/output digests, check admission, and execute a transactional UPSERT with outbox event,
 * followed by independent readback verification.
 */

import { z } from 'zod';
import { createHash } from 'node:crypto';
import { artifactLocatorSchema } from '../../queue/artifact-work-item-v1.js';

export const WORKER_RUNTIME_LANE_VALUES = [
  'CPU_PROCESS_POOL',
  'GPU_RAPIDS_RESIDENT',
] as const;
export type WorkerRuntimeLane = (typeof WORKER_RUNTIME_LANE_VALUES)[number];

export const WORKER_LIFECYCLE_STATUS_VALUES = [
  'CLAIMED',
  'RUNNING',
  'COMPUTED',
  'VALIDATED',
  'ADMISSION_BLOCKED',
  'COMMITTED',
  'READBACK_VERIFIED',
] as const;
export type WorkerLifecycleStatus = (typeof WORKER_LIFECYCLE_STATUS_VALUES)[number];

export const WorkerTaskV1Schema = z
  .object({
    schema: z.literal('atlas.worker-task.v1').default('atlas.worker-task.v1'),
    taskId: z.string().min(1),
    attemptId: z.string().min(1),
    runtimeLane: z.enum(WORKER_RUNTIME_LANE_VALUES),
    workspaceRevision: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    snapshotRevision: z.string().regex(/^sha256:[0-9a-f]{64}$/).optional(),
    sourceRef: z.string().min(1),
    sourceRevision: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    producerRevision: z.string().min(1),
    inputDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    artifactRef: artifactLocatorSchema.optional(),
    leasedAt: z.string().datetime(),
    leaseExpiresAt: z.string().datetime(),
  })
  .strict();
export type WorkerTaskV1 = z.infer<typeof WorkerTaskV1Schema>;

export const WorkerResultV1Schema = z
  .object({
    schema: z.literal('atlas.worker-result.v1').default('atlas.worker-result.v1'),
    taskId: z.string().min(1),
    attemptId: z.string().min(1),
    runtimeLane: z.enum(WORKER_RUNTIME_LANE_VALUES),
    status: z.enum(WORKER_LIFECYCLE_STATUS_VALUES),
    pythonVersion: z.string().min(1),
    freeThreaded: z.boolean(),
    sourceRef: z.string().min(1),
    sourceRevision: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    inputDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    outputDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    executionDurationMs: z.number().nonnegative(),
    peakMemoryBytes: z.number().int().nonnegative().optional(),
    artifactRef: artifactLocatorSchema.optional(),
    writesPerformed: z.literal(false).default(false),
    canonicalAuthority: z.literal(false).default(false),
    error: z.string().nullable().default(null),
  })
  .strict();
export type WorkerResultV1 = z.infer<typeof WorkerResultV1Schema>;

export const BatchCompletionReceiptV1Schema = z
  .object({
    schema: z.literal('atlas.batch-completion-receipt.v1').default('atlas.batch-completion-receipt.v1'),
    batchId: z.string().min(1),
    workspaceRevision: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    totalTasks: z.number().int().positive(),
    completedCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    results: z.array(WorkerResultV1Schema),
    status: z.enum(['AGGREGATED', 'VALIDATED', 'ADMISSION_PENDING', 'REJECTED']),
    batchOutputDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    writesPerformed: z.literal(false).default(false),
    canonicalAuthority: z.literal(false).default(false),
    rejectionReason: z.string().nullable().default(null),
  })
  .strict();
export type BatchCompletionReceiptV1 = z.infer<typeof BatchCompletionReceiptV1Schema>;

/**
 * Deterministically aggregate completed worker results.
 * Results are strictly ordered by sourceRef and taskId to eliminate completion-order variance.
 * Detects mismatched inputs, duplicate tasks, or contradictory revisions.
 */
export function aggregateWorkerResultsDeterministically(params: {
  batchId: string;
  workspaceRevision: string;
  tasks: WorkerTaskV1[];
  results: WorkerResultV1[];
  nowIso?: string;
}): BatchCompletionReceiptV1 {
  const taskMap = new Map<string, WorkerTaskV1>();
  for (const t of params.tasks) {
    taskMap.set(t.taskId, t);
  }

  // Deduplicate and detect contradictions
  const seenTaskIds = new Set<string>();
  const validatedResults: WorkerResultV1[] = [];
  let rejectionReason: string | null = null;

  // Order deterministically by sourceRef ASC, taskId ASC
  const orderedResults = [...params.results].sort((a, b) => {
    if (a.sourceRef !== b.sourceRef) return a.sourceRef.localeCompare(b.sourceRef);
    return a.taskId.localeCompare(b.taskId);
  });

  for (const result of orderedResults) {
    if (seenTaskIds.has(result.taskId)) {
      rejectionReason = `DUPLICATE_TASK_RESULT:${result.taskId}`;
      break;
    }
    seenTaskIds.add(result.taskId);

    const task = taskMap.get(result.taskId);
    if (!task) {
      rejectionReason = `UNKNOWN_TASK_RESULT:${result.taskId}`;
      break;
    }

    if (task.sourceRevision !== result.sourceRevision) {
      rejectionReason = `SOURCE_REVISION_MISMATCH: task=${task.sourceRevision} result=${result.sourceRevision}`;
      break;
    }

    if (task.inputDigest !== result.inputDigest) {
      rejectionReason = `INPUT_DIGEST_MISMATCH: task=${task.inputDigest} result=${result.inputDigest}`;
      break;
    }

    if (result.writesPerformed || result.canonicalAuthority) {
      rejectionReason = `WORKER_WRITES_FORBIDDEN: worker result cannot assert writesPerformed or canonicalAuthority`;
      break;
    }

    validatedResults.push({
      ...result,
      status: result.status === 'COMPLETED' ? 'VALIDATED' : result.status,
    });
  }

  const failedCount = validatedResults.filter((r) => r.error !== null).length;
  const completedCount = validatedResults.length - failedCount;

  // Deterministic batch output digest: SHA256 of sorted task+output digests
  const hash = createHash('sha256');
  for (const r of validatedResults) {
    hash.update(`${r.taskId}:${r.sourceRef}:${r.sourceRevision}:${r.outputDigest};`);
  }
  const batchOutputDigest = `sha256:${hash.digest('hex')}` as const;

  const isRejected = rejectionReason !== null || validatedResults.length !== params.tasks.length;
  const status = isRejected
    ? 'REJECTED'
    : failedCount === 0
      ? 'ADMISSION_PENDING'
      : 'AGGREGATED';

  return BatchCompletionReceiptV1Schema.parse({
    schema: 'atlas.batch-completion-receipt.v1',
    batchId: params.batchId,
    workspaceRevision: params.workspaceRevision,
    totalTasks: params.tasks.length,
    completedCount,
    failedCount,
    results: validatedResults,
    status,
    batchOutputDigest,
    writesPerformed: false,
    canonicalAuthority: false,
    rejectionReason,
  });
}

/**
 * Disposable/rollback-only rehearsal boundary for PostgreSQL 18 persistence.
 * Creates the exact parameters required for an atomic single-writer UPSERT with outbox event,
 * without executing live database mutations.
 */
export function buildAtomicUpsertRehearsalPlanV1(receipt: BatchCompletionReceiptV1): {
  rehearsalOnly: true;
  conflictTarget: string[];
  rowValues: Array<{
    taskId: string;
    sourceRef: string;
    sourceRevision: string;
    outputDigest: string;
    batchOutputDigest: string;
  }>;
  outboxEvent: {
    eventType: string;
    batchId: string;
    batchOutputDigest: string;
  };
  canPersist: boolean;
} {
  const canPersist = receipt.status === 'ADMISSION_PENDING' && receipt.rejectionReason === null;

  return {
    rehearsalOnly: true,
    conflictTarget: ['source_ref', 'source_revision', 'task_id'],
    rowValues: receipt.results.map((r) => ({
      taskId: r.taskId,
      sourceRef: r.sourceRef,
      sourceRevision: r.sourceRevision,
      outputDigest: r.outputDigest,
      batchOutputDigest: receipt.batchOutputDigest,
    })),
    outboxEvent: {
      eventType: 'atlas.worker.batch_completed.v1',
      batchId: receipt.batchId,
      batchOutputDigest: receipt.batchOutputDigest,
    },
    canPersist,
  };
}
