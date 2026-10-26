import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockHyperragPacketRpc } = vi.hoisted(() => ({
  mockHyperragPacketRpc: vi.fn(),
}));

vi.mock('$lib/server/retrieval/hyperrag-packet-rpc.js', () => ({
  hyperragPacketRpc: mockHyperragPacketRpc,
}));

import { POST } from './+server.js';
import type { TopKRpcDescriptorV1 } from '$lib/server/atlas/execution/topk-rpc-descriptor-v1.js';

const validDescriptor: TopKRpcDescriptorV1 = {
  schema: 'atlas.topk.rpc-descriptor.v1',
  executionId: `topk:${'a'.repeat(64)}`,
  manifestChecksum: 'b'.repeat(64),
  inputChecksum: 'c'.repeat(64),
  outputDigest: 'd'.repeat(64),
  ordinalMapDigest: 'e'.repeat(64),
  workspaceRevision: 'ws:1',
  candidateSnapshotRevision: 'snap:1',
  algorithm: 'cpu_exact',
  backend: 'cpu',
  k: 10,
  selected: [
    { rank: 1, ordinal: 0, canonicalId: 'can:0' },
    { rank: 2, ordinal: 1, canonicalId: 'can:1' },
  ],
  truncated: false,
  status: 'PASS',
  verified: 'VERIFIED_PASS',
  canonicalAuthority: false,
  retrievalVoteAdded: false,
  writesPerformed: false,
  gpuExecuted: false,
};

describe('POST /api/atlas/hyperrag-packet-rpc', () => {
  beforeEach(() => {
    mockHyperragPacketRpc.mockReset();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await POST({
      locals: { user: null },
      request: new Request('http://localhost', { method: 'POST' }),
    } as never);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('rejects invalid JSON body with 400', async () => {
    const res = await POST({
      locals: { user: { id: 'usr-1' } },
      request: { json: async () => { throw new Error('Bad json'); } } as never,
    } as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Invalid JSON body');
  });

  it('returns pure retrieval result when topkDescriptor is not provided', async () => {
    const rpcResult = {
      query: 'search query',
      strategy: 'fusion',
      packets: [{ packet_key: 'p:1', rank: 1 }],
      trace: { latency_ms: 10 },
    };
    mockHyperragPacketRpc.mockResolvedValue(rpcResult);

    const res = await POST({
      locals: { user: { id: 'usr-1' } },
      request: new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'search query', limit: 5 }),
      }),
    } as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.query).toBe('search query');
    expect(body.packets).toHaveLength(1);
    expect(body.topk_execution).toBeUndefined();
  });

  it('attaches verified Top-K descriptor when provided in request body', async () => {
    const rpcResult = {
      query: 'search query',
      strategy: 'fusion',
      packets: [{ packet_key: 'p:1', rank: 1 }],
      trace: { latency_ms: 12 },
    };
    mockHyperragPacketRpc.mockResolvedValue(rpcResult);

    const res = await POST({
      locals: { user: { id: 'usr-1' } },
      request: new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'search query',
          limit: 5,
          topkDescriptor: validDescriptor,
        }),
      }),
    } as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.topk_execution).toBeDefined();
    expect(body.topk_execution.executionId).toBe(`topk:${'a'.repeat(64)}`);
    expect(body.topk_execution.verified).toBe('VERIFIED_PASS');
    expect(body.topk_execution.canonicalAuthority).toBe(false);
    expect(body.packets).toEqual(rpcResult.packets);
  });

  it('rejects malformed topkDescriptor at schema boundary with 400', async () => {
    const res = await POST({
      locals: { user: { id: 'usr-1' } },
      request: new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'search query',
          limit: 5,
          topkDescriptor: {
            ...validDescriptor,
            canonicalAuthority: true, // violates strict literal constraint
          },
        }),
      }),
    } as never);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });
});
