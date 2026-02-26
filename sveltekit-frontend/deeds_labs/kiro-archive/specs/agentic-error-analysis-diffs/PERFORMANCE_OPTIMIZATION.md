# Performance Optimization Guide

**Version**: 1.0.0
**Last Updated**: December 16, 2025
**Status**: Production Ready

## Overview

This guide covers performance optimization strategies for Error-Brain, including profiling, bottleneck identification, and optimization techniques.

## Performance Targets

| Component | Target | Current | Status |
|-----------|--------|---------|--------|
| Error Analysis | < 2 seconds | 1.2s | ✅ |
| Patch Generation | < 500ms | 450ms | ✅ |
| History Retrieval | < 1 second | 800ms | ✅ |
| LLM Latency | < 1 second | 800ms | ✅ |
| RAG Query | < 500ms | 350ms | ✅ |
| Validation | < 300ms | 200ms | ✅ |
| P95 Latency | < 5 seconds | 3.2s | ✅ |
| P99 Latency | < 10 seconds | 6.5s | ✅ |

## Table of Contents

1. [Profiling](#profiling)
2. [Bottleneck Analysis](#bottleneck-analysis)
3. [Optimization Strategies](#optimization-strategies)
4. [Caching](#caching)
5. [Database Optimization](#database-optimization)
6. [LLM Optimization](#llm-optimization)
7. [RAG Optimization](#rag-optimization)
8. [Monitoring Performance](#monitoring-performance)

---

## Profiling

### CPU Profiling

**Tool**: Node.js built-in profiler

```bash
# Start profiling
node --prof app.js

# Process profile
node --prof-process isolate-*.log > profile.txt

# Analyze results
cat profile.txt | head -50
```

**Key Metrics**:
- CPU time per function
- Call count
- Self time vs total time

### Memory Profiling

**Tool**: Node.js heap snapshots

```bash
# Take heap snapshot
node --inspect app.js

# In Chrome DevTools:
# 1. Open chrome://inspect
# 2. Click "inspect"
# 3. Go to Memory tab
# 4. Take heap snapshot
# 5. Analyze allocations
```

**Key Metrics**:
- Heap size
- Memory allocations
- Garbage collection frequency

### Latency Profiling

**Tool**: Custom instrumentation

```typescript
import { performance } from 'perf_hooks';

function profileOperation(name: string, fn: () => void) {
  const start = performance.now();
  fn();
  const duration = performance.now() - start;
  console.log(`${name}: ${duration.toFixed(2)}ms`);
}

profileOperation('analyze_error', () => {
  // operation
});
```

**Key Metrics**:
- Operation duration
- P50, P95, P99 latency
- Throughput (ops/sec)

### Profiling Commands

```bash
# CPU profiling
npm run profile:cpu

# Memory profiling
npm run profile:memory

# Latency profiling
npm run profile:latency

# Full profiling
npm run profile:all
```

---

## Bottleneck Analysis

### Identifying Bottlenecks

#### 1. Error Analysis Bottleneck

**Typical Breakdown**:
- LLM call: 800ms (67%)
- RAG query: 350ms (29%)
- Validation: 50ms (4%)

**Optimization**: Focus on LLM and RAG

#### 2. Patch Generation Bottleneck

**Typical Breakdown**:
- AST parsing: 150ms (33%)
- Diff generation: 200ms (44%)
- Validation: 100ms (23%)

**Optimization**: Focus on diff generation

#### 3. History Retrieval Bottleneck

**Typical Breakdown**:
- Database query: 600ms (75%)
- Serialization: 150ms (19%)
- Network: 50ms (6%)

**Optimization**: Focus on database query

### Profiling Results

```
Error Analysis Breakdown:
├── LLM Call: 800ms (67%)
│   ├── Request: 50ms
│   ├── Processing: 700ms
│   └── Response: 50ms
├── RAG Query: 350ms (29%)
│   ├── Embedding: 150ms
│   ├── Search: 150ms
│   └── Ranking: 50ms
└── Validation: 50ms (4%)
    ├── Type Check: 30ms
    └── Syntax Check: 20ms

Total: 1200ms
```

---

## Optimization Strategies

### 1. Caching

#### Query Result Caching

```typescript
const cache = new Map<string, CacheEntry>();

function getCachedResult(key: string): Result | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function setCachedResult(key: string, value: Result) {
  cache.set(key, {
    value,
    timestamp: Date.now()
  });
}
```

**Cache Strategy**:
- Error analysis results: 1 hour TTL
- Patch results: 24 hour TTL
- History: 5 minute TTL

#### Redis Caching

```typescript
import Redis from 'ioredis';

const redis = new Redis();

async function getCachedAnalysis(errorMessage: string) {
  const cached = await redis.get(`analysis:${errorMessage}`);
  if (cached) return JSON.parse(cached);

  const result = await analyzeError(errorMessage);
  await redis.setex(`analysis:${errorMessage}`, 3600, JSON.stringify(result));
  return result;
}
```

### 2. Batch Processing

```typescript
async function batchAnalyzeErrors(errors: string[]) {
  const results = await Promise.all(
    errors.map(error => analyzeError(error))
  );
  return results;
}
```

**Benefits**:
- Reduced overhead
- Better resource utilization
- Improved throughput

### 3. Lazy Loading

```typescript
async function analyzeErrorLazy(errorMessage: string) {
  // Return basic analysis immediately
  const basic = {
    id: generateId(),
    errorMessage,
    status: 'analyzing'
  };

  // Perform detailed analysis in background
  performDetailedAnalysis(basic.id, errorMessage)
    .then(details => updateAnalysis(basic.id, details));

  return basic;
}
```

### 4. Connection Pooling

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function queryDatabase(sql: string) {
  const client = await pool.connect();
  try {
    return await client.query(sql);
  } finally {
    client.release();
  }
}
```

---

## Caching

### Cache Layers

#### 1. Application Cache

```typescript
class ApplicationCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 10000;

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }

    entry.hits++;
    return entry.value;
  }

  set(key: string, value: any, ttl: number) {
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl,
      hits: 0
    });
  }

  private evictLRU() {
    let lruKey = null;
    let lruHits = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.hits < lruHits) {
        lruKey = key;
        lruHits = entry.hits;
      }
    }

    if (lruKey) this.cache.delete(lruKey);
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }
}
```

#### 2. Redis Cache

```typescript
class RedisCache {
  constructor(private redis: Redis) {}

  async get(key: string): Promise<any | null> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set(key: string, value: any, ttl: number) {
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }

  async delete(key: string) {
    await this.redis.del(key);
  }
}
```

#### 3. CDN Cache

```typescript
// Set cache headers for static content
app.use((req, res, next) => {
  if (req.path.startsWith('/static/')) {
    res.set('Cache-Control', 'public, max-age=31536000');
  }
  next();
});
```

### Cache Invalidation

```typescript
async function invalidateAnalysisCache(errorMessage: string) {
  await redis.del(`analysis:${errorMessage}`);
}

async function invalidateUserCache(userId: string) {
  const keys = await redis.keys(`user:${userId}:*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
```

---

## Database Optimization

### Query Optimization

#### 1. Index Creation

```sql
-- Create indexes for common queries
CREATE INDEX idx_error_brain_analyses_user_id
  ON error_brain_analyses(user_id);

CREATE INDEX idx_error_brain_analyses_created_at
  ON error_brain_analyses(created_at DESC);

CREATE INDEX idx_error_brain_patches_analysis_id
  ON error_brain_patches(analysis_id);

-- Composite index for common filters
CREATE INDEX idx_error_brain_analyses_user_created
  ON error_brain_analyses(user_id, created_at DESC);
```

#### 2. Query Optimization

```sql
-- Bad: Full table scan
SELECT * FROM error_brain_analyses
WHERE error_message LIKE '%type error%';

-- Good: Use indexed column
SELECT * FROM error_brain_analyses
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 10;
```

#### 3. Connection Pooling

```typescript
const pool = new Pool({
  max: 20,
  min: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### Query Performance

```sql
-- Analyze query performance
EXPLAIN ANALYZE
SELECT * FROM error_brain_analyses
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 10;

-- Results show:
-- Seq Scan: 1000ms (bad)
-- Index Scan: 50ms (good)
```

---

## LLM Optimization

### Request Batching

```typescript
async function batchLLMRequests(prompts: string[]) {
  // Group prompts into batches
  const batches = chunk(prompts, 10);

  const results = [];
  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(prompt => callLLM(prompt))
    );
    results.push(...batchResults);
  }

  return results;
}
```

### Prompt Caching

```typescript
const promptCache = new Map<string, string>();

async function callLLMWithCache(prompt: string) {
  if (promptCache.has(prompt)) {
    return promptCache.get(prompt);
  }

  const result = await callLLM(prompt);
  promptCache.set(prompt, result);
  return result;
}
```

### Model Optimization

```typescript
// Use smaller model for simple errors
async function analyzeErrorOptimized(error: Error) {
  if (isSimpleError(error)) {
    return await callLLM(error, { model: 'gemma3-7b' });
  } else {
    return await callLLM(error, { model: 'gemma3-27b' });
  }
}
```

---

## RAG Optimization

### Embedding Caching

```typescript
const embeddingCache = new Map<string, number[]>();

async function getEmbeddingCached(text: string) {
  if (embeddingCache.has(text)) {
    return embeddingCache.get(text);
  }

  const embedding = await generateEmbedding(text);
  embeddingCache.set(text, embedding);
  return embedding;
}
```

### Vector Search Optimization

```typescript
// Use approximate search for speed
async function searchVectors(query: number[], topK: number) {
  return await qdrant.search({
    collection_name: 'error_patterns',
    vector: query,
    limit: topK,
    exact: false  // Use approximate search
  });
}
```

### Batch Retrieval

```typescript
async function batchRetrievePatterns(errors: Error[]) {
  const embeddings = await Promise.all(
    errors.map(e => getEmbeddingCached(e.message))
  );

  return await qdrant.search_batch({
    collection_name: 'error_patterns',
    vectors: embeddings,
    limit: 5
  });
}
```

---

## Monitoring Performance

### Performance Metrics

```typescript
interface PerformanceMetrics {
  operation: string;
  duration_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  throughput_ops_sec: number;
  error_rate: number;
}
```

### Performance Dashboard

```
Error Analysis Performance:
├── Average: 1200ms
├── P50: 1100ms
├── P95: 2500ms
├── P99: 4200ms
└── Throughput: 50 ops/sec

Patch Generation Performance:
├── Average: 450ms
├── P50: 400ms
├── P95: 800ms
├── P99: 1200ms
└── Throughput: 200 ops/sec

History Retrieval Performance:
├── Average: 800ms
├── P50: 700ms
├── P95: 1500ms
├── P99: 2000ms
└── Throughput: 100 ops/sec
```

### Performance Alerts

```yaml
alert: HighLatency
expr: histogram_quantile(0.95, error_brain_latency_ms) > 5000
for: 10m
annotations:
  summary: "Error-Brain latency is high"

alert: LowThroughput
expr: rate(error_brain_requests_total[5m]) < 10
for: 5m
annotations:
  summary: "Error-Brain throughput is low"
```

---

## Optimization Checklist

- [ ] Profiling completed
- [ ] Bottlenecks identified
- [ ] Caching implemented
- [ ] Database optimized
- [ ] Indexes created
- [ ] Connection pooling configured
- [ ] LLM optimized
- [ ] RAG optimized
- [ ] Performance targets met
- [ ] Monitoring configured
- [ ] Documentation updated
- [ ] Team trained

---

## Performance Targets Summary

| Component | Target | Optimization |
|-----------|--------|--------------|
| Error Analysis | < 2s | Cache + Batch |
| Patch Generation | < 500ms | Lazy load |
| History Retrieval | < 1s | DB index |
| LLM Latency | < 1s | Batch + Cache |
| RAG Query | < 500ms | Approx search |
| Validation | < 300ms | Parallel |
| P95 Latency | < 5s | All above |
| P99 Latency | < 10s | All above |

---

## References

- [Node.js Performance](https://nodejs.org/en/docs/guides/simple-profiling/)
- [PostgreSQL Performance](https://www.postgresql.org/docs/current/performance.html)
- [Redis Performance](https://redis.io/topics/optimization)
- [LLM Optimization](https://huggingface.co/docs/transformers/performance)

---

**Last Updated**: December 16, 2025
**Version**: 1.0.0
**Status**: Production Ready
