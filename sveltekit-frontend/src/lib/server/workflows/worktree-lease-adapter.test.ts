import { describe, expect, it, vi } from 'vitest';
import { executionJournalSteps } from '../db/schema/durable-execution.js';
import { worktreeLeases } from '../db/schema/worktree-leases.js';
import { createWorktreeLeaseAdapter } from './worktree-lease-adapter.js';

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  const makePredicate = (op: string, payload: Record<string, unknown>) => ({ op, ...payload });
  return {
    ...actual,
    and: (...parts: any[]) => makePredicate('and', { parts }),
    eq: (column: { name: string }, value: unknown) => makePredicate('eq', { column: column.name, value }),
    inArray: (column: { name: string }, values: unknown[]) =>
      makePredicate('inArray', { column: column.name, values }),
  };
});

type LeaseRow = {
  leaseId: string;
  taskId: string;
  runId?: string | null;
  ownerAgent: string;
  repositoryRoot: string;
  worktreePath: string;
  branchName: string;
  baseCommit: string;
  allowedPaths: string[];
  forbiddenPaths: string[];
  status: string;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string | null;
  releasedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function buildPredicateMatcher(predicate: any): (row: Record<string, unknown>) => boolean {
  if (!predicate) return () => true;
  const columnCandidates = (column: string) => {
    const camel = column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    return [column, camel];
  };
  if (predicate.op === 'eq') {
    return (row) => columnCandidates(predicate.column).some((column) => row[column] === predicate.value);
  }
  if (predicate.op === 'inArray') {
    return (row) =>
      columnCandidates(predicate.column).some((column) =>
        (predicate.values as unknown[]).includes(row[column]),
      );
  }
  if (predicate.op === 'and') {
    const matchers = (predicate.parts as any[]).map(buildPredicateMatcher);
    return (row) => matchers.every((matcher) => matcher(row));
  }
  return () => true;
}

function createStubDb(seed: {
  executionRuns?: Array<{ runId: string; taskId: string; agent: string; status: string; input: Record<string, unknown> }>;
  worktreeLeases?: LeaseRow[];
  journalSteps?: Array<{ id: number; runId: string; stepIndex: number; stepName: string; stepType: string; idempotencyKey: string; status: string; input: Record<string, unknown>; output?: Record<string, unknown>; executedAt?: string }>;
}) {
  const state = {
    executionRuns: [...(seed.executionRuns ?? [])],
    worktreeLeases: [...(seed.worktreeLeases ?? [])],
    journalSteps: [...(seed.journalSteps ?? [])],
    nextJournalId: (seed.journalSteps?.length ?? 0) + 1,
  };

  const tx: any = {
    query: {
      executionRuns: {
        findFirst: async ({ where }: { where?: any }) => {
          const matcher = buildPredicateMatcher(where);
          return state.executionRuns.find(matcher) ?? null;
        },
      },
      worktreeLeases: {
        findFirst: async ({ where }: { where?: any }) => {
          const matcher = buildPredicateMatcher(where);
          return state.worktreeLeases.find(matcher) ?? null;
        },
      },
      executionJournalSteps: {
        findFirst: async ({ where }: { where?: any }) => {
          const matcher = buildPredicateMatcher(where);
          return state.journalSteps.find(matcher) ?? null;
        },
        findMany: async ({ where }: { where?: any }) => {
          const matcher = buildPredicateMatcher(where);
          return state.journalSteps.filter(matcher);
        },
      },
    },
    insert: (table: unknown) => {
      return {
        values: (row: any) => ({
          returning: async () => {
            if (table === worktreeLeases) {
              state.worktreeLeases.push(row);
              return [row];
            }
            if (table === executionJournalSteps) {
              const stored = { id: state.nextJournalId++, ...row };
              state.journalSteps.push(stored);
              return [stored];
            }
            throw new Error(`Unsupported insert table: ${String(table)}`);
          },
        }),
      };
    },
    update: (table: unknown) => {
      let patch: Record<string, unknown> = {};
      let predicate: any = null;
      return {
        set: (next: Record<string, unknown>) => {
          patch = next;
          return {
            where: (where: any) => {
              predicate = where;
              return {
                returning: async () => {
                  if (table !== worktreeLeases) {
                    throw new Error(`Unsupported update table: ${String(table)}`);
                  }
                  const matcher = buildPredicateMatcher(predicate);
                  const updated: LeaseRow[] = [];
                  for (const row of state.worktreeLeases) {
                    if (matcher(row)) {
                      Object.assign(row, patch);
                      updated.push(row);
                    }
                  }
                  return updated;
                },
              };
            },
          };
        },
      };
    },
  };

  return {
    state,
    db: {
      transaction: async (fn: (tx: any) => Promise<any>) => fn(tx),
    },
  };
}

describe('worktree lease adapter', () => {
  it('acquires, heartbeats, and releases a lease while appending durable journal steps', async () => {
    const stub = createStubDb({
      executionRuns: [{ runId: 'run-1', taskId: 'task-1', agent: 'mastra', status: 'ACTIVE', input: {} }],
    });
    const adapter = createWorktreeLeaseAdapter(stub.db as any);

    const acquired = await adapter.acquireWorktreeLease({
      agentRunId: 'run-1',
      taskId: 'task-1',
      ownerAgent: 'opencode',
      repositoryRoot: 'C:/repo',
      worktreePath: 'C:/repo/.claude/worktrees/lease-a',
      branchName: 'atlas/lease-a',
      baseCommit: 'abc123',
      allowedPaths: ['src'],
      forbiddenPaths: ['node_modules'],
      metadata: { scope: 'graph-snapshot' },
    });

    expect(acquired.duplicate).toBe(false);
    expect(acquired.lease.status).toBe('ACTIVE');
    expect(stub.state.worktreeLeases).toHaveLength(1);
    expect(stub.state.journalSteps).toHaveLength(1);

    const heartbeated = await adapter.heartbeatWorktreeLease({
      agentRunId: 'run-1',
      leaseId: acquired.lease.leaseId,
      expiresAt: '2026-07-23T19:00:00.000Z',
      metadata: { pulse: 1 },
    });

    expect(heartbeated.lease.heartbeatAt).toBeDefined();
    expect(heartbeated.lease.expiresAt).toBe('2026-07-23T19:00:00.000Z');
    expect(stub.state.journalSteps).toHaveLength(2);

    const released = await adapter.releaseWorktreeLease({
      agentRunId: 'run-1',
      leaseId: acquired.lease.leaseId,
      metadata: { reason: 'done' },
    });

    expect(released.lease.status).toBe('RELEASED');
    expect(released.lease.releasedAt).toBeDefined();
    expect(stub.state.journalSteps).toHaveLength(3);
  });

  it('rejects a second active lease on the same canonical worktree surface', async () => {
    const stub = createStubDb({
      executionRuns: [{ runId: 'run-1', taskId: 'task-1', agent: 'mastra', status: 'ACTIVE', input: {} }],
      worktreeLeases: [
        {
          leaseId: '11111111-1111-4111-8111-111111111111',
          taskId: 'task-1',
          runId: 'run-1',
          ownerAgent: 'opencode',
          repositoryRoot: 'C:/repo',
          worktreePath: 'C:/repo/.claude/worktrees/lease-a',
          branchName: 'atlas/lease-a',
          baseCommit: 'abc123',
          allowedPaths: ['src'],
          forbiddenPaths: [],
          status: 'ACTIVE',
          acquiredAt: '2026-07-23T18:00:00.000Z',
          heartbeatAt: '2026-07-23T18:00:00.000Z',
          expiresAt: null,
          releasedAt: null,
          metadata: {},
          createdAt: '2026-07-23T18:00:00.000Z',
          updatedAt: '2026-07-23T18:00:00.000Z',
        },
      ],
    });
    const adapter = createWorktreeLeaseAdapter(stub.db as any);

    await expect(
      adapter.acquireWorktreeLease({
        agentRunId: 'run-1',
        taskId: 'task-1',
        ownerAgent: 'cline',
        repositoryRoot: 'C:/repo',
        worktreePath: 'C:/repo/.claude/worktrees/lease-a',
        branchName: 'atlas/lease-b',
        baseCommit: 'abc123',
      }),
    ).rejects.toThrow(/Active worktree lease already owns/);
  });
});
