import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { worktreeLeases } from './worktree-leases.js';

describe('worktree lease schema', () => {
  it('exports the canonical worktree lease table', () => {
    expect(getTableName(worktreeLeases)).toBe('worktree_leases');
  });

  it('keeps lease ownership columns visible to the app schema', () => {
    expect(worktreeLeases.leaseId.name).toBe('lease_id');
    expect(worktreeLeases.taskId.name).toBe('task_id');
    expect(worktreeLeases.ownerAgent.name).toBe('owner_agent');
    expect(worktreeLeases.worktreePath.name).toBe('worktree_path');
    expect(worktreeLeases.branchName.name).toBe('branch_name');
    expect(worktreeLeases.heartbeatAt.name).toBe('heartbeat_at');
    expect(worktreeLeases.releasedAt.name).toBe('released_at');
    expect(worktreeLeases.status.name).toBe('status');
  });
});
