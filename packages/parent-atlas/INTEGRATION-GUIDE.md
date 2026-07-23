# Parent-Atlas + Atlas-Core Integration Guide

**Date**: June 26, 2026  
**Status**: Ready for integration  
**Scope**: Wire canonical packet identity into semantic indexing CLI

---

## Overview

`packages/parent-atlas` is the CLI utility for codebase semantic indexing and search integrations.

`packages/atlas-core` provides the canonical packet identity contract that all systems must use.

This guide shows how to integrate them.

---

## What Changed

### 1. Parent-Atlas Dependency

**File**: `packages/parent-atlas/package.json`

```json
{
  "dependencies": {
    "@deeds/atlas-core": "workspace:*",
    "ioredis": "^5.3.2",
    "pg": "^8.11.3"
  }
}
```

### 2. Canonical Packet Bridge

**File**: `packages/parent-atlas/src/core/canonical-packet-bridge.ts` (NEW)

Bridges atlas-core types into parent-atlas validators and adapters.

**Exports**:
- `extractPacketIdentityFromRow()` — Safe extraction from Postgres row
- `validatePacketIdentityFromRow()` — Soft validation (for logging)
- `verifyPacketIdentityConsistency()` — Hard validation (triple match check)
- `createEnvelopeFromRow()` — Create AtlasMemoryEnvelope for audit trail
- Re-exports all canonical types from atlas-core (types + functions)

---

## Integration Pattern

### In Validators (packet-validator-materializer.ts, etc.)

**Before**:
```typescript
// Defined locally
export interface AtlasPacketRegistry {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  ...
}

// Manual validation
function validatePacket(row: any): string[] {
  const errors: string[] = [];
  if (!row.packet_key) errors.push('missing packet_key');
  if (!row.source_ref) errors.push('missing source_ref');
  // ... etc
  return errors;
}
```

**After**:
```typescript
import { extractPacketIdentityFromRow, validatePacketIdentityFromRow } from './canonical-packet-bridge.js';

// Use canonical type (via bridge)
const identity = extractPacketIdentityFromRow(row); // Hard fail on invalid
const errors = validatePacketIdentityFromRow(row);  // Soft check for logging

// Use canonical validation
if (errors.length > 0) {
  console.warn(`Packet validation failed: ${errors.join('; ')}`);
}
```

### In Adapters (qdrant.ts, neo4j.ts, valkey.ts)

**Before**:
```typescript
// Inconsistent identity handling
await qdrant.upsert({
  id: row.qdrant_point_id,
  payload: {
    packet_key: row.packet_key,
    source_ref: row.source_ref,
    feature_id: row.feature_id,
  },
  // ... other fields
});
```

**After**:
```typescript
import { createEnvelopeFromRow, verifyPacketTriple } from './canonical-packet-bridge.js';
import { bitfrostKey } from '@deeds/atlas-core/types';

// Create envelope with canonical identity
const envelope = createEnvelopeFromRow(row, traceId, 'packet');

// Verify consistency before writing
const { consistent, mismatches } = verifyPacketIdentityConsistency(
  identity,
  row
);
if (!consistent) {
  throw new Error(`Packet consistency violation: ${mismatches.join('; ')}`);
}

// Write to mirrors with canonical shape
await qdrant.upsert({
  id: row.qdrant_point_id,
  payload: {
    packet_key: envelope.packet_key,
    source_ref: envelope.source_ref,
    feature_id: envelope.feature_id,
    trace_id: envelope.trace_id,
  },
});

// Cache keys follow canonical pattern
const packetKey = bitfrostKey('packet', envelope.packet_key);
const glyphKey = bitfrostKey('glyph', envelope.glyph_id);
// ...
```

### In Gates (identity.ts, lineage.ts, final.ts)

**Before**:
```typescript
// Manual gate checks
function runIdentityGate(): GateReport {
  // Hardcoded packet field checks
  const packetKeyCount = await pg.query('SELECT COUNT(DISTINCT packet_key) FROM atlas_packets');
  const sourceRefCount = await pg.query('SELECT COUNT(DISTINCT source_ref) FROM atlas_packets');
  // ...
}
```

**After**:
```typescript
import { extractPacketIdentityFromRow } from './canonical-packet-bridge.js';

function runIdentityGate(): GateReport {
  // Use canonical validator
  const rows = await pg.query('SELECT * FROM atlas_packets LIMIT 100');
  
  const validPackets = [];
  const invalidPackets = [];
  
  for (const row of rows) {
    const errors = validatePacketIdentityFromRow(row);
    if (errors.length === 0) {
      validPackets.push(row);
    } else {
      invalidPackets.push({ row, errors });
    }
  }
  
  return {
    passed: invalidPackets.length === 0,
    metrics: {
      valid: validPackets.length,
      invalid: invalidPackets.length,
    },
    details: invalidPackets,
  };
}
```

### In Pipelines (ingest.ts, enrich-karpathy.ts, etc.)

**Before**:
```typescript
// Duplicate validation scattered across pipeline
async function runIngest(): Promise<void> {
  const packets = await fetchPackets();
  
  for (const packet of packets) {
    // Local validation
    if (!packet.packet_key || !packet.source_ref) {
      console.warn('Skipping packet with missing identity');
      continue;
    }
    
    // ... process packet
  }
}
```

**After**:
```typescript
import { extractPacketIdentityFromRow, createEnvelopeFromRow } from './canonical-packet-bridge.js';

async function runIngest(): Promise<void> {
  const packets = await fetchPackets();
  
  for (const packet of packets) {
    // Use canonical extraction
    try {
      const identity = extractPacketIdentityFromRow(packet);
      
      // Create envelope for audit trail
      const envelope = createEnvelopeFromRow(packet, traceId);
      
      // Process with full audit context
      await processPacket(envelope);
    } catch (err) {
      console.error(`Failed to ingest packet: ${err.message}`);
    }
  }
}
```

---

## File-by-File Checklist

**Priority** (use canonical identity first):

1. **core/packet-validator-materializer.ts**
   - [ ] Replace `AtlasPacketRegistry` interface with `PacketIdentity`
   - [ ] Update `validatePacket()` to use canonical validator
   - [ ] Add envelope creation for telemetry

2. **adapters/qdrant.ts**
   - [ ] Use `bitfrostKey()` for consistent cache key naming
   - [ ] Write envelope-shaped payloads
   - [ ] Verify triple consistency before upsert

3. **adapters/valkey.ts**
   - [ ] Use `bitfrostKey()` pattern for all cache keys
   - [ ] Store envelope trace_id on every write
   - [ ] Add validation before cache write

4. **adapters/neo4j.ts**
   - [ ] Use canonical identity for node properties
   - [ ] Verify triple consistency before relationship creation
   - [ ] Include trace_id in node metadata

5. **adapters/postgres.ts**
   - [ ] Use canonical types for schema queries
   - [ ] Include envelope in audit log writes

6. **gates/identity.ts**
   - [ ] Use canonical validator for all checks
   - [ ] Report on validation error categories

7. **gates/lineage.ts**
   - [ ] Use envelope trace_id for lineage tracking
   - [ ] Verify triple consistency across hops

8. **gates/final.ts**
   - [ ] Use canonical validator as final sanity check
   - [ ] Report envelope envelope distribution

9. **pipelines/ingest.ts**
   - [ ] Extract canonical identity from source
   - [ ] Create envelope for audit trail
   - [ ] Verify before writing to Postgres

10. **pipelines/enrich-karpathy.ts**
    - [ ] Use canonical identity for GPU work
    - [ ] Create reward envelope
    - [ ] Write grpo_reward_score to Postgres

---

## No Breaking Changes

The bridge is **additive only**:
- Existing code continues to work
- New code uses canonical types
- Gradual migration (one file at a time)
- Each gateway/pipeline can migrate independently

---

## Build & Test

```bash
# Build parent-atlas
cd packages/parent-atlas
npm run build

# Run existing CLI commands (unchanged API)
npm run gate:identity
npm run gate:lineage
npm run ingest

# Check TypeScript (should pass with zero new errors)
npm run build -- --noEmit
```

---

## Integration Timeline

### Phase 1 (Session 83)
- [ ] Wire atlas-core dependency into parent-atlas package.json ✅
- [ ] Create canonical-packet-bridge.ts ✅
- [ ] Update core/packet-validator-materializer.ts
- [ ] Test: `npm run gate:identity` passes with canonical validator

### Phase 2 (Session 84)
- [ ] Update all adapters (qdrant, valkey, neo4j, postgres)
- [ ] Test: `npm run enrich:karpathy` writes canonical envelopes

### Phase 3 (Session 85)
- [ ] Update all gates (identity, lineage, final)
- [ ] Update all pipelines (ingest, enrich, cache, mapreduce)
- [ ] Full integration test: `npm run gate:production` passes

---

## Key Principles

1. ✅ **Canonical Identity Only** — No more local `packet_key`, `source_ref`, `feature_id` duplication
2. ✅ **Envelope Everywhere** — Every operation creates/carries envelope for audit trail
3. ✅ **Verify Triple** — Always check packet_key + source_ref + feature_id consistency
4. ✅ **Cache Key Pattern** — Use `bitfrostKey(kind, id)` for all Redis keys
5. ✅ **Trace ID** — Include trace_id on every envelope/write
6. ✅ **Hard Fail on Invalid** — Missing identity fields throw error, not silent skip

---

## Reference

**Canonical Types** (from `packages/atlas-core`):
- `PacketIdentity` — Core identity type
- `PacketKey`, `SourceRef`, `FeatureId` — Branded types
- `AtlasMemoryEnvelope` — Unified carrier
- `GlyphRecord` — Postgres schema for derived memory

**Bridge Functions** (from `canonical-packet-bridge.ts`):
- `extractPacketIdentityFromRow()` — Hard extract from row
- `validatePacketIdentityFromRow()` — Soft validation (for logging)
- `verifyPacketIdentityConsistency()` — Triple verification
- `createEnvelopeFromRow()` — Create audit envelope
- `bitfrostKey()` — Consistent cache key naming
- `verifyPacketTriple()` — Verify triple match

---

**Status**: Ready for implementation.  
**Next Step**: Migrate core/packet-validator-materializer.ts to use canonical identity.
