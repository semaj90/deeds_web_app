import Redis from 'ioredis';

export interface PacketGates {
  featureIdPresent: boolean;
  sourceRefTrusted: boolean;
  aceCacheHit: boolean;
  kagNeighborAvailable: boolean;
  dagEdgeExists: boolean;
  summaryExists: boolean;
  embeddingExists: boolean;
  allMirrorsSynced: boolean;
}

export class PacketBitmapCache {
  constructor(private redis: Redis) {}

  async setGate(packetId: string, gateIndex: number, value: boolean): Promise<void> {
    if (gateIndex < 0 || gateIndex > 7) {
      throw new Error(`Gate index must be 0-7, got ${gateIndex}`);
    }
    const key = `atlas:mask:packet:${packetId}`;
    await this.redis.setbit(key, gateIndex, value ? 1 : 0);
  }

  async getGates(packetId: string): Promise<PacketGates> {
    const key = `atlas:mask:packet:${packetId}`;
    const byte = await this.redis.getBuffer(key);
    const bits = byte ? byte[0] : 0;

    return {
      featureIdPresent: !!(bits & 0b00000001),
      sourceRefTrusted: !!(bits & 0b00000010),
      aceCacheHit: !!(bits & 0b00000100),
      kagNeighborAvailable: !!(bits & 0b00001000),
      dagEdgeExists: !!(bits & 0b00010000),
      summaryExists: !!(bits & 0b00100000),
      embeddingExists: !!(bits & 0b01000000),
      allMirrorsSynced: !!(bits & 0b10000000),
    };
  }

  async getReadiness(packetId: string): Promise<{ gatesPass: number; ready: boolean }> {
    const key = `atlas:mask:packet:${packetId}`;
    const gatesPass = await this.redis.bitcount(key);
    return {
      gatesPass,
      ready: gatesPass >= 6,
    };
  }

  async similarity(packetIdA: string, packetIdB: string): Promise<number> {
    const tempKey = `temp:xor:${Date.now()}:${Math.random()}`;
    const keyA = `atlas:mask:packet:${packetIdA}`;
    const keyB = `atlas:mask:packet:${packetIdB}`;

    try {
      await this.redis.bitop('xor', tempKey, keyA, keyB);
      const hammingDistance = await this.redis.bitcount(tempKey);
      return 1 - hammingDistance / 8;
    } finally {
      await this.redis.del(tempKey);
    }
  }

  async traceCoverage(traceId: string): Promise<number> {
    const key = `atlas:mask:trace:${traceId}`;
    return this.redis.bitcount(key);
  }
}
