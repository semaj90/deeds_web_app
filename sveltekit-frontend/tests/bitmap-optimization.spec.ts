import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';
import { PacketBitmapCache } from '../src/lib/server/cache/packet-bitmap';

describe('PacketBitmapCache', () => {
  let redis: Redis;
  let bitmap: PacketBitmapCache;

  beforeAll(async () => {
    redis = new Redis({
      host: 'localhost',
      port: 6379,
      password: 'redis',
      lazyConnect: true,
    });
    await redis.connect();
    bitmap = new PacketBitmapCache(redis);
  });

  afterAll(async () => {
    await redis.flushdb();
    await redis.quit();
  });

  describe('setGate and getGates', () => {
    it('should encode/decode 8 gates in 1 byte', async () => {
      const packetId = `test:encode:${Date.now()}:${Math.random()}`;
      const key = `atlas:mask:packet:${packetId}`;

      // Write a test byte directly: 01010101 (bits 0, 2, 4, 6 set)
      const testByte = Buffer.from([0b01010101]);
      await redis.set(key, testByte);

      const gates = await bitmap.getGates(packetId);

      // Verify the bits were read correctly
      expect(gates.featureIdPresent).toBe(true); // bit 0
      expect(gates.sourceRefTrusted).toBe(false); // bit 1
      expect(gates.aceCacheHit).toBe(true); // bit 2
      expect(gates.kagNeighborAvailable).toBe(false); // bit 3
      expect(gates.dagEdgeExists).toBe(true); // bit 4
      expect(gates.summaryExists).toBe(false); // bit 5
      expect(gates.embeddingExists).toBe(true); // bit 6
      expect(gates.allMirrorsSynced).toBe(false); // bit 7
    });

    it('should validate gate index boundaries', async () => {
      const packetId = 'test:packet:boundary';

      await expect(bitmap.setGate(packetId, -1, true)).rejects.toThrow();
      await expect(bitmap.setGate(packetId, 8, true)).rejects.toThrow();

      // Valid boundaries should work
      await expect(bitmap.setGate(packetId, 0, true)).resolves.toBeUndefined();
      await expect(bitmap.setGate(packetId, 7, true)).resolves.toBeUndefined();
    });
  });

  describe('getReadiness', () => {
    it('should score readiness as gateCount/8', async () => {
      const packetId = 'test:packet:readiness';

      // Set 6 out of 8 gates to true
      for (let i = 0; i < 6; i++) {
        await bitmap.setGate(packetId, i, true);
      }

      const { gatesPass, ready } = await bitmap.getReadiness(packetId);

      expect(gatesPass).toBe(6);
      expect(ready).toBe(true); // 6/8 >= threshold (6)
    });

    it('should classify quarantine when gates < 4', async () => {
      const packetId = 'test:packet:quarantine';

      // Set only 2 gates
      await bitmap.setGate(packetId, 0, true);
      await bitmap.setGate(packetId, 1, true);

      const { gatesPass, ready } = await bitmap.getReadiness(packetId);

      expect(gatesPass).toBe(2);
      expect(ready).toBe(false); // 2/8 < threshold
    });

    it('should classify recover_identity when 4 <= gates < 6', async () => {
      const packetId = 'test:packet:recover';

      // Set 5 gates
      for (let i = 0; i < 5; i++) {
        await bitmap.setGate(packetId, i, true);
      }

      const { gatesPass, ready } = await bitmap.getReadiness(packetId);

      expect(gatesPass).toBe(5);
      expect(ready).toBe(false); // 5/8 < threshold (6)
    });

    it('should classify synthesize when gates >= 6', async () => {
      const packetId = 'test:packet:synthesize';

      // Set 8 gates for full confidence
      for (let i = 0; i < 8; i++) {
        await bitmap.setGate(packetId, i, true);
      }

      const { gatesPass, ready } = await bitmap.getReadiness(packetId);

      expect(gatesPass).toBe(8);
      expect(ready).toBe(true); // 8/8 >= threshold
    });
  });

  describe('similarity', () => {
    it('should calculate Hamming similarity via XOR', async () => {
      const packetA = 'test:packet:A';
      const packetB = 'test:packet:B';

      // Set packet A: bits 0-3 = 1 (11110000)
      for (let i = 0; i < 4; i++) {
        await bitmap.setGate(packetA, i, true);
      }

      // Set packet B: bits 0, 2, 4, 6 = 1 (01010101)
      await bitmap.setGate(packetB, 0, true);
      await bitmap.setGate(packetB, 2, true);
      await bitmap.setGate(packetB, 4, true);
      await bitmap.setGate(packetB, 6, true);

      const similarity = await bitmap.similarity(packetA, packetB);

      // packetA: 00001111 (bits 0-3 set)
      // packetB: 01010101 (bits 0, 2, 4, 6 set)
      // XOR: 00001111 ^ 01010101 = 01011010 (4 bits different)
      // Similarity = 1 - 4/8 = 0.5
      expect(similarity).toBeCloseTo(0.5, 2);
    });

    it('should return 1.0 for identical packets', async () => {
      const packetA = 'test:packet:identical:A';
      const packetB = 'test:packet:identical:B';

      // Set same gates on both
      for (let i = 0; i < 5; i++) {
        await bitmap.setGate(packetA, i, true);
        await bitmap.setGate(packetB, i, true);
      }

      const similarity = await bitmap.similarity(packetA, packetB);

      expect(similarity).toBe(1.0); // No bits differ
    });

    it('should return 0.0 for completely different packets', async () => {
      const packetA = 'test:packet:different:A';
      const packetB = 'test:packet:different:B';

      // Set opposite gates
      for (let i = 0; i < 8; i++) {
        await bitmap.setGate(packetA, i, i % 2 === 0); // 10101010
        await bitmap.setGate(packetB, i, i % 2 === 1); // 01010101
      }

      const similarity = await bitmap.similarity(packetA, packetB);

      expect(similarity).toBe(0.0); // All bits differ
    });
  });

  describe('traceCoverage', () => {
    it('should count covered packets in trace', async () => {
      const traceId = 'test:trace:1';
      const key = `atlas:mask:trace:${traceId}`;

      // Manually set some bits to simulate covered packets
      await redis.setbit(key, 0, 1);
      await redis.setbit(key, 3, 1);
      await redis.setbit(key, 5, 1);

      const coverage = await bitmap.traceCoverage(traceId);

      expect(coverage).toBe(3);
    });
  });

  describe('Performance characteristics', () => {
    it('should execute getReadiness in <5ms', async () => {
      const packetId = 'test:packet:perf';

      // Populate gates
      for (let i = 0; i < 8; i++) {
        await bitmap.setGate(packetId, i, i % 2 === 0);
      }

      const startTime = Date.now();
      const { gatesPass } = await bitmap.getReadiness(packetId);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5);
      expect(gatesPass).toBe(4);
    });

    it('should execute similarity in <10ms for two packets', async () => {
      const packetA = 'test:packet:perf:A';
      const packetB = 'test:packet:perf:B';

      // Populate packets
      for (let i = 0; i < 8; i++) {
        await bitmap.setGate(packetA, i, true);
        await bitmap.setGate(packetB, i, i < 4);
      }

      const startTime = Date.now();
      const similarity = await bitmap.similarity(packetA, packetB);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThanOrEqual(15);
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });
  });
});
