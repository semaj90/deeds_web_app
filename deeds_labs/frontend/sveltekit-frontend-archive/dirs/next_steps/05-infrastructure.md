# Infrastructure & Performance - Next Steps

**Generated:** March 1, 2026
**Priority:** MEDIUM
**Focus:** Redis, caching, testing, monitoring

---

## 🔥 Critical (Do First)

### 1. Redis Connection Pool
**File:** `src/lib/server/redis.ts`
**Issue:** Single connection, no pooling
**Impact:** Connection exhaustion under load
**Effort:** 1 hour

**Current:**
```typescript
// src/lib/server/redis.ts
let redis: Redis;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT });
  }
  return redis;
}
```

**Improved:**
```typescript
import { Redis, Cluster } from 'ioredis';

class RedisConnectionPool {
  private pool: Redis[] = [];
  private maxConnections = 10;
  private currentIndex = 0;

  getConnection(): Redis {
    if (this.pool.length < this.maxConnections) {
      const client = new Redis({
        host: REDIS_HOST,
        port: REDIS_PORT,
        retryStrategy: (times) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true
      });
      this.pool.push(client);
      return client;
    }

    // Round-robin existing connections
    const connection = this.pool[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.pool.length;
    return connection;
  }

  async closeAll() {
    await Promise.all(this.pool.map(c => c.quit()));
    this.pool = [];
  }
}

export const redisPool = new RedisConnectionPool();
export const getRedis = () => redisPool.getConnection();
```

---

### 2. Cache TTL Strategy
**Issue:** Inconsistent cache expiration
**Impact:** Stale data and memory bloat
**Effort:** 1.5 hours

**TTL Configuration:**
```typescript
// src/lib/server/cache-config.ts
export const CACHE_TTL = {
  // Short-lived (5 minutes)
  SESSION: 300,
  HEALTH_CHECK: 300,

  // Medium (1 hour)
  EVIDENCE_LIST: 3600,
  CASE_LIST: 3600,
  DASHBOARD_STATS: 3600,

  // Long-lived (24 hours)
  EMBEDDING: 86400,
  RAG_RESULTS: 86400,
  STATIC_DATA: 86400,

  // Very long (7 days)
  LEGAL_DOCUMENTS: 604800,
  PRECEDENTS: 604800
} as const;

export function getTTL(key: string): number {
  if (key.startsWith('session:')) return CACHE_TTL.SESSION;
  if (key.startsWith('embedding:')) return CACHE_TTL.EMBEDDING;
  if (key.startsWith('evidence:')) return CACHE_TTL.EVIDENCE_LIST;
  // ... etc

  return CACHE_TTL.SESSION; // Default: 5 minutes
}
```

**Apply Automatically:**
```typescript
// Wrap Redis set operations
export async function cacheSet(key: string, value: any): Promise<void> {
  const ttl = getTTL(key);
  await redis.set(key, JSON.stringify(value), 'EX', ttl);
}
```

---

### 3. Cache Invalidation Strategy
**Impact:** Ensure data consistency
**Effort:** 2 hours

**Pattern-Based Invalidation:**
```typescript
// src/lib/server/cache-invalidation.ts
export async function invalidateCache(pattern: string): Promise<number> {
  const redis = getRedis();
  const keys = await redis.keys(pattern);

  if (keys.length === 0) return 0;

  return await redis.del(...keys);
}

// Event-based invalidation
export async function onEvidenceUpdated(evidenceId: string) {
  await invalidateCache(`evidence:${evidenceId}:*`);
  await invalidateCache(`case:*:evidence`); // Invalidate case evidence lists
}

export async function onCaseUpdated(caseId: string) {
  await invalidateCache(`case:${caseId}:*`);
  await invalidateCache(`dashboard:stats:*`); // Dashboard shows case counts
}

export async function onReportCreated(reportId: string, caseId: string) {
  await invalidateCache(`reports:case:${caseId}`);
  await invalidateCache(`reports:user:*`); // User's report list
}
```

**Integration with DB Operations:**
```typescript
// In API endpoints after DB writes
await db.update(evidence).set(updates).where(eq(evidence.id, evidenceId));
await onEvidenceUpdated(evidenceId); // Invalidate cache
```

---

## 🚀 High Priority

### 4. API Response Caching Middleware
**Impact:** Reduce DB load, faster responses
**Effort:** 2 hours

**SvelteKit Hook:**
```typescript
// src/hooks.server.ts
import { cacheableRoutes } from '$lib/server/cache-config';

export async function handleFetch({ event, request, fetch }) {
  const url = new URL(request.url);
  const cacheKey = `api:${url.pathname}:${url.search}`;

  // Check if route is cacheable
  if (!cacheableRoutes.includes(url.pathname)) {
    return fetch(request);
  }

  // Try cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    return new Response(cached, {
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' }
    });
  }

  // Fetch and cache
  const response = await fetch(request);
  const clone = response.clone();
  const body = await clone.text();

  await redis.set(cacheKey, body, 'EX', getTTL(cacheKey));

  return new Response(body, {
    headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' }
  });
}
```

**Cacheable Routes Config:**
```typescript
export const cacheableRoutes = [
  '/api/dashboard/stats',
  '/api/cases',
  '/api/evidence',
  '/api/reports',
  '/api/citations',
  // ... but NOT /api/auth, /api/upload, etc
];
```

---

### 5. Test Coverage Expansion
**Current:** 19 report tests (89% pass)
**Goal:** 100+ tests across all features
**Effort:** 8 hours

**Test Categories:**
```bash
scripts/tests/
  test-reports.mjs (existing - 19 tests)
  test-evidence.mjs (new - 25 tests)
  test-cases.mjs (new - 20 tests)
  test-citations.mjs (new - 15 tests)
  test-ai.mjs (new - 20 tests)
  test-auth.mjs (new - 10 tests)
```

**Evidence Test Suite:**
```javascript
// scripts/tests/test-evidence.mjs
const tests = [
  // Upload
  { name: 'POST /api/evidence/upload (PDF)', method: 'POST', file: 'sample.pdf' },
  { name: 'POST /api/evidence/upload (image)', method: 'POST', file: 'sample.jpg' },

  // Analysis
  { name: 'POST /api/evidence/analysis', method: 'POST' },
  { name: 'GET /api/evidence/realtime?jobId=xxx', method: 'GET' },

  // Search
  { name: 'POST /api/evidence/search (semantic)', method: 'POST' },
  { name: 'GET /api/evidence?caseId=xxx', method: 'GET' },

  // CRUD
  { name: 'GET /api/evidence/[id]', method: 'GET' },
  { name: 'PATCH /api/evidence/[id]', method: 'PATCH' },
  { name: 'DELETE /api/evidence/[id]', method: 'DELETE' },

  // Tagging
  { name: 'POST /api/evidence/[id]/tags', method: 'POST' },
  { name: 'DELETE /api/evidence/[id]/tags/[tag]', method: 'DELETE' },

  // Export
  { name: 'POST /api/evidence/export (ZIP)', method: 'POST' },
  { name: 'POST /api/evidence/export (CSV)', method: 'POST' },

  // Versioning
  { name: 'GET /api/evidence/[id]/versions', method: 'GET' },
  { name: 'POST /api/evidence/[id]/revert?version=2', method: 'POST' },

  // Audit
  { name: 'GET /api/evidence/[id]/audit-log', method: 'GET' },
];
```

---

### 6. Performance Monitoring
**Impact:** Identify bottlenecks
**Effort:** 3 hours

**Request Timing Middleware:**
```typescript
// src/hooks.server.ts
export async function handle({ event, resolve }) {
  const start = Date.now();
  const response = await resolve(event);
  const duration = Date.now() - start;

  // Log slow requests
  if (duration > 1000) {
    console.warn(`Slow request: ${event.url.pathname} took ${duration}ms`);
  }

  // Track in Redis (time-series)
  const key = `perf:${event.url.pathname}`;
  await redis.zadd(key, Date.now(), JSON.stringify({ duration, timestamp: Date.now() }));
  await redis.expire(key, 86400); // Keep 24 hours

  response.headers.set('X-Response-Time', `${duration}ms`);
  return response;
}
```

**Performance Dashboard:**
```typescript
// GET /api/analytics/performance
export const GET: RequestHandler = async () => {
  const routes = await redis.keys('perf:*');
  const stats = await Promise.all(routes.map(async (route) => {
    const data = await redis.zrange(route, 0, -1);
    const durations = data.map(d => JSON.parse(d).duration);

    return {
      route: route.replace('perf:', ''),
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      maxDuration: Math.max(...durations),
      minDuration: Math.min(...durations),
      count: durations.length
    };
  }));

  return json(stats);
};
```

---

## 📋 Medium Priority

### 7. Database Query Optimization
**Impact:** Faster page loads
**Effort:** 4 hours

**Add Missing Indexes:**
```sql
-- Frequently queried columns
CREATE INDEX IF NOT EXISTS idx_evidence_case_id_created ON evidence(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_case_id_status ON reports(case_id, status);
CREATE INDEX IF NOT EXISTS idx_citations_case_id ON citations(case_id);

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_evidence_title_trgm ON evidence USING gin(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cases_title_trgm ON cases USING gin(title gin_trgm_ops);

-- JSONB indexes
CREATE INDEX IF NOT EXISTS idx_evidence_metadata_gin ON evidence USING gin(metadata);
CREATE INDEX IF NOT EXISTS idx_reports_metadata_gin ON reports USING gin(metadata);
```

**Query Analysis:**
```bash
# Find slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 20;
```

---

### 8. Docker Health Checks
**File:** `docker-compose.yml`
**Impact:** Better container orchestration
**Effort:** 1 hour

**Add Health Checks:**
```yaml
services:
  phase66-postgres:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  phase66-redis:
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  phase66-qdrant:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/healthz"]
      interval: 15s
      timeout: 5s
      retries: 5
```

---

### 9. Error Tracking Enhancement
**Current:** phase72_error table exists
**Gap:** No centralized error aggregation UI
**Effort:** 3 hours

**Error Dashboard Component:**
```svelte
<!-- ErrorDashboard.svelte -->
<script>
  import { onMount } from 'svelte';

  let errors = $state<any[]>([]);
  let groupedErrors = $derived.by(() => {
    const groups: Record<string, any[]> = {};
    for (const err of errors) {
      const key = err.file_path || 'Unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(err);
    }
    return groups;
  });

  onMount(async () => {
    const res = await fetch('/api/errors/summary');
    errors = await res.json();
  });
</script>

<div class="error-dashboard">
  <h2>Error Summary</h2>

  {#each Object.entries(groupedErrors) as [file, fileErrors]}
    <div class="error-group">
      <h3>{file} ({fileErrors.length} errors)</h3>

      {#each fileErrors.slice(0, 5) as error}
        <div class="error-item">
          <code>{error.message}</code>
          <span class="timestamp">{new Date(error.timestamp).toLocaleString()}</span>
        </div>
      {/each}
    </div>
  {/each}
</div>
```

---

### 10. Backup & Recovery Strategy
**Impact:** Data protection
**Effort:** 2 hours

**Automated Backups:**
```bash
#!/bin/bash
# scripts/backup-postgres.sh

DATE=$(date +%Y-%m-%d)
BACKUP_DIR="/backups/postgres"

# Dump PostgreSQL
docker exec phase66-postgres pg_dump -U postgres deeds > "$BACKUP_DIR/deeds-$DATE.sql"

# Compress
gzip "$BACKUP_DIR/deeds-$DATE.sql"

# Keep last 30 days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete

# Upload to S3 (optional)
# aws s3 cp "$BACKUP_DIR/deeds-$DATE.sql.gz" s3://deeds-backups/
```

**Cron Job:**
```cron
0 2 * * * /path/to/backup-postgres.sh
```

**Recovery Script:**
```bash
#!/bin/bash
# scripts/restore-postgres.sh

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: ./restore-postgres.sh <backup-file.sql.gz>"
  exit 1
fi

gunzip -c "$BACKUP_FILE" | docker exec -i phase66-postgres psql -U postgres deeds
```

---

## Summary

**Total Items:** 10
**Effort:** 28.5 hours
**Priority Breakdown:**
- Critical: 3 items (4.5 hours) - Redis pool, TTL strategy, cache invalidation
- High: 3 items (13 hours) - API caching, test coverage, performance monitoring
- Medium: 4 items (11 hours) - Query optimization, health checks, error tracking, backups

**Redis Improvements:**
- Connection pooling
- TTL strategy
- Pattern-based invalidation
- API response caching

**Testing:**
- Expand from 19 → 100+ tests
- 5 new test suites (evidence, cases, citations, AI, auth)

**Monitoring:**
- Request timing middleware
- Performance dashboard
- Slow query detection

**Database:**
- 5+ missing indexes
- Query optimization
- Automated backups

**Files to Create:**
- `scripts/tests/test-evidence.mjs`
- `scripts/tests/test-cases.mjs`
- `scripts/tests/test-citations.mjs`
- `scripts/tests/test-ai.mjs`
- `scripts/backup-postgres.sh`
- `scripts/restore-postgres.sh`
- `src/lib/server/cache-invalidation.ts`
- `src/lib/server/cache-config.ts`

**Files to Modify:**
- `src/lib/server/redis.ts` (connection pooling)
- `src/hooks.server.ts` (caching + performance middleware)
- `docker-compose.yml` (health checks)
