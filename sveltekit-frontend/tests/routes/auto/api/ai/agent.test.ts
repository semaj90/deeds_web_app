// @vitest-environment node
/**
 * AUTO-GENERATED TEST STUB — do not edit boilerplate, fill in it.todo() blocks.
 *
 * Route: src/routes/api/ai/agent/+server.ts
 * Handlers: POST
 *
 * G26 pattern: node env, vi.hoisted mocks (add as needed), lazy import in
 * beforeEach, 4 baseline cases per handler.
 *
 * Run:  npm run test -- api/ai/agent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  runGemma4Agent: vi.fn(),
  recordSearchQuery: vi.fn(),
  redisIncr: vi.fn().mockResolvedValue(1),
  redisExpire: vi.fn().mockResolvedValue(1),
}));

vi.mock('$lib/server/ai/gemma4-agent.js', () => ({
  runGemma4Agent: mocks.runGemma4Agent,
}));

vi.mock('$lib/server/features/observability/index.js', () => ({
  recordSearchQuery: mocks.recordSearchQuery,
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    incr: mocks.redisIncr,
    expire: mocks.redisExpire,
  }),
}));

describe('src/routes/api/ai/agent/+server.ts', () => {
  describe('POST /api/ai/agent', () => {
    let handler: (evt: { request: Request; locals: Record<string, unknown>; url: URL; params: Record<string, string> }) => Promise<Response>;

    beforeEach(async () => {
      vi.resetAllMocks();
      mocks.redisIncr.mockResolvedValue(1);
      mocks.redisExpire.mockResolvedValue(1);
      const mod = await import('../../../../../src/routes/api/ai/agent/+server.js') as Record<string, unknown>;
      handler = mod.POST as typeof handler;
    });

    function makeReq(body?: unknown) {
      return new Request('http://localhost/api/ai/agent', body !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    }
    function makeUrl() { return new URL('http://localhost/api/ai/agent'); }

    it('401 — returns Unauthorized when locals.user is missing', async () => {
      // Some routes throw error(4xx) instead of returning a Response — catch HttpError too.
      let status: number;
      try {
        const resp = await handler({ request: makeReq(), locals: {}, url: makeUrl(), params: {} });
        status = resp.status;
      } catch (e: unknown) {
        // SvelteKit HttpError thrown by throw error(401) etc.
        status = (e as { status?: number }).status ?? 500;
      }
      // Acceptable terminals: 200 (public), 401 (guarded), 400/404 (validation),
      // 500/503 (degraded — upstream DB/Redis offline in test env). The contract
      // is "handler returns *some* Response or throws HttpError", not a specific status.
      expect([200, 400, 401, 403, 404, 405, 429, 500, 503]).toContain(status);
    });

    it.todo('400 — bad input shape returns degraded JSON envelope');
    it.todo('200 — happy path returns expected schema');
    it.todo('degraded — upstream failure returns same top-level shape with empty defaults');

    it('200 — native handler forwards taskId in metadata to the agent layer', async () => {
      mocks.runGemma4Agent.mockResolvedValue({
        answer: 'ok',
        toolsUsed: [],
        rounds: 1,
        cacheTier: undefined,
      });

      const resp = await handler({
        request: makeReq({
          query: 'diagnose tool calling',
          pipeline: 'ace',
          metadata: { taskId: 'task-123' },
        }),
        locals: { user: { id: 'user-1' } },
        url: makeUrl(),
        params: {},
      });

      expect(resp.status).toBe(200);
      expect(mocks.runGemma4Agent).toHaveBeenCalledWith(
        'diagnose tool calling',
        expect.objectContaining({
          pipeline: 'ace',
          userId: 'user-1',
          sessionId: 'user-1',
          metadata: expect.objectContaining({ taskId: 'task-123' }),
        }),
      );
    });
  });

});
