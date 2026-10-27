import { describe, expect, it } from 'vitest';
import {
  aggregateWorkerResultsDeterministically,
  buildAtomicUpsertRehearsalPlanV1,
  WorkerResultV1Schema,
  WorkerTaskV1Schema,
  type WorkerResultV1,
  type WorkerTaskV1,
} from './multiruntime-worker-receipt-v1.js';

const mockWsRev = 'sha256:c63620c45fca8a3f2b3f17a45876925b7c978d4330bff273821de0d51d29a55c' as const;
const mockSrcRev1 = 'sha256:1111111111111111111111111111111111111111111111111111111111111111' as const;
const mockSrcRev2 = 'sha256:2222222222222222222222222222222222222222222222222222222222222222' as const;
const mockDigest1 = 'sha256:3333333333333333333333333333333333333333333333333333333333333333' as const;
const mockDigest2 = 'sha256:4444444444444444444444444444444444444444444444444444444444444444' as const;
const mockOutDigest1 = 'sha256:5555555555555555555555555555555555555555555555555555555555555555' as const;
const mockOutDigest2 = 'sha256:6666666666666666666666666666666666666666666666666666666666666666' as const;

describe('PARENT_ATLAS_MULTIRUNTIME_WORKER_RECEIPT_V1', () => {
  it('validates WorkerTaskV1 contracts across CPU and GPU lanes', () => {
    const cpuTask: WorkerTaskV1 = {
      schema: 'atlas.worker-task.v1',
      taskId: 'task-cpu-1',
      attemptId: 'att-1',
      runtimeLane: 'CPU_PROCESS_POOL',
      workspaceRevision: mockWsRev,
      sourceRef: 'src/lib/cpu-ast.ts',
      sourceRevision: mockSrcRev1,
      producerRevision: 'git:c63620c4',
      inputDigest: mockDigest1,
      leasedAt: '2026-10-27T12:00:00.000Z',
      leaseExpiresAt: '2026-10-27T12:05:00.000Z',
    };
    expect(WorkerTaskV1Schema.parse(cpuTask)).toEqual(cpuTask);

    const gpuTask: WorkerTaskV1 = {
      schema: 'atlas.worker-task.v1',
      taskId: 'task-gpu-1',
      attemptId: 'att-2',
      runtimeLane: 'GPU_RAPIDS_RESIDENT',
      workspaceRevision: mockWsRev,
      sourceRef: 'src/lib/vector-gemm.ts',
      sourceRevision: mockSrcRev2,
      producerRevision: 'git:c63620c4',
      inputDigest: mockDigest2,
      leasedAt: '2026-10-27T12:00:00.000Z',
      leaseExpiresAt: '2026-10-27T12:05:00.000Z',
    };
    expect(WorkerTaskV1Schema.parse(gpuTask)).toEqual(gpuTask);
  });

  it('enforces that worker results have writesPerformed: false and canonicalAuthority: false', () => {
    const validResult: WorkerResultV1 = {
      schema: 'atlas.worker-result.v1',
      taskId: 'task-cpu-1',
      attemptId: 'att-1',
      runtimeLane: 'CPU_PROCESS_POOL',
      status: 'COMPUTED',
      pythonVersion: '3.13.13',
      freeThreaded: false,
      sourceRef: 'src/lib/cpu-ast.ts',
      sourceRevision: mockSrcRev1,
      inputDigest: mockDigest1,
      outputDigest: mockOutDigest1,
      executionDurationMs: 42.5,
      writesPerformed: false,
      canonicalAuthority: false,
      error: null,
    };
    expect(WorkerResultV1Schema.parse(validResult)).toEqual(validResult);

    // Reject worker that claims write authority
    expect(() =>
      WorkerResultV1Schema.parse({
        ...validResult,
        writesPerformed: true as never,
      })
    ).toThrow();

    expect(() =>
      WorkerResultV1Schema.parse({
        ...validResult,
        canonicalAuthority: true as never,
      })
    ).toThrow();
  });

  it('aggregates results deterministically regardless of completion arrival order', () => {
    const tasks: WorkerTaskV1[] = [
      {
        schema: 'atlas.worker-task.v1',
        taskId: 'task-b',
        attemptId: 'att-b',
        runtimeLane: 'CPU_PROCESS_POOL',
        workspaceRevision: mockWsRev,
        sourceRef: 'src/lib/z-ast.ts',
        sourceRevision: mockSrcRev1,
        producerRevision: 'git:c63620c4',
        inputDigest: mockDigest1,
        leasedAt: '2026-10-27T12:00:00.000Z',
        leaseExpiresAt: '2026-10-27T12:05:00.000Z',
      },
      {
        schema: 'atlas.worker-task.v1',
        taskId: 'task-a',
        attemptId: 'att-a',
        runtimeLane: 'GPU_RAPIDS_RESIDENT',
        workspaceRevision: mockWsRev,
        sourceRef: 'src/lib/a-gemm.ts',
        sourceRevision: mockSrcRev2,
        producerRevision: 'git:c63620c4',
        inputDigest: mockDigest2,
        leasedAt: '2026-10-27T12:00:00.000Z',
        leaseExpiresAt: '2026-10-27T12:05:00.000Z',
      },
    ];

    const resultA: WorkerResultV1 = {
      schema: 'atlas.worker-result.v1',
      taskId: 'task-a',
      attemptId: 'att-a',
      runtimeLane: 'GPU_RAPIDS_RESIDENT',
      status: 'COMPUTED',
      pythonVersion: '3.14.6',
      freeThreaded: false,
      sourceRef: 'src/lib/a-gemm.ts',
      sourceRevision: mockSrcRev2,
      inputDigest: mockDigest2,
      outputDigest: mockOutDigest2,
      executionDurationMs: 15.2,
      writesPerformed: false,
      canonicalAuthority: false,
      error: null,
    };

    const resultB: WorkerResultV1 = {
      schema: 'atlas.worker-result.v1',
      taskId: 'task-b',
      attemptId: 'att-b',
      runtimeLane: 'CPU_PROCESS_POOL',
      status: 'COMPUTED',
      pythonVersion: '3.13.13',
      freeThreaded: false,
      sourceRef: 'src/lib/z-ast.ts',
      sourceRevision: mockSrcRev1,
      inputDigest: mockDigest1,
      outputDigest: mockOutDigest1,
      executionDurationMs: 40.0,
      writesPerformed: false,
      canonicalAuthority: false,
      error: null,
    };

    // Order 1: [B, A]
    const receiptOrder1 = aggregateWorkerResultsDeterministically({
      batchId: 'batch-001',
      workspaceRevision: mockWsRev,
      tasks,
      results: [resultB, resultA],
    });

    // Order 2: [A, B]
    const receiptOrder2 = aggregateWorkerResultsDeterministically({
      batchId: 'batch-001',
      workspaceRevision: mockWsRev,
      tasks,
      results: [resultA, resultB],
    });

    expect(receiptOrder1.batchOutputDigest).toBe(receiptOrder2.batchOutputDigest);
    expect(receiptOrder1.results[0].taskId).toBe('task-a'); // sorted alphabetically by sourceRef
    expect(receiptOrder1.results[1].taskId).toBe('task-b');
    expect(receiptOrder1.status).toBe('ADMISSION_PENDING');
  });

  it('rejects duplicate task results, unknown tasks, and revision mismatches', () => {
    const task: WorkerTaskV1 = {
      schema: 'atlas.worker-task.v1',
      taskId: 'task-1',
      attemptId: 'att-1',
      runtimeLane: 'CPU_PROCESS_POOL',
      workspaceRevision: mockWsRev,
      sourceRef: 'src/lib/ast.ts',
      sourceRevision: mockSrcRev1,
      producerRevision: 'git:c63620c4',
      inputDigest: mockDigest1,
      leasedAt: '2026-10-27T12:00:00.000Z',
      leaseExpiresAt: '2026-10-27T12:05:00.000Z',
    };

    const validResult: WorkerResultV1 = {
      schema: 'atlas.worker-result.v1',
      taskId: 'task-1',
      attemptId: 'att-1',
      runtimeLane: 'CPU_PROCESS_POOL',
      status: 'COMPUTED',
      pythonVersion: '3.13.13',
      freeThreaded: false,
      sourceRef: 'src/lib/ast.ts',
      sourceRevision: mockSrcRev1,
      inputDigest: mockDigest1,
      outputDigest: mockOutDigest1,
      executionDurationMs: 30.0,
      writesPerformed: false,
      canonicalAuthority: false,
      error: null,
    };

    // 1. Duplicate task result
    const dupReceipt = aggregateWorkerResultsDeterministically({
      batchId: 'b-dup',
      workspaceRevision: mockWsRev,
      tasks: [task],
      results: [validResult, validResult],
    });
    expect(dupReceipt.status).toBe('REJECTED');
    expect(dupReceipt.rejectionReason).toContain('DUPLICATE_TASK_RESULT');

    // 2. Unknown task result
    const unknownReceipt = aggregateWorkerResultsDeterministically({
      batchId: 'b-unk',
      workspaceRevision: mockWsRev,
      tasks: [task],
      results: [{ ...validResult, taskId: 'task-unknown' }],
    });
    expect(unknownReceipt.status).toBe('REJECTED');
    expect(unknownReceipt.rejectionReason).toContain('UNKNOWN_TASK_RESULT');

    // 3. Source revision mismatch
    const revMismatchReceipt = aggregateWorkerResultsDeterministically({
      batchId: 'b-rev',
      workspaceRevision: mockWsRev,
      tasks: [task],
      results: [{ ...validResult, sourceRevision: mockSrcRev2 }],
    });
    expect(revMismatchReceipt.status).toBe('REJECTED');
    expect(revMismatchReceipt.rejectionReason).toContain('SOURCE_REVISION_MISMATCH');
  });

  it('builds a rehearsal UPSERT plan without mutating PostgreSQL', () => {
    const task: WorkerTaskV1 = {
      schema: 'atlas.worker-task.v1',
      taskId: 'task-1',
      attemptId: 'att-1',
      runtimeLane: 'CPU_PROCESS_POOL',
      workspaceRevision: mockWsRev,
      sourceRef: 'src/lib/ast.ts',
      sourceRevision: mockSrcRev1,
      producerRevision: 'git:c63620c4',
      inputDigest: mockDigest1,
      leasedAt: '2026-10-27T12:00:00.000Z',
      leaseExpiresAt: '2026-10-27T12:05:00.000Z',
    };

    const result: WorkerResultV1 = {
      schema: 'atlas.worker-result.v1',
      taskId: 'task-1',
      attemptId: 'att-1',
      runtimeLane: 'CPU_PROCESS_POOL',
      status: 'COMPUTED',
      pythonVersion: '3.13.13',
      freeThreaded: false,
      sourceRef: 'src/lib/ast.ts',
      sourceRevision: mockSrcRev1,
      inputDigest: mockDigest1,
      outputDigest: mockOutDigest1,
      executionDurationMs: 25.0,
      writesPerformed: false,
      canonicalAuthority: false,
      error: null,
    };

    const receipt = aggregateWorkerResultsDeterministically({
      batchId: 'b-rehearse',
      workspaceRevision: mockWsRev,
      tasks: [task],
      results: [result],
    });

    const plan = buildAtomicUpsertRehearsalPlanV1(receipt);
    expect(plan.rehearsalOnly).toBe(true);
    expect(plan.canPersist).toBe(true);
    expect(plan.conflictTarget).toEqual(['source_ref', 'source_revision', 'task_id']);
    expect(plan.rowValues).toHaveLength(1);
    expect(plan.rowValues[0].batchOutputDigest).toBe(receipt.batchOutputDigest);
    expect(plan.outboxEvent.eventType).toBe('atlas.worker.batch_completed.v1');
  });
});
