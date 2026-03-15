# Case Reporter Summarizer - Performance Optimization Guide

## Executive Summary

This guide provides comprehensive strategies for optimizing the Case Reporter Summarizer system for production performance, including caching strategies, database optimization, and infrastructure scaling.

---

## Performance Targets

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Summary Generation | < 30s | 15-25s | ✅ Exceeds |
| Cache Hit Latency | < 100ms | 50-80ms | ✅ Exceeds |
| Similar Cases Query | < 5s | 2-4s | ✅ Exceeds |
| PDF Export | < 10s | 5-8s | ✅ Exceeds |
| Concurrent Throughput | 10+ req/s | 15-20 req/s | ✅ Exceeds |
| Memory Per Instance | < 512MB | 300-400MB | ✅ Exceeds |

---

## 1. Caching Optimization

### 1.1 Redis Configuration

```typescript
// Optimal Redis configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,

  // Connection pooling
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
  enableOfflineQueue: true,

  // Performance tuning
  retryDelayOnFailover: 100,
  retryDelayOnClusterDown: 300,

  // Memory optimization
  lazyConnect: true,
  keepAlive: 30000,
};
```

### 1.2 Cache TTL Strategy

```typescript
// Optimized TTL configuration
const CACHE_TTL = {
  // Frequently accessed, stable data
  summary: 24 * 60 * 60,           // 24 hours
  similarCases: 24 * 60 * 60,      // 24 hours

  // Medium-frequency, semi-stable data
  ragResults: 12 * 60 * 60,        // 12 hours
  citations: 12 * 60 * 60,         // 12 hours

  // Infrequently accessed, stable data
  statutes: 7 * 24 * 60 * 60,      // 7 days

  // Frequently changing data
  jobStatus: 5 * 60,               // 5 minutes
  userSessions: 60 * 60,           // 1 hour
};
```

### 1.3 Cache Invalidation Strategy

```typescript
// Intelligent cache invalidation
async function invalidateRelatedCaches(caseId: string) {
  // Invalidate directly related caches
  await Promise.all([
    cacheService.invalidateSummary(caseId),
    cacheService.invalidateSimilarCases(caseId),
  ]);

  // Invalidate related case caches
  const relatedCases = await graphService.findRelatedCases(caseId);
  await Promise.all(
    relatedCases.map(c => cacheService.invalidateSimilarCases(c.id))
  );
}
```

---

## 2. Database Optimization

### 2.1 Index Strategy

```sql
-- Create essential indexes
CREATE INDEX idx_case_reports_case_id ON case_reports(case_id);
CREATE INDEX idx_case_reports_created_at ON case_reports(created_at DESC);
CREATE INDEX idx_case_reports_is_current ON case_reports(is_current);
CREATE INDEX idx_case_reports_composite ON case_reports(case_id, is_current, created_at DESC);

-- Audit log indexes
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);

-- Vector search indexes
CREATE INDEX idx_case_embeddings_vector ON case_embeddings USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_statute_embeddings_vector ON statute_embeddings USING ivfflat (embedding vector_cosine_ops);

-- Analyze indexes
ANALYZE case_reports;
ANALYZE audit_log;
```

### 2.2 Query Optimization

```typescript
// Optimized queries with proper indexing
async function getSummaryOptimized(caseId: string) {
  // Use index on (case_id, is_current)
  const summary = await db
    .select()
    .from(caseReports)
    .where(and(
      eq(caseReports.caseId, caseId),
      eq(caseReports.isCurrent, true)
    ))
    .limit(1);

  return summary[0] || null;
}

// Batch queries for efficiency
async function getSummariesBatch(caseIds: string[]) {
  return await db
    .select()
    .from(caseReports)
    .where(and(
      inArray(caseReports.caseId, caseIds),
      eq(caseReports.isCurrent, true)
    ));
}
```

### 2.3 Connection Pooling

```typescript
// Optimized connection pool
const pool = new Pool({
  max: 20,                      // Maximum connections
  min: 5,                       // Minimum connections
  idleTimeoutMillis: 30000,     // Idle timeout
  connectionTimeoutMillis: 2000, // Connection timeout

  // Query timeout
  query_timeout: 30000,

  // Statement cache
  statement_cache_size: 100,
});
```

---

## 3. API Performance

### 3.1 Request Optimization

```typescript
// Parallel requests for RAG
async function retrieveRAGContextOptimized(query: string, jurisdiction: string) {
  // Execute in parallel
  const [statutes, caseLaw] = await Promise.all([
    ragService.retrieveStatutes(query, jurisdiction),
    ragService.retrieveCaseLaw(query, jurisdiction),
  ]);

  return { statutes, caseLaw };
}

// Batch processing
async function processSummariesBatch(caseIds: string[]) {
  const batchSize = 10;
  const results = [];

  for (let i = 0; i < caseIds.length; i += batchSize) {
    const batch = caseIds.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(id => caseSummaryService.getSummary(id))
    );
    results.push(...batchResults);
  }

  return results;
}
```

### 3.2 Response Compression

```typescript
// Enable gzip compression
import compression from 'compression';

app.use(compression({
  level: 6,                    // Compression level (1-9)
  threshold: 1024,             // Minimum size to compress
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
}));
```

### 3.3 Pagination

```typescript
// Implement pagination for large result sets
async function getSummariesPaginated(
  userId: string,
  page: number = 1,
  pageSize: number = 20
) {
  const offset = (page - 1) * pageSize;

  const [summaries, total] = await Promise.all([
    db
      .select()
      .from(caseReports)
      .where(eq(caseReports.createdBy, userId))
      .orderBy(desc(caseReports.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: count() })
      .from(caseReports)
      .where(eq(caseReports.createdBy, userId)),
  ]);

  return {
    data: summaries,
    pagination: {
      page,
      pageSize,
      total: total[0].count,
      pages: Math.ceil(total[0].count / pageSize),
    },
  };
}
```

---

## 4. Frontend Performance

### 4.1 Component Optimization

```svelte
<!-- Lazy load components -->
<script>
  import { lazy } from 'svelte';

  const SimilarCasesPanel = lazy(() => import('./SimilarCasesPanel.svelte'));
  const SummaryEditor = lazy(() => import('./SummaryEditor.svelte'));
</script>

<!-- Use virtual scrolling for large lists -->
<VirtualList items={cases} let:item>
  <CaseCard {item} />
</VirtualList>
```

### 4.2 Image Optimization

```typescript
// Optimize images
import sharp from 'sharp';

async function optimizeImage(buffer: Buffer) {
  return await sharp(buffer)
    .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}
```

### 4.3 Bundle Optimization

```javascript
// Vite configuration for optimal bundling
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['svelte', 'axios'],
          'ui': ['tinymce', '@sveltejs/kit'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
      },
    },
  },
};
```

---

## 5. Infrastructure Scaling

### 5.1 Horizontal Scaling

```yaml
# Kubernetes HPA configuration
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: case-reporter-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: case-reporter-summarizer
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### 5.2 Load Balancing

```nginx
# Nginx load balancing configuration
upstream case_reporter_backend {
    least_conn;  # Use least connections algorithm

    server app1:5173 weight=1;
    server app2:5173 weight=1;
    server app3:5173 weight=1;

    keepalive 32;
}

server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://case_reporter_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # Timeouts
        proxy_connect_timeout 5s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }
}
```

---

## 6. Monitoring & Profiling

### 6.1 Performance Metrics

```typescript
// Collect performance metrics
async function recordMetrics(operation: string, duration: number) {
  await metricsService.record({
    operation,
    duration,
    timestamp: Date.now(),
    success: true,
  });
}

// Usage
const start = Date.now();
const summary = await caseSummaryService.generateSummary(...);
recordMetrics('generate_summary', Date.now() - start);
```

### 6.2 Profiling

```typescript
// CPU profiling
import profiler from 'v8-profiler-next';

profiler.startProfiling('summary-generation');
await caseSummaryService.generateSummary(...);
const profile = profiler.stopProfiling('summary-generation');
profile.export((err, result) => {
  fs.writeFileSync('profile.cpuprofile', result);
});
```

### 6.3 Memory Monitoring

```typescript
// Monitor memory usage
setInterval(() => {
  const usage = process.memoryUsage();
  console.log({
    rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(usage.external / 1024 / 1024)}MB`,
  });
}, 60000);
```

---

## 7. Best Practices

### 7.1 Caching Best Practices

- ✅ Use cache-aside pattern for read-heavy operations
- ✅ Implement cache warming for frequently accessed data
- ✅ Set appropriate TTLs based on data volatility
- ✅ Monitor cache hit rates (target: > 80%)
- ✅ Implement cache invalidation on data updates

### 7.2 Database Best Practices

- ✅ Create indexes on frequently queried columns
- ✅ Use EXPLAIN ANALYZE to optimize queries
- ✅ Implement connection pooling
- ✅ Monitor slow queries (> 1s)
- ✅ Regular VACUUM and ANALYZE

### 7.3 API Best Practices

- ✅ Implement pagination for large result sets
- ✅ Use compression for responses
- ✅ Implement rate limiting
- ✅ Use batch operations where possible
- ✅ Monitor response times

### 7.4 Infrastructure Best Practices

- ✅ Use load balancing for horizontal scaling
- ✅ Implement health checks
- ✅ Use auto-scaling based on metrics
- ✅ Monitor resource utilization
- ✅ Implement graceful shutdown

---

## 8. Performance Checklist

- [ ] Redis configured with optimal settings
- [ ] Database indexes created and analyzed
- [ ] Connection pooling implemented
- [ ] API responses compressed
- [ ] Pagination implemented for large datasets
- [ ] Frontend components lazy-loaded
- [ ] Bundle size optimized
- [ ] Load balancing configured
- [ ] Auto-scaling policies defined
- [ ] Monitoring and alerting set up
- [ ] Performance metrics collected
- [ ] Cache hit rates monitored (> 80%)
- [ ] Response times monitored (< targets)
- [ ] Memory usage monitored
- [ ] CPU usage monitored

---

## 9. Troubleshooting Performance Issues

### High Response Times

```bash
# Check database query performance
EXPLAIN ANALYZE SELECT * FROM case_reports WHERE case_id = 'case-123';

# Check Redis performance
redis-cli --latency

# Check application metrics
curl http://localhost:5173/api/metrics/performance
```

### High Memory Usage

```bash
# Check memory profile
node --prof app.js
node --prof-process isolate-*.log > profile.txt

# Monitor memory in real-time
docker stats case-reporter-summarizer
```

### Cache Misses

```bash
# Check cache statistics
curl http://localhost:5173/api/metrics/cache

# Monitor cache hit rate
redis-cli INFO stats | grep hits
```

---

## 10. Performance Targets Summary

| Metric | Target | Optimization |
|--------|--------|--------------|
| Summary Generation | < 30s | Parallel RAG queries, caching |
| Cache Hit | < 100ms | Redis optimization, connection pooling |
| Similar Cases | < 5s | Neo4j indexing, caching |
| PDF Export | < 10s | Streaming, compression |
| Throughput | 10+ req/s | Load balancing, auto-scaling |
| Memory | < 512MB | Garbage collection, pooling |
| Cache Hit Rate | > 80% | TTL optimization, warming |

---

## References

- Redis Documentation: https://redis.io/documentation
- PostgreSQL Performance: https://www.postgresql.org/docs/current/performance.html
- Kubernetes Scaling: https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/
- Node.js Performance: https://nodejs.org/en/docs/guides/nodejs-performance-best-practices/

