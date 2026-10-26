import { describe, expect, it } from 'vitest';
import {
  AtlasHllTelemetryClient,
  buildDailyHllWindowId,
  buildHllEntityKey,
  buildHllRegisterKeys,
  type HllRedisAdapter,
} from './atlas-hll-telemetry.js';

class MockHllRedisAdapter implements HllRedisAdapter {
  private registers = new Map<string, Set<string>>();

  async pfadd(key: string, ...elements: string[]): Promise<number> {
    let current = this.registers.get(key);
    if (!current) {
      current = new Set<string>();
      this.registers.set(key, current);
    }
    const initialSize = current.size;
    for (const el of elements) {
      current.add(el);
    }
    return current.size > initialSize ? 1 : 0;
  }

  async pfcount(...keys: string[]): Promise<number> {
    const combined = new Set<string>();
    for (const key of keys) {
      const reg = this.registers.get(key);
      if (reg) {
        for (const item of reg) {
          combined.add(item);
        }
      }
    }
    return combined.size;
  }
}

describe('AtlasHllTelemetryClient', () => {
  it('correctly builds register key namespace', () => {
    const keys = buildHllRegisterKeys('agentic-repair', '2026-10-12T18:00');
    expect(keys.errorHllKey).toBe('atlas:hll:agentic-repair:2026-10-12T18:00:errors');
    expect(keys.symbolHllKey).toBe('atlas:hll:agentic-repair:2026-10-12T18:00:symbols');
  });

  it('records distinct items and estimates cardinality accurately', async () => {
    const mockAdapter = new MockHllRedisAdapter();
    const client = new AtlasHllTelemetryClient(mockAdapter);
    const keys = buildHllRegisterKeys('session-1', 'hour-1');

    await client.recordTelemetryBatch(keys, {
      errors: ['TS2304:MissingType', 'TS2304:MissingType', 'TS2345:ArgumentMismatch'],
      symbols: ['PacketControlWordV1', 'runPacketDenseSearch'],
      sources: ['src/lib/foo.ts', 'src/lib/foo.ts', 'src/lib/bar.ts'],
    });

    const estimates = await client.queryEstimates(keys);
    expect(estimates.errors).toBe(2);
    expect(estimates.symbols).toBe(2);
    expect(estimates.sources).toBe(2);
    expect(estimates.workflows).toBe(0);
    expect(estimates.sessions).toBe(0);
  });

  it('formats protobuf-aligned envelope with bounded metadata', async () => {
    const mockAdapter = new MockHllRedisAdapter();
    const client = new AtlasHllTelemetryClient(mockAdapter);
    const keys = buildHllRegisterKeys('agent-audit', 'w1');

    await client.recordTelemetryBatch(keys, {
      errors: ['ERR_TIMEOUT'],
    });

    const estimates = await client.queryEstimates(keys);
    const envelope = client.formatProtobufEnvelope(keys, estimates, {
      producerId: 'opencode-agent-governor',
      revision: 'v1.2',
    });

    expect(envelope.schema).toBe('atlas.telemetry.hll.v1');
    expect(envelope.standardErrorPct).toBe(0.81);
    expect(envelope.registerBytes).toBe(12288);
    expect(envelope.estimates.errors).toBe(1);
    expect(envelope.producerId).toBe('opencode-agent-governor');
  });
});

describe('AtlasHllTelemetryClient entity registers (HLL-ALIGN)', () => {
  it('builds per-kind keys in the shared scheme and rejects unsafe kinds', () => {
    expect(buildHllEntityKey('bitfrost-agent-warm', '2026-10-16', 'packets')).toBe(
      'atlas:hll:bitfrost-agent-warm:2026-10-16:packets'
    );
    expect(buildHllEntityKey('ns', 'w', 'sources')).toBe(buildHllRegisterKeys('ns', 'w').sourceHllKey);
    for (const bad of ['', 'Packets', '1x', 'a:b', 'a b', 'x'.repeat(33)]) {
      expect(() => buildHllEntityKey('ns', 'w', bad)).toThrow();
    }
    expect(buildDailyHllWindowId(new Date('2026-10-16T23:59:59Z'))).toBe('2026-10-16');
  });

  it('keeps entity kinds in separate registers (regression: the old single mixed register)', async () => {
    const client = new AtlasHllTelemetryClient(new MockHllRedisAdapter());
    await client.recordEntityBatch('ns', 'w', {
      tasks: ['t1', 't2'],
      stories: ['s1'],
      packets: ['p1', 'p2', 'p3'],
      features: ['f1'],
      sources: ['src/a.ts', 'src/b.ts'],
    });
    const estimates = await client.queryEntityEstimates('ns', 'w', ['tasks', 'stories', 'packets', 'features', 'sources']);
    expect(estimates).toEqual({ tasks: 2, stories: 1, packets: 3, features: 1, sources: 2 });
  });

  it('de-duplicates, drops empty ids and chunks PFADD by combined length', async () => {
    const calls: string[][] = [];
    const adapter: HllRedisAdapter = {
      async pfadd(_key, ...elements) { calls.push(elements); return undefined as unknown as number; },
      async pfcount() { return 0; },
    };
    const client = new AtlasHllTelemetryClient(adapter);
    const result = await client.recordEntityBatch(
      'ns', 'w',
      { sources: ['aaaa', 'bbbb', 'aaaa', '', 'cccc', 'dddd'] },
      { maxChunkChars: 8 }
    );
    expect(calls).toEqual([['aaaa', 'bbbb'], ['cccc', 'dddd']]);
    expect(result.added).toBe(0); // adapter returned nothing: coerced, not NaN
    expect(result.keys.sources).toBe('atlas:hll:ns:w:sources');
  });
});
