# Phase 72 Performance Optimization – Design

**Feature:** Phase 72 GPU-Accelerated Error Vectorization (Performance Layer)
**Status:** Design
**Date:** December 2, 2025

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Phase 72 Optimized Pipeline                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Input: svelte-check output (raw or JSON)                      │
│    ↓                                                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. Go Error Parser (ripgrep + simdjson)                 │  │
│  │    - Parse svelte-check output                          │  │
│  │    - Extract: file, line, column, code, message        │  │
│  │    - Return: []Error (gRPC)                            │  │
│  │    - Latency: <100ms for 10k errors                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│    ↓                                                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 2. Redis Cache Check                                    │  │
│  │    - Key: hash(error_message)                           │  │
│  │    - Hit: return cached vector                          │  │
│  │    - Miss: proceed to vectorization                     │  │
│  │    - Latency: <1ms per lookup                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│    ↓                                                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 3. Python GPU Vectorizer (FastAPI service)              │  │
│  │    - Long-lived PyTorch model in GPU memory             │  │
│  │    - Batch encode error texts                           │  │
│  │    - Return: vectors (no model reload)                  │  │
│  │    - Latency: ~1.5s for 10k errors                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│    ↓                                                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 4. Redis Cache Store                                    │  │
│  │    - Store: error_message → vector                      │  │
│  │    - TTL: 24 hours                                      │  │
│  │    - Latency: <1ms per store                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│    ↓                                                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 5. Qdrant Clustering (nearest-neighbor search)           │  │
│  │    - Upload vectors to Qdrant                           │  │
│  │    - Query K nearest neighbors per error                │  │
│  │    - Build local clustering graph                       │  │
│  │    - Identify error clusters                            │  │
│  │    - Latency: <500ms for 10k errors                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│    ↓                                                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 6. AST Topology Graph (ts-morph)                         │  │
│  │    - Parse error locations                              │  │
│  │    - Build AST graph                                    │  │
│  │    - Link related errors                                │  │
│  │    - Store in Neo4j (optional)                          │  │
│  │    - Latency: <100ms per error (cached)                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│    ↓                                                            │
│  Output: Clusters + AST context (for Phase 73 fixes)           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. Go Error Parser Service

**File:** `go-services/phase72-error-parser/main.go`

```go
// gRPC service for error parsing
service ErrorParserService {
  rpc ParseSvelteCheckLog(ParseLogRequest) returns (ParseLogResponse);
  rpc SearchCodebase(CodeSearchRequest) returns (stream CodeSearchResult);
}

// Implementation:
// - Use ripgrep for pattern matching (concurrent, AVX2)
// - Use simdjson-go for JSON parsing (SIMD)
// - Return normalized Error objects
// - Expose HTTP gateway for Node.js clients
```

**Latency Target:** <100ms for 10k errors

**Key Functions:**
- `ParseSvelteCheckLog(raw_log string) → []Error`
- `SearchCodebase(pattern, root_dir, globs) → stream CodeSearchResult`
- `Health() → HealthStatus`

### 2. Python GPU Vectorizer Service

**File:** `python-services/phase72_vectorizer_service.py`

```python
# FastAPI service wrapping PyTorch model
@app.on_event("startup")
async def startup():
    # Load model ONCE at startup
    model = load_embedding_model().cuda()
    model.eval()

@app.post("/embed")
async def embed(req: EmbedRequest) -> EmbedResponse:
    # Batch encode without reloading model
    with torch.no_grad():
        vectors = model.encode(req.texts)
    return EmbedResponse(vectors=vectors.tolist())

@app.get("/health")
async def health() -> HealthStatus:
    return HealthStatus(status="healthy", model_loaded=True)
```

**Latency Target:** ~1.5s for 10k errors (no reload cost)

**Key Endpoints:**
- `POST /embed` – Batch encode error texts
- `GET /health` – Health check
- `POST /batch` – Async batch processing

### 3. Redis Cache Layer

**File:** `scripts/phase72-redis-cache.mjs`

```javascript
// Redis cache for error vectors
class ErrorVectorCache {
  async get(errorMessage) {
    const key = hash(errorMessage);
    return redis.get(key);
  }

  async set(errorMessage, vector) {
    const key = hash(errorMessage);
    await redis.setex(key, 86400, JSON.stringify(vector)); // 24h TTL
  }

  async stats() {
    return {
      keys: await redis.dbsize(),
      memory: await redis.info('memory')
    };
  }
}
```

**Latency Target:** <1ms per lookup/store

**Hit Rate Target:** >80% on repeated errors

### 4. Qdrant Clustering

**File:** `scripts/phase72-qdrant-clustering.mjs`

```javascript
// Qdrant-based clustering
class QdrantClusterer {
  async uploadVectors(errors, vectors) {
    // Upload to Qdrant collection
    // Returns point IDs
  }

  async findClusters(k = 5) {
    // For each error, find K nearest neighbors
    // Build clustering graph
    // Identify clusters (connected components)
  }

  async getClusters() {
    // Return: { cluster_id: [error_ids] }
  }
}
```

**Latency Target:** <500ms for 10k errors

**Output:** Cluster assignments for ACE

### 5. AST Topology Graph

**File:** `scripts/phase72-ast-topology.mjs`

```javascript
// AST graph for error context
class ASTTopology {
  async buildGraph(errors) {
    // For each error location:
    // - Parse with ts-morph
    // - Extract AST node
    // - Find related nodes (same scope, same type, etc.)
    // - Build graph
  }

  async getContext(errorId) {
    // Return: { error, ast_node, related_errors, suggested_fixes }
  }

  async storeInNeo4j() {
    // Optional: persist graph to Neo4j
  }
}
```

**Latency Target:** <100ms per error (cached)

**Output:** Error context for Phase 73 fixes

### 6. Unified Orchestrator

**File:** `scripts/phase72-optimized.mjs`

```javascript
// Orchestrate all components
async function phase72Optimized() {
  const startTime = Date.now();

  // 1. Parse errors (Go service)
  const errors = await goErrorParser.parse(svelteCheckOutput);
  log(`Parsed ${errors.length} errors in ${Date.now() - startTime}ms`);

  // 2. Check Redis cache
  const { cached, uncached } = await redisCache.checkBatch(errors);
  log(`Cache hit: ${cached.length}/${errors.length}`);

  // 3. Vectorize uncached errors (Python service)
  const vectors = await pythonVectorizer.embed(uncached.map(e => e.message));
  log(`Vectorized ${vectors.length} errors in ${Date.now() - startTime}ms`);

  // 4. Store in Redis
  await redisCache.storeBatch(uncached, vectors);

  // 5. Cluster with Qdrant
  const clusters = await qdrantClusterer.findClusters();
  log(`Found ${clusters.length} clusters in ${Date.now() - startTime}ms`);

  // 6. Build AST topology
  const topology = await astTopology.buildGraph(errors);
  log(`Built AST graph in ${Date.now() - startTime}ms`);

  // 7. Log and return
  const totalTime = Date.now() - startTime;
  log(`Phase 72 Optimized complete: ${totalTime}ms`);
  return { errors, clusters, topology, totalTime };
}
```

**Latency Target:** <5s for 10k errors (vs ~30-60s today)

## Data Flow

```
svelte-check output
    ↓
[Go Parser] → []Error (gRPC)
    ↓
[Redis Cache] → cached: []Vector, uncached: []Error
    ↓
[Python Vectorizer] → []Vector
    ↓
[Redis Store] → cache updated
    ↓
[Qdrant Upload] → point IDs
    ↓
[Qdrant Clustering] → []Cluster
    ↓
[AST Topology] → Graph
    ↓
Output: { errors, clusters, topology }
```

## Fallback Strategy

If any service is unavailable:

1. **Go Parser unavailable** → Fall back to Node regex parser
2. **Python Vectorizer unavailable** → Fall back to simple features
3. **Redis unavailable** → Skip caching (no error)
4. **Qdrant unavailable** → Use WebGPU SOM clustering
5. **AST Topology unavailable** → Skip context (no error)

**Result:** Pipeline always works, just slower

## Performance Targets

| Component | Latency | Notes |
|-----------|---------|-------|
| Go Parser | <100ms | ripgrep + simdjson |
| Redis Cache | <1ms | per lookup |
| Python Vectorizer | ~1.5s | no reload cost |
| Qdrant Clustering | <500ms | nearest-neighbor |
| AST Topology | <100ms | per error (cached) |
| **Total** | **<5s** | for 10k errors |

**vs. Current Phase 72:** ~30-60s → <5s (6-12x faster)

## Monitoring & Observability

- JSONL logging for all steps
- Metrics: latency, cache hit rate, cluster count, errors
- Health checks for all services
- Graceful degradation with fallbacks

## Testing Strategy

1. **Unit tests** for each component
2. **Integration tests** with mock services
3. **Performance tests** with 10k+ errors
4. **Fallback tests** (service unavailable scenarios)
5. **End-to-end tests** with real svelte-check output

## Deployment

1. Start Go parser service
2. Start Python vectorizer service
3. Start Redis (if caching enabled)
4. Start Qdrant (if clustering enabled)
5. Run orchestrator: `npm run phase72:optimized`

## Success Criteria

- [ ] Phase 72 latency: <5s for 10k errors
- [ ] Cache hit rate: >80%
- [ ] All services have health checks
- [ ] Graceful fallback works
- [ ] JSONL logging complete
- [ ] Documentation complete
- [ ] Tests passing
