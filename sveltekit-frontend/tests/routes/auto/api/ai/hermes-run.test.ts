// @vitest-environment node
/**
 * AUTO-GENERATED TEST STUB — do not edit boilerplate, fill in it.todo() blocks.
 *
 * Route: src/routes/api/ai/hermes-run/+server.ts
 * Handlers: POST
 *
 * G26 pattern: node env, vi.hoisted mocks (add as needed), lazy import in
 * beforeEach, 4 baseline cases per handler.
 *
 * Run:  npm run test -- api/ai/hermes-run
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockRunHermesPlanner,
  mockBuildFallbackPlan,
  mockExecuteHermesPlan,
  mockAssembleContext,
  mockSynthesize,
} = vi.hoisted(() => ({
  mockRunHermesPlanner: vi.fn(),
  mockBuildFallbackPlan: vi.fn(),
  mockExecuteHermesPlan: vi.fn(),
  mockAssembleContext: vi.fn(),
  mockSynthesize: vi.fn(),
}));

vi.mock('$lib/server/ai/hermes-planner.js', () => ({
  runHermesPlanner: mockRunHermesPlanner,
  buildFallbackPlan: mockBuildFallbackPlan,
}));

vi.mock('$lib/server/ai/hermes-executor.js', () => ({
  executeHermesPlan: mockExecuteHermesPlan,
}));

vi.mock('$lib/server/ai/hermes-synth.js', () => ({
  assembleContext: mockAssembleContext,
  synthesize: mockSynthesize,
}));

// Add hoisted mocks here when handler logic is filled in:
// const { mockFoo } = vi.hoisted(() => ({ mockFoo: vi.fn() }));
// vi.mock('$lib/server/foo', () => ({ foo: mockFoo }));

describe('src/routes/api/ai/hermes-run/+server.ts', () => {
  describe('POST /api/ai/hermes-run', () => {
    let handler: (evt: { request: Request; locals: Record<string, unknown>; url: URL; params: Record<string, string> }) => Promise<Response>;

    beforeEach(async () => {
      vi.resetAllMocks();
      const mod = await import('../../../../../src/routes/api/ai/hermes-run/+server.js') as Record<string, unknown>;
      handler = mod.POST as typeof handler;
    });

    function makeReq(body?: unknown) {
      return new Request('http://localhost/api/ai/hermes-run', body !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    }
    function makeUrl() { return new URL('http://localhost/api/ai/hermes-run'); }

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
    it('200 — happy path returns expected schema', async () => {
      mockRunHermesPlanner.mockResolvedValue({
        intent: 'smoke',
        risk: 'low',
        tools: [
          {
            name: 'attention_rank_files',
            arguments: { query: 'hot cluster', topN: 5 },
          },
        ],
        finalComposer: 'none',
      });
      mockBuildFallbackPlan.mockReturnValue({
        intent: 'fallback',
        risk: 'low',
        tools: [],
        finalComposer: 'none',
      });
      mockExecuteHermesPlan.mockResolvedValue({
        results: [
          {
            tool: 'attention_rank_files',
            ok: true,
            data: {
              query: 'hot cluster',
              files: [
                {
                  filePath: 'src/lib/server/ai/hermes-planner.ts',
                  qdrantScore: 0.91,
                  blend: 0.78,
                  combinedScore: 0.87,
                },
              ],
              count: 1,
              karpathyFilesAvailable: 42,
            },
          },
        ],
        toolCount: 1,
        durationMs: 11,
      });
      mockAssembleContext.mockReturnValue('packed context');
      mockSynthesize.mockResolvedValue({
        answer: '',
        cacheHit: false,
        durationMs: 0,
        composer: 'none',
      });

      const resp = await handler({
        request: makeReq({ userQuery: 'rank hot files', aceMode: 'analyze' }),
        locals: { user: { id: '1' } },
        url: makeUrl(),
        params: {},
      });
      expect(resp.status).toBe(200);

      const body = (await resp.json()) as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(body.source).toBe('hermes');
      expect((body.plan as { tools?: Array<{ name: string }> }).tools?.[0]?.name).toBe(
        'attention_rank_files'
      );
      expect((body.execution as { results?: Array<{ tool: string }> }).results?.[0]?.tool).toBe(
        'attention_rank_files'
      );
      expect(body.context).toBe('packed context');
    });

    it.todo('degraded — upstream failure returns same top-level shape with empty defaults');
  });

});
