# Phase C Option B: Pre-Execution Checklist

**Date**: June 30, 2026  
**Purpose**: Quick reference before starting Phase C Option B work  
**Estimated time**: 30-45 minutes

---

## 1. Verify Service Status (5 min)

```bash
# Terminal 1: Check all services
echo "=== Service Status ===" && \
curl -s http://127.0.0.1:6333/health && echo "✅ Qdrant" || echo "❌ Qdrant" && \
redis-cli -p 6379 --pass redis ping && echo "✅ Valkey" || echo "❌ Valkey" && \
psql -h 127.0.0.1 -U legal_admin -d legal_ai_db -c "SELECT 1" && echo "✅ Postgres" || echo "❌ Postgres" && \
curl -s http://127.0.0.1:11434/api/tags | jq .models > /dev/null && echo "✅ Ollama" || echo "⏳ Ollama" && \
curl -s http://127.0.0.1:8090/health | jq .model > /dev/null && echo "✅ TurboQuant" || echo "⏳ TurboQuant" && \
curl -s http://127.0.0.1:8792/health > /dev/null && echo "✅ TurboVec" || echo "⏳ TurboVec (optional)"
```

**Expected output:**
```
✅ Qdrant
✅ Valkey        ← THIS WILL FAIL; fix next step (AGPL-free Redis drop-in, password: redis)
✅ Postgres
✅ Ollama
✅ TurboQuant
⏳ TurboVec      ← Optional (graceful fallback to CPU prefilter if offline)
```

**Architecture Note**: Port 8101 (legacy topology search) has been replaced by TurboVec sidecar (:8792) for efficient 4D manifold prefiltering. TurboVec is optional; if offline, the system degrades to CPU-only clustering.

---

## 2. Start Missing Services (10 min)

### If Valkey is down:

```bash
docker-compose up legal-ai-valkey
```

Wait for:
```
legal-ai-valkey  | Ready to accept connections
```

### Verify Valkey is running:

```bash
redis-cli -p 6379 --pass redis ping
# Expected: PONG
```

**Note**: Valkey is the AGPL-free Redis drop-in replacement. Password is `redis` (set in docker-compose.yml)

---

## 3. Create Telemetry Tables (5 min)

### Option A: Via migration (preferred)

```bash
cd sveltekit-frontend
npm run db:migrate
```

### Option B: Manual SQL (if migration doesn't exist)

```bash
# Terminal with psql connection
psql -h 127.0.0.1 -U legal_admin -d legal_ai_db << 'SQL'
CREATE TABLE IF NOT EXISTS acp_decisions (
  story_id UUID PRIMARY KEY,
  task_id UUID,
  decision TEXT,
  candidate_count INT,
  confidence_score REAL,
  reasoning_json JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retrieval_traces (
  id SERIAL PRIMARY KEY,
  story_id UUID,
  task_id UUID,
  query TEXT,
  lane TEXT,
  candidate_count INT,
  cache_hit BOOLEAN,
  latency_ms REAL,
  telemetry_json JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gpu_rerank_telemetry (
  id SERIAL PRIMARY KEY,
  story_id UUID,
  task_id UUID,
  batch_size INT,
  rerank_decision TEXT,
  cache_hit BOOLEAN,
  latency_ms REAL,
  telemetry_json JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS synthesis_traces (
  id SERIAL PRIMARY KEY,
  story_id UUID,
  task_id UUID,
  token_count INT,
  latency_ms REAL,
  model TEXT,
  temperature REAL,
  created_at TIMESTAMP DEFAULT NOW()
);
SQL
```

### Verify tables exist:

```bash
psql -h 127.0.0.1 -U legal_admin -d legal_ai_db -c "\dt acp_decisions retrieval_traces gpu_rerank_telemetry synthesis_traces"
```

Expected:
```
Did not find any relation named "acp_decisions".
↑ This means the migration hasn't run yet OR the table doesn't exist yet. That's OK — it will be created when you run the migration.
```

---

## 4. Run Validation Tests (10 min)

### Test 1: CUDA graph reranking

```bash
cd sveltekit-frontend
npx tsx scripts/tests/test-cuda-graph-rerank-integration.mts
```

**Expected**: All 6 tests pass ✅

### Test 2: E2E latency

```bash
npx tsx scripts/tests/test-e2e-latency.mts
```

**Expected**: 5/5 scenarios pass, average latency < 1ms ✅

### Test 3: Benchmark

```bash
npm run bench:cuda-graph-cache:quick
```

**Expected**: Speedup > 4× ✅

---

## 5. Verify GPU Bridge Loaded (5 min)

```bash
node -e "
const addon = require('./simd-bridge/cpp/build/Release/tensorrt_bridge.node');
console.log('GPU bridge functions:', Object.keys(addon).filter(k => typeof addon[k] === 'function').slice(0, 5));
console.log('CUDA available:', addon.isCudaAvailable?.());
"
```

**Expected**:
```
GPU bridge functions: [ 'batchCosineSimilarity', 'clusterEmbeddings', 'trainSOM', ... ]
CUDA available: true
```

---

## 6. Quick Sanity Check: Query Flow (5 min)

```bash
# Simulate a query through the stack (no actual DB writes yet)

# Terminal 1: Start dev server
npm run dev

# Terminal 2: Send test query
curl -X POST http://127.0.0.1:5173/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"auth session validation"}],"model":"gemma4-legal-iq4xs"}'
```

**Expected**:
```json
{
  "content": "...",
  "telemetry_id": "trace_...",
  "cache_hit": "miss",
  "latency_ms": 150-300
}
```

---

## ✅ Pre-Execution Checklist

- [ ] Valkey running (`redis-cli -p 6379 --pass redis ping` → PONG)
- [ ] Postgres telemetry tables created
- [ ] CUDA integration test passes (6/6)
- [ ] E2E latency test passes (5/5)
- [ ] Benchmark test passes (>4× speedup)
- [ ] GPU bridge loaded and CUDA available
- [ ] Dev server can handle queries
- [ ] Architecture docs read (see references below)
- [ ] (Optional) TurboVec sidecar online for optimized prefiltering

---

## If Any Step Fails

### Valkey won't start
```bash
docker-compose logs legal-ai-valkey
docker-compose down legal-ai-valkey
docker-compose up legal-ai-valkey --force-recreate
```

**Note**: If using Redis instead (legacy), replace `legal-ai-valkey` with `legal-ai-redis` in the commands above. Valkey is the AGPL-free drop-in replacement and is recommended.

### Telemetry tables won't create
```bash
# Check if migration exists
ls sveltekit-frontend/drizzle/*.sql | grep telemetry

# If not, create manually (see step 3, Option B above)
```

### CUDA tests fail
```bash
# Check if tensorrt_bridge.node exists
ls simd-bridge/cpp/build/Release/tensorrt_bridge.node

# If missing, it's not critical for Phase C (CPU fallback works)
# But log a note for later: "GPU bridge not available in dev"
```

### Dev server won't start
```bash
npm run dev --verbose
# Look for errors about missing env vars or port conflicts
```

---

## Time Budget

| Step | Duration | Required? |
|------|----------|-----------|
| Service status check | 5 min | Yes |
| Start Redis | 10 min | Yes |
| Create telemetry tables | 5 min | Yes |
| Run validation tests | 10 min | Yes |
| Verify GPU bridge | 5 min | No (nice-to-have) |
| Sanity check: query flow | 5 min | No (nice-to-have) |
| **Total** | **40 min** | |

**If all green** → Ready to start Phase C Option B (Part 1).

---

## What's Next (After This Checklist)

Once all boxes are checked:

```bash
# Phase C Option B, Part 1: Provenance Breadth (3-4 hours)
npm run phase-c:part1:provenance

# Phase C Option B, Part 2: Telemetry Persistence (4-6 hours)
npm run phase-c:part2:telemetry

# Phase C Option B, Part 3: Production Gates (2-3 hours)
npm run phase-c:part3:gates

# Validation (1 hour)
npm run verify:phase-c:complete
```

---

## References

- `SESSION-98-PHASE-C-OPTION-B-READINESS.md` — Full readiness assessment
- `PHASE-C-OPTION-B-ARCHITECTURE-DECISION.md` — Architecture decisions
- `ACP-TELEMETRY-DAILY-GRAPHIFY-FLOW.md` — Telemetry pipeline
- `SESSION-98-E2E-TESTING-PLAN.md` — Testing checklist

**Quick link to this doc**: `docs/PHASE-C-OPTION-B-PRE-EXEC-CHECKLIST.md`
