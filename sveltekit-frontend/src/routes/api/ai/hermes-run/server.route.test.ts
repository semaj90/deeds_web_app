import { describe, expect, it, vi } from 'vitest';
import { refuseVerifiedContextV1, type VerifiedContextServiceV1 } from '$lib/server/atlas/execution/verified-context-service-v1.js';
import { POST } from './+server.js';

function eventFor(body: unknown, verifiedContextService?: VerifiedContextServiceV1) {
  return {
    request: new Request('http://app.test/api/ai/hermes-run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    locals: {
      user: { id: 'authenticated-actor' },
      ...(verifiedContextService ? { verifiedContextService } : {}),
    },
  } as unknown as Parameters<typeof POST>[0];
}

describe('/api/ai/hermes-run verified-context gate', () => {
  it('refuses before orchestration when the shared service is missing', async () => {
    const response = await POST(eventFor({ query: 'find the parser', actorId: 'forged-actor' }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      status: 'refused',
      refusalCode: 'VERIFIED_CONTEXT_SERVICE_NOT_CONFIGURED',
      firstFailingBoundary: 'SERVICE_CONFIGURATION',
      canonicalAuthority: false,
      writesPerformed: false,
    });
  });

  it('uses the authenticated actor and refuses caller-provided scope on authority failure', async () => {
    const execute = vi.fn(async (_actorId: string | null, requestInput: unknown) => {
      const request = requestInput as { requestId: string };
      return refuseVerifiedContextV1(request.requestId, 'TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE', 'WORKSPACE_AUTHORITY');
    });
    const service = { execute } as unknown as VerifiedContextServiceV1;
    const response = await POST(eventFor({
      query: 'find the parser',
      actorId: 'forged-actor',
      admission: { status: 'ADMITTED' },
      fileContext: 'src/private.ts',
    }, service));

    expect(response.status).toBe(409);
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0]?.[0]).toBe('authenticated-actor');
    expect(execute.mock.calls[0]?.[1]).toMatchObject({ query: 'find the parser', topK: 5 });
    expect(execute.mock.calls[0]?.[1]).not.toHaveProperty('fileContext');
    await expect(response.json()).resolves.toMatchObject({
      refusalCode: 'TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE',
      firstFailingBoundary: 'WORKSPACE_AUTHORITY',
      writesPerformed: false,
    });
  });

  it('refuses admitted references until a server packet hydrator exists', async () => {
    const execute = vi.fn(async (_actorId: string | null, requestInput: unknown) => {
      const request = requestInput as { requestId: string };
      return {
        schema: 'atlas.verified-context-result.v1' as const,
        status: 'ADMITTED' as const,
        requestId: request.requestId,
        contextPacketRef: 'verified-context:sha256:packet-digest',
        contextPacketDigest: 'a'.repeat(64),
        contextManifestChecksum: 'b'.repeat(64),
        promptPlanChecksum: 'c'.repeat(64),
        promptPlan: { schema: 'atlas.prompt-plan.v1' },
        receipt: { status: 'ADMITTED' },
        canonicalAuthority: false as const,
        writesPerformed: false as const,
      };
    });
    const service = { execute } as unknown as VerifiedContextServiceV1;
    const response = await POST(eventFor({ query: 'find the parser' }, service));

    expect(response.status).toBe(409);
    expect(execute).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({
      refusalCode: 'VERIFIED_CONTEXT_PACKET_HYDRATOR_NOT_CONFIGURED',
      firstFailingBoundary: 'PACKET_HYDRATION',
      canonicalAuthority: false,
      writesPerformed: false,
    });
  });
});
