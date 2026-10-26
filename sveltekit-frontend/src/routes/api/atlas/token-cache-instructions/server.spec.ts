import { describe, it, expect, vi } from 'vitest';
import { POST } from './+server.js';
import type { RequestEvent } from './$types.js';

const sourceEvidenceMock = vi.hoisted(() => ({
  loadFeatureAnchorPacketEvidenceV1: vi.fn(),
}));

vi.mock('$lib/server/atlas/taxonomy/feature-anchor-packet-evidence-v1.js', () => sourceEvidenceMock);

describe('POST /api/atlas/token-cache-instructions', () => {
  it('returns valid cache instructions descriptor for legal query', async () => {
    sourceEvidenceMock.loadFeatureAnchorPacketEvidenceV1.mockResolvedValue({
      schema: 'atlas.feature-anchor-packet-evidence.v1',
      featureLabel: 'wiki',
      status: 'CANDIDATES_FOUND',
      candidates: [{
        packetKey: 'packet:wiki',
        sourceRef: 'sveltekit-frontend/src/lib/server/features/codebase-intel/indexer/karpathy-wiki.ts',
        sourceRevision: `sha256:${'a'.repeat(64)}`,
        sourceBytesSha256: 'a'.repeat(64),
        workspaceRevisionKey: `sha256:${'c'.repeat(64)}`,
        workspaceBinding: {
          canonicalSourceRef: 'sveltekit-frontend/src/lib/server/features/codebase-intel/indexer/karpathy-wiki.ts',
          workspaceRevision: `sha256:${'c'.repeat(64)}`,
          contentDigest: 'a'.repeat(64),
        },
        qualification: 'SOURCE_BYTES_AND_WORKSPACE_BINDING_MATCH_NOT_ADMITTED',
      }],
      rejections: [],
      canonicalAuthority: false,
      writesPerformed: false,
    });
    const mockRequest = new Request('http://localhost/api/atlas/token-cache-instructions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'search legal knowledge base in codebase wiki',
        dryRun: true,
      }),
    });

    const response = await POST({
      request: mockRequest,
    } as unknown as RequestEvent);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.featureLabel).toBe('wiki');
    expect(data.fsmState).toBe('DESCRIPTOR_READY');
    expect(data.descriptor.lowRankStatus).toBe('NOT_RUN_NO_QUALIFIED_FEATURE_MATRIX');
    expect(data.descriptor.suggestedComponents).toEqual(data.acePacket.coreComponents);
    expect(data.cachedToValkey).toBe(false);
    expect(data.sourceEvidence.status).toBe('CANDIDATES_FOUND');
    expect(data.sourceEvidence.candidates[0].qualification).toBe('SOURCE_BYTES_AND_WORKSPACE_BINDING_MATCH_NOT_ADMITTED');
    expect(sourceEvidenceMock.loadFeatureAnchorPacketEvidenceV1).toHaveBeenCalledWith('wiki');
    expect(data.acePacket.coreComponents[0]).toBeTruthy();
    expect(data.acePacket.canonicalAuthority).toBe(false);
    expect(data.descriptor.schema).toBe('atlas.token-cache-instructions.v1');
    expect(data.acePacket.schema).toBe('atlas.ace-packet-proposal.v1');
    expect(data.acePacket.canonicalAuthority).toBe(false);
  });

  it('rejects invalid or empty query payloads with 400 and stable JSON', async () => {
    const mockRequest = new Request('http://localhost/api/atlas/token-cache-instructions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: '',
      }),
    });

    const response = await POST({
      request: mockRequest,
    } as unknown as RequestEvent);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.fsmState).toBe('FAILED');
    expect(data.error).toContain('Validation error');
  });

  it('returns 422 for an unmatched feature query without creating a packet', async () => {
    const mockRequest = new Request('http://localhost/api/atlas/token-cache-instructions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'zzqv unmapped phrase' }),
    });
    const response = await POST({ request: mockRequest } as unknown as RequestEvent);
    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.featureLabel).toBe('');
    expect(data.acePacket).toBeNull();
    expect(data.sourceEvidence).toBeNull();
    expect(data.cachedToValkey).toBe(false);
  });
});
