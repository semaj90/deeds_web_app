import { beforeEach, describe, expect, it, vi } from 'vitest';

const boardMocks = vi.hoisted(() => ({
  KanbanTaskLaneSchema: {
    parse: (v: string) => v,
  },
  KanbanTaskStatusSchema: {
    parse: (v: string) => v,
  },
  listKanbanTasks: vi.fn(),
  listKanbanTaskEvents: vi.fn(),
  showKanbanTask: vi.fn(),
  createKanbanTask: vi.fn(),
  claimKanbanTask: vi.fn(),
  heartbeatKanbanTask: vi.fn(),
  completeKanbanTask: vi.fn(),
  blockKanbanTask: vi.fn(),
  retryKanbanTask: vi.fn(),
  reclaimStaleKanbanTask: vi.fn(),
}));

vi.mock('$lib/server/atlas/kanban-task-board.js', () => boardMocks);

import { GET, POST } from './+server.js';

function makeEvent(options: {
  role?: string;
  userId?: string;
  sessionId?: string;
  url?: string;
  body?: unknown;
}) {
  const url = new URL(options.url ?? 'http://localhost/api/admin/atlas/kanban-tickets');
  return {
    url,
    locals: {
      session: options.sessionId ? { id: options.sessionId } : null,
      user: options.role
        ? { id: options.userId ?? 'admin-1', role: options.role }
        : null,
    },
    request: new Request(url.toString(), {
      method: options.body !== undefined ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    }),
  } as any;
}

describe('/api/admin/atlas/kanban-tickets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 with stable JSON shape when user is not admin', async () => {
    const res = await GET(makeEvent({ role: 'viewer' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: false,
      tasks: [],
      total: 0,
      events: [],
      canonicalAuthority: false,
      error: 'ADMIN_ONLY',
    });
  });

  it('denies Kanban writes from the synthetic development admin', async () => {
    const res = await POST(makeEvent({
      role: 'admin',
      sessionId: 'dev-bypass-session',
      body: { action: 'agent_dispatch', taskId: 'task-1', workerId: 'worker-1' },
    }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, error: 'ADMIN_ONLY' });
    expect(boardMocks.claimKanbanTask).not.toHaveBeenCalled();
    expect(boardMocks.completeKanbanTask).not.toHaveBeenCalled();
  });

  it('lists kanban tasks and recent events for admin GET', async () => {
    boardMocks.listKanbanTasks.mockResolvedValue({
      tasks: [
        {
          taskId: 'task-1',
          featureId: 'feat-1',
          featureLabel: 'Feature 1',
          sourceRefs: ['src/a.ts'],
          lane: 'todo',
          status: 'pending',
          validationCommand: null,
          createdAt: '2026-10-25T00:00:00.000Z',
          updatedAt: '2026-10-25T00:00:00.000Z',
        },
      ],
      total: 1,
    });
    boardMocks.listKanbanTaskEvents.mockResolvedValue([
      {
        taskId: 'task-1',
        runId: null,
        eventType: 'ticket_created',
        payload: { workspaceRevision: 'sha256:23413763' },
        createdAt: '2026-10-25T00:00:00.000Z',
      },
    ]);

    const res = await GET(makeEvent({ role: 'admin' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.total).toBe(1);
    expect(body.tasks).toHaveLength(1);
    expect(body.events).toHaveLength(1);
    expect(body.canonicalAuthority).toBe(false);
  });

  it('looks up one exact ticket and its events without listing or mutating the board', async () => {
    boardMocks.showKanbanTask.mockResolvedValue({ taskId: 'openspec:topk#abc123' });
    boardMocks.listKanbanTaskEvents.mockResolvedValue([{ id: 'event-1', taskId: 'openspec:topk#abc123' }]);

    const res = await GET(makeEvent({ role: 'admin', url: 'http://localhost/api/admin/atlas/kanban-tickets?taskId=openspec%3Atopk%23abc123' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(await res.json()).toMatchObject({
      ok: true,
      total: 1,
      tasks: [{ taskId: 'openspec:topk#abc123' }],
      events: [{ taskId: 'openspec:topk#abc123' }],
      canonicalAuthority: false,
    });
    expect(boardMocks.showKanbanTask).toHaveBeenCalledWith({ taskId: 'openspec:topk#abc123' });
    expect(boardMocks.listKanbanTasks).not.toHaveBeenCalled();
    expect(boardMocks.createKanbanTask).not.toHaveBeenCalled();
  });

  it('rejects malformed exact ticket lookups and reports missing tickets distinctly', async () => {
    const invalid = await GET(makeEvent({ role: 'admin', url: 'http://localhost/api/admin/atlas/kanban-tickets?taskId=%20%20' }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ ok: false, tasks: [], error: 'INVALID_TASK_ID' });

    boardMocks.showKanbanTask.mockResolvedValue(null);
    const missing = await GET(makeEvent({ role: 'admin', url: 'http://localhost/api/admin/atlas/kanban-tickets?taskId=not-found' }));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ ok: false, tasks: [], error: 'TASK_NOT_FOUND' });
  });

  it('creates a revision-bound ticket via projectRecommendationToKanbanV1 + createKanbanTask', async () => {
    boardMocks.createKanbanTask.mockResolvedValue({
      taskId: 'ticket-oaklib-1',
      featureId: 'feat:oaklib-tuple-gate',
      featureLabel: 'Verify OAKLIB tuple gate',
      sourceRefs: ['scripts/atlas/prove_oaklib_ontology_tuple_to_pytorch_loading_v1.py'],
      lane: 'todo',
      status: 'pending',
      validationCommand: 'py -3.13 -m pytest python/tests/test_oaklib_ontology_tuple_to_pytorch_loading_v1.py -v',
      createdAt: '2026-10-25T04:00:00.000Z',
      updatedAt: '2026-10-25T04:00:00.000Z',
    });

    const res = await POST(
      makeEvent({
        role: 'admin',
        body: {
          action: 'create_ticket',
          taskId: 'ticket-oaklib-1',
          featureId: 'feat:oaklib-tuple-gate',
          featureLabel: 'Verify OAKLIB tuple gate',
          summary: 'Validate GATED vs ACTIVE_VERIFIED domain classification tuples',
          priority: 'high',
          sourceRefs: ['scripts/atlas/prove_oaklib_ontology_tuple_to_pytorch_loading_v1.py'],
          validationCommand: 'py -3.13 -m pytest python/tests/test_oaklib_ontology_tuple_to_pytorch_loading_v1.py -v',
          permissionMode: 'proposal_only',
          sourceRevision: `sha256:${'a'.repeat(64)}`,
          workspaceRevision: 'sha256:23413763d52c94ecf5e4566edbfbe283505e048aafe7f2b7a417dc55c74492e5',
          graphifyRevision: 'graphify:23413763',
          featureRevision: 'feature:oaklib-v1',
        },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.action).toBe('create_ticket');
    expect(body.recommendationProjection.status).toBe('proposed');
    expect(body.recommendationProjection.humanDecision).toBe('pending');
    expect(body.canonicalAuthority).toBe(false);
    expect(boardMocks.createKanbanTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'ticket-oaklib-1',
        featureId: 'feat:oaklib-tuple-gate',
        lane: 'todo',
        priority: 75,
        sourceRevision: `sha256:${'a'.repeat(64)}`,
        workspaceRevision: 'sha256:23413763d52c94ecf5e4566edbfbe283505e048aafe7f2b7a417dc55c74492e5',
      }),
    );
  });

  it('rejects malformed source revisions before creating a ticket', async () => {
    const res = await POST(makeEvent({
      role: 'admin',
      body: {
        action: 'create_ticket',
        taskId: 'ticket-invalid-revision',
        featureId: 'feat:test',
        featureLabel: 'Invalid revision test',
        sourceRefs: ['openspec/changes/sample/tasks.md#L1'],
        validationCommand: 'node --version',
        sourceRevision: 'sha256:not-a-hash',
      },
    }));

    expect(res.status).toBe(400);
    expect(boardMocks.createKanbanTask).not.toHaveBeenCalled();
  });

  it('supports claim and review_decision actions', async () => {
    boardMocks.claimKanbanTask.mockResolvedValue({
      task: { taskId: 'ticket-oaklib-1', lane: 'in_progress', status: 'active' },
      claimToken: 'claim:ticket-oaklib-1:worker-1:1',
      runId: 'run:ticket-oaklib-1:1',
      claimExpiresAt: '2026-10-25T04:15:00.000Z',
    });

    const claimRes = await POST(
      makeEvent({
        role: 'admin',
        body: {
          action: 'claim',
          taskId: 'ticket-oaklib-1',
          workerId: 'worker-1',
        },
      }),
    );
    expect(claimRes.status).toBe(200);
    const claimBody = await claimRes.json();
    expect(claimBody.ok).toBe(true);
    expect(claimBody.claimToken).toContain('claim:');

    boardMocks.createKanbanTask.mockResolvedValue({
      taskId: 'ticket-oaklib-2',
      featureId: 'feat:oaklib-tuple-gate',
      featureLabel: 'Verify OAKLIB tuple gate',
      sourceRefs: ['scripts/atlas/prove_oaklib_ontology_tuple_to_pytorch_loading_v1.py'],
      lane: 'todo',
      status: 'pending',
      validationCommand: 'py -3.13 -m pytest',
      createdAt: '2026-10-25T04:00:00.000Z',
      updatedAt: '2026-10-25T04:00:00.000Z',
    });
    const createRes = await POST(
      makeEvent({
        role: 'admin',
        body: {
          action: 'create_ticket',
          taskId: 'ticket-oaklib-2',
          featureId: 'feat:oaklib-tuple-gate',
          featureLabel: 'Verify OAKLIB tuple gate',
          sourceRefs: ['scripts/atlas/prove_oaklib_ontology_tuple_to_pytorch_loading_v1.py'],
          validationCommand: 'py -3.13 -m pytest',
        },
      }),
    );
    const createdBody = await createRes.json();

    const reviewRes = await POST(
      makeEvent({
        role: 'admin',
        body: {
          action: 'review_decision',
          recommendation: createdBody.recommendationProjection,
          decision: 'approve',
          reviewerId: 'admin-operator',
          notes: 'Verified 2/2 OAKLIB PyTorch loading and 3/3 cudf DLPack tests',
        },
      }),
    );
    expect(reviewRes.status).toBe(200);
    const reviewBody = await reviewRes.json();
    expect(reviewBody.ok).toBe(true);
    expect(reviewBody.recommendationProjection.status).toBe('approved');
    expect(reviewBody.recommendationProjection.humanDecision).toBe('approve');
    expect(reviewBody.reviewEvent.decision).toBe('approve');
  });

  it('refuses agent_dispatch without a validated worker and never claims or completes the task', async () => {
    const res = await POST(
      makeEvent({
        role: 'admin',
        body: {
          action: 'agent_dispatch',
          taskId: 'ticket-agent-1',
        },
      }),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.action).toBe('agent_dispatch');
    expect(body.error).toBe('AGENT_DISPATCH_UNAVAILABLE_VALIDATED_WORKER_REQUIRED');
    expect(boardMocks.claimKanbanTask).not.toHaveBeenCalled();
    expect(boardMocks.completeKanbanTask).not.toHaveBeenCalled();
  });
});
