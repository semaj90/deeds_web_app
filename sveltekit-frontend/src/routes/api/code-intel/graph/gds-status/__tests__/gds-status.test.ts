import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/graph/neo4j-gds.js', () => ({
  getGdsStatus: vi.fn(),
  getGdsExtendedStats: vi.fn(),
  ensureGdsProjection: vi.fn(),
  runPageRankMutate: vi.fn(),
  runLouvainMutate: vi.fn(),
  runKnnMutate: vi.fn(),
  writeAuthorityScoresToQdrant: vi.fn(),
  seedAndClassifyOntology: vi.fn(),
  getUnclassifiedFileCount: vi.fn().mockResolvedValue(0),
}));

import { POST } from '../+server.js';

const user = { id: 'test-user' };

function request(body?: unknown): Request {
  return new Request('http://localhost/api/code-intel/graph/gds-status', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('POST /api/code-intel/graph/gds-status', () => {
  it('rejects unauthenticated requests', async () => {
    const response = await POST({ request: request(), locals: {} } as never);

    expect(response.status).toBe(401);
  });

  it('defaults to the read-only d27 check', async () => {
    const response = await POST({ request: request(), locals: { user } } as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.action).toBe('d27');
    expect(body.d27Passed).toBe(true);
  });

  it('rejects invalid actions through schema validation', async () => {
    const response = await POST({ request: request({ action: 'drop-everything' }), locals: { user } } as never);

    expect(response.status).toBe(400);
  });

  it('requires explicit apply for mutation-capable actions', async () => {
    const response = await POST({ request: request({ action: 'pagerank' }), locals: { user } } as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Mutation-capable GDS actions require apply=true' });
  });
});
