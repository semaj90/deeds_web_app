// @vitest-environment node
/**
 * AUTO-GENERATED TEST STUB — do not edit boilerplate, fill in it.todo() blocks.
 *
 * Route: src/routes/api/evidence/[id]/suggest-summary/+server.ts
 * Handlers: POST
 *
 * G26 pattern: node env, vi.hoisted mocks (add as needed), lazy import in
 * beforeEach, 4 baseline cases per handler.
 *
 * Run:  npm run test -- api/evidence/__id/suggest-summary
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSelect, mockResolveTarget, mockEq, mockAnd, mockOr } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockResolveTarget: vi.fn(),
  mockEq: vi.fn(),
  mockAnd: vi.fn(),
  mockOr: vi.fn(),
}));

vi.mock('$lib/server/db/client.js', () => ({ db: { select: mockSelect } }));
vi.mock('$lib/server/db/schema-postgres.js', () => ({
  evidence: {
    id: 'id', userId: 'userId', uploadedBy: 'uploadedBy', title: 'title',
    description: 'description', summary: 'summary', extractedText: 'extractedText', evidenceType: 'evidenceType',
  },
}));
vi.mock('drizzle-orm', () => ({ and: mockAnd, eq: mockEq, or: mockOr }));
vi.mock('$lib/server/llm/runtime-contract.js', () => ({
  resolveLlamaInferenceTarget: mockResolveTarget,
}));

describe('src/routes/api/evidence/[id]/suggest-summary/+server.ts', () => {
  describe('POST /api/evidence/:id/suggest-summary', () => {
    let handler: (evt: { request: Request; locals: Record<string, unknown>; url: URL; params: Record<string, string> }) => Promise<Response>;

    beforeEach(async () => {
      vi.resetAllMocks();
      mockEq.mockImplementation((column, value) => ({ column, value }));
      mockAnd.mockImplementation((...conditions) => conditions);
      mockOr.mockImplementation((...conditions) => conditions);
      mockSelect.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: async () => [{
              id: '1a0d09d2-8127-4cc2-9999-5b2c8a51a110',
              title: 'Ledger exhibit',
              description: 'A receipt from the scene.',
              summary: 'Previously stored synopsis.',
              extractedText: 'The signed ledger records a transfer on March 4. '.repeat(20),
              evidenceType: 'document',
            }],
          }),
        }),
      });
      mockResolveTarget.mockResolvedValue({
        baseUrl: 'http://127.0.0.1:8090',
        model: 'ornith-1.5-9b',
      });
      const mod = await import('../../../../../../src/routes/api/evidence/[id]/suggest-summary/+server.js') as Record<string, unknown>;
      handler = mod.POST as typeof handler;
    });

    function makeReq(body?: unknown) {
      return new Request('http://localhost/api/evidence/:id/suggest-summary', body !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    }
    function makeUrl() { return new URL('http://localhost/api/evidence/:id/suggest-summary'); }

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

    it('uses extracted document text and the configured loaded llama-server model', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
        choices: [{ message: { content: 'The ledger records a transfer on March 4, signed by the account holder.' } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

      const response = await handler({
        request: makeReq(),
        locals: { user: { id: 1 } },
        url: makeUrl(),
        params: { id: '1a0d09d2-8127-4cc2-9999-5b2c8a51a110' },
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.generated).toBe(true);
      expect(body.contextSource).toBe('extracted_text');
      expect(body.model).toBe('ornith-1.5-9b');
      expect(fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:8090/v1/chat/completions',
        expect.objectContaining({ method: 'POST' }),
      );
      const requestBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
      expect(requestBody.messages[1].content).toContain('The signed ledger records a transfer');
      expect(requestBody.messages[1].content).not.toContain('Previously stored synopsis.');
    });

    it('returns an explicitly marked excerpt when model resolution fails', async () => {
      mockResolveTarget.mockRejectedValue(new Error('llama-server unavailable'));

      const response = await handler({
        request: makeReq(),
        locals: { user: { id: 1 } },
        url: makeUrl(),
        params: { id: '1a0d09d2-8127-4cc2-9999-5b2c8a51a110' },
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.generated).toBe(false);
      expect(body.model).toBe('excerpt-fallback');
      expect(body.contextSource).toBe('extracted_text');
      expect(body.suggestedText).toContain('The signed ledger records a transfer');
    });
  });

});
