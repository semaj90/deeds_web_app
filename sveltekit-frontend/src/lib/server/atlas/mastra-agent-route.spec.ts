import { describe, expect, it, vi } from 'vitest';

const setSpanAttributes = vi.hoisted(() => vi.fn());
vi.mock('@opentelemetry/api', () => ({ trace: { getActiveSpan: () => ({ setAttributes: setSpanAttributes }) } }));

import { POST } from '../../../routes/api/atlas/mastra-agent/+server.js';
import { createVerifiedContextRuntimeV1 } from './execution/verified-context-runtime-v1.js';

const admitted = {
  schema: 'atlas.verified-context-result.v1' as const,
  status: 'ADMITTED' as const,
  requestId: 'server-request-1',
  contextPacketRef: 'verified-context:sha256:packet',
  contextPacketDigest: 'a'.repeat(64),
  contextManifestChecksum: 'b'.repeat(64),
  promptPlanChecksum: 'c'.repeat(64),
  promptPlan: { checksumSha256: 'c'.repeat(64) },
  receipt: { receiptChecksum: 'd'.repeat(64) },
  canonicalAuthority: false as const,
  writesPerformed: false as const,
};

function post(body: unknown, locals: Record<string, unknown> = { user: { id: 'actor-1' }, requestId: 'server-request-1' }) {
  return POST({
    request: new Request('https://app.fixture/api/atlas/mastra-agent', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    locals,
  } as never);
}

describe('POST /api/atlas/mastra-agent', () => {
  it('rejects caller-assembled admission and PromptPlan fields', async () => {
    const response = await post({ query: 'find route helpers', admission: {}, promptPlan: {}, segmentContent: [] });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: 'INVALID_REQUEST', writesPerformed: false });
  });

  it('requires authentication before invoking the service', async () => {
    const execute = vi.fn();
    const response = await post({ query: 'find route helpers' }, { verifiedContextService: { execute } });
    expect(response.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });

  it('fails closed when the server-owned service is unconfigured', async () => {
    const response = await post({ query: 'find route helpers' });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      success: false,
      error: 'VERIFIED_CONTEXT_SERVICE_NOT_CONFIGURED',
      requestId: 'server-request-1',
      writesPerformed: false,
    });
  });

  it('uses the registered server runtime and returns its exact authority refusal', async () => {
    setSpanAttributes.mockClear();
    const service = createVerifiedContextRuntimeV1(async () => ({
      status: 'UNAVAILABLE', workspaceRevision: null, reason: 'LIVE_READBACK_NOT_PROVEN',
      resolverRevision: 'atlas.trusted-workspace-resolver.v1',
    }));
    const response = await post({ query: 'find route helpers' }, {
      user: { id: 'actor-1' }, requestId: 'server-request-1', verifiedContextService: service,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false, error: 'TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE',
      requestId: 'server-request-1', firstFailingBoundary: 'WORKSPACE_AUTHORITY', writesPerformed: false,
    });
    expect(setSpanAttributes).toHaveBeenCalledWith(expect.objectContaining({
      'parent_atlas.request_id': 'server-request-1',
      'parent_atlas.service_health': 'AVAILABLE',
      'parent_atlas.agent_execution_status': 'NOT_STARTED',
      'parent_atlas.evidence_validity': 'NOT_ADMITTED',
      'parent_atlas.canonical_admission': 'NOT_ADMITTED',
      'parent_atlas.first_failing_boundary': 'WORKSPACE_AUTHORITY',
      'parent_atlas.refusal_code': 'TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE',
      'parent_atlas.writes_performed': false,
    }));
  });

  it('propagates exact service refusal without invoking inference', async () => {
    const execute = vi.fn().mockResolvedValue({
      schema: 'atlas.verified-context-result.v1', status: 'REFUSED', requestId: 'server-request-1',
      refusalCode: 'FEATURE_SNAPSHOT_READBACK_NOT_ADMITTED', firstFailingBoundary: 'FEATURE_SNAPSHOT',
      receipt: { refusalCode: 'FEATURE_SNAPSHOT_READBACK_NOT_ADMITTED' }, canonicalAuthority: false, writesPerformed: false,
    });
    const response = await post({ query: 'find route helpers', topK: 3 }, { user: { id: 'actor-1' }, requestId: 'server-request-1', verifiedContextService: { execute } });
    expect(execute).toHaveBeenCalledWith('actor-1', { query: 'find route helpers', topK: 3, requestId: 'server-request-1' });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      error: 'FEATURE_SNAPSHOT_READBACK_NOT_ADMITTED',
      firstFailingBoundary: 'FEATURE_SNAPSHOT',
      writesPerformed: false,
    });
  });

  it('does not synthesize until an immutable packet hydrator exists', async () => {
    const execute = vi.fn().mockResolvedValue(admitted);
    const response = await post({ query: 'find route helpers' }, { user: { id: 'actor-1' }, requestId: 'server-request-1', verifiedContextService: { execute } });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      success: false,
      error: 'VERIFIED_CONTEXT_PACKET_HYDRATOR_NOT_CONFIGURED',
      contextPacketRef: admitted.contextPacketRef,
      contextPacketDigest: admitted.contextPacketDigest,
      promptPlanChecksum: admitted.promptPlanChecksum,
      writesPerformed: false,
    });
  });
});
