import { describe, expect, it, vi } from 'vitest';
vi.mock('$lib/server/redis.js', () => ({ getRedis: () => { throw new Error('No live Redis allowed'); } }));
import { withRpcCache, type RpcCacheStore } from '../cache/rpc-cache.js';
import { annotateRetrievalDelivery, measureTransportCodec, observeTransport, RetrievalDeliveryTelemetrySchema } from './transport-telemetry.js';
import { withPacketTelemetryContext } from '../telemetry/packet-telemetry-context.js';

describe('retrieval cache delivery provenance', () => {
  it('separates current compute from historical codec measurements on a real cache-envelope replay', async () => {
    const entries = new Map<string, string>();
    const store: RpcCacheStore = {
      get: async (key) => entries.get(key) ?? null,
      set: async (key, value) => { entries.set(key, value); return 'OK'; },
      del: async (key) => entries.delete(key),
    };
    const compute = vi.fn(() => observeTransport('grpc', async () => {
      measureTransportCodec('protobuf_encode', () => Buffer.from([1, 2, 3]), (value) => value.byteLength);
      return { results: [{ packetKey: 'packet:fixture' }] };
    }, 'SearchChunks'));
    const options = { transport: 'grpc' as const, method: 'SearchChunks', ttlSeconds: 30, cacheStore: store };
    const args = { query: 'private fixture query' };
    const miss = await withPacketTelemetryContext({ trace_id: 'trace:origin' },
      async () => annotateRetrievalDelivery(await withRpcCache(args, compute, options)));
    const hit = await withPacketTelemetryContext({ trace_id: 'trace:current' },
      async () => annotateRetrievalDelivery(await withRpcCache(args, compute, options)));
    expect(compute).toHaveBeenCalledTimes(1);
    expect(miss.deliveryTelemetry.source).toBe('COMPUTE_RETURN');
    expect(hit.deliveryTelemetry.source).toBe('L1_REDIS');
    expect(hit.deliveryTelemetry.trace_id).toBe('trace:current');
    expect(hit.deliveryTelemetry.origin_transport_telemetry?.trace_id).toBe('trace:origin');
    expect(hit).not.toHaveProperty('transportTelemetry');
    expect(hit.results).toEqual(miss.results);
    expect(hit.deliveryTelemetry.origin_transport_telemetry).toEqual(miss.transportTelemetry);
    expect(hit.deliveryTelemetry.origin_transport_telemetry?.measurements.protobuf_encode?.calls).toBe(1);
    expect(RetrievalDeliveryTelemetrySchema.safeParse(hit.deliveryTelemetry).success).toBe(true);
    expect(JSON.stringify(hit.deliveryTelemetry)).not.toContain(args.query);
    expect(hit.deliveryTelemetry).not.toHaveProperty('key');
  });

  it('keeps unavailable-origin metadata unknown and does not fabricate transport proof', () => {
    const value = { results: [], totalMs: 0 };
    const result = annotateRetrievalDelivery({ value, cache: { hit: false, hitLevel: 'MISS', key: 'fixture', ttlSeconds: 30 } });
    expect(result).not.toHaveProperty('transportTelemetry');
    expect(result.deliveryTelemetry).toMatchObject({ source: 'COMPUTE_RETURN', origin_transport_telemetry: null });
    expect(value).not.toHaveProperty('deliveryTelemetry');
  });

  it('does not propagate malformed historical transport payloads or mutate cached values', () => {
    const value = { results: [], transportTelemetry: { tensor: [1, 2], rpc_transport: 'grpc' } };
    const result = annotateRetrievalDelivery({ value, cache: { hit: true, hitLevel: 'L1_REDIS', key: 'fixture', ttlSeconds: 30 } });
    expect(result).not.toHaveProperty('transportTelemetry');
    expect(result.deliveryTelemetry.origin_transport_telemetry).toBeNull();
    expect(value.transportTelemetry.tensor).toEqual([1, 2]);
    expect(JSON.stringify(result.deliveryTelemetry)).not.toContain('tensor');
  });

  it('preserves null and array results without inventing an object result', () => {
    const cache = { hit: false, hitLevel: 'MISS' as const, key: 'fixture', ttlSeconds: 30 };
    expect(annotateRetrievalDelivery({ value: null, cache })).toBeNull();
    const array: unknown[] = [];
    expect(annotateRetrievalDelivery({ value: array, cache })).toBe(array);
  });
});
