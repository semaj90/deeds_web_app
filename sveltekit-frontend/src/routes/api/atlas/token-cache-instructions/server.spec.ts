import { describe, it, expect } from 'vitest';
import { POST } from './+server.js';
import type { RequestEvent } from './$types.js';

describe('POST /api/atlas/token-cache-instructions', () => {
  it('returns valid cache instructions descriptor for legal query', async () => {
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
    expect(data.fsmState).toBe('PREFIX_HOT');
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
});
