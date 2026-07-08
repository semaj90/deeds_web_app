# Session 123 Launch Brief

**Start Time**: Tomorrow morning  
**Mission**: Execute Phase 6-7 production deployment (27 hours total)  
**Success Criteria**: All 8 production gates pass

---

## 📋 Open These Tabs Before You Start

1. **`PHASE-6-7-QUICK-REFERENCE.md`** (print this one)
2. **`SESSION-123-PRODUCTION-EXECUTION.md`** (bookmark this)
3. **Terminal ready**: `cd sveltekit-frontend`
4. **Docker running**: `docker-compose ps` (all services UP)

---

## ⏱️ Timeline: 27 Hours Total

```
T+0:00    Phase A: Preflight (30 min)
          └─ npm run atlas:phase6:preflight

T+0:30    Phase B Stage 1: 5% Canary (30 min)
          └─ npm run atlas:phase6:ramp:canary
          └─ npm run dev
          └─ Monitor: latency/error/candidates/identity

T+1:00    Phase B Stage 2: 25% Ramp (30 min)
          └─ npm run atlas:phase6:ramp:25pct
          └─ npm run dev
          └─ Monitor (same metrics)

T+1:30    Phase B Stage 3: 100% Live (5 min)
          └─ npm run atlas:phase6:ramp:100pct
          └─ npm run dev
          └─ 50 sequential queries, all HTTP 200

T+1:35    Phase C: 24-Hour Soak Test
          ├─ Terminal 1: Infrastructure telemetry (60s intervals)
          ├─ Terminal 2: Application metrics (60s intervals)
          ├─ Terminal 3: Golden replay (hourly)
          └─ Terminal 4: Error log monitoring

T+25:35   Analysis & Sign-Off (1 hour)
          ├─ Review all 8 gates
          ├─ Generate final report
          └─ Commit if all pass
```

---

## 🎯 Phase A: Preflight Check (30 minutes)

**Purpose**: Verify all infrastructure is ready before canary ramp

**Execute**:
```bash
cd sveltekit-frontend
npm run atlas:phase6:preflight
```

**Expected Output**:
```
✅ [Infrastructure] Postgres: 58,365+ packets
✅ [Infrastructure] Valkey: responding
✅ [Infrastructure] Qdrant: responding
✅ [Infrastructure] Neo4j: responding
✅ [Infrastructure] Go Retrieval: responding
✅ [Infrastructure] Gemma4: responding
✅ [Data Sync] Keywords indexed: 26,800+ unique
✅ [Data Sync] Qdrant payloads enriched
✅ [Data Sync] Bitmap cache warmed
✅ [Retrieval Readiness] RRF weights configured
...
(17 total checks)
```

**Success Criteria**:
- Exit code: `0`
- All 17 checks pass (no ❌)

**If Any Fail**:
- STOP immediately
- Fix the root cause
- Re-run preflight
- Do NOT proceed until all pass

---

## 🎯 Phase B: Canary Ramp (2 hours)

### Stage 1: 5% Canary (30 min)

**Terminal 1**: Enable canary
```bash
npm run atlas:phase6:ramp:canary
```

**Terminal 2**: Start dev server
```bash
npm run dev
```

**Terminal 3**: Monitor for 30 min
```bash
while true; do
  curl -s 'http://localhost:5173/api/retrieval/multi-vector?q=authentication' | jq '{
    latency_p95: .timing.p95_ms,
    error_rate: .stats.error_rate,
    candidate_count: (.candidates | length),
    quarantine_pct: .stats.quarantine_pct
  }'
  sleep 120
done
```

**Success Signals After 30 min**:
- p95 latency < 200ms ✅
- Error rate < 0.1% ✅
- Candidates per query ≥ 5 ✅
- Quarantine < 1% ✅
- No ERROR/CRITICAL in logs ✅

**If Any Signal Fails**:
```bash
npm run atlas:phase6:ramp:rollback
# Takes 2 minutes. Investigate. Fix. Restart Phase A.
```

---

### Stage 2: 25% Ramp (30 min)

Stop dev server (Ctrl+C in Terminal 2)

**Terminal 1**: Enable 25% ramp
```bash
npm run atlas:phase6:ramp:25pct
```

**Terminal 2**: Restart dev server
```bash
npm run dev
```

**Terminal 3**: Same monitoring loop (30 min)

**Success**: Same signals as Stage 1

---

### Stage 3: 100% Live (5 min)

Stop dev server

**Terminal 1**: Enable 100% live
```bash
npm run atlas:phase6:ramp:100pct
```

**Terminal 2**: Restart dev server
```bash
npm run dev
```

**Terminal 3**: Quick health check
```bash
for i in {1..50}; do
  curl -s "http://localhost:5173/api/retrieval/multi-vector?q=test$i" \
    -o /dev/null -w "Query $i: %{http_code}\n"
done
```

**Success**: 50/50 HTTP 200

---

## 🎯 Phase C: 24-Hour Soak Test

**Start Time**: T+1:35 (after Phase B completes)

**Keep All 4 Terminals Running in Parallel for 24 Hours**

### Terminal 1: Infrastructure Metrics
```bash
mkdir -p reports/soak
while true; do
  docker stats --no-stream legal-ai-postgres legal-ai-redis --format "table {{.Container}}\t{{.MemUsage}}\t{{.CPUPerc}}" >> reports/soak/infra.log
  sleep 60
done
```

### Terminal 2: Application Metrics
```bash
mkdir -p reports/soak
node <<'EOF'
const fs = require('fs');
setInterval(async () => {
  try {
    const res = await fetch('http://localhost:5173/api/retrieval/multi-vector?q=test');
    const data = await res.json();
    fs.appendFileSync('reports/soak/app.jsonl', JSON.stringify({
      timestamp: new Date().toISOString(),
      latency_p95: data.timing?.p95_ms,
      candidates: data.candidates?.length || 0,
      error: !res.ok
    }) + '\n');
  } catch (e) {
    console.error('Query failed:', e.message);
  }
}, 60000);
EOF
```

### Terminal 3: Golden Replay (Hourly)
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

async function replay() {
  console.log(`\n[${new Date().toISOString()}] Golden Replay`);
  for (const q of queries) {
    try {
      const res = await fetch(`http://localhost:5173/api/retrieval/multi-vector?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      console.log(`✅ ${q}: ${data.candidates?.length} candidates`);
    } catch (e) {
      console.error(`❌ ${q}: ${e.message}`);
    }
  }
}

replay();
setInterval(replay, 3600000);
EOF
```

### Terminal 4: Error Monitoring
```bash
tail -f .logs/multi-vector-ramp.log | grep -E "ERROR|CRITICAL" | while read line; do
  echo "[$(date)] 🚨 $line"
done
```

---

## ✅ 8 Production Gates (Check After 24h)

| Gate | Threshold | How to Check |
|------|-----------|--------------|
| **Latency p95** | < 200ms | Check reports/soak/app.jsonl average |
| **Error Rate** | < 0.1% | Count errors in app.jsonl |
| **Recall@100** | ≥ 98% | Compare golden replay results |
| **Diversity** | > 5.0 | Sum(1/log(rank+1)) for top-10 |
| **Identity Quarantine** | < 1% | Check all responses for quarantine count |
| **Golden Replay** | Stable | Hourly results should have <±10% drift |
| **Infrastructure** | Bounded | No sustained >80% CPU, no memory spike |
| **Silent Failures** | Zero | Every response must have all 4 lanes |

---

## 🎉 After 24 Hours: Sign-Off

**If All 8 Gates Pass**:
```bash
git add -A
git commit -m "feat(retrieval): multi-vector RRF live after Phase 6-7 validation

Phase 6-7 production deployment complete:
- Phase 6 canary ramp successful (5% → 25% → 100%)
- Phase 7 24-hour soak test passed all 8 gates
- Latency p95 <200ms
- Error rate <0.1%
- Recall@100 ≥98% maintained
- All gates verified

Ready for production."

git push origin main
```

**If Any Gate Fails**:
```bash
npm run atlas:phase6:ramp:rollback
```
Then: Investigate → Fix → Restart Phase A

---

## 🚨 Emergency Rollback (Anytime)

```bash
npm run atlas:phase6:ramp:rollback
```

**Takes 2 minutes. Fully reversible. No data loss.**

---

## 📊 Success Looks Like

**During Phases A-B**:
- No manual rollbacks
- Metrics stable
- No ERROR/CRITICAL logs
- Each stage completes within time window

**During Phase C (24h)**:
- No cascading failures
- Golden replay stable
- Infrastructure metrics bounded
- No sudden latency spikes

**After 24h**:
- All 8 gates show green
- Commit message explains the win
- `git push` succeeds
- Nothing blocks Phase 8 work

---

## 📁 Files You Need

**Print & Carry**:
- `PHASE-6-7-QUICK-REFERENCE.md`

**Open in Browser**:
- `SESSION-123-PRODUCTION-EXECUTION.md` (detailed reference)
- `PHASE-6-7-PRODUCTION-DISCIPLINE.md` (gates reference)

**Bookmark**:
- `SESSIONS-123-130-ROADMAP-AND-INDEX.md` (for Sessions 124+)

---

## 🎯 Your Job

1. Run preflight → passes or fix
2. Execute 3-stage canary → monitor each
3. Run 24h soak → 4 parallel terminals
4. Verify 8 gates → all pass
5. Commit → push

**That's it. Execute with confidence.**

---

**Status**: ✅ Ready to launch  
**Nothing blocking**: ✅ Verified  
**You've got this**: ✅ Yes

**Begin with**: `npm run atlas:phase6:preflight`

---

**Session 123 starts now. Go prove it works in production.**
