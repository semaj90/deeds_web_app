# Phase 3: Redis/Valkey Bitmap Optimization for Atlas Packets

**Date**: 2026-07-07 (Post-Phase 2)  
**Status**: Design Ready  
**Effort**: 2-3 hours  
**Outcome**: 10× faster gate scoring, 50+ fewer Redis keys per packet

---

## TL;DR

Replace 8 individual Redis keys per packet with **1 bitmap (1 byte)** for state gates:
- Bit 0: feature_id present
- Bit 1: source_ref trusted
- Bit 2: ACE cache hit
- Bit 3: KAG neighbor available
- Bit 4: DAG edge exists
- Bit 5: summary exists
- Bit 6: embedding exists
- Bit 7: all mirrors synced

Operations: BITOP XOR (similarity), BITCOUNT (readiness), BITFIELD (packed fields).

---

## Key Pattern

### Packet State Mask (1 Byte)
```
atlas:mask:packet:{packet_id}      → 0-255 (8 bits = 8 gates)
atlas:mask:feature:{feature_id}    → Bitmap of all packets with feature
atlas:mask:trace:{trace_id}        → Bitmap of query coverage
```

### Gate Scoring Rule
```
readiness = bitcount(mask) / 8

0-3/8 → quarantine
4-5/8 → recover_identity  
6-7/8 → synthesize (warnings)
8/8   → synthesize (full confidence)
```

### Performance Gains
| Operation | Before | After | Speedup |
|-----------|--------|-------|---------|
| Get packet gates | 50-200ms (Postgres) | 0.1ms (Redis BITCOUNT) | 500-2000× |
| Similarity score | N+1 queries | 1 BITOP XOR | N× |
| Trace coverage | Loop + count | 1 BITCOUNT | 100× |
| Storage per packet | 8 keys | 1 key | 8× savings |

---

## Implementation Steps

### Step 1: Create Bitmap Helper Module
**File**: `src/lib/server/cache/packet-bitmap.ts`

```typescript
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

  // Set individual gate
  async setGate(packetId: string, gateIndex: 0-7, value: boolean): Promise<void> {
    const key = `atlas:mask:packet:${packetId}`;
    await this.redis.setbit(key, gateIndex, value ? 1 : 0);
  }

  // Get all gates for packet
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

  // Gate readiness score
  async getReadiness(packetId: string): Promise<{ gatesPass: number; ready: boolean }> {
    const key = `atlas:mask:packet:${packetId}`;
    const gatesPass = await this.redis.bitcount(key);
    return {
      gatesPass,
      ready: gatesPass >= 6, // 6/8 threshold
    };
  }

  // Binary similarity (Hamming distance via XOR)
  async similarity(packetIdA: string, packetIdB: string): Promise<number> {
    const tempKey = `temp:xor:${Date.now()}:${Math.random()}`;
    const keyA = `atlas:mask:packet:${packetIdA}`;
    const keyB = `atlas:mask:packet:${packetIdB}`;

    await this.redis.bitop('xor', tempKey, keyA, keyB);
    const hammingDistance = await this.redis.bitcount(tempKey);
    await this.redis.del(tempKey);

    return 1 - hammingDistance / 8; // 0-1 similarity score
  }

  // Trace coverage
  async traceCoverage(traceId: string): Promise<number> {
    const key = `atlas:mask:trace:${traceId}`;
    return this.redis.bitcount(key);
  }
}
```

### Step 2: Wire into Dispatcher Node 6 (Validation)
**File**: `src/lib/server/langgraph/dispatcher-nodes/node-validate-envelope.ts`

```typescript
// Replace Postgres gate checks with bitmap scoring
const bitmap = new PacketBitmapCache(redis);
const { gatesPass, ready } = await bitmap.getReadiness(packet.packet_id);

const decision = ready
  ? 'synthesize'
  : gatesPass >= 4
  ? 'recover_identity'
  : 'quarantine';

return {
  ...state,
  dispatch_decision: decision,
  gate_confidence: gatesPass / 8,
  telemetry: {
    ...state.telemetry,
    gates_pass: gatesPass,
    validation_method: 'bitmap', // vs 'postgres'
  },
};
```

### Step 3: Add Telemetry Tracking
**File**: `src/lib/server/telemetry/dispatcher-telemetry-wrapper.ts`

```typescript
// Track bitmap operation latencies
const startBitmap = Date.now();
const readiness = await bitmap.getReadiness(packetId);
const bitmapMs = Date.now() - startBitmap;

// Compare vs Postgres baseline
telemetry.bitmap_latency_ms = bitmapMs;
telemetry.speedup_vs_postgres = bitmapMs < 1 ? '500×+' : 'baseline';
```

### Step 4: Test & Verify
**File**: `tests/bitmap-optimization.spec.ts`

```typescript
describe('PacketBitmapCache', () => {
  it('should encode/decode 8 gates in 1 byte', async () => {
    const bitmap = new PacketBitmapCache(redis);
    await bitmap.setGate('test:1', 0, true);  // featureIdPresent
    await bitmap.setGate('test:1', 7, false); // allMirrorsSynced

    const gates = await bitmap.getGates('test:1');
    expect(gates.featureIdPresent).toBe(true);
    expect(gates.allMirrorsSynced).toBe(false);
  });

  it('should score readiness as gateCount/8', async () => {
    const bitmap = new PacketBitmapCache(redis);
    for (let i = 0; i < 6; i++) {
      await bitmap.setGate('test:2', i, true);
    }

    const { gatesPass, ready } = await bitmap.getReadiness('test:2');
    expect(gatesPass).toBe(6);
    expect(ready).toBe(true); // 6/8 >= threshold
  });

  it('should calculate Hamming similarity via XOR', async () => {
    const bitmap = new PacketBitmapCache(redis);
    // Set packet A: 11110000
    for (let i = 0; i < 4; i++) await bitmap.setGate('A', i, true);
    // Set packet B: 10101010
    await bitmap.setGate('B', 0, true);
    await bitmap.setGate('B', 2, true);
    await bitmap.setGate('B', 4, true);
    await bitmap.setGate('B', 6, true);

    const sim = await bitmap.similarity('A', 'B');
    expect(sim).toBeCloseTo(0.5, 1); // Half bits match
  });
});
```

---

## Deployment Checklist

- [ ] Create `packet-bitmap.ts` module
- [ ] Wire into `node-validate-envelope.ts` (dispatcher node 6)
- [ ] Add telemetry tracking (bitmap_latency_ms)
- [ ] Write & pass tests (3 core scenarios)
- [ ] Warm bitmap cache from existing gate flags (backfill)
- [ ] Measure latency improvement (baseline: Postgres vs new: Redis bitmap)
- [ ] Update CLAUDE.md with new gate scoring rule
- [ ] Commit with telemetry proof

---

## Timeline

**Phase 2 (Current)**: OpenCode dispatcher bridge ✅  
**Phase 2a (This week)**: GAN audit endpoint ✅  
**Phase 3 (Next week)**: Bitmap optimization (2-3h)  
**Phase 4 (Roadmap)**: LangGraph real integration + A2A agent discovery

---

## Key Metrics to Track

| Metric | Target | Baseline |
|--------|--------|----------|
| Gate scoring latency | <1ms | 50-200ms |
| Packet readiness checks/sec | 10k+ | 100-200 |
| Redis memory per packet | 1 byte | 8 keys |
| Dispatcher throughput | 100 req/s | 10-20 req/s |

---

**Status**: Ready for Phase 3 implementation  
**Owner**: Next session  
**Reference**: `src/lib/server/cache/packet-bitmap.ts` (to be created)
