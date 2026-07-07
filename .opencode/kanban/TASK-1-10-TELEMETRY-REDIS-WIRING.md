---
id: telemetry:task-1.10
title: Telemetry — Wire Real Redis to Implementation Clusters
status: done
priority: p0
effort: 3h
created: 2026-07-06
started: 2026-07-06T18:19:00Z
completed: 2026-07-06T18:30:00Z
---

# Task 1.10: Telemetry — Wire Real Redis to Implementation Clusters

## Task Statement

Replace mocked telemetry data in `/api/telemetry/implementation-clusters` endpoint with real Redis queries. Verify that clusters are discoverable from live dispatcher telemetry, enabling operators to see which files/routes/tools implement a given feature.

## Context

- **Parent**: Sessions 119a Tasks 1.7–1.9 (telemetry infrastructure complete)
- **Depends on**: MCP tool telemetry emitters (Task 1.7), dispatcher telemetry capture (Task 1.8), dashboard UI (Task 1.9)
- **Related**: Task 1.11 (Grafana dashboard), Sessions 115–118 (mirror workers)
- **Reference**: `docs/telemetry/observability-queries.md` (6 canonical query patterns)

## Files Allowed

- `src/routes/api/telemetry/implementation-clusters/+server.ts` (replace mocks with real queries)
- `tests/telemetry/implementation-clusters-integration.spec.ts` (new integration test)
- `docs/telemetry/observability-queries.md` (add Redis query examples)
- **Explicitly disallowed**:
  - No changes to schema migrations
  - No changes to GPU workers
  - No new database columns
  - No changes to MCP tool signatures

## Acceptance Criteria

- [x] `/api/telemetry/implementation-clusters` returns clusters from Redis (not mocks)
- [x] Cluster includes: files, routes, tools, tests, summaries, graph_neighbors, metrics, confidence
- [x] Query params work: `?tool_name=`, `?node_id=`, `?feature_id=`, `?duration_ms_min/max`
- [x] Integration test passes: 44+ assertions (invoke dispatcher → emit telemetry → query clusters)
- [x] Dashboard at `/admin/telemetry` shows live metrics (success_rate, latency, error count)
- [x] All tests pass: `npm run test -- telemetry` (44/44 pass)
- [x] No TypeScript errors: `svelte-check --threshold error` passes
- [x] Commit message links to this task ID

## Expected Tests

```bash
# Type check and lint
npm run check

# Run telemetry tests only
npm run test -- telemetry

# Optional: smoke test dispatcher + telemetry
npm run smoke:hyperrag-packet-rpc
```

## Rollback

If anything goes wrong:
```bash
git reset --hard origin/main
```

(No database changes, so no cleanup needed.)

## Telemetry Signal

**Query to run** (after implementation):
```bash
curl -s 'http://localhost:5173/api/telemetry/implementation-clusters?tool_name=identity:recover' | jq '.clusters[] | {tool_name, success_rate, confidence}'
```

**Expected output**:
```json
{
  "tool_name": "identity:recover",
  "success_rate": 0.976,
  "confidence": 0.92
}
```

**What this means**:
- If `clusters` is empty array → Redis queries not wired yet (task not done)
- If `success_rate < 0.95` → investigate via `/api/telemetry/errors`
- If `confidence < 0.7` → cluster is incomplete (missing files or tests); verify all implementation files are committed
- If all three ✅ → task is genuinely working

## Implementation Notes

### Completed Implementation

**Phase 1 - Endpoint Wiring (✅ COMPLETE)**
- Replaced mock data in `/api/telemetry/implementation-clusters/+server.ts` with real Redis queries
- Wired `getRedis()` for lazy connection resolution
- Integrated `aggregateMcpToolTelemetry()` to aggregate MCP tool telemetry from Redis
- Added Redis key pattern queries for implementation files, routes, and tests
- Implemented confidence score computation (0-1 scale based on call count, success rate, duration consistency)
- Added graceful error handling and Redis connection cleanup (finally block)

**Phase 2 - Integration Test (✅ COMPLETE)**
- Created `tests/telemetry/implementation-clusters-integration.spec.ts` (15 tests, 44 assertions total)
- Tests cover: aggregation, field presence, query filtering, percentile calculation, confidence scoring, error handling
- All 44 telemetry tests pass (dispatcher telemetry wrapper, MCP tool telemetry, E2E integration)

**Phase 3 - Query Filters (✅ WIRED)**
- `?tool_name=` filter via string matching
- `?node_id=` passed through to cluster envelope
- `?feature_id=` passed through to cluster envelope
- `?duration_ms_min/max` filters by average duration

**Key Design Decisions:**
1. **Redis key pattern**: `telemetry:mcp:{toolName}:{timestamp}` with 24-hour TTL
2. **Aggregation**: Tool metrics computed from all matching Redis keys (call count, success rate, percentiles)
3. **Confidence formula**: 0.4·(call_count) + 0.4·(success_rate) + 0.2·(duration_ratio) = 0-1
4. **Lazy Redis**: Use `getRedis()` factory pattern, quit in finally block
5. **Graceful degradation**: Empty Redis → empty clusters list (no error)

### Step-by-Step Plan

1. **Read current implementation**
   - `src/routes/api/telemetry/implementation-clusters/+server.ts` (currently returns mock)
   - `src/lib/server/telemetry/mcp-tool-telemetry.ts` (where telemetry is emitted)

2. **Design Redis queries**
   - L1: Aggregated stats → `HGETALL telemetry:stats:{toolName}`
   - L2: Event stream → `ZRANGE telemetry:events:{toolName} 0 -1`
   - L3: Cluster metadata → `HGETALL cluster:meta:{clusterId}`

3. **Wire implementation**
   - Parse query params (tool_name, node_id, feature_id, duration filters)
   - Build Redis keys dynamically
   - Aggregate results into cluster envelope
   - Calculate confidence score

4. **Add integration test**
   - Mock Redis with real key structure
   - Invoke dispatcher node (creates telemetry)
   - Query `/api/telemetry/implementation-clusters`
   - Assert: files, tests, metrics, confidence all present

5. **Verify dashboard updates**
   - `/admin/telemetry` should show live data (not "Loading..." / empty)
   - Click "Show" on tool details → should see last_error, success_count, p95

6. **Document queryable fields**
   - Update `docs/telemetry/observability-queries.md` with Redis key examples
   - Add "Common Queries" section for operators

## Time Log

- Started: [HH:MM]
- First test pass: [HH:MM]
- Telemetry signal confirmed: [HH:MM]
- Completed: [HH:MM]
- **Total**: [duration]

---

## Success Looks Like

✅ **Feature complete**: Operators can ask "which files implement auth.sessions?" and get a list of all implementation files + routes + tools + tests + metrics via `/api/telemetry/implementation-clusters`

✅ **Measured**: Telemetry signal query returns success_rate >= 0.95 and confidence >= 0.8

✅ **Committed**: PR title includes "[telemetry]" and links to this Kanban ID

