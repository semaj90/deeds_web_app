# Environment Service Dependencies — Diagnostic & Mitigation Map

**Date**: June 26, 2026  
**Purpose**: Document where Redis, Qdrant, and Go Retrieval dependencies originate and how to fix cascading failures

---

## Service Dependency Chain

### 1. Redis / Valkey Dependency

**Where it comes from**:
```
env.server.ts
  ├─ privateEnv.REDIS_PASSWORD (checked first)
  ├─ privateEnv.REDIS_PASS (fallback)
  ├─ privateEnv.VALKEY_PASSWORD (Valkey bundle fallback)
  └─ privateEnv.VALKEY_PASS (legacy fallback)
  
⬇️

ENV.REDIS_URL
  ├─ privateEnv.REDIS_URL (user-provided URL)
  ├─ privateEnv.VALKEY_URL (Valkey bundle URL)
  └─ DEV.REDIS_URL = 'redis://127.0.0.1:6379' (development fallback)

⬇️

redis.ts::RedisConnectionPool
  ├─ Creates ioredis clients from REDIS_URL + REDIS_PASSWORD
  ├─ Attaches error handler (silent suppression after first error)
  ├─ Connection timeout: 3000ms
  └─ Retry strategy: max 2 attempts, exponential backoff (100-500ms)
```

**Failure mode**: If Redis is unavailable at startup:
```
[Redis Pool] Connection error (systemic): connect ECONNREFUSED 127.0.0.1:6379 — further pool errors suppressed.
```

**Mitigation**: Non-blocking fallback in every use:
```typescript
// In src/routes/api/atlas/gan-audit/deep/+server.ts
let redis;
try {
  redis = getRedis();  // May fail if connection pool exhausted
} catch (err) {
  if (config.verbose) console.warn('[GAN Deep Audit] Redis unavailable, continuing without cache');
  // Fallback: feature registry search proceeds via Postgres FTS (Tier 2)
}
```

**Usage in Phase 2.5**:
- Line 47-57 in `+server.ts`: Try to get Redis, catch gracefully
- Tier 1 search (BitFrost cache) skipped if Redis unavailable
- Falls back to Tier 2 (Postgres FTS 10-50ms) automatically

---

### 2. Qdrant Dependency

**Where it comes from**:
```
env.server.ts
  ├─ privateEnv.QDRANT_URL (direct URL: http://host:port)
  ├─ qdrantUrlFromParts() helper
  │   ├─ privateEnv.QDRANT_HOST (hostname only)
  │   └─ privateEnv.QDRANT_PORT (default 6333)
  └─ DEV.QDRANT_URL = 'http://127.0.0.1:6333' (development fallback)

⬇️

ENV.QDRANT_URL = 'http://127.0.0.1:6333'

⬇️

qdrant-http.ts
  ├─ QDRANT_URL used in every fetch() call
  ├─ HTTP timeout: 10,000ms (10s)
  └─ Operations: search, upsert, delete, getCollections, getCollection
```

**Failure mode**: If Qdrant is unavailable:
```
// Fetch fails with network error or timeout
throw new Error(`Qdrant getCollections failed: 503`)
```

**Mitigation**: Three-tier search fallback in Phase 2.5:
```typescript
// In feature-registry-search.ts
async function searchFeatureRegistry(query, db, redis, qdrant) {
  // Tier 1: BitFrost (Redis)
  if (redis) {
    const results = await searchBitfrostCache(query, redis);
    if (results.length > 0) return results;  // Hit!
  }
  
  // Tier 2: Postgres FTS (always works if DB is up)
  if (db) {
    const results = await searchPostgresFeatureRegistry(query, db);
    if (results.length > 0) return results;  // Hit!
  }
  
  // Tier 3: Qdrant (Phase 3)
  // Skipped in current implementation — returns results from T1/T2
}
```

**Usage in Phase 2.5**:
- `gan-deep-audit.ts` does NOT directly call Qdrant
- Feature registry search bottoms out at Postgres FTS
- Tier 3 (Qdrant semantic) deferred to Phase 3

---

### 3. Go Retrieval Service Dependency

**Where it comes from**:
```
env.server.ts
  ├─ privateEnv.GO_RETRIEVAL_HTTP_URL (explicit URL)
  ├─ privateEnv.RETRIEVAL_HTTP_URL (alias)
  └─ Default: 'http://127.0.0.1:8100' (go-retrieval-unified port)

⬇️

goRetrievalHttpUrl() helper
  ├─ Checks RAG_USE_GO_RETRIEVAL, GO_RETRIEVAL_ENABLED, RETRIEVAL_HTTP_ENABLED
  ├─ goRetrievalHttpEnabled() validates 'true' string
  └─ Returns URL only if enabled

⬇️

ENV.GO_RETRIEVAL_HTTP_URL
ENV.RAG_USE_GO_RETRIEVAL
ENV.GO_RETRIEVAL_HTTP_ENABLED
ENV.RETRIEVAL_HTTP_ENABLED

⬇️

go-search-bridge.ts
  ├─ GO_SEARCH_HTTP_URL = ENV.GO_RETRIEVAL_HTTP_URL (hardcoded line 111)
  ├─ searchGoService(query, options)
  │   ├─ POST /api/search to Go service
  │   ├─ Returns RRF-fused results (sparse BM25 + dense Qdrant)
  │   ├─ Timeout: 30,000ms (30s)
  │   └─ Graceful catch() on network failure
  └─ Fallback: returns empty array if service unavailable
```

**Failure mode**: If Go Retrieval service is unavailable:
```
// fetch() to http://127.0.0.1:8100/api/search times out or fails
// go-search-bridge.ts catches error, logs warning, returns []
```

**Mitigation**: Retrieval analysis in Phase 2.5:
```typescript
// In gan-retrieval-analysis.ts
async function analyzeRetrievalCoverage(auditResult, goSearchBridge, db) {
  if (!goSearchBridge) {
    return metrics;  // Graceful degradation — returns empty metrics
  }
  
  // Optional loop: sample packets and test searchability
  for (const packet of samplePackets) {
    try {
      const result = await goSearchBridge.searchGoService(packet.summary);
      // Process result...
    } catch (err) {
      console.warn(`[GAN Retrieval] Search failed: ${err.message}`);
      // Continue to next packet — non-blocking
    }
  }
}
```

**Usage in Phase 2.5**:
- Lines 44-45 in `+server.ts`: Import goSearchBridge dynamically
- Line 63: Conditionally injected into `executeGanDeepAudit()` only if `includeRetrievalAnalysis: true`
- If service is down: audit completes, retrieval analysis layer skipped
- Returns degraded response with empty `retrieval_gaps` array

---

## Environment Variables Reference

### Redis / Valkey
| Variable | Priority | Source | Default | Purpose |
|----------|----------|--------|---------|---------|
| `REDIS_URL` | 1 | `.env.local` | `redis://127.0.0.1:6379` | Full connection URL |
| `VALKEY_URL` | 2 | `.env` | – | Valkey bundle fallback |
| `REDIS_PASSWORD` | 1 | `.env.local` | `'redis'` | Auth password |
| `REDIS_PASS` | 2 | `.env` | – | Auth password (short form) |
| `VALKEY_PASSWORD` | 3 | `.env` | – | Valkey bundle password |
| `VALKEY_PASS` | 4 | `.env` | – | Valkey bundle password (short) |

### Qdrant
| Variable | Priority | Source | Default | Purpose |
|----------|----------|--------|---------|---------|
| `QDRANT_URL` | 1 | `.env.local` | `http://127.0.0.1:6333` | Full HTTP URL |
| `QDRANT_HOST` | 2 | `.env` | – | Hostname only (constructs URL with :6333) |
| `QDRANT_PORT` | 3 | `.env` | `'6333'` | Port (used with QDRANT_HOST) |
| `QDRANT_API_KEY` | – | `.env` | `''` | API key (if secured) |

### Go Retrieval Service
| Variable | Priority | Source | Default | Purpose |
|----------|----------|--------|---------|---------|
| `GO_RETRIEVAL_HTTP_URL` | 1 | `.env.local` | `http://127.0.0.1:8100` | Explicit HTTP URL |
| `RETRIEVAL_HTTP_URL` | 2 | `.env` | – | Alias for above |
| `GO_RETRIEVAL_HTTP_ENABLED` | – | `.env` | `'false'` | Toggle (must be `'true'` string) |
| `RAG_USE_GO_RETRIEVAL` | – | `.env` | – | Alias for enabled flag |
| `RETRIEVAL_HTTP_ENABLED` | – | `.env` | – | Alias for enabled flag |

---

## How to Diagnose Service Issues

### Check Redis
```bash
# From Windows PowerShell
docker ps | grep redis
# Expected: legal-ai-redis-prod running on 127.0.0.1:6379

# Test connection
docker exec legal-ai-redis-prod redis-cli PING
# Expected: PONG

# Verify password in .env.local
cat .env.local | grep -i redis
# Expected: REDIS_PASSWORD=<password_from_docker_setup>
```

### Check Qdrant
```bash
# Verify running
docker ps | grep qdrant
# Expected: legal-ai-qdrant running on 127.0.0.1:6333

# Test HTTP endpoint
curl http://127.0.0.1:6333/collections
# Expected: JSON response with collections list

# Check .env.local
cat .env.local | grep QDRANT
# Expected: QDRANT_URL=http://127.0.0.1:6333 or QDRANT_HOST=127.0.0.1
```

### Check Go Retrieval Service
```bash
# Verify running (port varies)
docker ps | grep go-search
# Expected: go-retrieval-service or similar running on port 8096 or 8100

# Test HTTP endpoint
curl http://127.0.0.1:8100/health
# Expected: 200 OK with health status

# Check .env.local
cat .env.local | grep -i retrieval
# Expected: GO_RETRIEVAL_HTTP_URL=http://127.0.0.1:8100
```

---

## Cascade Failure & Recovery Matrix

### Scenario 1: Redis Down (Most Likely)

**Impact**:
- BitFrost L1 cache unavailable
- Token savings feature registry search falls back to Postgres L2
- Latency increases from <1ms (Redis) to 10-50ms (Postgres)
- Deep audit still completes, all other layers proceed

**Recovery**:
```bash
# Check Redis status
docker logs legal-ai-redis-prod | tail -20

# Restart Redis
docker restart legal-ai-redis-prod

# Clear stale connections
docker exec legal-ai-redis-prod redis-cli FLUSHDB

# Verify
docker exec legal-ai-redis-prod redis-cli PING
```

**Code path**:
```typescript
// src/routes/api/atlas/gan-audit/deep/+server.ts, line 48-53
try {
  redis = getRedis();
} catch (err) {
  if (config.verbose) console.warn('[GAN Deep Audit] Redis unavailable, continuing without cache');
  // redis remains undefined
}
// Later: if (!redis) skip BitFrost search, use Postgres only
```

---

### Scenario 2: Qdrant Down (Unlikely, Phase 3 only)

**Impact**:
- Qdrant semantic search unavailable
- Not used in Phase 2.5 (deferred)
- No impact on current deep audit

**Recovery**:
```bash
docker restart legal-ai-qdrant
docker exec legal-ai-qdrant curl http://localhost:6333/collections
```

**Code path**:
```typescript
// gan-retrieval-analysis.ts: searchQdrantWorkflows() not called
// Feature registry search bottoms out at Postgres FTS (Tier 2)
```

---

### Scenario 3: Go Retrieval Down (Moderate Impact)

**Impact**:
- Retrieval coverage analysis skipped
- Only if `includeRetrievalAnalysis: true` in request
- Other 4 audit layers (GAN, token savings, hardening, recommendations) still proceed

**Recovery**:
```bash
# Check Go service logs
docker logs go-retrieval-service | tail -20

# Restart
docker restart go-retrieval-service

# Verify
curl http://127.0.0.1:8100/health

# Or update .env.local to disable retrieval analysis
# GO_RETRIEVAL_HTTP_ENABLED=false
```

**Code path**:
```typescript
// src/routes/api/atlas/gan-audit/deep/+server.ts, line 45
try {
  const { goSearchBridge } = await import('$lib/server/retrieval/go-search-bridge.js');
} catch (err) {
  console.warn('[GAN Deep Audit] Go Retrieval unavailable');
  // goSearchBridge remains undefined
}

// Line 63: conditional injection
deps = {
  db,
  redis,
  nats,
  goSearchBridge: config.includeRetrievalAnalysis ? goSearchBridge : undefined
};

// gan-deep-audit.ts line ~200: graceful skip
if (!deps.goSearchBridge) {
  // Retrieval analysis skipped, audit continues
}
```

---

## Fix & Hardening Checklist

### Immediate (Dev Environment)
- [ ] Verify `.env.local` has all three service URLs set
- [ ] Run `docker ps` to confirm all three containers are `Up`
- [ ] Run health checks (PING for Redis, curl for Qdrant/Go Retrieval)

### Short-term (Phase 2.5 Integration)
- [ ] Add `.env` reference documentation to integration guide
- [ ] Log env values at startup (dev only): `console.log(ENV.REDIS_URL, ENV.QDRANT_URL, ENV.GO_RETRIEVAL_HTTP_URL)`
- [ ] Test with each service down individually

### Medium-term (Phase 3)
- [ ] Implement circuit breaker pattern for Go Retrieval (if used in production)
- [ ] Add Redis pool health check before first use
- [ ] Implement Qdrant fallback (if Tier 3 semantic search enabled)

### Long-term (Phase 4+)
- [ ] Move env config to a central service registry (Consul, etcd, or K8s ConfigMap)
- [ ] Implement graceful service degradation dashboard
- [ ] Add metrics for cache hit rates, fallback activations

---

## Environment Variable Setup (Development)

### Create `.env.local` (gitignored)
```bash
# Redis / Valkey
REDIS_URL=redis://127.0.0.1:6379
REDIS_PASSWORD=<your_redis_password_from_docker_setup>

# Qdrant
QDRANT_URL=http://127.0.0.1:6333
QDRANT_API_KEY=  # Empty unless secured

# Go Retrieval Service
GO_RETRIEVAL_HTTP_URL=http://127.0.0.1:8100
GO_RETRIEVAL_HTTP_ENABLED=true

# Postgres (already set in .env)
# DATABASE_URL=postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db
```

### Verify Env Loading
```bash
# In SvelteKit dev server:
# env.server.ts logs first error globally (line 59-62)
npm run dev 2>&1 | grep -i "redis pool\|qdrant\|retrieval"
```

---

## Technical Deep Dive: env.server.ts Chain Resolution

**File**: `sveltekit-frontend/src/lib/server/env.server.ts`

**Resolution order** (for each variable):

1. **User-provided** (`.env.local` → `process.env`)
2. **Project default** (`.env` → `process.env`)
3. **Hardcoded development fallback** (DEV object)

**Example for Redis**:
```typescript
// Line 9-24: Load .env and .env.local files
loadEnvFile(envRoot);           // Load .env first
loadEnvFile(envLocal, rootValues);  // Then .env.local (overrides)

// Line 36: Password resolution (hardcoded with fallbacks)
const redisPassword = 
  privateEnv.REDIS_PASSWORD ??        // Try .env.local / process.env
  privateEnv.REDIS_PASS ??            // Try short form
  privateEnv.VALKEY_PASSWORD ??       // Try Valkey bundle
  privateEnv.VALKEY_PASS ??           // Try Valkey short form
  '';                                 // Default empty string

// Line 130: URL resolution in exported ENV object
ENV.REDIS_URL: normalizeRedisUrl(
  privateEnv.REDIS_URL ??             // Try .env.local
  privateEnv.VALKEY_URL ??            // Try Valkey bundle
  DEV.REDIS_URL                       // Hardcoded fallback
)
```

**Key insight**: Each service has a 3-4 variable precedence chain. To override, set the variable with highest priority in `.env.local`.

---

## Monitoring & Alerting (Phase 3+)

### Redis Health Metric
```typescript
// In feature-registry-search.ts before calling BitFrost
const redisBefore = Date.now();
const results = await searchBitfrostCache(query, redis);
const redisLatency = Date.now() - redisBefore;

// If redisLatency > 100ms: Redis is slow, fallback may be triggered
if (redisLatency > 100) {
  console.warn(`[Redis Perf] BitFrost cache slow: ${redisLatency}ms`);
}
```

### Qdrant Health Metric
```typescript
// In Phase 3 when Qdrant Tier 3 is enabled
const qdrantBefore = Date.now();
const results = await searchQdrantWorkflows(query, qdrant);
const qdrantLatency = Date.now() - qdrantBefore;

// Alert if > 5 seconds
if (qdrantLatency > 5000) {
  console.warn(`[Qdrant Perf] Semantic search slow: ${qdrantLatency}ms`);
}
```

### Go Retrieval Health Metric
```typescript
// In gan-retrieval-analysis.ts
const goSearchBefore = Date.now();
const result = await goSearchBridge.searchGoService(query);
const goSearchLatency = Date.now() - goSearchBefore;

// Expected: 100-500ms; warn if > 10 seconds
if (goSearchLatency > 10000) {
  console.warn(`[Go Retrieval] Search slow: ${goSearchLatency}ms`);
}
```

---

## Summary

| Service | Env Var (Primary) | Default Port | Phase 2.5 Use | Failure Mode |
|---------|-------------------|--------------|---------------|--------------|
| Redis | `REDIS_URL` | 6379 | BitFrost L1 cache (optional) | Falls back to Postgres FTS |
| Qdrant | `QDRANT_URL` | 6333 | None (Phase 3) | N/A |
| Go Retrieval | `GO_RETRIEVAL_HTTP_URL` | 8100 | Retrieval coverage (optional) | Skipped, audit continues |

**Key takeaway**: Phase 2.5 has **zero hard dependencies**. All three services are optional with graceful fallback. The deep audit completes successfully even if all three are down.

---

**Status**: ✅ Diagnostic complete  
**Maintained by**: Claude (Anthropic)  
**Last Updated**: June 26, 2026 @ 19:30 UTC