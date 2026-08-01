// @vitest-environment node
/**
 * Integration test for the atlas.retrieveEvidence tRPC procedure
 * (src/lib/server/trpc/routers/atlas.ts), invoked directly via tRPC's
 * createCaller (no HTTP layer) so it stays fast and deterministic.
 *
 * The equivalent live-HTTP proof (real auth session via
 * /api/auth/demo-login, real Postgres FTS results) is recorded in
 * openspec/changes/parent-atlas-runtime-ownership-precall/proposal.md's
 * Progress section — this file covers MCP_OR_TRPC_CONSUMER_READS_RESULT
 * at the unit/integration level, and the router's own degraded-error
 * fallback branch, which the live proof didn't happen to exercise
 * (nothing failed during that run).
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TRPCContext } from '$lib/server/trpc/init.js';

const { mockRetrieveEvidence } = vi.hoisted(() => ({
  mockRetrieveEvidence: vi.fn(),
}));

vi.mock('$lib/server/parent-atlas/precall/retrieve-evidence-service.js', async () => {
  const actual = await vi.importActual<
    typeof import('$lib/server/parent-atlas/precall/retrieve-evidence-service.js')
  >('$lib/server/parent-atlas/precall/retrieve-evidence-service.js');
  return {
    ...actual,
    retrieveEvidence: mockRetrieveEvidence,
  };
});

function makeCtx(): TRPCContext {
  return { userId: 1, sessionId: 'test-session', requestId: 'test-request' };
}

describe('atlas.retrieveEvidence (tRPC procedure)', () => {
  let appRouter: typeof import('$lib/server/trpc/router.js').appRouter;

  // router.ts's import graph does real (flaky, occasionally slow) work at
  // module-load time somewhere downstream — imported once here, not per
  // test, with a generous timeout so that cost is paid predictably once
  // rather than risking every individual test's default hook timeout.
  beforeAll(async () => {
    const mod = await import('$lib/server/trpc/router.js');
    appRouter = mod.appRouter;
  }, 30_000);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('INVALID_INPUT_REJECTED — tRPC input validation rejects before the resolver runs', async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      // @ts-expect-error deliberately missing workspaceRevision
      caller.atlas.retrieveEvidence({ query: 'test' })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mockRetrieveEvidence).not.toHaveBeenCalled();
  });

  it('MCP_OR_TRPC_CONSUMER_READS_RESULT — valid input reaches the service and returns its schema-shaped output', async () => {
    mockRetrieveEvidence.mockResolvedValue({
      workspaceRevision: 'rev-1',
      evidence: [{ packetKey: 'k1', sourceRef: 'src/foo.ts', score: 0.5, summary: 'hit' }],
      lanes: [{ lane: 'lexical', status: 'success', candidateCount: 1, fallbackUsed: false }],
    });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.atlas.retrieveEvidence({
      query: 'find auth logic',
      workspaceRevision: 'rev-1',
    });

    expect(mockRetrieveEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'find auth logic', workspaceRevision: 'rev-1' })
    );
    expect(result.workspaceRevision).toBe('rev-1');
    expect(result.evidence).toHaveLength(1);
  });

  it('degraded — service throwing an unexpected error still returns a schema-valid response, not a 500', async () => {
    mockRetrieveEvidence.mockRejectedValue(new Error('Postgres connection refused'));

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.atlas.retrieveEvidence({
      query: 'find auth logic',
      workspaceRevision: 'rev-1',
    });

    // Same top-level shape as a success response — no thrown TRPCError,
    // no missing keys a client would need to special-case.
    expect(result.workspaceRevision).toBe('rev-1');
    expect(result.evidence).toEqual([]);
    expect(result.lanes).toHaveLength(1);
    expect(result.lanes[0].status).toBe('error');
    expect(result.lanes[0].reason).toContain('Postgres connection refused');
  });

  it('re-throws RetrieveEvidenceInputError rather than masking it as a degraded response', async () => {
    const { RetrieveEvidenceInputError } = await vi.importActual<
      typeof import('$lib/server/parent-atlas/precall/retrieve-evidence-service.js')
    >('$lib/server/parent-atlas/precall/retrieve-evidence-service.js');
    mockRetrieveEvidence.mockRejectedValue(new RetrieveEvidenceInputError([{ message: 'bad shape' }]));

    const caller = appRouter.createCaller(makeCtx());
    // tRPC's own resolver wrapper normalizes any thrown error that escapes
    // a .query()/.mutation() into a TRPCError (setting `.cause` to the
    // original) — the router's `if (error instanceof RetrieveEvidenceInputError) throw error`
    // branch still matters: it's what stops that error from being caught
    // and silently converted into the degraded-response fallback below it.
    await expect(
      caller.atlas.retrieveEvidence({ query: 'find auth logic', workspaceRevision: 'rev-1' })
    ).rejects.toMatchObject({
      cause: expect.any(RetrieveEvidenceInputError),
    });
  });
});
