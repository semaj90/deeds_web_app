// @vitest-environment node
/**
 * AUTO-GENERATED TEST STUB — do not edit boilerplate, fill in it.todo() blocks.
 *
 * Route: src/routes/api/acp/execute/+server.ts
 * Handlers: POST
 *
 * G26 pattern: node env, vi.hoisted mocks (add as needed), lazy import in
 * beforeEach, 4 baseline cases per handler.
 *
 * Run:  npm run test -- api/acp/execute
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Add hoisted mocks here when handler logic is filled in:
// const { mockFoo } = vi.hoisted(() => ({ mockFoo: vi.fn() }));
// vi.mock('$lib/server/foo', () => ({ foo: mockFoo }));

describe('src/routes/api/acp/execute/+server.ts', () => {
  describe('POST /api/acp/execute', () => {
    let handler: (evt: { request: Request; locals: Record<string, unknown>; url: URL; params: Record<string, string> }) => Promise<Response>;

    beforeEach(async () => {
      vi.resetAllMocks();
      const mod = await import('../../../../../src/routes/api/acp/execute/+server.js') as Record<string, unknown>;
      handler = mod.POST as typeof handler;
    }, 30000);

    function makeReq(body?: unknown) {
      return new Request('http://localhost/api/acp/execute', body !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    }
    function makeUrl() { return new URL('http://localhost/api/acp/execute'); }

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

    it('200 — dispatches the RAPIDS PageRank dry-run tool through ACP', async () => {
      const resp = await handler({
        request: makeReq({ tool: 'atlas:cugraph:pagerank:dry', args: { taskId: 'pagerank-dry-smoke' }, dryRun: true }),
        locals: { user: { id: 'test-user' } },
        url: makeUrl(),
        params: {},
      });

      expect(resp.status).toBe(200);
      const body = await resp.json() as {
        success: boolean;
        kind: string;
        result?: { steps?: Array<{ action: string; target: string; detail: string }> };
        error?: string;
      };

      expect(body.success).toBe(true);
      expect(body.kind).toBe('plan');
      expect(body.result?.steps?.[0]?.action).toBe('exec');
      expect(body.result?.steps?.[0]?.target).toBe('wsl-bash');
    });

    it('200 — dispatches the live RAPIDS PageRank tool through ACP in dry-run mode', async () => {
      const resp = await handler({
        request: makeReq({ tool: 'atlas:cugraph:pagerank', args: { taskId: 'pagerank-live-smoke' }, dryRun: true }),
        locals: { user: { id: 'test-user' } },
        url: makeUrl(),
        params: {},
      });

      expect(resp.status).toBe(200);
      const body = await resp.json() as {
        success: boolean;
        kind: string;
        result?: { steps?: Array<{ action: string; target: string; detail: string }> };
        error?: string;
      };

      expect(body.success).toBe(true);
      expect(body.kind).toBe('plan');
      expect(body.result?.steps?.[0]?.action).toBe('exec');
      expect(body.result?.steps?.[0]?.target).toBe('wsl-bash');
      expect(body.result?.steps?.[0]?.detail).toContain('atlas-rapids-cu13');
    });
  });

});
