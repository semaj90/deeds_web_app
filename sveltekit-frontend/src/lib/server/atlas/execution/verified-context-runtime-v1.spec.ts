import { describe, expect, it, vi } from 'vitest';
import { createVerifiedContextRuntimeV1, VERIFIED_CONTEXT_MISSING_PROVIDERS_V1 } from './verified-context-runtime-v1.js';

const request = { requestId: 'server-request-1', query: 'find a route helper', topK: 3 };

describe('server-registered VerifiedContext runtime', () => {
  it('refuses when current workspace authority is unavailable and preserves the request id', async () => {
    const resolveAuthority = vi.fn().mockResolvedValue({ status: 'UNAVAILABLE', workspaceRevision: null, reason: 'LIVE_READBACK_NOT_PROVEN', resolverRevision: 'atlas.trusted-workspace-resolver.v1' });
    const result = await createVerifiedContextRuntimeV1(resolveAuthority).execute('actor-1', request);

    expect(result).toMatchObject({
      schema: 'atlas.verified-context-result.v1', status: 'REFUSED', requestId: request.requestId,
      refusalCode: 'TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE', firstFailingBoundary: 'WORKSPACE_AUTHORITY',
      receipt: { receiptChecksum: expect.stringMatching(/^[a-f0-9]{64}$/), details: {
        serviceHealth: 'REGISTERED_FAIL_CLOSED', agentExecutionStatus: 'NOT_STARTED',
        canonicalEvidenceValidity: 'NOT_ADMITTED', agentRunId: null, traceId: null,
      } }, canonicalAuthority: false, writesPerformed: false,
    });
    expect(resolveAuthority).toHaveBeenCalledOnce();
  });

  it('refuses at provider configuration after authority but never fabricates admission', async () => {
    const resolveAuthority = vi.fn().mockResolvedValue({
      status: 'TRUSTED', workspaceRevision: `sha256:${'a'.repeat(64)}`, source: 'OPERATOR_PIN',
      receiptCrossCheck: 'MATCHES_ADMISSION_RECEIPT', resolverRevision: 'atlas.trusted-workspace-resolver.v1',
    });
    const result = await createVerifiedContextRuntimeV1(resolveAuthority).execute('actor-1', request);

    expect(result).toMatchObject({
      status: 'REFUSED', requestId: request.requestId,
      refusalCode: 'VERIFIED_CONTEXT_PROVIDERS_NOT_CONFIGURED', firstFailingBoundary: 'SERVICE_CONFIGURATION',
      receipt: { receiptChecksum: expect.stringMatching(/^[a-f0-9]{64}$/), details: {
        missingProviders: VERIFIED_CONTEXT_MISSING_PROVIDERS_V1,
        serviceHealth: 'REGISTERED_FAIL_CLOSED', agentExecutionStatus: 'NOT_STARTED',
        canonicalEvidenceValidity: 'NOT_ADMITTED',
      } },
      canonicalAuthority: false, writesPerformed: false,
    });
  });

  it('does not resolve workspace authority for an unauthenticated actor', async () => {
    const resolveAuthority = vi.fn();
    const result = await createVerifiedContextRuntimeV1(resolveAuthority).execute(null, request);

    expect(result).toMatchObject({
      status: 'REFUSED', requestId: request.requestId,
      refusalCode: 'AUTHENTICATED_ACTOR_REQUIRED', firstFailingBoundary: 'WORKSPACE_AUTHORITY',
    });
    expect(resolveAuthority).not.toHaveBeenCalled();
  });
});
