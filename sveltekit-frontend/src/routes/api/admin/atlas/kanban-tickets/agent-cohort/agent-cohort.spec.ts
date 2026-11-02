import { beforeEach, describe, expect, it, vi } from 'vitest';

const listKanbanTasksMock = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/atlas/kanban-task-board.js', () => ({
  listKanbanTasks: listKanbanTasksMock,
}));

import { GET } from './+server.js';

function makeEvent(options: { role?: string; query?: string }) {
  const url = new URL(`http://localhost/api/admin/atlas/kanban-tickets/agent-cohort${options.query ?? ''}`);
  return { url, locals: { user: options.role ? { role: options.role } : null } } as unknown as Parameters<typeof GET>[0];
}

describe('/api/admin/atlas/kanban-tickets/agent-cohort', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires an admin and returns a stable blocked response', async () => {
    const response = await GET(makeEvent({ role: 'viewer' }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      tasks: [], total: 0, dispatchAllowed: false,
      executionAdmission: 'BLOCKED_PERMISSION_AND_REVISION_PROOF',
      canonicalAuthority: false, error: 'ADMIN_ONLY',
    });
    expect(listKanbanTasksMock).not.toHaveBeenCalled();
  });

  it('requires one bounded OpenSpec cohort and rejects oversized or duplicate input', async () => {
    const missing = await GET(makeEvent({ role: 'admin' }));
    const oversized = await GET(makeEvent({ role: 'admin', query: '?cohort=openspec:change&limit=6' }));
    const duplicate = await GET(makeEvent({ role: 'admin', query: '?cohort=openspec:change&cohort=openspec:other' }));

    expect(missing.status).toBe(400);
    expect(oversized.status).toBe(400);
    expect(duplicate.status).toBe(400);
    expect(listKanbanTasksMock).not.toHaveBeenCalled();
  });

  it('lists at most five pending dependency-ready rows for exactly one cohort without authorizing dispatch', async () => {
    listKanbanTasksMock.mockResolvedValue({ tasks: [], total: 0, invalid: [] });
    const response = await GET(makeEvent({ role: 'admin', query: '?cohort=openspec:parent-atlas-agentic-file-compiler' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      cohort: 'openspec:parent-atlas-agentic-file-compiler',
      dispatchAllowed: false,
      executionAdmission: 'BLOCKED_PERMISSION_AND_REVISION_PROOF',
      canonicalAuthority: false,
    });
    expect(listKanbanTasksMock).toHaveBeenCalledWith({
      featureId: 'openspec:parent-atlas-agentic-file-compiler',
      lane: 'todo',
      status: 'pending',
      readyOnly: true,
      limit: 5,
    });
  });
});
