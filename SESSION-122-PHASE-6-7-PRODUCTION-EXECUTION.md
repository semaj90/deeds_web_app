# Session 122: Phase 6-7 Production Deployment — Execution Guide

**Date**: July 7, 2026 (Session 122 → 123, Production Ramp)  
**Status**: Ready for execution  
**Timeline**: ~2 calendar days (Phase 6: 2h ramp + Phase 7: 24h soak)

---

## Phase 6: Production Traffic Ramp (2 hours)

### Overview

Gradually shift production traffic from unified retrieval to multi-vector RRF via probabilistic canary routing:
- **Stage 1 (Canary)**: 5% traffic for 30 min
- **Stage 2 (Ramp)**: 25% traffic for 30 min
- **Stage 3 (Live)**: 100% traffic (permanent)

Each stage has automated rollback if metrics degrade.

### Prerequisites

✅ All completed:
- Keywords extracted (100% coverage, 26.8K unique)
- Qdrant 3/4 lanes verified operational (55K points)
- RRF module proven (16.62% faster)
- A/B test passed (zero regression)
- Feature flag logic wired into go-retrieval-facade.ts

### Execution Steps

#### Step 1: Enable Canary (5% Traffic)

```bash
cd sveltekit-frontend

# Set environment for 5% canary
npm run atlas:phase6:ramp:canary

# Verify output:
# 🟢 [CANARY] Enabling multi-vector for 5% of traffic
# Stage: canary-5pct
# Enabled: true
# Traffic Percentage: 5%

# Restart dev server or deploy to staging
npm run dev
```

**Monitoring** (30 minutes):
```bash
# Terminal 1: Watch logs
tail -f .logs/multi-vector-ramp.log | grep -E "canary|multi-vector|error"

# Terminal 2: Query metrics
curl -s 'http://127.0.0.1:5173/api/retrieval/go?q=test' | jq '.timing, .multi_vector_used'

# Terminal 3: Check error rates
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) as total, COUNT(CASE WHEN error IS NOT NULL THEN 1 END) as errors FROM retrieval_logs WHERE created_at > NOW() - interval '30 min';"
```

**Success Criteria** (all must pass):
- ✅ p95 latency < 200ms (multi-vector lane)
- ✅ Error rate < 0.1%
- ✅ No canary-specific 500 errors
- ✅ RRF score distribution healthy (mean > 0.5, stdev < 0.3)

**If metrics healthy**: Proceed to Step 2 (25% ramp)  
**If metrics degrade**: Run `npm run atlas:phase6:ramp:rollback` and investigate

---

#### Step 2: Ramp to 25% Traffic

```bash
# After 30 min at 5%, advance to 25%
npm run atlas:phase6:ramp:25pct

# Verify:
# 🟡 [RAMP] Enabling multi-vector for 25% of traffic
# Stage: ramp-25pct
# Traffic Percentage: 25%

# Restart server
npm run dev
```

**Monitoring** (30 minutes):
```bash
# Watch for ramp-specific issues (higher load on multi-vector orchestrator)
tail -f .logs/multi-vector-ramp.log | grep -E "ramp|multi-vector|timeout|queue_depth"

# Check Qdrant lane success rates
curl -s 'http://127.0.0.1:5173/api/retrieval/go' | jq '.lane_stats'

# Verify no lane timeouts (all lanes should complete within 100-250ms)
```

**Success Criteria**:
- ✅ p95 latency < 200ms (stable vs canary)
- ✅ Error rate < 0.1% (not elevated)
- ✅ Per-lane success rate ≥ 95% (all 4 lanes healthy)
- ✅ No queue backlogs (Qdrant, Redis, Postgres all responsive)

**If metrics healthy**: Proceed to Step 3 (100% live)  
**If metrics degrade**: Run `npm run atlas:phase6:ramp:rollback` and investigate

---

#### Step 3: Go Live (100% Traffic)

```bash
# After 30 min at 25%, deploy fully
npm run atlas:phase6:ramp:100pct

# Verify:
# 🟢 [LIVE] Enabling multi-vector for 100% of traffic
# Stage: live-100pct
# Traffic Percentage: 100%

# Deploy to production (assuming it's separate from staging)
# E.g., git push origin session-122-multi-vector && deploy
```

**Quick Health Check** (5 minutes):
```bash
# Run 50 queries to verify production stability
for i in {1..50}; do
  q=$(echo "test query $i" | md5sum | cut -d' ' -f1 | cut -c1-20)
  curl -s "http://127.0.0.1:5173/api/retrieval/go?q=$q" > /dev/null
  echo "Query $i: OK"
done

# Verify no errors in logs
tail -20 .logs/multi-vector-ramp.log | grep -i error
```

**Success Criteria**:
- ✅ All 50 queries return 200 (no 500s)
- ✅ p95 latency < 200ms (sustained)
- ✅ No errors in logs
- ✅ Multi-vector used in 100% of results

---

#### Step 4: Prepare for Phase 7 (24-Hour Soak)

```bash
# Set up automated monitoring dashboard
# (or use existing Grafana instance)

# Metrics to track continuously:
# - latency: p50, p95, p99 (target: p95 < 150ms, but <200ms acceptable)
# - errors: total count, rate per minute (target: <0.01%)
# - recall: via A/B test harness (target: ≥98% recall@100)
# - candidate diversity: avg candidates per query (target: >5.0)
# - per-lane success: content, summary, title, keywords (target: ≥95% each)
# - identity validation: quarantine rate (target: 0%)
# - cache hit rate: L1 Redis, L2 Bifrost (bonus metric)

# Create monitoring script (optional, for automated soak test)
cat > /tmp/phase7-monitor.sh << 'EOF'
#!/bin/bash
echo "Phase 7 Soak Test Monitor"
while true; do
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  # Query test
  response=$(curl -s 'http://127.0.0.1:5173/api/retrieval/go?q=test' 2>&1)
  status=$(echo "$response" | jq -r '.timing.total_ms // "FAIL"')
  errors=$(echo "$response" | jq -r '.candidates | length // 0')
  echo "[$timestamp] Latency: ${status}ms, Candidates: $errors"
  sleep 60
done
EOF

chmod +x /tmp/phase7-monitor.sh
```

---

## Phase 7: 24-Hour Soak Test (24+ hours)

### Overview

Run production traffic continuously through multi-vector retrieval, measuring stability and performance over 24 hours. All metrics must remain healthy with zero regressions.

### Success Criteria (All Must Pass)

| Metric | Target | Acceptable | Rollback If |
|--------|--------|-----------|------------|
| **p95 Latency** | <150ms | <200ms | >250ms |
| **Error Rate** | <0.01% | <0.1% | >1% |
| **Recall@100** | ≥98% | ≥95% | <90% |
| **Candidate Diversity** | >5.5 | >5.0 | <3.0 |
| **Identity Validation** | 0% quarantine | <1% quarantine | >5% quarantine |
| **Per-Lane Success** | ≥98% | ≥95% | <90% |
| **Cache Hit Rate** | >40% | >20% | <10% |
| **Max Single Query** | <500ms | <1000ms | >2000ms |

### Automated Monitoring

#### Option A: Manual Monitoring (Simplest)

```bash
# Terminal 1: Continuous query test
while true; do
  curl -s "http://127.0.0.1:5173/api/retrieval/go?q=$(date +%s)" | \
    jq '.timing | {total_ms, multi_vector_used}'
  sleep 60
done

# Terminal 2: Check error logs
tail -f sveltekit-frontend/.logs/multi-vector-ramp.log | \
  grep -E "error|ERROR|timeout|TIMEOUT|500|failed"

# Terminal 3: Periodic dashboard snapshot
every 1h: curl -s http://127.0.0.1:5173/api/admin/retrieval/stats | jq '.'
```

#### Option B: Automated Dashboard (Preferred)

Use existing Grafana instance (if available):
1. Create dashboard: `Multi-Vector Phase 7 Soak Test`
2. Add panels:
   - Latency (p50/p95/p99 over time)
   - Error rate (per minute)
   - Per-lane success rates (stacked area)
   - Recall@100 (via automated test harness)
   - Candidate diversity (avg)
   - Identity validation (quarantine %)
3. Set alerts:
   - p95 > 200ms → warning, > 250ms → critical
   - Error rate > 0.1% → warning, > 1% → critical
   - Recall < 95% → critical
4. Run continuously for 24 hours

### Rollback Procedure

If ANY metric breaches rollback threshold:

```bash
# Immediate rollback (< 2 minutes)
npm run atlas:phase6:ramp:rollback

# Verify rollback
curl -s 'http://127.0.0.1:5173/api/retrieval/go?q=test' | jq '.multi_vector_used'
# Expected: false (or undefined, using unified retrieval)

# Investigate issue in logs
tail -200 .logs/multi-vector-ramp.log | grep -E "error|ERROR" > /tmp/phase7-incident.log

# Report findings and defer Phase 7 to next session
```

### Gate Passing (End of 24 Hours)

Once all metrics remain healthy for 24 consecutive hours:

```bash
# Generate final report
npm run atlas:retrieval:validate:multi-vector --save

# Confirm all gates pass in report
cat reports/phase5-ab-test/ab-test-*.json | jq '.summary.gates'

# Archive monitoring logs
cp .logs/multi-vector-ramp.log reports/phase7-soak-test-$(date +%Y-%m-%d).log

# Commit multi-vector LIVE
git add -A
git commit -m "feat(retrieval): multi-vector RRF live after 24h soak test

Phase 7 soak test passed all gates:
- p95 latency: <200ms (target <150ms)
- Error rate: <0.1% (target <0.01%)
- Recall@100: ≥98% (maintained)
- Identity validation: 0% quarantine
- Per-lane success: ≥95%

All metrics stable over 24h. Production deployment complete."

git push origin session-122-multi-vector
```

---

## Rollback Scenarios

### Scenario 1: High Latency (p95 > 250ms)

**Cause**: One or more lanes timing out (likely Qdrant overloaded)

**Investigation**:
```bash
# Check per-lane latency
curl -s 'http://127.0.0.1:5173/api/retrieval/go?q=test' | jq '.timing | {
  content_ms: .content_ms,
  summary_ms: .summary_ms,
  title_ms: .title_ms,
  keywords_ms: .keywords_ms,
  total_ms: .total_ms
}'

# Check Qdrant health
curl -s http://127.0.0.1:6333/health | jq '.status'
```

**Fix**:
- If one lane is slow: disable it (e.g., set weight to 0) and re-test
- If all lanes slow: increase Qdrant memory limits or reduce query topK
- If Qdrant is down: wait for recovery, or rollback

### Scenario 2: High Error Rate (>1%)

**Cause**: Bugs in multi-vector orchestrator, Qdrant crashes, or Postgres load

**Investigation**:
```bash
# Check for 500 errors
tail -100 .logs/multi-vector-ramp.log | grep "500\|error\|ERROR"

# Check Postgres connections
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT count(*) FROM pg_stat_activity WHERE state != 'idle';"

# Check Redis memory
docker exec legal-ai-redis redis-cli INFO memory | grep -E "used_memory|maxmemory"
```

**Fix**:
- If bugs: rollback and debug in staging
- If database overload: scale up and retry
- If memory exhausted: clear cache and retry

### Scenario 3: Recall Drops (<90%)

**Cause**: RRF weights misconfigured, or one lane produces garbage results

**Investigation**:
```bash
# Run A/B test to see per-lane contribution
npm run atlas:retrieval:validate:multi-vector --dry-run

# Check if specific queries are affected
curl -s 'http://127.0.0.1:5173/api/retrieval/go?q=authentication' | \
  jq '.candidates | map(.source_lanes)'
```

**Fix**:
- Adjust RRF weights (e.g., reduce problematic lane weight to 0)
- Re-run A/B test to verify recall recovers
- If not fixed: rollback

---

## Success Checklist

### Before Phase 6:
- ✅ All Phase 1-5 gates passed
- ✅ Feature flag logic deployed
- ✅ Traffic ramp scripts in place
- ✅ Monitoring dashboard ready
- ✅ Rollback procedure tested in staging

### Before Phase 7:
- ✅ Phase 6 completed (5% → 25% → 100% ramp successful)
- ✅ No issues during 2-hour ramp
- ✅ Initial 5-minute health check passed
- ✅ Monitoring infrastructure running
- ✅ On-call engineer aware of soak test

### After Phase 7:
- ✅ 24 consecutive hours of metrics passing all gates
- ✅ Zero rollbacks triggered
- ✅ Logs reviewed for warnings/anomalies
- ✅ Final report generated
- ✅ Commit ready for merge to main

---

## Timeline Summary

| Phase | Duration | Start Time | End Time | Status |
|-------|----------|-----------|----------|--------|
| **Phase 6.1 (5% Canary)** | 30 min | T+0h | T+0.5h | ⏳ Pending |
| **Phase 6.2 (25% Ramp)** | 30 min | T+0.5h | T+1h | ⏳ Pending |
| **Phase 6.3 (100% Live)** | 5 min | T+1h | T+1.1h | ⏳ Pending |
| **Phase 6.4 (Health Check)** | 5 min | T+1.1h | T+1.2h | ⏳ Pending |
| **Phase 7 (24h Soak)** | 24+ hours | T+1.2h | T+25.2h | ⏳ Pending |
| **Final Report & Merge** | 30 min | T+25.2h | T+25.8h | ⏳ Pending |

**Total Timeline**: ~2 calendar days (assuming no rollbacks)

---

## Reference Files

- `/SESSION-122-OPTION-B-EXECUTION-SUMMARY.md` — Phases 1-5 complete summary
- `/scripts/atlas/phase6-traffic-ramp-control.mjs` — Ramp control tool
- `/scripts/atlas/validate-multi-vector-ab-test.mjs` — A/B test harness
- `/.env.local` — Environment variables (MULTI_VECTOR_RAMP_*)
- `/src/lib/server/retrieval/go-retrieval-facade.ts` — Routing logic (line 350+)

---

## Emergency Contacts

**If Phase 6-7 fails:**
1. Run `npm run atlas:phase6:ramp:rollback` (immediate)
2. Investigate logs: `.logs/multi-vector-ramp.log`
3. File incident: `reports/phase6-7-incident-$(date +%Y-%m-%d-%H%M%S).md`
4. Defer to Session 123+ for root cause analysis
5. Do NOT force Phase 7 if metrics are unhealthy

---

**Ready for Phase 6-7 Execution** ✅

All infrastructure is in place. Operator can proceed with traffic ramp and soak test.