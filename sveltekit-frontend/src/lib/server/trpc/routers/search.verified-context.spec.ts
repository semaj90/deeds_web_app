import { describe, expect, it, vi } from 'vitest';
import { searchRouter } from './search.js';

describe('search.verifiedContext', () => {
  it('uses the authenticated tRPC actor and server request ID, not caller identity', async () => {
    const execute = vi.fn(async (_actorId: string | null, request: unknown) => ({
      schema: 'atlas.verified-context-result.v1' as const,
      status: 'REFUSED' as const,
      requestId: (request as { requestId: string }).requestId,
      refusalCode: 'FEATURE_SNAPSHOT_READBACK_NOT_ADMITTED',
      firstFailingBoundary: 'FEATURE_SNAPSHOT',
      receipt: { requestId: (request as { requestId: string }).requestId },
      canonicalAuthority: false as const,
      writesPerformed: false as const,
    }));
    const caller = searchRouter.createCaller({ userId: 42, sessionId: 'session-1', requestId: 'server-request-1', verifiedContextService: { execute } } as never);
    const result = await caller.verifiedContext({ query: 'Drizzle route helpers', topK: 3 });
    expect(execute).toHaveBeenCalledWith('42', { requestId: 'server-request-1', query: 'Drizzle route helpers', topK: 3 });
    expect(result).toEqual({
      schema: 'atlas.verified-context-result.v1', status: 'REFUSED', requestId: 'server-request-1',
      refusalCode: 'FEATURE_SNAPSHOT_READBACK_NOT_ADMITTED', firstFailingBoundary: 'FEATURE_SNAPSHOT',
      receipt: { requestId: 'server-request-1' }, canonicalAuthority: false, writesPerformed: false,
    });
  });

  it('forwards optional recommendationEvidence to the verifiedContextService with server requestId', async () => {
    const execute = vi.fn(async (_actorId: string | null, request: unknown) => ({
      schema: 'atlas.verified-context-result.v1' as const,
      status: 'ADMITTED' as const,
      requestId: (request as { requestId: string }).requestId,
      contextPacketRef: 'verified-context:sha256:abcd',
      contextPacketDigest: 'a'.repeat(64),
      contextManifestChecksum: 'b'.repeat(64),
      promptPlanChecksum: 'c'.repeat(64),
      promptPlan: {},
      receipt: { requestId: (request as { requestId: string }).requestId },
      canonicalAuthority: false as const,
      writesPerformed: false as const,
    }));
    const fakeBundle = { schema: 'atlas.recommendation-evidence-bundle.v1', bundleChecksum: 'f'.repeat(64) };
    const caller = searchRouter.createCaller({
      userId: 42,
      sessionId: 'session-1',
      requestId: 'server-request-rec',
      verifiedContextService: { execute },
    } as never);
    const result = await caller.verifiedContext({
      query: 'Drizzle route helpers',
      topK: 5,
      recommendationEvidence: fakeBundle,
    });
    expect(execute).toHaveBeenCalledWith('42', {
      requestId: 'server-request-rec',
      query: 'Drizzle route helpers',
      topK: 5,
      recommendationEvidence: fakeBundle,
    });
    expect(result.status).toBe('ADMITTED');
  });

  it('refuses cleanly until a server-side service is registered', async () => {
    const caller = searchRouter.createCaller({ userId: 42, sessionId: null, requestId: 'server-request-2' } as never);
    await expect(caller.verifiedContext({ query: 'source search', topK: 5 })).resolves.toMatchObject({
      status: 'REFUSED', refusalCode: 'VERIFIED_CONTEXT_SERVICE_NOT_CONFIGURED', firstFailingBoundary: 'SERVICE_CONFIGURATION',
    });
  });

  it('rejects unauthenticated calls at the protected procedure boundary', async () => {
    const caller = searchRouter.createCaller({ userId: null, sessionId: null, requestId: 'server-request-3' } as never);
    await expect(caller.verifiedContext({ query: 'source search', topK: 5 })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
