# Phase 1: TurboVec Baseline Evaluation — Quick Start

**Status**: Ready to execute  
**Duration**: 3-5 days of live usage data collection  
**Infrastructure**: ✅ Wired (metrics API, bridge, logging)

---

## Pre-Flight (Today)

- [x] Verify `.env`: `TURBOVEC_SIDECAR_GRPC_ENABLED=true`
- [x] TurboVec sidecar running (gRPC :50062)
- [x] SvelteKit dev server running (metrics API @ :5173)
- [ ] Smoke test passes:
  ```bash
  node scripts/eval/turbovec-baseline-test.mjs --dry-run
  # Expected: ✅ API is up, ✅ Metrics API available
  ```

---

## Phase 1a: Live Collection (Days 1-3)

**Goal**: Accumulate 50-100 real user searches with TurboVec enabled.

**What happens automatically**:
- Users search via the app (`/api/rag/search`)
- Each query → Qdrant ANN → TurboVec rerank → results
- Metrics auto-logged: `qdrantLatencyMs`, `turbovecLatencyMs`, `totalLatencyMs`, candidate counts
- Redis keys: `retrieval:metrics:{queryHash}:turbovec-enabled` (30-day TTL)
- Postgres rows: `retrieval_eval_runs` table (for batch analysis)

**No manual action needed** — just let the app run and users search.

**Check progress** (every 12–24h):
```bash
curl http://127.0.0.1:5173/api/metrics/retrieval?branch=turbovec-enabled&hours=24
# Check: sampleCount (should increase by 10–20 per hour of active usage)
```

**Expected results after 3 days**:
- sampleCount: 50–100
- latencyP50: 130–160ms
- latencyP95: 200–250ms
- latencyP99: 400–600ms
- turbovecLatencyAvg: 25–40ms

---

## Phase 1b: Qdrant-Only Baseline (Days 4-5)

**Goal**: Establish baseline for comparison.

**Step 1**: Disable TurboVec
```bash
# In .env:
TURBOVEC_SIDECAR_GRPC_ENABLED=false

# Restart dev server:
npm run dev
```

**Step 2**: Run same 50 queries again
- Users repeat their searches (or same search queries used in Phase 1a)
- These queries log to: `retrieval:metrics:{queryHash}:qdrant-only`

**Step 3**: Query baseline dashboard after 24h
```bash
curl http://127.0.0.1:5173/api/metrics/retrieval?branch=qdrant-only&hours=24
```

**Expected results**:
- latencyP50: 200–250ms (Qdrant ANN only, no GPU)
- latencyP95: 300–400ms
- latencyP99: 600–1000ms (no TurboVec = slower)

---

## Phase 1c: Comparison & Report (Day 6)

**Side-by-side metrics:**

```bash
# TurboVec-enabled branch
curl http://127.0.0.1:5173/api/metrics/retrieval?branch=turbovec-enabled&hours=24

# Qdrant-only baseline
curl http://127.0.0.1:5173/api/metrics/retrieval?branch=qdrant-only&hours=24
```

**Fill in success table:**

| Metric | Qdrant-only | TurboVec | Speedup | Target |
|--------|-------------|----------|---------|--------|
| P50 latency (ms) | ? | ? | ? | 5-10× |
| P95 latency (ms) | ? | ? | ? | 5-10× |
| P99 latency (ms) | ? | ? | ? | 5-10× |
| Avg candidates | ? | ? | ~same | — |

**Example (expected)**:

| Metric | Qdrant-only | TurboVec | Speedup | Target |
|--------|-------------|----------|---------|--------|
| P50 latency (ms) | 220 | 150 | 1.5× | 5-10× |
| P95 latency (ms) | 360 | 240 | 1.5× | 5-10× |
| P99 latency (ms) | 800 | 380 | 2.1× | 5-10× |
| Avg candidates | 50 | 45 | ~same | — |

**⚠️ Reality check**: Speedup may be modest (1.5–3×) because:
- Qdrant ANN is already fast (100–150ms on 54K vectors)
- TurboVec reranks top-100 → top-50 (smaller batch = smaller GPU gain)
- Network latency to gRPC sidecar is ~5–10ms
- True speedup emerges at scale (1000+ queries/day)

**But if results show <1.5× speedup or P95 > 300ms**, investigate:
1. Is TurboVec sidecar responding? `curl -X POST http://127.0.0.1:50062/health`
2. Are metrics being logged? Check Redis: `docker exec legal-ai-redis redis-cli KEYS 'retrieval:metrics:*' | wc -l`
3. Is the gRPC call actually happening? Add debug log in context-assembler.ts

---

## Troubleshooting

### Metrics API returns sampleCount=0

**Cause**: No queries have been logged yet.
**Fix**: 
1. Ensure TurboVec enabled: `grep TURBOVEC_SIDECAR_GRPC_ENABLED .env`
2. Make a search in the app
3. Wait 10 seconds
4. Retry metrics API

### Metrics API returns all zeros (P50=0, P95=0, etc.)

**Cause**: Redis keys exist but JSON parsing failed.
**Fix**:
```bash
docker exec legal-ai-redis redis-cli GET 'retrieval:metrics:abc123:turbovec-enabled'
# Check JSON is valid
```

### TurboVec latency is 0 or missing

**Cause**: TurboVec didn't run (disabled or crashed).
**Fix**:
1. Check `.env`: `TURBOVEC_SIDECAR_GRPC_ENABLED=true`
2. Check gRPC sidecar: `lsof -i :50062` (should be listening)
3. Check logs: `grep -i turbovec logs/app.log`
4. Restart: `docker compose down && docker compose up -d` (if using Docker)

### Phase 1b queries aren't logging to qdrant-only branch

**Cause**: Users need to repeat searches, or cache is serving old results.
**Fix**:
1. Clear cache: `redis-cli FLUSHDB` (careful! clears all Redis data)
2. Or wait for cache TTL (1 hour default)
3. Or change query slightly ("auth session" vs "authentication session")

---

## Commands Summary

**Check TurboVec enabled:**
```bash
grep TURBOVEC_SIDECAR_GRPC_ENABLED .env
# Should be: true
```

**Check metrics (turbovec-enabled):**
```bash
curl http://127.0.0.1:5173/api/metrics/retrieval?branch=turbovec-enabled&hours=24 | jq
```

**Check metrics (qdrant-only):**
```bash
curl http://127.0.0.1:5173/api/metrics/retrieval?branch=qdrant-only&hours=24 | jq
```

**Check Redis metrics count:**
```bash
docker exec legal-ai-redis redis-cli KEYS 'retrieval:metrics:*' | wc -l
```

**Check one metric sample:**
```bash
docker exec legal-ai-redis redis-cli KEYS 'retrieval:metrics:*' | head -1 | xargs docker exec legal-ai-redis redis-cli GET
```

**Inspect retrieval_eval_runs Postgres table:**
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -c "SELECT COUNT(*) as total_runs, \
           COUNT(DISTINCT branch) as branches, \
           AVG(totalLatencyMs) as avg_latency_ms \
      FROM retrieval_eval_runs;"
```

---

## Next Steps (After Phase 1)

Once Phase 1 completes:
1. **Export data** → CSV for policy training (Phase 2)
2. **Train policy** on TurboVec evaluation data (Phase 3)
3. **Deploy sidecar** and wire into retrieval (Phase 4)

See `TURBOVEC_LANE5_INTEGRATION.md` for full roadmap.

---

## Timeline

| Timeline | Task | Owner | Status |
|----------|------|-------|--------|
| **Today** | Verify infra (smoke test) | You | — |
| **Days 1–3** | Live collection (Phase 1a) | Users | — |
| **Days 4–5** | Qdrant baseline (Phase 1b) | You | — |
| **Day 6** | Report & compare (Phase 1c) | You | — |
| **Weeks 2–3** | Export → Train policy (Phase 2–3) | Claude | — |
| **Weeks 4+** | Deploy & monitor (Phase 4+) | You | — |

---

**Ready to start? Run the smoke test:**

```bash
node scripts/eval/turbovec-baseline-test.mjs --dry-run
# Expected output:
# 🔬 TurboVec Baseline Test
# ✅ API is up
# ✅ Metrics API is available
# 🏃 DRY-RUN MODE: Not making real API calls
```

If all checks pass, Phase 1 is ready to begin. Let users search normally — metrics will accumulate automatically.