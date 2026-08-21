import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  buildGroundedContextManifestV1,
  buildGroundedExecutionReceiptV1,
  checksumGroundedContextManifestV1,
  digestClaimTokenV1,
  type GroundedExecutionReceiptV1,
} from './grounded-execution-receipt-v1';
import { createGroundedExecutionRepository } from './grounded-execution-repository';

const CONTEXT_CHECKSUM = 'a'.repeat(64);
const OUTPUT_DIGEST = 'b'.repeat(64);

function fixture() {
  const groundedContext = buildGroundedContextManifestV1({
    taskId: 'task:1',
    runId: 'run:1',
    workerId: 'codex-worker',
    contextManifestSchema: 'atlas.context-manifest.v1',
    contextManifestChecksum: CONTEXT_CHECKSUM,
    requestId: 'request:1',
    snapshotId: 'snapshot:1',
    graphRevision: 'graph:1',
    producerRevision: 'context-compiler:v1',
    grounding: {
      packetKeys: ['packet:1'],
      processIds: ['process:1'],
      sourceRefs: ['src/example.ts'],
      evidenceRefs: ['evidence:1'],
    },
  });
  const receipt = buildGroundedExecutionReceiptV1({
    receiptId: 'execution:1',
    taskId: 'task:1',
    runId: 'run:1',
    workerId: 'codex-worker',
    claimTokenDigest: digestClaimTokenV1('claim-secret'),
    groundedContextChecksum: checksumGroundedContextManifestV1(groundedContext),
    contextManifestChecksum: CONTEXT_CHECKSUM,
    startedAt: '2026-08-21T12:00:00.000Z',
    finishedAt: '2026-08-21T12:00:01.000Z',
    status: 'SUCCESS',
    executor: 'codex',
    executorRevision: 'codex:v1',
    mutationRefs: ['mutation:1'],
    outputRefs: ['output:1'],
    validation: [{
      validationId: 'validation:1',
      command: 'npx vitest run example.spec.ts',
      status: 'PASSED',
      exitCode: 0,
      startedAt: '2026-08-21T12:00:00.500Z',
      finishedAt: '2026-08-21T12:00:00.900Z',
      evidenceRefs: ['evidence:1'],
      outputDigest: OUTPUT_DIGEST,
    }],
    evidenceRefs: ['evidence:1'],
  });
  return { groundedContext, receipt };
}

type FakeOptions = {
  currentRunId?: string;
  claimToken?: string;
  storedReceipt?: GroundedExecutionReceiptV1;
  receiptInsertRowCount?: number;
};

function fakePool(options: FakeOptions = {}) {
  const calls: string[] = [];
  const { groundedContext, receipt } = fixture();
  const storedReceipt = options.storedReceipt ?? receipt;
  const client = {
    query: async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push(normalized);
      if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
        return { rowCount: null, rows: [] };
      }
      if (normalized.includes('FROM kanban_tasks')) {
        return {
          rowCount: 1,
          rows: [{
            task_id: 'task:1',
            current_run_id: options.currentRunId ?? 'run:1',
            assignee: 'codex-worker',
            claim_token: options.claimToken ?? 'claim-secret',
          }],
        };
      }
      if (normalized.startsWith('INSERT INTO atlas_grounded_execution_receipts')) {
        return { rowCount: options.receiptInsertRowCount ?? 1, rows: [] };
      }
      if (normalized.includes('FROM atlas_grounded_execution_receipts')) {
        return {
          rowCount: 1,
          rows: [{
            receipt: storedReceipt,
            grounded_context: groundedContext,
            recorded_at: '2026-08-21T12:00:02.000Z',
          }],
        };
      }
      if (normalized.startsWith('INSERT INTO kanban_task_attempts')) {
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`UNEXPECTED_SQL:${normalized}`);
    },
    release: () => {},
  };
  const pool = {
    connect: async () => client,
    query: client.query,
  } as unknown as Pool;
  return { pool, calls, groundedContext, receipt };
}

describe('grounded execution repository', () => {
  it('atomically persists an accepted receipt and links the Kanban attempt', async () => {
    const fake = fakePool();
    const repository = createGroundedExecutionRepository(fake.pool);
    const stored = await repository.persistAndLinkAttempt({
      receipt: fake.receipt,
      groundedContext: fake.groundedContext,
    });

    expect(stored.receipt.receiptId).toBe('execution:1');
    expect(fake.calls).toContain('BEGIN');
    expect(fake.calls.at(-1)).toBe('COMMIT');
    const attemptSql = fake.calls.find((sql) => sql.startsWith('INSERT INTO kanban_task_attempts')) ?? '';
    expect(attemptSql).toContain('WHERE execution_receipt_id IS NOT NULL');
  });

  it('rolls back before receipt/attempt insertion when the active run is stale', async () => {
    const fake = fakePool({ currentRunId: 'run:2' });
    const repository = createGroundedExecutionRepository(fake.pool);

    await expect(repository.persistAndLinkAttempt({
      receipt: fake.receipt,
      groundedContext: fake.groundedContext,
    })).rejects.toThrow('RUN_ID_MISMATCH');

    expect(fake.calls).toContain('ROLLBACK');
    expect(fake.calls.some((sql) => sql.startsWith('INSERT INTO atlas_grounded_execution_receipts'))).toBe(false);
    expect(fake.calls.some((sql) => sql.startsWith('INSERT INTO kanban_task_attempts'))).toBe(false);
  });

  it('rolls back before mutation when the active claim changed', async () => {
    const fake = fakePool({ claimToken: 'new-claim' });
    const repository = createGroundedExecutionRepository(fake.pool);

    await expect(repository.persistAndLinkAttempt({
      receipt: fake.receipt,
      groundedContext: fake.groundedContext,
    })).rejects.toThrow('CLAIM_TOKEN_MISMATCH');

    expect(fake.calls.some((sql) => sql.startsWith('INSERT INTO atlas_grounded_execution_receipts'))).toBe(false);
  });

  it('allows an idempotent replay when the durable receipt checksum is identical', async () => {
    const fake = fakePool({ receiptInsertRowCount: 0 });
    const repository = createGroundedExecutionRepository(fake.pool);
    const stored = await repository.persistAndLinkAttempt({
      receipt: fake.receipt,
      groundedContext: fake.groundedContext,
    });
    expect(stored.receipt.receiptChecksum).toBe(fake.receipt.receiptChecksum);
    expect(fake.calls.at(-1)).toBe('COMMIT');
  });

  it('rejects receipt-id reuse with different immutable content', async () => {
    const base = fixture();
    const conflictingReceipt = buildGroundedExecutionReceiptV1({
      ...base.receipt,
      outputRefs: ['output:different'],
    });
    const fake = fakePool({ storedReceipt: conflictingReceipt, receiptInsertRowCount: 0 });
    const repository = createGroundedExecutionRepository(fake.pool);

    await expect(repository.persistAndLinkAttempt({
      receipt: fake.receipt,
      groundedContext: fake.groundedContext,
    })).rejects.toThrow('GROUNDED_EXECUTION_IMMUTABILITY_CONFLICT');
    expect(fake.calls).toContain('ROLLBACK');
  });
});
