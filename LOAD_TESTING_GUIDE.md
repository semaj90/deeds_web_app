# Redis + Bifrost Load Testing Guide

**Status**: Ready for execution
**Created**: April 12, 2026
**Purpose**: Validate 3-tier cache system performance under production load

---

## Overview

This guide documents load testing for the production Redis + Bifrost cache system.

### System Under Test

**3-Tier Cache Architecture**:
1. **L1: Redis Exact-Match** (5ms) — Hash-based exact query matching
2. **L2: Bifrost Semantic Cache** (2-5s) — Vector similarity search (Qdrant)
3. **L3: Ollama GPU** (25s) — Direct LLM inference fallback

**Target Performance**:
- Combined hit rate: ≥90%
- p99 latency: <20ms
- Throughput: 12,000 QPM sustained
- Memory growth: <200MB/hour

---

## Prerequisites

### 1. Infrastructure Running

```bash
# Verify all services are up
bash scripts/audit/backend-infrastructure-audit.sh

# Expected: 15/17 gates passing
```

**Required Services**:
- ✅ Redis (port 6379) — 2GB maxmemory
- ✅ Bifrost (port 3040) — Semantic cache
- ✅ Qdrant (port 6333) — Vector search
- ✅ Ollama (port 11434) — GPU inference
- ✅ SvelteKit dev server (port 5173)

### 2. Baseline Metrics

Capture pre-test baselines:

```bash
# Redis current state
docker exec deeds-redis-prod redis-cli INFO stats | grep keyspace

# Memory usage
docker exec deeds-redis-prod redis-cli INFO memory | grep used_memory_human

# Cache stats
curl http://localhost:5173/api/cache/exact-match/stats
```

**Record**:
- Initial hit rate: _____
- Initial memory: _____
- Initial key count: _____

---

## Test Scenarios

### Quick Test (30s, Low Load)

**Purpose**: Warm up cache, verify script works
**Command**:
```bash
node scripts/tests/redis-load-test.mjs --duration=30 --concurrency=10
```

**Expected**:
- 500-600 requests
- Hit rate: 40-60% (cache still warming)
- p99 latency: Variable (first runs)

### Standard Test (60s, Medium Load)

**Purpose**: Validate target QPM at moderate concurrency
**Command**:
```bash
node scripts/tests/redis-load-test.mjs --duration=60 --concurrency=50
```

**Expected**:
- ~12,000 requests (12,000 QPM)
- Hit rate: 85-95%
- p99 latency: <20ms

### Production Simulation (300s, High Load)

**Purpose**: Sustained load test, detect memory leaks
**Command**:
```bash
node scripts/tests/redis-load-test.mjs --duration=300 --concurrency=100
```

**Expected**:
- ~60,000 requests
- Hit rate: 90-95%
- p99 latency: <20ms
- Memory growth: <50MB

### Full Test Suite

**Purpose**: Run all scenarios automatically
**Command**:
```bash
bash scripts/tests/run-load-tests.sh
```

**Duration**: ~8 minutes total (4 scenarios)

---

## Test Script Features

### Query Distribution

The load test uses weighted query patterns:

| Type | Weight | Purpose | Expected Tier |
|------|--------|---------|---------------|
| **Exact duplicates** | 65% | Test L1 Redis | L1 (5ms) |
| **Semantic variants** | 30% | Test L2 Bifrost | L2 (2-5s) |
| **Unique queries** | 5% | Test L3 Ollama | L3 (25s) |

### Metrics Captured

**Request Metrics**:
- Total requests
- Success/failure rate
- L1/L2/L3 hit distribution
- QPM (queries per minute)

**Latency Metrics**:
- Average latency
- p50 (median)
- p95
- p99

**Memory Metrics**:
- Redis memory usage (sampled every 5s)
- Cache size growth
- Hit rate over time

### Report Output

**Console Output** (real-time):
```
[15s] Requests: 3000 | QPM: 12000 | Hit Rate: 87.3% | Avg Latency: 12.4ms
[20s] Requests: 4000 | QPM: 12000 | Hit Rate: 89.1% | Avg Latency: 11.8ms
```

**Final Report**:
```
Combined Hit Rate: 91.25% ✅ TARGET MET
p99 Latency: 15.3ms ✅ TARGET MET
QPM: 12,047 ✅ TARGET MET
Memory Growth: 23.5 MB ✅ ACCEPTABLE
```

**JSON Report**: `scripts/tests/redis-load-test-report.json`
- Full metrics export
- Memory timeline
- Error details (if any)

---

## Interpreting Results

### Success Criteria

| Metric | Target | Status |
|--------|--------|--------|
| **Combined Hit Rate** | ≥90% | ✅ Primary goal |
| **p99 Latency** | <20ms | ✅ User experience |
| **QPM** | ≥10,000 | ✅ Throughput |
| **Failed Requests** | 0 | ✅ Reliability |
| **Memory Growth** | <200MB/hour | ✅ Stability |

### Hit Rate Analysis

**90-95%**: ✅ **Excellent** — Production ready
- L1 handling most duplicates
- L2 catching semantic variants
- System performing as designed

**80-90%**: ⚠️ **Good** — Minor tuning needed
- Check query distribution
- Verify Bifrost threshold (0.8)
- Review L2 cache TTL

**<80%**: ❌ **Poor** — Investigation required
- Check Bifrost service status
- Verify Qdrant connectivity
- Review cache invalidation frequency

### Latency Analysis

**p99 <20ms**: ✅ **Excellent**
- L1 Redis responding quickly
- No network bottlenecks
- Adequate concurrency

**p99 20-50ms**: ⚠️ **Acceptable**
- May indicate L2 misses
- Check Bifrost latency
- Monitor Redis CPU usage

**p99 >50ms**: ❌ **Poor**
- Possible L3 GPU fallback contamination
- Redis connection pool saturation
- Network issues

### Memory Growth Analysis

**<50MB/hour**: ✅ **Excellent** — Stable
**50-200MB/hour**: ⚠️ **Monitor** — Within headroom
**>200MB/hour**: ❌ **Issue** — Investigate leak

**Headroom Check**:
```bash
# Current usage vs limit
docker exec deeds-redis-prod redis-cli INFO memory | grep -E "used_memory_human|maxmemory_human"

# Expected: <1.6GB used (80% of 2GB limit)
```

---

## Post-Test Validation

### 1. Check for Evictions

```bash
docker exec deeds-redis-prod redis-cli INFO stats | grep evicted_keys
```

**Expected**: `evicted_keys:0` (no evictions with 2GB memory)

**If evictions occurred**:
- ⚠️ Memory pressure detected
- Review cache TTLs (may be too long)
- Consider increasing maxmemory

### 2. Review Slow Log

```bash
docker exec deeds-redis-prod redis-cli SLOWLOG GET 10
```

**Expected**: Empty or only a few entries

**If many slow commands**:
- Check for large key sizes
- Review complex operations
- Monitor Redis CPU usage

### 3. Bifrost Health

```bash
curl http://localhost:3040/health
```

**Expected**: `{"status":"ok"}`

### 4. Compare to Baseline

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Hit Rate | ___% | ___% | ___% |
| Memory | ___MB | ___MB | ___MB |
| Key Count | ___ | ___ | ___ |

---

## Troubleshooting

### Issue: Low Hit Rate (<80%)

**Possible Causes**:
1. Bifrost service down/unreachable
2. Qdrant vector search timeout
3. Cache recently cleared

**Diagnosis**:
```bash
# Check Bifrost
curl http://localhost:3040/health

# Check Qdrant
curl http://localhost:6333/collections/cache_vectors

# Check Redis keys
docker exec deeds-redis-prod redis-cli DBSIZE
```

**Fix**:
- Restart Bifrost: `docker restart bifrost-cache`
- Verify Qdrant index: Review collection schema
- Warm up cache: Run low-load test first

### Issue: High p99 Latency (>50ms)

**Possible Causes**:
1. L3 GPU fallback contamination
2. Redis connection pool exhaustion
3. Network latency

**Diagnosis**:
```bash
# Check Redis response time
redis-cli --latency -h localhost -p 6379

# Monitor connections
docker exec deeds-redis-prod redis-cli INFO clients | grep connected_clients

# Check Ollama status
curl http://localhost:11434/api/tags
```

**Fix**:
- Increase L2 cache threshold (more L2 hits, fewer L3)
- Scale Redis connection pool (currently 10 connections)
- Review query patterns (avoid unique queries)

### Issue: Memory Growth (>200MB/hour)

**Possible Causes**:
1. TTL too long (keys not expiring)
2. Large response payloads
3. Memory leak in application

**Diagnosis**:
```bash
# Check TTL distribution
docker exec deeds-redis-prod redis-cli --scan --pattern "llm:*" | head -10 | xargs -I {} docker exec deeds-redis-prod redis-cli TTL {}

# Check key sizes
docker exec deeds-redis-prod redis-cli --bigkeys

# Monitor fragmentation
docker exec deeds-redis-prod redis-cli INFO memory | grep mem_fragmentation_ratio
```

**Fix**:
- Reduce TTL (currently 1 hour for L1)
- Implement response compression
- Review lazy freeing configuration

### Issue: Failed Requests

**Possible Causes**:
1. Service timeout (>30s)
2. 429 rate limiting
3. Server error (500)

**Diagnosis**:
```bash
# Check error log
tail -100 scripts/tests/redis-load-test-report.json | grep errors

# Monitor SvelteKit logs
# Check for stack traces in dev server output
```

**Fix**:
- Increase timeout (currently 30s)
- Add request throttling to load test
- Fix server-side errors (check API routes)

---

## Optimization Recommendations

### After First Load Test

Based on results, consider:

**If hit rate 85-90%**:
- Lower Bifrost semantic threshold (0.8 → 0.75)
- Increase L1 TTL (1h → 2h)
- Add more query pattern variants

**If p99 latency 15-20ms**:
- ✅ **Good** — No changes needed
- Monitor under higher concurrency

**If memory growth 100-200MB/hour**:
- ⚠️ **Monitor** — Acceptable but watch
- Consider shorter TTL if growth continues
- Plan for 3GB → 4GB if sustained

### Production Tuning

**Recommended Settings** (after validation):

```yaml
# docker-compose.yml
redis:
  command: >
    --maxmemory 3gb           # If sustained growth observed
    --maxmemory-policy allkeys-lru
    --save 900 1 300 10 60 10000
    --lazyfree-lazy-eviction yes
    --lazyfree-lazy-expire yes
```

**Bifrost Configuration**:
- Semantic threshold: 0.75-0.85 (tune based on hit rate)
- Cache TTL: 1-2 hours (tune based on memory)

---

## Next Steps

### After Successful Load Test

1. ✅ **Document Baseline** — Record hit rate, latency, memory
2. ✅ **Schedule Monitoring** — Set up Grafana dashboards
3. ✅ **Configure Alerts** — Memory >80%, hit rate <70%
4. ⏳ **Production Deployment** — Apply configuration to prod
5. ⏳ **Continuous Monitoring** — Track metrics over time

### Monitoring Setup

**Grafana Dashboards** (recommended):
- Redis memory usage (line chart)
- Cache hit rate (gauge + timeline)
- Latency distribution (histogram)
- QPM throughput (area chart)

**Alerts**:
- Redis memory >80% → Warning
- Hit rate <70% for 10 min → Critical
- p99 latency >50ms → Warning
- Evictions >10/min → Critical

---

## Files Reference

| File | Purpose |
|------|---------|
| `scripts/tests/redis-load-test.mjs` | Load testing script (367 lines) |
| `scripts/tests/run-load-tests.sh` | Test suite runner (4 scenarios) |
| `scripts/tests/redis-load-test-report.json` | Test results (auto-generated) |
| `LOAD_TESTING_GUIDE.md` | This documentation |

---

## Success Criteria Summary

✅ **Production Ready** if ALL met:
- Combined hit rate ≥90%
- p99 latency <20ms
- QPM ≥10,000 sustained
- Zero failed requests
- Memory growth <200MB/hour
- Zero evictions during test

⚠️ **Needs Tuning** if ANY unmet:
- Review specific metric
- Apply optimization recommendations
- Re-test with adjustments

❌ **Major Issues** if MULTIPLE unmet:
- Review infrastructure health
- Check service connectivity
- Investigate application errors
- Consider architecture changes

---

**Last Updated**: April 12, 2026
**Status**: Ready for execution
**Next Action**: Run `bash scripts/tests/run-load-tests.sh`
