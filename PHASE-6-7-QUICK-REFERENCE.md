# Phase 6-7 Production Deployment: Quick Reference Card

**Print this. Have it handy. Execute in order.**

---

## PRE-EXECUTION CHECK (5 minutes)

```bash
# Verify all services are running
docker-compose ps

# Expected: postgres UP, redis UP, qdrant UP, neo4j UP

# Enter sveltekit-frontend directory
cd sveltekit-frontend
```

---

## PHASE A: PREFLIGHT (30 minutes)

### ✅ Check 1: Run Preflight
```bash
npm run atlas:phase6:preflight
```

**Expected output:**
- All 17 checks pass
- Exit code: `0`

**If any check fails:**
- STOP
- Fix the issue
- Re-run preflight
- Do NOT proceed until all pass

---

## PHASE B: CANARY RAMP (2 hours)

### ✅ Stage 1: 5% Canary (30 minutes)

**Terminal 1:**
```bash
npm run atlas:phase6:ramp:canary
# Output: 🟢 [CANARY] Enabling multi-vector for 5% of traffic
```

**Terminal 2:**
```bash
npm run dev
# Keep running for entire 30 minutes
```

**Terminal 3 (Monitor for 30 minutes):**
```bash
# Run this loop continuously
while true; do
  curl -s 'http://localhost:5173/api/retrieval/multi-vector?q=authentication' | jq '{
    latency: .timing.p95_ms,
    error_rate: .stats.error_rate,
    candidates: (.candidates | length),
    quarantine: .stats.quarantine_pct
  }'
  sleep 120
done
```

**Success (after 30 min):**
- p95 latency < 200ms
- Error rate < 0.1%
- Candidates ≥ 5
- Quarantine < 1%

**FAILURE → IMMEDIATE ROLLBACK:**
```bash
npm run atlas:phase6:ramp:rollback
# Stop, investigate, fix, restart Phase A
```

---

### ✅ Stage 2: 25% Ramp (30 minutes)

**Terminal 1:**
```bash
npm run atlas:phase6:ramp:25pct
```

**Terminal 2:**
```bash
# Stop dev server (Ctrl+C)
npm run dev
# Restart it
```

**Terminal 3:**
```bash
# Same monitoring loop (30 min)
```

**Success:** Same criteria as Stage 1

**FAILURE → IMMEDIATE ROLLBACK**

---

### ✅ Stage 3: 100% Live (5 minutes)

**Terminal 1:**
```bash
npm run atlas:phase6:ramp:100pct
```

**Terminal 2:**
```bash
# Stop dev server (Ctrl+C)
npm run dev
# Restart it
```

**Terminal 3:**
```bash
# 50 sequential queries, all should be HTTP 200
for i in {1..50}; do
  curl -s "http://localhost:5173/api/retrieval/multi-vector?q=test$i" -o /dev/null -w "Query $i: %{http_code}\n"
done
```

**Success:** 50/50 HTTP 200

**FAILURE → IMMEDIATE ROLLBACK**

---

## PHASE C: 24-HOUR SOAK TEST

### ✅ Setup Monitoring (Start at timestamp T)

**Keep all 4 terminals running in parallel for 24 hours**

**Terminal 1: Infrastructure Metrics**
```bash
mkdir -p reports/soak
while true; do
  echo "$(date -u +%s),$(docker stats --no-stream legal-ai-postgres --format 'table {{.MemUsage}}')" >> reports/soak/infra.csv
  sleep 60
done
```

**Terminal 2: Application Metrics**
```bash
mkdir -p reports/soak
node <<'EOF'
const fs = require('fs');
let count = 0;
setInterval(async () => {
  try {
    const res = await fetch('http://localhost:5173/api/retrieval/multi-vector?q=test');
    const data = await res.json();
    fs.appendFileSync('reports/soak/app.jsonl', JSON.stringify({
      timestamp: new Date().toISOString(),
      latency: data.timing.p95_ms,
      error: !res.ok,
      candidates: data.candidates?.length || 0
    }) + '\n');
    console.log(`[${count++}] p95=${data.timing.p95_ms}ms, candidates=${data.candidates?.length}`);
  } catch (e) {
    console.error('Error:', e.message);
  }
}, 60000);
EOF
```

**Terminal 3: Golden Replay (hourly)**
```bash
node <<'EOF'
const queries = [
  'authentication session validation',
  'embedding vector search',
  'ontology packet extraction',
  'qdrant collection query',
  'neo4j relationship traversal',
  'dispatcher routing decision',
  'turbovec quantization',
  'valkey cache lookup',
  'som topology clustering',
  'bitmap identity validation'
];

setInterval(async () => {
  console.log(`\n[${new Date().toISOString()}] Golden Replay Start`);
  for (const q of queries) {
    try {
      const res = await fetch(`http://localhost:5173/api/retrieval/multi-vector?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      console.log(`✅ ${q}: ${data.candidates?.length || 0} candidates, ${data.timing.p95_ms}ms`);
    } catch (e) {
      console.error(`❌ ${q}: ${e.message}`);
    }
  }
  console.log(`[${new Date().toISOString()}] Golden Replay End\n`);
}, 3600000);

// Run immediately first time
(() => {
  console.log(`\n[${new Date().toISOString()}] Golden Replay Start`);
  queries.forEach(q => console.log(`Running: ${q}`));
  console.log(`[${new Date().toISOString()}] Golden Replay End\n`);
})();
EOF
```

**Terminal 4: Error Monitoring**
```bash
tail -f .logs/multi-vector-ramp.log | grep -E "ERROR|CRITICAL" | while read line; do
  echo "[$(date)] 🚨 ALERT: $line"
  # Optional: send alert to Slack/Discord
done
```

### ✅ After 24 Hours: Verify All 8 Gates Pass

1. **Latency (p95 < 200ms)** — Check reports/soak/app.jsonl
2. **Error Rate (< 0.1%)** — Count errors in app.jsonl
3. **Recall@100 (≥ 98%)** — Compare golden replay results
4. **Diversity (> 5.0)** — Check candidate count stability
5. **Identity (< 1% quarantine)** — Check all responses
6. **Golden Replay (stable)** — No unexplained drift
7. **Infrastructure (bounded)** — Check CPU/memory/Redis
8. **Silent Failures (zero)** — All 4 lanes present in every response

---

## PRODUCTION SIGN-OFF

### If All 8 Gates Pass:

```bash
git add -A
git commit -m "feat(retrieval): multi-vector RRF live after Phase 6-7 validation

Phase 6 canary ramp successful (5% → 25% → 100%)
Phase 7 24-hour soak test passed all 8 gates
✅ Production ready"

git push origin main
```

### If Any Gate Fails:

```bash
npm run atlas:phase6:ramp:rollback

# Then:
# 1. Stop soak test
# 2. Investigate root cause
# 3. Fix the issue
# 4. Restart Phase A preflight
# 5. Resume from Phase B Stage 1
```

---

## CRITICAL TIMEOUTS

| Phase | Timeout | Action |
|-------|---------|--------|
| Preflight check | 5 min | Stop if exceeds |
| Canary Stage 1 monitor | 30 min | Move to Stage 2 |
| Canary Stage 2 monitor | 30 min | Move to Stage 3 |
| Canary Stage 3 check | 5 min | Proceed to Phase C |
| Soak test monitoring | 24h | Run full duration |
| Per-query response | 10s | Log as timeout |

---

## EMERGENCY ROLLBACK

**At ANY time during Phases B or C:**

```bash
npm run atlas:phase6:ramp:rollback
# Takes ~2 minutes
# Retrieval reverts to unified baseline
# Zero data loss
# Fully reversible
```

---

## SUCCESS INDICATORS (During Soak)

- ✅ No ERROR or CRITICAL messages in Terminal 4
- ✅ Terminal 3 golden replay completes every hour
- ✅ Terminal 1 infrastructure metrics stable
- ✅ Terminal 2 latency flat (no spikes)
- ✅ Hourly log shows consistent candidate counts
- ✅ Zero "silent failure" responses (all 4 lanes present)

---

## After Production Sign-Off

Phase 8-10 work unblocked:
- Phase 8 (Sessions 125-126): Semantic packet generation + tree hierarchy
- Phase 8b (Session 127): Multi-space framework
- Phase 9 (Sessions 128-129): OpenTelemetry instrumentation
- Phase 10 (Sessions 130+): Adaptive routing + contextual assembly

See `ATLAS-LANES-DEPENDENCY-GRAPH.md` for parallelization opportunities.

---

**Ready to execute. Begin with Phase A preflight check.**
