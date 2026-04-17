// @vitest-environment node
/**
 * Unit tests for DELETE /api/codebase-index/tags
 *
 * Cases covered:
 *  - 401 unauthenticated
 *  - 400 invalid input (missing tag field, empty string)
 *  - 200 success — string[] tags array, tag stripped from N points
 *  - 200 success — string (single-value) tags field, tag stripped
 *  - 200 empty  — no points matched, removed: 0
 *  - 200 paginated — two scroll pages summed correctly
 *  - 500 Qdrant scroll failure — safe error message, no internal detail
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Static module mocks ───────────────────────────────────────────────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public',  () => ({ env: {} }));

vi.mock('$lib/config/env.server.js', () => ({
  getQdrantUrl: () => 'http://qdrant.test:6333',
}));

vi.mock('$lib/server/gpu/simdjson-bridge.js', () => ({
  fastJsonParse: (text: string) => JSON.parse(text),
}));

// ── Hoisted fetch mock ────────────────────────────────────────────────────────

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.stubGlobal('fetch', mockFetch);

// ── Response builders ─────────────────────────────────────────────────────────

function scrollResponse(
  points: Array<{ id: string; payload: Record<string, unknown> }>,
  nextOffset: number | null = null
) {
  return new Response(
    JSON.stringify({ result: { points, next_page_offset: nextOffset } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function putOkResponse() {
  return new Response(JSON.stringify({ result: { status: 'ok' } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

import { makeAuthEvent, makeEvent, responseJson } from '../helpers/route-test-utils.js';

function makeDeleteEvent(tag?: string) {
  return makeAuthEvent({
    method: 'DELETE',
    url: '/api/codebase-index/tags',
    body: tag !== undefined ? { tag } : undefined,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DELETE /api/codebase-index/tags', () => {
  beforeEach(() => {
    // resetAllMocks clears both call history AND the mockOnce/mockResolvedValue queue
    vi.resetAllMocks();
    // Default: any PUT → 200 OK, any scroll → empty page (no next offset)
    mockFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'PUT') return putOkResponse();
      return scrollResponse([]);
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const { DELETE } = await import(
      '../../src/routes/api/codebase-index/tags/+server.js'
    );
    const event = makeEvent({
      method: 'DELETE',
      url: '/api/codebase-index/tags',
      body: { tag: 'api-route' },
    });
    const res = await DELETE(event as any);
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 400 when body is missing tag field', async () => {
    const { DELETE } = await import(
      '../../src/routes/api/codebase-index/tags/+server.js'
    );
    const event = makeAuthEvent({
      method: 'DELETE',
      url: '/api/codebase-index/tags',
      body: {},
    });
    const res = await DELETE(event as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when tag is an empty string', async () => {
    const { DELETE } = await import(
      '../../src/routes/api/codebase-index/tags/+server.js'
    );
    const res = await DELETE(makeDeleteEvent('') as any);
    expect(res.status).toBe(400);
  });

  it('returns 200 with removed: 0 when no points carry the tag', async () => {
    // default mockImplementation returns empty scroll — no override needed

    const { DELETE } = await import(
      '../../src/routes/api/codebase-index/tags/+server.js'
    );
    const res = await DELETE(makeDeleteEvent('orphan-tag') as any);
    expect(res.status).toBe(200);

    const body = await responseJson<{ success: boolean; tag: string; removed: number }>(res);
    expect(body.success).toBe(true);
    expect(body.tag).toBe('orphan-tag');
    expect(body.removed).toBe(0);

    const putCalls = mockFetch.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(putCalls).toHaveLength(0);
  });

  it('strips the tag from string[] payload and PUTs the trimmed array', async () => {
    // First scroll call returns 3 points; subsequent calls are PUTs
    let scrollCalled = false;
    mockFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'PUT') return putOkResponse();
      if (!scrollCalled) {
        scrollCalled = true;
        return scrollResponse([
          { id: 'pt1', payload: { tags: ['api-route', 'auth', 'zod'] } },
          { id: 'pt2', payload: { tags: ['api-route', 'component'] } },
          { id: 'pt3', payload: { tags: ['unrelated'] } },
        ]);
      }
      return scrollResponse([]); // page 2 empty
    });

    const { DELETE } = await import(
      '../../src/routes/api/codebase-index/tags/+server.js'
    );
    const res = await DELETE(makeDeleteEvent('api-route') as any);
    expect(res.status).toBe(200);

    const body = await responseJson<{ success: boolean; removed: number }>(res);
    expect(body.success).toBe(true);
    expect(body.removed).toBe(3);

    const putCalls = mockFetch.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(putCalls).toHaveLength(3);

    const pt1Body = JSON.parse(putCalls[0][1].body as string);
    expect(pt1Body.payload.tags).not.toContain('api-route');
    expect(pt1Body.payload.tags).toContain('auth');

    const pt2Body = JSON.parse(putCalls[1][1].body as string);
    expect(pt2Body.payload.tags).toEqual(['component']);
  });

  it('strips the tag from a string (non-array) tags field', async () => {
    let scrollCalled = false;
    mockFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'PUT') return putOkResponse();
      if (!scrollCalled) {
        scrollCalled = true;
        return scrollResponse([{ id: 'pt1', payload: { tags: 'api-route' } }]);
      }
      return scrollResponse([]);
    });

    const { DELETE } = await import(
      '../../src/routes/api/codebase-index/tags/+server.js'
    );
    const res = await DELETE(makeDeleteEvent('api-route') as any);
    expect(res.status).toBe(200);

    const body = await responseJson<{ removed: number }>(res);
    expect(body.removed).toBe(1);

    const putCalls = mockFetch.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(putCalls).toHaveLength(1);

    const ptBody = JSON.parse(putCalls[0][1].body as string);
    expect(ptBody.payload.tags).toEqual([]); // sole tag cleared
  });

  it('paginates across multiple scroll pages', async () => {
    let scrollCount = 0;
    mockFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'PUT') return putOkResponse();
      scrollCount++;
      if (scrollCount === 1) {
        return scrollResponse(
          [
            { id: 'a', payload: { tags: ['api-route'] } },
            { id: 'b', payload: { tags: ['api-route', 'other'] } },
          ],
          42 // next page offset signals another page
        );
      }
      if (scrollCount === 2) {
        return scrollResponse([{ id: 'c', payload: { tags: ['api-route'] } }]);
      }
      return scrollResponse([]);
    });

    const { DELETE } = await import(
      '../../src/routes/api/codebase-index/tags/+server.js'
    );
    const res = await DELETE(makeDeleteEvent('api-route') as any);
    expect(res.status).toBe(200);

    const body = await responseJson<{ removed: number }>(res);
    expect(body.removed).toBe(3); // 2 from page 1 + 1 from page 2
  });

  it('returns 500 with safe error message when Qdrant scroll throws', async () => {
    mockFetch.mockRejectedValue(
      new Error('INTERNAL: connection refused — do not expose')
    );

    const { DELETE } = await import(
      '../../src/routes/api/codebase-index/tags/+server.js'
    );
    const res = await DELETE(makeDeleteEvent('api-route') as any);
    expect(res.status).toBe(500);

    const body = await responseJson<Record<string, unknown>>(res);
    expect(body.error).toBe('Tag deletion failed');
    expect(JSON.stringify(body)).not.toContain('do not expose');
    expect(body.detail).toBeUndefined();
  });
});
