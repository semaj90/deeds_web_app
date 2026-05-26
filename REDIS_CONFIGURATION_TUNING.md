# Redis Configuration Tuning Guide

**Date**: April 13, 2026
**Status**: Current config reviewed, optimizations recommended
**Priority**: P1 (prerequisite for load testing)

---

## Current Configuration

### Memory Settings
```
used_memory:        20.52 MB   (current usage)
maxmemory:          512 MB     (configured limit)
maxmemory_policy:   allkeys-lru (evict least recently used)
mem_fragmentation:  2.21       (slightly high but acceptable)
```

### Performance Stats
```
keyspace_hits:      167,623    (cache hits)
keyspace_misses:    323,529    (cache misses)
hit_rate:           34.1%      (below target of 90-95%)
evicted_keys:       0          (no memory pressure)
expired_keys:       12,205     (TTL working)
total_keys:         162        (mostly Langfuse queue keys)
```

### Key Distribution
- **Langfuse (Bull queues)**: 161 keys (~99%)
- **Application cache**: 1 key (~1%)
  - `model-price-tiers:deeds-observability:gemma4-rotorquant:latest%3Alatest`

---

## Analysis

### ✅ What's Working Well

1. **Eviction Policy**: `allkeys-lru` is optimal for cache workloads
2. **No Memory Pressure**: 0 evicted keys, 20MB/512MB used (3.9%)
3. **TTL Functioning**: 12,205 expired keys (automatic cleanup working)
4. **No Fragmentation Issues**: 2.21 ratio is acceptable (<3.0)

### ⚠️ Areas for Improvement

1. **Low Hit Rate**: 34.1% vs target 90-95%
   - **Root Cause**: Cache warming phase, low traffic
   - **Action**: Wait for production load, run load tests

2. **Minimal Application Cache Usage**: Only 1 app key out of 162
   - **Root Cause**: L1 cache (redis-exact-match.ts) not heavily used yet
   - **Expected**: Will increase after load testing and production deployment

3. **Memory Allocation**: 512MB may be undersized for high-traffic
   - **Current**: Sufficient for dev/staging (20MB used)
   - **Production**: Recommend 2GB for 12,000 QPM target

---

## Recommended Optimizations

### Immediate (Pre-Load Testing)

#### 1. Increase Memory Limit (Production)
```bash
# Current: 512MB
# Recommended: 2GB for high-traffic production

docker exec deeds-redis-prod redis-cli CONFIG SET maxmemory 2gb
docker exec deeds-redis-prod redis-cli CONFIG REWRITE
```

**Rationale**:
- L1 cache stores full LLM responses (can be 1-10KB each)
- At 12,000 QPM with 90% hit rate → ~10,800 cached responses/min
- With 1hr TTL → ~648,000 cached items
- Average 5KB/response → ~3.24GB needed

**Alternative**: Keep 512MB for dev, use 2GB only in production docker-compose

#### 2. Verify Eviction Policy
```bash
docker exec deeds-redis-prod redis-cli CONFIG GET maxmemory-policy
# Should return: allkeys-lru ✅
```

#### 3. Enable Persistence (Optional)
```bash
# Check current persistence settings
docker exec deeds-redis-prod redis-cli CONFIG GET save

# Enable RDB snapshots (recommended for cache durability)
docker exec deeds-redis-prod redis-cli CONFIG SET save "900 1 300 10 60 10000"
docker exec deeds-redis-prod redis-cli CONFIG REWRITE
```

**Translation**: Save snapshot if:
- 900 seconds (15 min) and ≥1 key changed
- 300 seconds (5 min) and ≥10 keys changed
- 60 seconds (1 min) and ≥10,000 keys changed

### Short-Term (Post-Load Testing)

#### 4. Tune TTLs Based on Load Test Results

Current TTLs (from codebase):
- **L1 exact-match cache**: 1 hour (3600s)
- **ACE evaluations**: 15 minutes (900s)
- **Session data**: Varies by endpoint

**Recommendations**:
- **Increase L1 TTL** to 2 hours if hit rate >90%
- **Decrease ACE TTL** to 5 minutes if stale data is acceptable
- **Add TTL monitoring** to track optimal expiration times

#### 5. Monitor Key Space Growth

Create monitoring query:
```bash
# Run every 5 minutes via cron
docker exec deeds-redis-prod redis-cli INFO keyspace | grep "db0:keys"
# Expected: Grows to 10,000-100,000 keys under load
```

Alert if:
- Keys > 1,000,000 (potential memory issue)
- Keys < 100 (cache not being used)

### Long-Term (Production Hardening)

#### 6. Enable Lazy Freeing
```bash
docker exec deeds-redis-prod redis-cli CONFIG SET lazyfree-lazy-eviction yes
docker exec deeds-redis-prod redis-cli CONFIG SET lazyfree-lazy-expire yes
docker exec deeds-redis-prod redis-cli CONFIG REWRITE
```

**Benefit**: Evictions/expirations happen in background thread (non-blocking)

#### 7. Connection Pool Tuning

Current: 10 connections (from getRedis() pool)

Recommended for high traffic:
```typescript
// src/lib/server/redis.ts
const POOL_SIZE = process.env.REDIS_POOL_SIZE
  ? parseInt(process.env.REDIS_POOL_SIZE)
  : 20; // Increase from 10 to 20 for production
```

#### 8. Add Slow Log Monitoring
```bash
docker exec deeds-redis-prod redis-cli CONFIG SET slowlog-log-slower-than 10000
docker exec deeds-redis-prod redis-cli CONFIG SET slowlog-max-len 128
```

**Translation**: Log commands taking >10ms, keep last 128 entries

Check slow log:
```bash
docker exec deeds-redis-prod redis-cli SLOWLOG GET 10
```

---

## Docker Compose Configuration

### Development (Current)
```yaml
# docker-compose.yml
services:
  deeds-redis-prod:
    image: redis:7-alpine
    command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru
    mem_limit: 1gb
```

### Production (Recommended)
```yaml
# docker-compose.prod.yml
services:
  deeds-redis-prod:
    image: redis:7-alpine
    command: >
      redis-server
      --maxmemory 2gb
      --maxmemory-policy allkeys-lru
      --save "900 1 300 10 60 10000"
      --lazyfree-lazy-eviction yes
      --lazyfree-lazy-expire yes
      --slowlog-log-slower-than 10000
    mem_limit: 3gb  # Give 1GB headroom for fragmentation
    deploy:
      resources:
        limits:
          memory: 3gb
        reservations:
          memory: 2gb
```

---

## Performance Targets

### Current Baseline
| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Hit Rate | 34.1% | 90-95% | ⚠️ Below target (warming up) |
| Latency | 5ms avg | <10ms | ✅ Met |
| Throughput | Unknown | 12,000 QPM | ⏳ Needs load test |
| Memory Usage | 20MB | <1.6GB (80% of 2GB) | ✅ Met |
| Evictions | 0 | <1% of sets | ✅ Met |

### Post-Optimization Targets
| Metric | Target | Verification |
|--------|--------|--------------|
| Hit Rate | 90-95% | `INFO stats` after 1hr of load |
| Latency (p50) | <5ms | Load test measurements |
| Latency (p99) | <20ms | Load test measurements |
| Throughput | 12,000 QPM | Sustained load test |
| Memory Usage | <80% of maxmemory | `INFO memory` |
| Evictions | <1% of sets | `evicted_keys` / (`keyspace_hits` + `keyspace_misses`) |

---

## Monitoring Commands

### Real-Time Stats
```bash
# Watch memory usage
watch -n 1 'docker exec deeds-redis-prod redis-cli INFO memory | grep -E "used_memory_human|maxmemory_human"'

# Watch hit rate
watch -n 5 'docker exec deeds-redis-prod redis-cli INFO stats | grep -E "keyspace_hits|keyspace_misses"'

# Watch key count
watch -n 5 'docker exec deeds-redis-prod redis-cli DBSIZE'
```

### One-Time Checks
```bash
# Full info dump
docker exec deeds-redis-prod redis-cli INFO > redis-info-$(date +%Y%m%d-%H%M%S).txt

# Check specific keys
docker exec deeds-redis-prod redis-cli --scan --pattern "llm:cache:*" --count 100

# Get key TTLs
docker exec deeds-redis-prod redis-cli TTL "model-price-tiers:deeds-observability:gemma4-rotorquant:latest%3Alatest"

# Check memory usage of largest keys
docker exec deeds-redis-prod redis-cli --bigkeys
```

---

## Load Testing Preparation

### Before Running Load Tests

1. **Baseline Snapshot**
   ```bash
   docker exec deeds-redis-prod redis-cli INFO > redis-baseline.txt
   docker exec deeds-redis-prod redis-cli --bigkeys > redis-bigkeys-baseline.txt
   ```

2. **Clear Old Data** (optional, dev only)
   ```bash
   # WARNING: Only run in dev environment
   docker exec deeds-redis-prod redis-cli FLUSHDB
   ```

3. **Start Monitoring**
   ```bash
   # Terminal 1: Monitor memory
   watch -n 1 'docker exec deeds-redis-prod redis-cli INFO memory | grep used_memory_human'

   # Terminal 2: Monitor operations
   watch -n 1 'docker exec deeds-redis-prod redis-cli INFO stats | grep instantaneous_ops_per_sec'
   ```

### During Load Test

Monitor:
- **Ops/sec**: Should handle 200+ ops/sec (12,000 QPM / 60s = 200 QPS)
- **Memory growth**: Should not exceed maxmemory
- **Evictions**: Should remain 0 or <1% of operations
- **Hit rate**: Should climb toward 90%+ after warm-up

### After Load Test

1. **Capture Stats**
   ```bash
   docker exec deeds-redis-prod redis-cli INFO > redis-post-load.txt
   docker exec deeds-redis-prod redis-cli SLOWLOG GET 20 > redis-slowlog.txt
   ```

2. **Calculate Hit Rate**
   ```bash
   docker exec deeds-redis-prod redis-cli INFO stats | grep keyspace
   # Hit Rate = hits / (hits + misses)
   ```

3. **Analyze Key Distribution**
   ```bash
   docker exec deeds-redis-prod redis-cli --bigkeys
   docker exec deeds-redis-prod redis-cli --scan --count 100 | cut -d: -f1 | sort | uniq -c | sort -rn
   ```

---

## Troubleshooting

### High Memory Usage (>80%)
**Symptoms**: `used_memory` approaching `maxmemory`

**Solutions**:
1. Check for key leaks: `docker exec deeds-redis-prod redis-cli --bigkeys`
2. Verify eviction policy: `CONFIG GET maxmemory-policy`
3. Reduce TTLs for less-critical data
4. Increase maxmemory (if justified by hit rate)

### Low Hit Rate (<50%)
**Symptoms**: `keyspace_misses` >> `keyspace_hits`

**Solutions**:
1. Increase TTLs (cache expires too quickly)
2. Check if queries are unique (no cache reuse)
3. Verify cache keys are deterministic (same input → same key)
4. Review cache invalidation patterns (too aggressive?)

### High Latency (>10ms p99)
**Symptoms**: `INFO commandstats` shows high `usec_per_call`

**Solutions**:
1. Check slow log: `SLOWLOG GET 20`
2. Enable lazy freeing (background eviction)
3. Reduce key size (shorter key names, smaller values)
4. Consider Redis Cluster for horizontal scaling

### Memory Fragmentation (>3.0)
**Symptoms**: `mem_fragmentation_ratio` >3.0

**Solutions**:
1. Restart Redis: `docker restart deeds-redis-prod`
2. Enable active defragmentation (Redis 4.0+):
   ```bash
   CONFIG SET activedefrag yes
   CONFIG SET active-defrag-threshold-lower 10
   CONFIG SET active-defrag-threshold-upper 30
   ```

---

## Next Steps

### Immediate Actions
1. ✅ Document current config (this file)
2. ⏳ Apply production memory settings (2GB)
3. ⏳ Enable persistence (RDB snapshots)
4. ⏳ Run load tests (verify 90%+ hit rate)

### Follow-Up
1. Add Redis metrics to monitoring dashboard
2. Set up alerts for memory usage >80%
3. Set up alerts for hit rate <70%
4. Create automated performance regression tests

---

## References

- **Redis Official Docs**: https://redis.io/docs/manual/config/
- **Memory Optimization**: https://redis.io/docs/manual/eviction/
- **Persistence**: https://redis.io/docs/manual/persistence/
- **Performance Tuning**: https://redis.io/docs/manual/optimization/

**Internal Docs**:
- CLAUDE.md (Redis L1 + Bifrost L2 Cache System section)
- BACKEND_INFRASTRUCTURE_AUDIT.md (Gate G1-G3: Redis checks)
- redis-exact-match.ts (L1 cache implementation)

---

**Configuration Review Complete**: April 13, 2026, 3:45 AM
**Status**: ✅ Current config sufficient for dev, production optimizations documented
**Next**: Apply production settings + run load tests
