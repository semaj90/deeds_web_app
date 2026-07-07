# Session 120 Phase 1: OpenCode Dispatcher Bridge — Implementation Checklist

**Goal**: Wire Gemma4 planner intent → LangGraph tool dispatcher → MCP execution → telemetry capture

**Effort**: 2-3 hours  
**Test signal**: `POST /api/opencode-dispatch` returns `{ results, telemetry, proof }`

---

## Pre-flight Verification (5 min)

- [ ] Dev server running: `npm run dev` (check logs for "Boot" complete)
- [ ] llama-server @ :8090 running: `curl http://127.0.0.1:8090/slots | jq '.[] | .n_ctx'` → should be `65536`
- [ ] MCP @ :8788 up: `curl http://127.0.0.1:8788/tools/list | jq '.tools | length'` → should be `42+`
- [ ] Redis available: `docker exec legal-ai-valkey redis-cli -a redis PING` → `PONG`
- [ ] Qdrant available: `curl http://127.0.0.1:6333/collections | jq '.result | length'` → `40+`

---

## Task 1: Create Dispatcher Endpoint (45 min)

**File**: `src/routes/api/opencode-dispatch/+server.ts`

**Checklist**:

1. **Create directory**
   ```bash
   mkdir -p sveltekit-frontend/src/routes/api/opencode-dispatch
   ```

2. **Create +server.ts** with:
   - [ ] POST handler that accepts `{ intent: string, tools_requested?: string[] }`
   - [ ] Call `dispatchIntentToTools()` helper
   - [ ] Capture telemetry (redis write, duration)
   - [ ] Return `{ results, telemetry, proof }`
   - [ ] Error handling (try/catch with graceful fallback)

3. **Type stubs**:
   ```typescript
   interface DispatchRequest {
     intent: string;
     tools_requested?: string[];
   }

   interface DispatchResponse {
     results: Record<string, unknown>;
     telemetry: {
       tool_executed: string;
       duration_ms: number;
       success: boolean;
     };
     proof: string; // e.g., "Executed rg with pattern 'auth'; found 12 files"
   }
   ```

4. **Test locally**:
   ```bash
   curl -X POST http://localhost:5173/api/opencode-dispatch \
     -H 'Content-Type: application/json' \
     -d '{"intent":"search for auth:recover implementation"}' \
     | jq .
   ```

---

## Task 2: Create Dispatch Router Helper (45 min)

**File**: `src/lib/server/opencode/dispatch-router.ts`

**Checklist**:

1. **Create file**
   ```bash
   mkdir -p sveltekit-frontend/src/lib/server/opencode
   touch sveltekit-frontend/src/lib/server/opencode/dispatch-router.ts
   ```

2. **Implement intent → tool mapping**:
   - [ ] `routeIntentToTool(intent: string): Promise<{ tool: string; args: Record<string, unknown> }>`
   - [ ] Simple keyword matching (heuristic) OR ML model (defer for now)
   - [ ] Keywords:
     - `search` / `find` / `where` / `locate` → `rg`
     - `semantic` / `similarity` / `vector` → `qdrant_search`
     - `codebase` / `index` / `cluster` → `codebase_api`
     - `test` / `check` / `validate` → `run_tests`

3. **Implement tool executor**:
   - [ ] `executeDispatchedTool(tool: string, args: Record<string, unknown>): Promise<{ output: string; error?: string }>`
   - [ ] Route to tool-dispatcher.ts functions (rg, qdrant, codebase API, etc.)
   - [ ] Add AbortSignal.timeout(10s) to prevent hangs

4. **Implement telemetry capture**:
   - [ ] `captureToolTelemetry(tool: string, startTime: number, success: boolean, output: string): Promise<void>`
   - [ ] Write to Redis: `telemetry:stats:{tool}` (HSET)
   - [ ] Write to Redis: `telemetry:events:{tool}` (ZADD with timestamp)
   - [ ] Use getRedis() from `$lib/server/redis.ts`

5. **Test locally**:
   ```bash
   # In Node REPL or test file:
   import { routeIntentToTool, executeDispatchedTool } from '$lib/server/opencode/dispatch-router';
   
   const decision = await routeIntentToTool('find where auth:sessions is used');
   console.log(decision); // { tool: 'rg', args: { pattern: 'auth:sessions' } }
   ```

---

## Task 3: Wire LangGraph Node (30 min)

**File**: `src/lib/server/opencode-langgraph-node.ts` (update existing)

**Checklist**:

1. **Add new node** `opencode_dispatch_node`:
   - [ ] Accepts `OpenCodeAgentState` (policy decision output)
   - [ ] Calls `dispatchIntentToTool()` from dispatch-router
   - [ ] Returns `{ dispatch_result, telemetry }`

2. **Add to graph**:
   - [ ] Wire between `policyDecisionNode` and `gemma4SynthesisNode`
   - [ ] Policy decision → dispatch → synthesis

3. **Test with graph**:
   ```bash
   npm run test -- opencode-langgraph-node.spec.ts
   ```

---

## Task 4: Add Tests (30 min)

**File**: `tests/opencode-dispatch.spec.ts`

**Checklist**:

- [ ] Test 1: POST endpoint returns 200 + valid schema
- [ ] Test 2: Intent mapping works (keyword → tool)
- [ ] Test 3: Tool execution succeeds (rg mock)
- [ ] Test 4: Telemetry captured (Redis keys created)
- [ ] Test 5: Error handling (graceful fallback)
- [ ] Test 6: Timeout protection (AbortSignal)
- [ ] Test 7: Proof string generated

**Run**:
```bash
npm run test -- opencode-dispatch
```

---

## Task 5: Verify Integration (15 min)

**Checklist**:

1. **Type check**:
   ```bash
   npm run check
   ```
   Expected: 0 errors in opencode-dispatch, dispatch-router

2. **Smoke test telemetry signal**:
   ```bash
   # Invoke dispatcher via API
   curl -X POST http://localhost:5173/api/opencode-dispatch \
     -H 'Content-Type: application/json' \
     -d '{"intent":"search for auth implementation"}' | jq .

   # Check Redis keys were written
   docker exec legal-ai-valkey redis-cli -a redis KEYS "telemetry:*"
   # Expected: at least 2 keys (stats + events)

   # Check telemetry endpoint sees data
   curl -s 'http://localhost:5173/api/telemetry/implementation-clusters?tool_name=rg' | jq '.clusters | length'
   # Expected: > 0 (or 0 if data is sparse; Phase 2 fills this)
   ```

3. **Log inspection**:
   ```bash
   tail -100 /tmp/dev-server.log | grep -E "(opencode-dispatch|telemetry)"
   ```
   Expected: Tool execution + telemetry writes logged

---

## Success Criteria

✅ **Phase 1 Complete When**:

1. Endpoint exists: `POST /api/opencode-dispatch` returns 200
2. Intent routing works: `{ intent: "..." }` → correct tool selected
3. Tool executes: Results returned in response
4. Telemetry captured: Redis keys `telemetry:stats:*` + `telemetry:events:*` created
5. Tests pass: `npm run test -- opencode-dispatch` → 7/7 green
6. Type check: `npm run check` → 0 errors
7. Proof string: Response includes human-readable proof (e.g., "Executed rg, found 12 files in auth.ts")

---

## If Things Break

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| `POST /api/opencode-dispatch` returns 404 | Route not created or misspelled | Check file path: `src/routes/api/opencode-dispatch/+server.ts` |
| Cannot import dispatch-router | Module path wrong | Import as: `import { routeIntentToTool } from '$lib/server/opencode/dispatch-router'` |
| Redis connection fails | Valkey not running or password wrong | `docker exec legal-ai-valkey redis-cli -a redis PING` |
| Tool execution times out | AbortSignal timeout too short | Increase from 10s to 15s in dispatch-router |
| Telemetry keys not written | Redis call failed silently | Check getRedis() initialization, add error logging |
| Tests fail | Type mismatch or mocked Redis not working | Use redis-mock in test, verify DispatchResponse shape |

---

## Next: Phase 2 (Task 1.10 — Real Redis Wiring)

Once Phase 1 passes:

1. Replace mock queries in `/api/telemetry/implementation-clusters`
2. Wire real Redis L1/L2 reads
3. Add integration test (44+ assertions)
4. Verify telemetry signal: `success_rate >= 0.95, confidence >= 0.8`

---

## Files to Create/Update

| File | Action | Lines |
|------|--------|-------|
| `src/routes/api/opencode-dispatch/+server.ts` | **CREATE** | ~80 |
| `src/lib/server/opencode/dispatch-router.ts` | **CREATE** | ~150 |
| `src/lib/server/opencode-langgraph-node.ts` | UPDATE | +20 |
| `tests/opencode-dispatch.spec.ts` | **CREATE** | ~200 |
| `src/routes/api/opencode-dispatch/README.md` | **CREATE** (optional) | ~50 |

**Total new code**: ~380 lines (mostly test + comments)

---

## Commands to Run

```bash
# Start fresh
cd sveltekit-frontend

# Run type check (should pass)
npm run check

# Run tests (should be 7/7 green)
npm run test -- opencode-dispatch

# Quick manual test
curl -X POST http://localhost:5173/api/opencode-dispatch \
  -H 'Content-Type: application/json' \
  -d '{"intent":"find identity:recover implementation"}' | jq .

# Verify telemetry signal
curl -s 'http://localhost:5173/api/telemetry/implementation-clusters' | jq '.clusters | length'
```

---

## Time Breakdown

| Task | Time | Status |
|------|------|--------|
| Pre-flight checks | 5 min | ✅ |
| Create dispatcher endpoint | 45 min | ⏳ Phase 1 |
| Create dispatch router helper | 45 min | ⏳ Phase 1 |
| Wire LangGraph node | 30 min | ⏳ Phase 1 |
| Add tests | 30 min | ⏳ Phase 1 |
| Verify integration | 15 min | ⏳ Phase 1 |
| **Total Phase 1** | **~165 min (2h 45min)** | ⏳ |

**Then Phase 2**: Task 1.10 real Redis wiring (3-4h)

---

## Ready to Start?

Run this to confirm all services are up:

```bash
for service in postgres redis qdrant ollama llama-server mcp; do
  case $service in
    postgres) docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT 1" > /dev/null && echo "✅ $service" || echo "❌ $service" ;;
    redis) docker exec legal-ai-valkey redis-cli -a redis PING > /dev/null && echo "✅ $service" || echo "❌ $service" ;;
    qdrant) curl -s http://127.0.0.1:6333/ > /dev/null && echo "✅ $service" || echo "❌ $service" ;;
    ollama) curl -s http://127.0.0.1:11434/ > /dev/null && echo "✅ $service" || echo "❌ $service" ;;
    llama-server) curl -s http://127.0.0.1:8090/slots > /dev/null && echo "✅ $service" || echo "❌ $service" ;;
    mcp) curl -s http://127.0.0.1:8788/tools/list > /dev/null && echo "✅ $service" || echo "❌ $service" ;;
  esac
done
```

**All green?** Start Task 1.
