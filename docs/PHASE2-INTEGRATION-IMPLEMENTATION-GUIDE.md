# Phase 2 Integration Implementation Guide

**Objective**: Wire real Postgres/Redis/NATS clients into GanAuditOrchestrator  
**Effort**: 1-2 hours  
**Current State**: All methods return mocks; tests pass with empty results  
**Target**: Full end-to-end packet validation with real backends

---

## Prerequisites

### 1. Postgres Database Setup
- ✅ `atlas_packets` table exists (verified with 5 sample packets)
- ✅ Required columns: `packet_key`, `source_ref`, `feature_id`, `summary`, `embedding`, `ganValidated`
- Connection: Via `$lib/server/db/client.ts` (Drizzle ORM + node-postgres)

### 2. Redis/Valkey Cache
- Endpoint: `127.0.0.1:6379` (docker compose: `legal-ai-redis`)
- Pattern: `bitfrost:packet:{packet_key}`, `bitfrost:trace:*`, `bitfrost:source:*`, `bitfrost:feature:*`
- Package: `ioredis` (already installed)

### 3. NATS Message Queue
- Endpoint: `nats://localhost:4222` (docker compose: `legal-ai-nats`)
- Subject: `atlas.packets.validated`
- Package: `nats` (npm install nats)

---

## Step 1: Update GanAuditOrchestrator — Read from Postgres

**File**: `packages/atlas-core/src/validation/gan-audit-integration.ts`

**Current** (lines 54-62):
```typescript
async readPacketsFromPostgres(limit: number): Promise<any[]> {
  // Mock implementation — would call actual Postgres pool
  if (this.config.verbose) {
    console.log(`[GAN Audit] Step 1: Reading ${limit} packets from Postgres...`);
  }
  return [];
}
```

**Replace with**:
```typescript
async readPacketsFromPostgres(limit: number): Promise<any[]> {
  if (this.config.verbose) {
    console.log(`[GAN Audit] Step 1: Reading ${limit} packets from Postgres...`);
  }

  try {
    // Import canonical Postgres client
    const { db } = await import('$lib/server/db/client.js');
    const { sql } = await import('drizzle-orm');

    // Raw query for direct access to atlas_packets
    const rows = await db.execute(sql<{
      packet_key: string;
      source_ref: string;
      feature_id: string;
      summary?: string;
      title?: string;
      embedding?: number[];
      ganValidated?: boolean;
    }>`
      SELECT
        packet_key,
        source_ref,
        feature_id,
        summary,
        title,
        embedding,
        ganValidated
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
        AND source_ref IS NOT NULL
        AND feature_id IS NOT NULL
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);

    // Extract rows (Drizzle returns { rows: T[] })
    const packets = Array.isArray(rows) ? rows : (rows as any).rows ?? [];
    
    if (this.config.verbose) {
      console.log(`[GAN Audit] Read ${packets.length} packets from Postgres`);
    }

    return packets;
  } catch (err: any) {
    console.error(`[GAN Audit] Step 1 failed: ${err.message}`);
    throw new Error(`Postgres read failed: ${err.message}`);
  }
}
```

---

## Step 2: Update GanAuditOrchestrator — Write to Postgres

**File**: `packages/atlas-core/src/validation/gan-audit-integration.ts`

**Current** (lines 162-199):
```typescript
async writeValidationResultsToPostgres(
  hardFailures: any[],
  softWarnings: any[],
  passed: any[]
): Promise<number> {
  let updatedCount = 0;

  if (this.config.dryRun) {
    if (this.config.verbose) {
      console.log(`[GAN Audit] Step 3 (DRY-RUN): Would write ${hardFailures.length + softWarnings.length + passed.length} updates to Postgres`);
    }
    return hardFailures.length + softWarnings.length + passed.length;
  }

  // Hard failures: ganValidated = false
  if (hardFailures.length > 0) {
    // UPDATE atlas_packets SET ganValidated = false, ganValidationError = ?, updated_at = NOW()
    updatedCount += hardFailures.length;
  }

  // Soft warnings: ganValidated = true, ganWarnings = ?
  if (softWarnings.length > 0) {
    // UPDATE atlas_packets SET ganValidated = true, ganWarnings = ?, updated_at = NOW()
    updatedCount += softWarnings.length;
  }

  // Passed: ganValidated = true
  if (passed.length > 0) {
    // UPDATE atlas_packets SET ganValidated = true, ganWarnings = NULL, updated_at = NOW()
    updatedCount += passed.length;
  }

  if (this.config.verbose) {
    console.log(`[GAN Audit] Step 3: Wrote ${updatedCount} validation results to Postgres`);
  }

  return updatedCount;
}
```

**Replace with**:
```typescript
async writeValidationResultsToPostgres(
  hardFailures: any[],
  softWarnings: any[],
  passed: any[]
): Promise<number> {
  let updatedCount = 0;

  if (this.config.dryRun) {
    if (this.config.verbose) {
      console.log(`[GAN Audit] Step 3 (DRY-RUN): Would write ${hardFailures.length + softWarnings.length + passed.length} updates to Postgres`);
    }
    return hardFailures.length + softWarnings.length + passed.length;
  }

  try {
    const { db } = await import('$lib/server/db/client.js');
    const { eq, sql } = await import('drizzle-orm');

    // Hard failures: ganValidated = false
    if (hardFailures.length > 0) {
      for (const failure of hardFailures) {
        await db.execute(sql`
          UPDATE atlas_packets
          SET
            ganValidated = false,
            ganValidationError = ${failure.reason},
            updated_at = NOW()
          WHERE packet_key = ${failure.packet_key}
        `);
        updatedCount++;
      }
    }

    // Soft warnings: ganValidated = true, ganWarnings = array
    if (softWarnings.length > 0) {
      for (const warning of softWarnings) {
        await db.execute(sql`
          UPDATE atlas_packets
          SET
            ganValidated = true,
            ganWarnings = ${JSON.stringify(warning.warnings)},
            updated_at = NOW()
          WHERE packet_key = ${warning.packet_key}
        `);
        updatedCount++;
      }
    }

    // Passed: ganValidated = true
    if (passed.length > 0) {
      for (const packet of passed) {
        await db.execute(sql`
          UPDATE atlas_packets
          SET
            ganValidated = true,
            ganWarnings = NULL,
            updated_at = NOW()
          WHERE packet_key = ${packet.packet_key}
        `);
        updatedCount++;
      }
    }

    if (this.config.verbose) {
      console.log(`[GAN Audit] Step 3: Wrote ${updatedCount} validation results to Postgres`);
    }

    return updatedCount;
  } catch (err: any) {
    console.error(`[GAN Audit] Step 3 failed: ${err.message}`);
    throw new Error(`Postgres write failed: ${err.message}`);
  }
}
```

---

## Step 3: Update GanAuditOrchestrator — Invalidate Redis Cache

**File**: `packages/atlas-core/src/validation/gan-audit-integration.ts`

**Current** (lines 211-235):
```typescript
async invalidateRedisCache(packets: any[]): Promise<number> {
  let keysInvalidated = 0;

  if (this.config.dryRun) {
    const expectedKeys = packets.length * 4; // 4 keys per packet
    if (this.config.verbose) {
      console.log(`[GAN Audit] Step 4 (DRY-RUN): Would invalidate ${expectedKeys} Redis keys`);
    }
    return expectedKeys;
  }

  try {
    // await redis.del(...keys) for all bitfrost:* patterns
    keysInvalidated = packets.length * 4;

    if (this.config.verbose) {
      console.log(`[GAN Audit] Step 4: Invalidated ${keysInvalidated} Redis keys`);
    }
  } catch (err: any) {
    // Non-blocking — log but continue
    console.warn(`[GAN Audit] Step 4: Redis invalidation failed (non-blocking): ${err.message}`);
  }

  return keysInvalidated;
}
```

**Replace with**:
```typescript
async invalidateRedisCache(packets: any[]): Promise<number> {
  let keysInvalidated = 0;

  if (this.config.dryRun) {
    const expectedKeys = packets.length * 4; // 4 keys per packet
    if (this.config.verbose) {
      console.log(`[GAN Audit] Step 4 (DRY-RUN): Would invalidate ${expectedKeys} Redis keys`);
    }
    return expectedKeys;
  }

  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();

    // Delete 4 keys per packet: bitfrost:packet, :trace, :source, :feature
    const keysToDelete: string[] = [];

    for (const packet of packets) {
      keysToDelete.push(
        `bitfrost:packet:${packet.packet_key}`,
        `bitfrost:trace:${packet.packet_key}`,
        `bitfrost:source:${packet.source_ref}`,
        `bitfrost:feature:${packet.feature_id}`
      );
    }

    // Batch delete
    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
      keysInvalidated = keysToDelete.length;
    }

    if (this.config.verbose) {
      console.log(`[GAN Audit] Step 4: Invalidated ${keysInvalidated} Redis keys`);
    }
  } catch (err: any) {
    // Non-blocking — log but continue
    console.warn(`[GAN Audit] Step 4: Redis invalidation failed (non-blocking): ${err.message}`);
  }

  return keysInvalidated;
}
```

---

## Step 4: Update GanAuditOrchestrator — Emit NATS Events

**File**: `packages/atlas-core/src/validation/gan-audit-integration.ts`

**Current** (lines 242-267):
```typescript
async emitValidationEvents(
  hardFailures: any[],
  softWarnings: any[],
  passed: any[]
): Promise<number> {
  const eventCount = hardFailures.length + softWarnings.length + passed.length;

  if (this.config.dryRun) {
    if (this.config.verbose) {
      console.log(`[GAN Audit] Step 5 (DRY-RUN): Would emit ${eventCount} validation events`);
    }
    return eventCount;
  }

  try {
    // await nats.publish('atlas.packets.validated', { ... })
    if (this.config.verbose) {
      console.log(`[GAN Audit] Step 5: Emitted ${eventCount} validation events`);
    }
  } catch (err: any) {
    // Non-blocking — log but continue
    console.warn(`[GAN Audit] Step 5: NATS publish failed (non-blocking): ${err.message}`);
  }

  return eventCount;
}
```

**Replace with**:
```typescript
async emitValidationEvents(
  hardFailures: any[],
  softWarnings: any[],
  passed: any[]
): Promise<number> {
  const eventCount = hardFailures.length + softWarnings.length + passed.length;

  if (this.config.dryRun) {
    if (this.config.verbose) {
      console.log(`[GAN Audit] Step 5 (DRY-RUN): Would emit ${eventCount} validation events`);
    }
    return eventCount;
  }

  try {
    const { getNatsClient } = await import('../nats/nats-client.js');
    const nats = getNatsClient();

    // Emit events for all packets
    for (const failure of hardFailures) {
      await nats.publishTraceCheckpoint({
        trace_id: `audit:${Date.now()}`,
        packet_key: failure.packet_key,
        step: 3,
        node: 'gan_audit',
        duration_ms: 0,
        synthesis_length: failure.reason.length,
        timestamp: new Date().toISOString(),
      });
    }

    for (const warning of softWarnings) {
      await nats.publishTraceCheckpoint({
        trace_id: `audit:${Date.now()}`,
        packet_key: warning.packet_key,
        step: 3,
        node: 'gan_audit',
        duration_ms: 0,
        synthesis_length: JSON.stringify(warning.warnings).length,
        timestamp: new Date().toISOString(),
      });
    }

    for (const packet of passed) {
      await nats.publishTraceCheckpoint({
        trace_id: `audit:${Date.now()}`,
        packet_key: packet.packet_key,
        step: 3,
        node: 'gan_audit',
        duration_ms: 0,
        synthesis_length: 0,
        timestamp: new Date().toISOString(),
      });
    }

    if (this.config.verbose) {
      console.log(`[GAN Audit] Step 5: Emitted ${eventCount} validation events`);
    }
  } catch (err: any) {
    // Non-blocking — log but continue
    console.warn(`[GAN Audit] Step 5: NATS publish failed (non-blocking): ${err.message}`);
  }

  return eventCount;
}
```

---

## Step 5: Test End-to-End Integration

### Run the Integration Test
```bash
npx tsx scripts/atlas/test-gan-audit-integration.mts
```

**Expected Output**:
```
Test 3: 5-step canonical flow
✅ All 5 steps executed:
   1. Read packets from Postgres ✓
   2. Validate structure (adversarial probes) ✓
   3. Write results to Postgres ✓
   4. Invalidate Redis cache ✓
   5. Emit NATS events ✓
```

### Verify with Real Data

```bash
# Query Postgres to see updated ganValidated flag
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT packet_key, ganValidated, ganValidationError FROM atlas_packets LIMIT 5"

# Check Redis cache keys were deleted
docker exec legal-ai-redis redis-cli KEYS "bitfrost:*" | head -10
```

---

## Step 6: Add Gemma4 LLM Telemetry (Optional)

**File**: Create `packages/atlas-core/src/telemetry/gemma4-latency-tracker.ts`

```typescript
interface GemmaLatencyEvent {
  trace_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  timestamp: Date;
}

export class GemmaLatencyTracker {
  private events: GemmaLatencyEvent[] = [];

  recordSynthesis(event: Omit<GemmaLatencyEvent, 'timestamp'>) {
    this.events.push({ ...event, timestamp: new Date() });
  }

  getLatencyStats() {
    const durations = this.events.map(e => e.duration_ms);
    return {
      mean: durations.reduce((a, b) => a + b, 0) / durations.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      p95: durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)],
    };
  }
}
```

---

## Step 7: Wire into LangGraph Worker (Optional)

**File**: `packages/atlas-core/src/langgraph/worker.ts`

Add to `gemma4_synthesis` node:
```typescript
const startTime = performance.now();

// ... synthesis code ...

const duration = performance.now() - startTime;

// Track telemetry
const telemetry = getTelemetryCollector(trace_id);
const timer = telemetry.startNodeTimer('gemma4_synthesis');
timer.recordAsyncOp('gemma4_call', duration);
timer.stop();

const checkpoint = await telemetry.emitCheckpoint();
```

---

## Deployment Checklist

- [ ] Postgres client imports verified (no ESM issues)
- [ ] Redis client imports verified
- [ ] NATS client initialized
- [ ] Error handling tested (graceful degradation)
- [ ] Non-blocking cache/NATS failures verified
- [ ] End-to-end test passes (read → validate → write → invalidate → emit)
- [ ] Live data validation passes
- [ ] Monitoring dashboard updated (optional)
- [ ] Production deployment health checks enabled

---

## Success Criteria

✅ **All** of the following must be true:

1. `readPacketsFromPostgres()` returns real packets from atlas_packets
2. `validatePacketStructure()` processes packets correctly (6 probes active)
3. `writeValidationResultsToPostgres()` updates `ganValidated` flag
4. `invalidateRedisCache()` deletes bitfrost:* keys
5. `emitValidationEvents()` publishes to NATS subject `atlas.packets.validated`
6. End-to-end test completes without errors
7. Live packet validation shows correct identity fields

---

**Estimated Time to Complete**: 1-2 hours  
**Risk Level**: Low (all methods are isolated; failures are non-blocking except Postgres writes)  
**Rollback Plan**: Revert to mock implementations if backends become unavailable

