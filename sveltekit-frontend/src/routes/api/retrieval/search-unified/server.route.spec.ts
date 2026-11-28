import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runWorkflowMock } = vi.hoisted(() => ({
  runWorkflowMock: vi.fn(async () => ({ packets: [], workflowState: 'COMPLETE' })),
}));

vi.mock('$lib/server/retrieval/semantic-search-workflow.js', () => ({
  SemanticSearchWorkflowRequestSchema: {
    parse: (value: unknown) => value,
  },
  runSemanticSearchWorkflow: runWorkflowMock,
}));

import { POST } from './+server.js';

describe('POST /api/retrieval/search-unified', () => {
  beforeEach(() => runWorkflowMock.mockClear());

  it('passes the server request signal into the workflow runtime options', async () => {
    const controller = new AbortController();
    const request = new Request('http://localhost/api/retrieval/search-unified', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'bounded retrieval' }),
      signal: controller.signal,
    });

    const response = await POST({
      request,
      locals: { user: { id: 'actor-fixture' } },
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);
    expect(runWorkflowMock).toHaveBeenCalledWith(expect.any(Object), {
      userId: 'actor-fixture',
      caseId: null,
      signal: request.signal,
    });
  });
});
