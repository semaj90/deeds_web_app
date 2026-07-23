import crypto from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  executionJournalSteps,
  executionRuns,
} from '../db/schema/durable-execution.js';
import {
  worktreeLeases,
  worktreeLeaseStatusValues,
  type NewWorktreeLeaseRow,
  type WorktreeLeaseRow,
  type WorktreeLeaseStatus,
} from '../db/schema/worktree-leases.js';

const ACTIVE_LEASE_STATUSES: WorktreeLeaseStatus[] = [
  'ALLOCATED',
  'ACTIVE',
  'VALIDATING',
  'READY_FOR_REVIEW',
];

export interface WorktreeLeaseAcquireInput {
  agentRunId: string;
  taskId: string;
  ownerAgent: string;
  repositoryRoot: string;
  worktreePath: string;
  branchName: string;
  baseCommit: string;
  allowedPaths?: string[];
  forbiddenPaths?: string[];
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
  leaseId?: string;
}

export interface WorktreeLeaseHeartbeatInput {
  agentRunId: string;
  leaseId: string;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface WorktreeLeaseReleaseInput {
  agentRunId: string;
  leaseId: string;
  metadata?: Record<string, unknown>;
}

export interface WorktreeLeaseAdapterResult {
  lease: WorktreeLeaseRow;
  journalStepId: number;
  duplicate: boolean;
}

function stableLeaseId(input: WorktreeLeaseAcquireInput): string {
  if (input.leaseId) return input.leaseId;

  const hash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        agentRunId: input.agentRunId,
        taskId: input.taskId,
        ownerAgent: input.ownerAgent,
        repositoryRoot: input.repositoryRoot,
        worktreePath: input.worktreePath,
        branchName: input.branchName,
        baseCommit: input.baseCommit,
      }),
    )
    .digest('hex');

  const bytes = Buffer.from(hash.slice(0, 32), 'hex');
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

function nowIso(): string {
  return new Date().toISOString();
}

function activeLeaseWhere(repositoryRoot: string, worktreePath: string) {
  return and(
    eq(worktreeLeases.repositoryRoot, repositoryRoot),
    eq(worktreeLeases.worktreePath, worktreePath),
    inArray(worktreeLeases.status, ACTIVE_LEASE_STATUSES),
  );
}

async function assertExecutionRunExists(tx: any, agentRunId: string): Promise<void> {
  const run = await tx.query.executionRuns.findFirst({
    where: eq(executionRuns.runId, agentRunId),
  });

  if (!run) {
    throw new Error(`Unknown execution run: ${agentRunId}`);
  }
}

async function appendLeaseJournalStep(
  tx: any,
  input: {
    agentRunId: string;
    stepName: string;
    stepType: string;
    payload: Record<string, unknown>;
  },
): Promise<{ journalStepId: number; duplicate: boolean }> {
  const idempotencyKey = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        agentRunId: input.agentRunId,
        stepName: input.stepName,
        payload: input.payload,
      }),
    )
    .digest('hex');

  const existing = await tx.query.executionJournalSteps.findFirst({
    where: eq(executionJournalSteps.idempotencyKey, idempotencyKey),
  });

  if (existing) {
    return { journalStepId: existing.id, duplicate: true };
  }

  const existingSteps = await tx.query.executionJournalSteps.findMany({
    where: eq(executionJournalSteps.runId, input.agentRunId),
  });

  const inserted = await tx.insert(executionJournalSteps).values({
    runId: input.agentRunId,
    stepIndex: existingSteps.length,
    stepName: input.stepName,
    stepType: input.stepType,
    idempotencyKey,
    status: 'SUCCESS',
    input: input.payload,
    output: input.payload,
    executedAt: new Date(),
  }).returning({ id: executionJournalSteps.id });

  return { journalStepId: inserted[0]!.id, duplicate: false };
}

function shouldReuseLease(existing: WorktreeLeaseRow, input: { agentRunId: string; taskId: string; ownerAgent: string; repositoryRoot: string; worktreePath: string; branchName: string; baseCommit: string; allowedPaths?: string[]; forbiddenPaths?: string[]; leaseId: string; }): boolean {
  return existing.status !== 'RELEASED'
    && existing.status !== 'ARCHIVED'
    && existing.leaseId === input.leaseId
    && existing.runId === input.agentRunId
    && existing.taskId === input.taskId
    && existing.ownerAgent === input.ownerAgent
    && existing.repositoryRoot === input.repositoryRoot
    && existing.worktreePath === input.worktreePath
    && existing.branchName === input.branchName
    && existing.baseCommit === input.baseCommit;
}

export function createWorktreeLeaseAdapter(database: PostgresJsDatabase<any>) {
  async function acquireWorktreeLease(
    input: WorktreeLeaseAcquireInput,
  ): Promise<WorktreeLeaseAdapterResult> {
    const leaseId = stableLeaseId(input);
    const acquiredAt = nowIso();
    const allowedPaths = input.allowedPaths ?? [];
    const forbiddenPaths = input.forbiddenPaths ?? [];
    const metadata = input.metadata ?? {};

    return database.transaction(async (tx) => {
      await assertExecutionRunExists(tx, input.agentRunId);

      const existingLease = await tx.query.worktreeLeases.findFirst({
        where: eq(worktreeLeases.leaseId, leaseId),
      });

      if (existingLease) {
        if (!shouldReuseLease(existingLease, { ...input, leaseId })) {
          throw new Error(`Worktree lease ${leaseId} already exists for another scope.`);
        }

        const journal = await appendLeaseJournalStep(tx, {
          agentRunId: input.agentRunId,
          stepName: 'worktree_lease.acquire',
          stepType: 'db_mutation',
          payload: {
            leaseId,
            scope: 'reused',
            repositoryRoot: input.repositoryRoot,
            worktreePath: input.worktreePath,
          },
        });

        return { lease: existingLease, journalStepId: journal.journalStepId, duplicate: true };
      }

      const activeLease = await tx.query.worktreeLeases.findFirst({
        where: activeLeaseWhere(input.repositoryRoot, input.worktreePath),
      });

      if (activeLease) {
        throw new Error(
          `Active worktree lease already owns ${input.repositoryRoot} :: ${input.worktreePath}.`,
        );
      }

      const inserted = await tx.insert(worktreeLeases).values({
        leaseId,
        taskId: input.taskId,
        runId: input.agentRunId,
        ownerAgent: input.ownerAgent,
        repositoryRoot: input.repositoryRoot,
        worktreePath: input.worktreePath,
        branchName: input.branchName,
        baseCommit: input.baseCommit,
        allowedPaths,
        forbiddenPaths,
        status: 'ACTIVE',
        acquiredAt,
        heartbeatAt: acquiredAt,
        expiresAt: input.expiresAt ?? null,
        releasedAt: null,
        metadata,
      } satisfies NewWorktreeLeaseRow).returning();

      const journal = await appendLeaseJournalStep(tx, {
        agentRunId: input.agentRunId,
        stepName: 'worktree_lease.acquire',
        stepType: 'db_mutation',
        payload: {
          leaseId,
          repositoryRoot: input.repositoryRoot,
          worktreePath: input.worktreePath,
          branchName: input.branchName,
          taskId: input.taskId,
        },
      });

      return { lease: inserted[0]!, journalStepId: journal.journalStepId, duplicate: false };
    });
  }

  async function heartbeatWorktreeLease(
    input: WorktreeLeaseHeartbeatInput,
  ): Promise<WorktreeLeaseAdapterResult> {
    const heartbeatAt = nowIso();

    return database.transaction(async (tx) => {
      await assertExecutionRunExists(tx, input.agentRunId);

      const existingLease = await tx.query.worktreeLeases.findFirst({
        where: eq(worktreeLeases.leaseId, input.leaseId),
      });

      if (!existingLease) {
        throw new Error(`Unknown worktree lease: ${input.leaseId}`);
      }

      if (existingLease.status === 'RELEASED' || existingLease.releasedAt) {
        throw new Error(`Worktree lease ${input.leaseId} has already been released.`);
      }

      const updated = await tx
        .update(worktreeLeases)
        .set({
          heartbeatAt,
          expiresAt: input.expiresAt ?? existingLease.expiresAt,
          metadata: {
            ...(existingLease.metadata as Record<string, unknown>),
            ...(input.metadata ?? {}),
          },
          updatedAt: heartbeatAt,
        })
        .where(eq(worktreeLeases.leaseId, input.leaseId))
        .returning();

      const journal = await appendLeaseJournalStep(tx, {
        agentRunId: input.agentRunId,
        stepName: 'worktree_lease.heartbeat',
        stepType: 'db_mutation',
        payload: {
          leaseId: input.leaseId,
          expiresAt: input.expiresAt ?? null,
        },
      });

      return { lease: updated[0]!, journalStepId: journal.journalStepId, duplicate: journal.duplicate };
    });
  }

  async function releaseWorktreeLease(
    input: WorktreeLeaseReleaseInput,
  ): Promise<WorktreeLeaseAdapterResult> {
    const releasedAt = nowIso();

    return database.transaction(async (tx) => {
      await assertExecutionRunExists(tx, input.agentRunId);

      const existingLease = await tx.query.worktreeLeases.findFirst({
        where: eq(worktreeLeases.leaseId, input.leaseId),
      });

      if (!existingLease) {
        throw new Error(`Unknown worktree lease: ${input.leaseId}`);
      }

      if (existingLease.status === 'RELEASED' && existingLease.releasedAt) {
        const journal = await appendLeaseJournalStep(tx, {
          agentRunId: input.agentRunId,
          stepName: 'worktree_lease.release',
          stepType: 'db_mutation',
          payload: {
            leaseId: input.leaseId,
            duplicate: true,
          },
        });

        return { lease: existingLease, journalStepId: journal.journalStepId, duplicate: true };
      }

      const updated = await tx
        .update(worktreeLeases)
        .set({
          status: 'RELEASED',
          heartbeatAt: releasedAt,
          releasedAt,
          metadata: {
            ...(existingLease.metadata as Record<string, unknown>),
            ...(input.metadata ?? {}),
          },
          updatedAt: releasedAt,
        })
        .where(eq(worktreeLeases.leaseId, input.leaseId))
        .returning();

      const journal = await appendLeaseJournalStep(tx, {
        agentRunId: input.agentRunId,
        stepName: 'worktree_lease.release',
        stepType: 'db_mutation',
        payload: {
          leaseId: input.leaseId,
          duplicate: false,
        },
      });

      return { lease: updated[0]!, journalStepId: journal.journalStepId, duplicate: false };
    });
  }

  return {
    acquireWorktreeLease,
    heartbeatWorktreeLease,
    releaseWorktreeLease,
  };
}

export type WorktreeLeaseAdapter = ReturnType<typeof createWorktreeLeaseAdapter>;
export { worktreeLeaseStatusValues };
