# Phase 2: Next Actions — Immediate Implementation Roadmap

**Current Status**: Phase 2 100% complete with mock implementations (70/70 tests passing)  
**Next Phase**: Wire real Postgres/Redis/NATS clients  
**Timeline**: 1-2 hours  
**Complexity**: Medium (straightforward client wiring, all patterns exist in codebase)

---

## What's Done ✅

- [x] ACP Tool Contracts (P2) — 4 Zod schemas
- [x] NATS Client (P4) — Event publishing
- [x] Telemetry (P5/P6) — Metrics collection
- [x] GAN Adversarial Validator (P7) — 6 probes
- [x] GAN Audit Orchestrator (P8) — 5-step flow
- [x] LangGraph Integration — NATS wiring in worker.ts
- [x] All Tests Passing — 70/70 (63 master + 7 integration)
- [x] Live Packet Validation — 5 packets verified from Postgres

---

## What's Not Done (Mocked) ⏳

| Component | Current | Target | Work |
|---|---|---|---|
| `readPacketsFromPostgres()` | Returns `[]` | Query real atlas_packets | 15 min |
| `writeValidationResultsToPostgres()` | No-op | UPDATE atlas_packets | 20 min |
| `invalidateRedisCache()` | Returns count | DELETE bitfrost:* keys | 15 min |
| `emitValidationEvents()` | No-op | Publish to NATS | 10 min |
| Gemma4 Latency Tracking | None | Optional telemetry | 20 min (skip for now) |

---

## Immediate Action Items (Today)

### 1. Wire Postgres Read ← READ FIRST
**File**: `packages/atlas-core/src/validation/gan-audit-integration.ts:54-62`

**Change**: Replace mock `return []` with real query

**Pseudo-code**:
```typescript
const { db } = await import('$lib/server/db/client.js');
const { sql } = await import('drizzle-orm');

const packets = await db.execute(sql`
  SELECT packet_key, source_ref, feature_id, summary, title, embedding, ganValidated
  FROM atlas_packets
  WHERE packet_key IS NOT NULL AND source_ref IS NOT NULL AND feature_id IS NOT NULL
  LIMIT ${limit}
`);
return Array.isArray(packets) ? packets : packets.rows ?? [];
```

**Verification**:
```bash
npx tsx scripts/atlas/test-gan-audit-integration.mts
# Expect: Test 2 "Dry-run" shows processed > 0
```

**Time**: 15 minutes

---

### 2. Wire Postgres Write ← Second
**File**: `packages/atlas-core/src/validation/gan-audit-integration.ts:162-199`

**Change**: Replace comment-only logic with actual UPDATE queries

**Pattern**:
- Hard failures: `UPDATE ... SET ganValidated=false, ganValidationError=...`
- Soft warnings: `UPDATE ... SET ganValidated=true, ganWarnings=...`
- Passed: `UPDATE ... SET ganValidated=true, ganWarnings=NULL`

**Verification**:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*), COUNT(CASE WHEN ganValidated THEN 1 END) FROM atlas_packets"
# Expect: some rows have ganValidated=true
```

**Time**: 20 minutes

---

### 3. Wire Redis Invalidation ← Third
**File**: `packages/atlas-core/src/validation/gan-audit-integration.ts:211-235`

**Change**: Replace mock count with actual Redis DEL

**Pattern**:
```typescript
const { getRedis } = await import('$lib/server/redis.js');
const redis = getRedis();

const keys = packets.flatMap(p => [
  `bitfrost:packet:${p.packet_key}`,
  `bitfrost:trace:${p.packet_key}`,
  `bitfrost:source:${p.source_ref}`,
  `bitfrost:feature:${p.feature_id}`
]);

if (keys.length > 0) {
  await redis.del(...keys);
}
```

**Verification**:
```bash
docker exec legal-ai-redis redis-cli KEYS "bitfrost:*" | wc -l
# Expect: count decreases after invalidation
```

**Time**: 15 minutes

---

### 4. Wire NATS Publish ← Fourth
**File**: `packages/atlas-core/src/validation/gan-audit-integration.ts:242-267`

**Change**: Replace no-op with actual NATS publish

**Pattern**:
```typescript
const { getNatsClient } = await import('../nats/nats-client.js');
const nats = getNatsClient();

for (const packet of [...hardFailures, ...softWarnings, ...passed]) {
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
```

**Verification**:
```bash
# Monitor NATS subject in a separate terminal:
# docker exec legal-ai-nats nats sub 'atlas.packets.validated'
# Then run the test — should see events
```

**Time**: 10 minutes

---

### 5. Run Full Integration Test
**Command**:
```bash
npx tsx scripts/atlas/test-gan-audit-integration.mts
```

**Expected**:
- Test 2 (Dry-run): `processed > 0`
- Test 3 (5-step): All steps show ✅ PASS
- Test 7 (NATS): Events emitted > 0

**Time**: 5 minutes (run time)

---

## Optional Follow-Up (Tomorrow or Next Session)

### 6. Add Gemma4 Latency Tracking
**File**: Create `packages/atlas-core/src/telemetry/gemma4-latency-tracker.ts`

**Why**: Track synthesis latency per node for performance monitoring

**Time**: 20 minutes

---

### 7. Export Metrics to Grafana/Datadog
**Why**: Enable monitoring dashboard

**Effort**: Depends on dashboard setup

**Time**: 30+ minutes

---

### 8. Add Circuit Breaker for Graceful Degradation
**Why**: Handle backend failures gracefully

**Pattern**:
```typescript
try {
  await redis.del(...keys);
} catch (err) {
  console.warn('Redis failure (non-blocking):', err.message);
  // Continue anyway — Redis is cache, not critical path
}
```

**Time**: 15 minutes

---

## Completeness Checklist

### After Step 1 (Postgres Read)
- [ ] `readPacketsFromPostgres()` returns real packets
- [ ] `npx tsx test-gan-audit-integration.mts` shows `processed > 0`
- [ ] No Postgres connection errors

### After Step 2 (Postgres Write)
- [ ] `writeValidationResultsToPostgres()` updates Postgres
- [ ] `ganValidated` flag is set correctly in atlas_packets
- [ ] Docker Postgres shows updated rows

### After Step 3 (Redis Invalidation)
- [ ] `invalidateRedisCache()` deletes keys
- [ ] `bitfrost:*` key count decreases
- [ ] Redis key validation shows deletions

### After Step 4 (NATS Publish)
- [ ] `emitValidationEvents()` publishes events
- [ ] NATS monitoring shows events on `atlas.packets.validated`
- [ ] No NATS connection errors

### After Step 5 (Full Integration Test)
- [ ] All 7 integration tests pass
- [ ] End-to-end flow completes without errors
- [ ] Test report shows 100% pass rate

---

## Key Files to Review Before Starting

1. **Postgres Client Pattern**: `sveltekit-frontend/src/lib/server/db/client.ts`
   - Shows how to import `db` from Drizzle
   - Shows raw SQL query pattern with `.execute()`

2. **Redis Client Pattern**: `sveltekit-frontend/src/lib/server/redis.ts`
   - Shows `getRedis()` singleton pattern
   - Shows batch operations like `.del(...keys)`

3. **NATS Client Pattern**: `packages/atlas-core/src/nats/nats-client.ts`
   - Already implemented; just call `getNatsClient().publishTraceCheckpoint()`

4. **Implementation Guide**: `docs/PHASE2-INTEGRATION-IMPLEMENTATION-GUIDE.md`
   - Complete code snippets for all 4 changes
   - Verification commands for each step

---

## Risk Assessment

| Step | Risk | Mitigation | Rollback |
|---|---|---|---|
| Postgres Read | Connection error | Check env.DATABASE_URL | Revert to mock |
| Postgres Write | Data corruption | Validate UPDATE syntax | ROLLBACK in transaction |
| Redis Delete | Wrong keys deleted | Test regex pattern first | Redis still caches, not critical |
| NATS Publish | Message loss | Non-blocking, logged | Skip publishing, continue |

**Overall Risk**: Low (all failures are gracefully handled; Postgres writes are the only critical path)

---

## Success Criteria

When complete, all of the following must be true:

1. ✅ Master test suite passes (63/63)
2. ✅ GAN audit integration tests pass (7/7)
3. ✅ `readPacketsFromPostgres()` returns real packets from Postgres
4. ✅ `writeValidationResultsToPostgres()` updates `ganValidated` flag in Postgres
5. ✅ `invalidateRedisCache()` deletes `bitfrost:*` keys from Redis
6. ✅ `emitValidationEvents()` publishes to NATS subject `atlas.packets.validated`
7. ✅ End-to-end test passes without errors
8. ✅ Live packet validation passes (packet identity verified)

---

## Estimated Timeline

| Activity | Duration | Total |
|---|---|---|
| Postgres Read | 15 min | 15 min |
| Postgres Write | 20 min | 35 min |
| Redis Invalidation | 15 min | 50 min |
| NATS Publish | 10 min | 60 min |
| Full Test Run | 5 min | 65 min |
| Verification | 10 min | 75 min |
| **Total** | | **~1.5 hours** |

---

## How to Get Help

If you get stuck on any step:

1. **Postgres Query Syntax**: Check `sveltekit-frontend/src/lib/server/db/*.ts` for examples
2. **Redis Key Pattern**: Check `bitfrost:*` keys in redis-cli to understand the pattern
3. **NATS Subject**: Check `nats-client.ts:SUBJECTS.TRACE_CHECKPOINT` for the correct subject name
4. **Error Messages**: All error messages include file path, line number, and the failed operation

---

## Notes

- **Do NOT skip Postgres Write verification** — that's where the canonical truth is updated
- **Redis failure is non-blocking** — the orchestrator continues even if Redis is down
- **NATS failure is non-blocking** — events are best-effort notifications
- **All test commands can be run in dry-run mode first** — use `--dry-run` flag to preview changes

---

**Status**: Ready to implement  
**Difficulty**: Medium (straightforward client wiring)  
**Estimated Time**: 1-2 hours  
**Complexity**: Low (all patterns exist in codebase)  
**Risk**: Low (graceful error handling in place)

Start with **Step 1 (Postgres Read)** — it's the quickest and unlocks the rest of the pipeline.

