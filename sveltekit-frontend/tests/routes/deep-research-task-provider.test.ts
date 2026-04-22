// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

const {
  mockDbSelect,
  mockDbInsert,
  mockDbUpdate,
  mockSelectFrom,
  mockSelectWhere,
  mockSelectOrderBy,
  mockSelectLimit,
  mockInsertValues,
  mockInsertReturning,
  mockUpdateSet,
  mockUpdateWhere,
  mockUpdateReturning,
  mockRunResearchTask,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockSelectFrom: vi.fn(),
  mockSelectWhere: vi.fn(),
  mockSelectOrderBy: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockInsertValues: vi.fn(),
  mockInsertReturning: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockUpdateReturning: vi.fn(),
  mockRunResearchTask: vi.fn(),
}));

vi.mock('$lib/server/db/client', () => ({
  db: {
    select: (...args: unknown[]) => {
      mockDbSelect(...args);
      return { from: mockSelectFrom };
    },
    insert: (...args: unknown[]) => {
      mockDbInsert(...args);
      return { values: mockInsertValues };
    },
    update: (...args: unknown[]) => {
      mockDbUpdate(...args);
      return { set: mockUpdateSet };
    },
  },
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
  userResearchTasks: {
    id: 'id',
    userId: 'user_id',
    sessionId: 'session_id',
    createdAt: 'created_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (...args: unknown[]) => ({ type: 'eq', args }),
  and: (...args: unknown[]) => ({ type: 'and', args }),
  desc: (...args: unknown[]) => ({ type: 'desc', args }),
}));

vi.mock('$lib/server/research/task-runner.js', () => ({
  runResearchTask: (...args: unknown[]) => mockRunResearchTask(...args),
}));

import { makeAuthEvent, makeEvent, responseJson } from '../helpers/route-test-utils.js';

describe('Research task provider routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockInsertValues.mockReturnValue({ returning: mockInsertReturning });
    mockInsertReturning.mockResolvedValue([
      {
        id: 'task-1',
        title: 'Ollama Task',
        selfPrompt: 'Find hearsay precedent',
        pipelineHint: 'ace',
        result: { provider: 'ollama' },
        status: 'running',
      },
    ]);

    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockReturnValue({ orderBy: mockSelectOrderBy });
    mockSelectOrderBy.mockReturnValue({ limit: mockSelectLimit });
    mockSelectLimit.mockResolvedValue([
      {
        id: 'task-google-done-1',
        title: 'Completed Google Task',
        selfPrompt: 'Investigate hearsay reliability',
        pipelineHint: 'ace',
        status: 'done',
        result: {
          provider: 'google',
          pipeline: 'ace',
          answer: 'Final grounded answer.',
          durationMs: 2200,
          interactionId: 'intr-1',
          imageCount: 1,
          images: [
            {
              src: 'data:image/png;base64,YWJj',
              uri: null,
              mimeType: 'image/png',
              resolution: 'high',
            },
          ],
          thoughtSummaries: ['Draft a two-step research plan.'],
        },
        summaryId: 'summary-1',
      },
    ]);

    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
    mockUpdateReturning.mockResolvedValue([
      {
        id: 'task-1',
        selfPrompt: 'Find hearsay precedent',
        pipelineHint: 'ace',
        result: { provider: 'google' },
        status: 'running',
      },
    ]);

    mockRunResearchTask.mockResolvedValue(undefined);
  });

  it('returns 400 for invalid task payloads', async () => {
    const { POST } = await import('../../src/routes/api/tasks/+server.js');
    const event = makeAuthEvent({
      method: 'POST',
      url: '/api/tasks',
      body: { title: 'Missing prompt' },
    });

    const res = await POST(event as any);
    expect(res.status).toBe(400);
  });

  it('preserves Google image and thought-summary metadata when loading tasks', async () => {
    const { GET } = await import('../../src/routes/api/tasks/+server.js');
    const event = makeAuthEvent({
      method: 'GET',
      url: '/api/tasks',
    });

    const res = await GET(event as any);
    expect(res.status).toBe(200);

    const body = await responseJson<{ tasks: Array<Record<string, unknown>> }>(res);
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0]).toMatchObject({
      id: 'task-google-done-1',
      status: 'done',
      summaryId: 'summary-1',
      result: {
        provider: 'google',
        interactionId: 'intr-1',
        imageCount: 1,
        images: [
          {
            src: 'data:image/png;base64,YWJj',
            uri: null,
            mimeType: 'image/png',
            resolution: 'high',
          },
        ],
        thoughtSummaries: ['Draft a two-step research plan.'],
      },
    });
  });

  it('persists the local ollama provider and dispatches the shared runner when runNow is enabled', async () => {
    const { POST } = await import('../../src/routes/api/tasks/+server.js');
    const event = makeAuthEvent({
      method: 'POST',
      url: '/api/tasks',
      body: {
        title: 'Ollama Task',
        selfPrompt: 'Find hearsay precedent',
        pipelineHint: 'ace',
        provider: 'ollama',
        runNow: true,
      },
    });

    const res = await POST(event as any);
    expect(res.status).toBe(201);

    const body = await responseJson<Record<string, unknown>>(res);
    expect((body.task as Record<string, unknown>).id).toBe('task-1');

    const [insertValues] = mockInsertValues.mock.calls[0] ?? [{}];
    expect(insertValues).toMatchObject({
      status: 'running',
      result: { provider: 'ollama' },
    });
    expect(mockRunResearchTask).toHaveBeenCalledWith('task-1', {
      selfPrompt: 'Find hearsay precedent',
      pipelineHint: 'ace',
      provider: 'ollama',
    });
  });

  it('reruns an existing queued task through the shared runner', async () => {
    const { PATCH } = await import('../../src/routes/api/tasks/[id]/+server.js');
    const event = makeAuthEvent({
      method: 'PATCH',
      url: '/api/tasks/task-1',
      params: { id: 'task-1' },
      body: { run: true },
    });

    const res = await PATCH(event as any);
    expect(res.status).toBe(200);
    expect(mockRunResearchTask).toHaveBeenCalledWith('task-1', {
      selfPrompt: 'Find hearsay precedent',
      pipelineHint: 'ace',
    });
  });
});