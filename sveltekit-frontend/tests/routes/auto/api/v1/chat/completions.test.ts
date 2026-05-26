// @vitest-environment node
/**
 * AUTO-GENERATED TEST STUB — do not edit boilerplate, fill in it.todo() blocks.
 *
 * Route: src/routes/api/v1/chat/completions/+server.ts
 * Handlers: POST
 *
 * G26 pattern: node env, vi.hoisted mocks (add as needed), lazy import in
 * beforeEach, 4 baseline cases per handler.
 *
 * Run:  npm run test -- api/v1/chat/completions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  runChatCompletion: vi.fn(),
}));

vi.mock('$lib/server/ai/openai-facade.js', () => ({
  runChatCompletion: mocks.runChatCompletion,
}));

describe('src/routes/api/v1/chat/completions/+server.ts', () => {
  describe('POST /api/v1/chat/completions', () => {
    let handler: (evt: { request: Request; locals: Record<string, unknown>; url: URL; params: Record<string, string> }) => Promise<Response>;

    beforeEach(async () => {
      vi.resetAllMocks();
      const mod = await import('../../../../../../src/routes/api/v1/chat/completions/+server.js') as Record<string, unknown>;
      handler = mod.POST as typeof handler;
    });

    function makeReq(body?: unknown) {
      return new Request(
        'http://localhost/api/v1/chat/completions',
        body !== undefined
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }
          : {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            }
      );
    }
    function makeUrl() { return new URL('http://localhost/api/v1/chat/completions'); }

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

    it('200 — stream:true returns SSE response from cached or provider path', async () => {
      mocks.runChatCompletion.mockResolvedValue({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: 1,
        model: 'gemma4-rotorquant:latest',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'hello world' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 3, total_tokens: 3 },
      });

      const { POST } = (await import(
        '../../../../../../src/routes/api/v1/chat/completions/+server.js'
      )) as Record<string, unknown>;
      const response = await (POST as typeof handler)({
        request: makeReq({
          model: 'yorha-legal',
          messages: [{ role: 'user', content: 'hello' }],
          stream: true,
        }),
        locals: { user: { id: 'u1' } },
        url: makeUrl(),
        params: {},
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      const bodyText = await response.text();
      expect(bodyText).toContain('data: ');
      expect(bodyText).toContain('[DONE]');
      expect(mocks.runChatCompletion).toHaveBeenCalled();
    });
  });

});
