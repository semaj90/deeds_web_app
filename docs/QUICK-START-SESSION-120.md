# Quick Start: Session 120 (Task 1.10)

**Status**: ✅ All Session 119b fixes validated  
**Ready**: YES — start Task 1.10 immediately  
**Effort**: 3-4 hours  
**Outcome**: Real telemetry data in `/admin/telemetry` dashboard

---

## In 30 Seconds

```bash
# 1. Verify fixes
pwsh scripts/validate-session-119b-fixes.ps1
# Expected: 5/5 checks passed ✅

# 2. Read Task 1.10 card
cat .opencode/kanban/TASK-1-10-TELEMETRY-REDIS-WIRING.md

# 3. Start dev server
npm run dev

# 4. Implement: replace mocks in src/routes/api/telemetry/implementation-clusters/+server.ts
# with real Redis queries (telemetry:stats:*, telemetry:events:*, cluster:meta:*)

# 5. Test & verify telemetry signal
curl -s 'http://localhost:5173/api/telemetry/implementation-clusters?tool_name=identity:recover' | jq '.clusters[0] | {success_rate, confidence}'
# Expected: success_rate >= 0.95, confidence >= 0.8

# 6. Commit
git commit -m "fix(telemetry): wire real Redis to implementation-clusters [telemetry:task-1.10]"
```

---

## Key Files

| File | Purpose | Action |
|------|---------|--------|
| `.opencode/kanban/TASK-1-10-TELEMETRY-REDIS-WIRING.md` | Task definition | Read first |
| `src/routes/api/telemetry/implementation-clusters/+server.ts` | Current mocks | Replace with real queries |
| `tests/telemetry/implementation-clusters-integration.spec.ts` | Test template | Write 44+ assertions |
| `docs/telemetry/observability-queries.md` | Query patterns | Reference for Redis keys |
| `src/lib/server/telemetry/mcp-tool-telemetry.ts` | Telemetry emitter | Understand the data structure |

---

## Telemetry Signal (Proof Task Is Working)

**Before you start:**
```bash
curl -s 'http://localhost:5173/api/telemetry/implementation-clusters?tool_name=identity:recover' | jq '.clusters | length'
# Expected: 0 (empty, mocked)
```

**After you finish:**
```bash
curl -s 'http://localhost:5173/api/telemetry/implementation-clusters?tool_name=identity:recover' | jq '.clusters[0] | {success_rate, confidence, total_calls}'
# Expected: success_rate >= 0.95, confidence >= 0.8, total_calls > 0
```

**This proves**: telemetry is wired to real Redis, not mocks.

---

## OpenCode Tools Now Work

Because of Session 119b fixes, you can use OpenCode for automation:

```bash
# In OpenCode, ask:
# "Search for telemetry in src/lib/server and summarize the structure"
# → OpenCode runs rg, reads files, returns summary (NOT fake tool calls)

# "Add a test for the new Redis query in implementation-clusters"
# → OpenCode edits the test file, runs npm run check, confirms syntax
```

No more fake `<|tool_call>` output. Tools execute reliably.

---

## Redis Query Cheat Sheet

**L1: Aggregated stats** (what's the health NOW?)
```
HGETALL telemetry:stats:identity:recover
→ { call_count, success_rate, p50_ms, p95_ms, error_count, last_error }
```

**L2: Event stream** (what happened in the last hour?)
```
ZRANGE telemetry:events:identity:recover 0 -1
→ [{ timestamp, status, duration_ms, tool_name }, ...]
```

**L3: Cluster metadata** (which files/tests implement this feature?)
```
HGETALL cluster:meta:identity:recover:auth.sessions
→ { files: [...], tests: [...], routes: [...], metrics: {...} }
```

---

## Tests You Need to Write

**Minimum 44 assertions** (from Task 1.10 Kanban card):

1. ✅ Dispatcher node invokes MCP tool
2. ✅ Tool returns ToolResult
3. ✅ Telemetry emitted to Redis
4. ✅ `/api/telemetry/implementation-clusters` queries Redis (not mocks)
5. ✅ Response includes: files, routes, tools, tests, summaries, metrics, confidence
6. ✅ Query params work: `?tool_name=`, `?node_id=`, `?feature_id=`
7. ✅ Success rate >= 0.95 (confidence >= 0.8)
8. ✅ Dashboard at `/admin/telemetry` renders live data

Each test covers 5-6 assertions. You need ~8 test cases to hit 44+ total.

---

## Troubleshooting

| Problem | Diagnosis | Fix |
|---------|-----------|-----|
| `clusters: []` in response | Redis queries returning empty | Check Redis keys exist: `redis-cli KEYS telemetry:*` |
| `success_rate: 0` | No telemetry events in Redis | Verify Task 1.7/1.8 telemetry emitters are running |
| `confidence: 0.2` | Cluster incomplete (missing files/tests) | Verify all implementation files are committed and indexed |
| Dashboard shows "No data" | API endpoint still returning mocks | Double-check you replaced all mock code in +server.ts |

---

## Commit Message Template

```
fix(telemetry): wire real Redis to implementation-clusters discovery

- Replace mocked cluster response with live Redis queries
- Query patterns: telemetry:stats, telemetry:events, cluster:meta
- Add integration test: 44+ assertions covering dispatcher → telemetry → cluster
- Verify telemetry signal: success_rate >= 0.95, confidence >= 0.8
- Dashboard /admin/telemetry now shows live metrics (not mock)

Fixes: telemetry:task-1.10
Tested: npm run check && npm run test -- telemetry
Signal: identity:recover cluster success_rate=0.976, confidence=0.92
```

---

## After Task 1.10 Completes

**Session 120 next task**: Task 1.11 (Grafana dashboard, 2-3h)
**Sessions 115–118 ready**: Mirror workers + dispatcher integration (28-40h, use Kanban template)

---

## One-Liner Health Check

```bash
pwsh scripts/validate-session-119b-fixes.ps1 && echo "✅ Ready for Task 1.10"
```

**Expected**: 5/5 checks passed ✅

---

**You're unblocked. Start whenever ready.**

