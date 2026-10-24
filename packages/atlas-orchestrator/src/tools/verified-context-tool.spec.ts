import { describe, expect, it, vi } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import { createVerifiedContextToolV1 } from './verified-context-tool.js';

describe('Mastra verified-context tool', () => {
  it('creates a real Mastra tool with server request-context authority', () => {
    const service = { execute: vi.fn() };
    const tool = createVerifiedContextToolV1(service as never);
    expect(tool.id).toBe('atlas.verified_context');
    expect(tool.inputSchema).toBeDefined();
    expect(tool.outputSchema).toBeDefined();
    expect(tool.requestContextSchema).toBeDefined();
  });

  it('passes server request context to the shared service and returns its exact refusal', async () => {
    const refusal = {
      schema: 'atlas.verified-context-result.v1' as const,
      status: 'REFUSED' as const,
      requestId: 'request:mastra-1',
      refusalCode: 'FEATURE_SNAPSHOT_READBACK_NOT_ADMITTED',
      firstFailingBoundary: 'FEATURE_SNAPSHOT',
      receipt: { canonicalAuthority: false, writesPerformed: false },
      canonicalAuthority: false as const,
      writesPerformed: false as const,
    };
    const service = {
      execute: vi.fn(async () => refusal),
      verifyMastraReadback: vi.fn((result) => result),
    };
    const tool = createVerifiedContextToolV1(service as never);
    const requestContext = new RequestContext();
    requestContext.set('actorId', 'actor:42');
    requestContext.set('requestId', 'request:mastra-1');
    const result = await tool.execute?.({ query: 'Drizzle route helpers', topK: 3 }, { requestContext } as never);

    expect(service.execute).toHaveBeenCalledWith('actor:42', {
      requestId: 'request:mastra-1', query: 'Drizzle route helpers', topK: 3,
    });
    expect(service.verifyMastraReadback).toHaveBeenCalledWith(refusal);
    expect(result).toEqual(refusal);
  });

  it('returns an admitted packet only after the service readback verifier marks its digest', async () => {
    const admitted = {
      schema: 'atlas.verified-context-result.v1' as const,
      status: 'ADMITTED' as const,
      requestId: 'request:mastra-admitted',
      contextPacketRef: `verified-context:sha256:${'a'.repeat(64)}`,
      contextPacketDigest: 'a'.repeat(64),
      contextManifestChecksum: 'b'.repeat(64),
      promptPlanChecksum: 'c'.repeat(64),
      promptPlan: { checksumSha256: 'c'.repeat(64) },
      receipt: { mastraReadback: { status: 'NOT_INVOKED' } },
      canonicalAuthority: false as const,
      writesPerformed: false as const,
    };
    const verified = {
      ...admitted,
      receipt: { mastraReadback: { status: 'PROMPT_PLAN_DIGEST_MATCH' } },
    };
    const service = {
      execute: vi.fn(async () => admitted),
      verifyMastraReadback: vi.fn(() => verified),
    };
    const tool = createVerifiedContextToolV1(service as never);
    const requestContext = new RequestContext();
    requestContext.set('actorId', 'actor:42');
    requestContext.set('requestId', 'request:mastra-admitted');

    await expect(tool.execute?.({ query: 'find source', topK: 1 }, { requestContext } as never)).resolves.toEqual(verified);
    expect(service.verifyMastraReadback).toHaveBeenCalledWith(admitted);
  });

  it('rejects an admitted packet unless the readback verifier records a digest match', async () => {
    const admitted = {
      schema: 'atlas.verified-context-result.v1' as const,
      status: 'ADMITTED' as const,
      requestId: 'request:mastra-2',
      contextPacketRef: `verified-context:sha256:${'a'.repeat(64)}`,
      contextPacketDigest: 'a'.repeat(64),
      contextManifestChecksum: 'b'.repeat(64),
      promptPlanChecksum: 'c'.repeat(64),
      promptPlan: {},
      receipt: { mastraReadback: { status: 'NOT_INVOKED' } },
      canonicalAuthority: false as const,
      writesPerformed: false as const,
    };
    const service = {
      execute: vi.fn(async () => admitted),
      verifyMastraReadback: vi.fn((result) => result),
    };
    const tool = createVerifiedContextToolV1(service as never);
    const requestContext = new RequestContext();
    requestContext.set('actorId', 'actor:42');
    requestContext.set('requestId', 'request:mastra-2');

    await expect(tool.execute?.({ query: 'find source', topK: 1 }, { requestContext } as never)).resolves.toEqual({
      schema: 'atlas.verified-context-result.v1',
      status: 'REFUSED',
      requestId: 'request:mastra-2',
      refusalCode: 'MASTRA_READBACK_NOT_VERIFIED',
      firstFailingBoundary: 'MASTRA_READBACK',
      receipt: { reason: 'OUTPUT_CONTRACT_INVALID', canonicalAuthority: false, writesPerformed: false },
      canonicalAuthority: false,
      writesPerformed: false,
    });
  });

  it('converts provider exceptions into a stable read-only refusal', async () => {
    const service = {
      execute: vi.fn(async () => { throw new Error('provider detail must not leak'); }),
      verifyMastraReadback: vi.fn(),
    };
    const tool = createVerifiedContextToolV1(service as never);
    const requestContext = new RequestContext();
    requestContext.set('actorId', 'actor:42');
    requestContext.set('requestId', 'request:mastra-failed');

    await expect(tool.execute?.({ query: 'find source', topK: 1 }, { requestContext } as never)).resolves.toEqual({
      schema: 'atlas.verified-context-result.v1',
      status: 'REFUSED',
      requestId: 'request:mastra-failed',
      refusalCode: 'VERIFIED_CONTEXT_SERVICE_FAILED',
      firstFailingBoundary: 'VERIFIED_CONTEXT_SERVICE',
      receipt: { canonicalAuthority: false, writesPerformed: false },
      canonicalAuthority: false,
      writesPerformed: false,
    });
    expect(service.verifyMastraReadback).not.toHaveBeenCalled();
  });
});
