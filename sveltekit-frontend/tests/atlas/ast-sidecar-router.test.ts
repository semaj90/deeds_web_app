// @vitest-environment node
/**
 * Integration test for the astSidecar.chunk tRPC procedure
 * (src/lib/server/trpc/routers/ast-sidecar.ts), invoked directly via tRPC's
 * createCaller (no HTTP layer, no real Docker sidecar call).
 *
 * Mirrors tests/atlas/atlas-router.test.ts's pattern: mock the underlying
 * provider factory, prove input validation, success passthrough, and the
 * degraded-response fallback when the sidecar is unavailable.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TRPCContext } from '$lib/server/trpc/init.js';

const { mockMaterialize } = vi.hoisted(() => ({
  mockMaterialize: vi.fn(),
}));

vi.mock('$lib/server/atlas/indexing/graphify-structural-materializer.js', async () => {
  const actual = await vi.importActual<
    typeof import('$lib/server/atlas/indexing/graphify-structural-materializer.js')
  >('$lib/server/atlas/indexing/graphify-structural-materializer.js');
  return {
    ...actual,
    create8095AstProvider: () => ({ materialize: mockMaterialize }),
  };
});

function makeCtx(): TRPCContext {
  return { userId: 1, sessionId: 'test-session', requestId: 'test-request' };
}

describe('astSidecar.chunk (tRPC procedure)', () => {
  let appRouter: typeof import('$lib/server/trpc/router.js').appRouter;

  beforeAll(async () => {
    const mod = await import('$lib/server/trpc/router.js');
    appRouter = mod.appRouter;
  }, 30_000);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('INVALID_INPUT_REJECTED — missing required fields rejected before the resolver runs', async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      // @ts-expect-error deliberately missing source/language
      caller.astSidecar.chunk({ sourceRef: 'src/foo.ts', sourceRevision: 'sha256:x' })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mockMaterialize).not.toHaveBeenCalled();
  });

  it('valid input reaches the provider and returns its schema-shaped chunk evidence', async () => {
    mockMaterialize.mockResolvedValue({
      provider: 'treesitter-chunker-8095',
      status: 'PROVEN',
      diagnostics: [],
      evidence: {
        schema: 'atlas.ast.evidence.v1',
        engine: 'treesitter-chunker',
        engine_version: '4.0.0',
        language: 'typescript',
        file_path: 'src/foo.ts',
        source_revision: 'sha256:x',
        chunks: [{
          node_type: 'function_declaration',
          kind: 'function',
          name: 'foo',
          parent_route: [],
          parent_context: null,
          start_byte: 0,
          end_byte: 20,
          start_line: 0,
          start_column: 0,
          end_line: 0,
          end_column: 20,
          calls: [],
          imports: [],
          exports: [],
        }],
        edges: [],
        diagnostics: [],
        error_tag: null,
        syntax_status: 'CLEAN',
      },
    });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.astSidecar.chunk({
      sourceRef: 'src/foo.ts',
      sourceRevision: 'sha256:x',
      language: 'typescript',
      source: 'export function foo(){ return 1; }',
    });

    expect(mockMaterialize).toHaveBeenCalledWith(
      expect.objectContaining({ sourceRef: 'src/foo.ts', language: 'typescript' })
    );
    expect(result.status).toBe('PROVEN');
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].name).toBe('foo');
  });

  it('degraded — provider failure still returns a schema-valid FAILED response, not a 500', async () => {
    mockMaterialize.mockResolvedValue({
      provider: 'treesitter-chunker-8095',
      status: 'FAILED',
      diagnostics: ['fetch failed: ECONNREFUSED'],
      errorTag: 'SIDECAR_UNAVAILABLE_OR_SCHEMA_FAILURE',
    });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.astSidecar.chunk({
      sourceRef: 'src/foo.ts',
      sourceRevision: 'sha256:x',
      language: 'typescript',
      source: 'export function foo(){ return 1; }',
    });

    expect(result.status).toBe('FAILED');
    expect(result.chunks).toEqual([]);
    expect(result.errorTag).toBe('SIDECAR_UNAVAILABLE_OR_SCHEMA_FAILURE');
    expect(result.diagnostics[0]).toContain('ECONNREFUSED');
  });
});
