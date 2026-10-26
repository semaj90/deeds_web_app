import { beforeEach, describe, expect, it, vi } from 'vitest';
const { cache } = vi.hoisted(() => ({ cache: vi.fn() }));
vi.mock('$lib/server/cache/rpc-cache.js', () => ({ withRpcCache: cache }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { RETRIEVAL_GRPC_ENABLED: false, RETRIEVAL_HTTP_ENABLED: false } }));
import { retrievalClient } from './retrieval-client.js';
import { observeTransport } from './transport-telemetry.js';

beforeEach(() => cache.mockReset());

describe('retrieval client cached method delivery metadata', () => {
  it.each(['searchChunks', 'getClusterSummary', 'expandAstNeighbors', 'getTopologyContext', 'getResearchContext'] as const)(
    'labels %s cache hits without claiming a new RPC', async (method) => {
      const value = await observeTransport('grpc', async () => ({ results: [], fixture: method }));
      cache.mockResolvedValueOnce({ value, cache: { hit: true, hitLevel: 'L1_REDIS', key: 'fixture', ttlSeconds: 30 } });
      const calls = {
        searchChunks: () => retrievalClient.searchChunks('fixture'),
        getClusterSummary: () => retrievalClient.getClusterSummary(1),
        expandAstNeighbors: () => retrievalClient.expandAstNeighbors('fixture'),
        getTopologyContext: () => retrievalClient.getTopologyContext(0, 0),
        getResearchContext: () => retrievalClient.getResearchContext({ query: 'fixture' }),
      };
      const result = await calls[method]();
      expect(cache).toHaveBeenCalledTimes(1);
      expect(result).not.toHaveProperty('transportTelemetry');
      expect(result).toMatchObject({ fixture: method, deliveryTelemetry: { source: 'L1_REDIS',
        origin_transport_telemetry: { rpc_transport: 'grpc' }, canonicalAuthority: false } });
    },
  );
});
