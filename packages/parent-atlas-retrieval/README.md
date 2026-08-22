# @deeds/parent-atlas-retrieval

GPU-accelerated retrieval pipeline for Parent Atlas: Bifrost semantic cache, TurboVec prefilter/reranking, LibTorch N-API GPU bridge, and Rust SIMD JSON parsing.

## Overview

6-stage GPU acceleration pipeline delivering 100× speedup on retrieval operations:

```
Bifrost L1 (Redis exact-match, 5ms)
  ↓
Bifrost L2 (Qdrant semantic, 2-5s)
  ↓
TurboVec Prefilter (SOM cluster routing, 50ms)
  ↓
TurboVec Reranking (4-signal GPU blend, 25ms for 1000 items)
  ↓
LibTorch GPU (batch similarity, 100× speedup)
  ↓
Bifrost L3 (TurboQuant/Ollama fallback, 25-30s)
```

## Installation

```bash
npm install @deeds/parent-atlas-retrieval
```

## Quick Start

### Semantic Search (Bifrost L1/L2 Cache)

```typescript
import { bifrostChat } from '@deeds/parent-atlas-retrieval';

const response = await bifrostChat(
  [{ role: 'user', content: 'authentication flow' }],
  'gemma4-rotorquant:latest',
  { temperature: 0.3, maxTokens: 200 }
);

console.log(response.content);        // LLM response
console.log(response.cacheHit);       // 'l1' | 'l2' | 'l3' | undefined
console.log(response.latencyMs);      // Actual latency
```

### Prefiltering (TurboVec Cluster Routing)

```typescript
import { turbovecPrefilter } from '@deeds/parent-atlas-retrieval';

const candidates = await turbovecPrefilter({
  vector: queryEmbedding,      // Float32Array (768-dim)
  topClusters: 5,              // Return top 5 SOM clusters
  timeout: 250,                // 250ms default
});

console.log(candidates.clusterIds);     // [5, 12, 3, 8, 1]
console.log(candidates.reduction);      // 0.95 (95% reduction)
```

### GPU Batch Similarity (LibTorch N-API)

```typescript
import { batchCosineSimilarity, isCudaAvailable } from '@deeds/parent-atlas-retrieval';

if (isCudaAvailable()) {
  const queryVec = new Float32Array(768);      // Query embedding
  const candidates = [/* Float32Array[] */];   // 1000+ candidates
  
  const scores = await batchCosineSimilarity(queryVec, candidates);
  console.log(scores);  // Float64Array with similarity scores
  // RTX 3060 Ti: 1000 comparisons in 25ms (100× vs CPU)
}
```

### Fast JSON Parsing (Rust SIMD)

```typescript
import { fastJsonParse, isSimdJsonAvailable } from '@deeds/parent-atlas-retrieval';

const largeJson = JSON.stringify({ /* 100KB+ object */ });

if (isSimdJsonAvailable()) {
  const parsed = fastJsonParse<MyType>(largeJson);
  // 2-5× faster for payloads >1KB
}
```

## API Reference

### Bifrost (L1/L2 Semantic Cache)

- **`bifrostChat(messages, model, options?)`** — Chat with semantic caching
  - L1 (Redis): Exact-match queries, 5ms baseline
  - L2 (Qdrant): Semantic similarity, 2-5s with prefilter
  - L3 (TurboQuant/Ollama): Cold inference fallback
  - Returns: `{ content, cacheHit?, latencyMs, trace? }`

- **`bifrostCacheManager`** — Direct cache control (advanced)
  - `get(key)`, `set(key, value, ttl)`, `invalidate(pattern)`

### TurboVec (Prefilter + Reranking)

- **`turbovecPrefilter(request)`** — SOM cluster routing
  - Input: Query vector + top-K clusters to return
  - Output: Cluster IDs + centroid scores + reduction %
  - Timeout: 250ms (configurable)
  - Reduction: 50-95% of candidate set

- **`turbovecRerank(request)`** — 4-signal blend reranking
  - Weights: semantic (0.45) + topology (0.30) + latent (0.15) + glyph (0.10)
  - GPU-accelerated via `batchCosineSimilarity` for semantic signal
  - Trace: Score deltas per signal for debugging

### GPU Operations (LibTorch N-API)

- **`batchCosineSimilarity(query, candidates, options?)`** — GPU batch similarity
  - Input: Query vector + array of candidate vectors
  - Output: Scores array (same length as candidates)
  - Speed: 100× vs CPU for batches >256 items
  - Fallback: Graceful CPU path if CUDA unavailable
  - Memory: Float32Array pooling for GC efficiency

- **`clusterEmbeddings(embeddings, k)`** — GPU K-means clustering

- **`attentionScoreGPU(query, candidates)`** — Attention-weighted scoring

- **`getCudaMemoryInfo()`** — Real-time VRAM usage + pressure

- **`isCudaAvailable()`** — Check GPU availability

### Rust SIMD JSON Parsing

- **`fastJsonParse<T>(jsonString)`** — Fast JSON parsing
  - 2-5× faster for payloads >1KB
  - Smart routing: V8 for <1KB (faster), simdjson for >1KB
  - LRU cache: 200-entry cache with 30s TTL
  - Fallback: Graceful degrade to V8 if addon unavailable

- **`isSimdJsonAvailable()`** — Check if addon is available

## Performance Benchmarks

| Operation | Latency | Speedup | Hardware |
|-----------|---------|---------|----------|
| L1 exact match | 5ms | 6,542× | — |
| L2 semantic + prefilter | 2-5s | 5-10× | — |
| Reranking 1000 items | 25ms | 100× | RTX 3060 Ti |
| JSON parsing 100KB | 2.4ms | 5× | — |
| Batch similarity 1000 vecs | 25ms | 100× | RTX 3060 Ti |

**Baseline**: CPU only (no caching, no GPU)  
**Hardware**: RTX 3060 Ti, 8GB VRAM, CUDA 12.1

## Configuration

### Environment Variables

```bash
# Bifrost L2 semantic cache
BIFROST_OPENAI_BASE_URL=http://127.0.0.1:3040/v1
BIFROST_CACHE_THRESHOLD=0.8                    # Similarity threshold (0.0-1.0)

# TurboVec sidecar
TURBOVEC_SIDECAR=http://127.0.0.1:8792
TURBOVEC_SIDECAR_GRPC_ENABLED=true

# Vector search
QDRANT_URL=http://127.0.0.1:6333
NEO4J_URI=neo4j://127.0.0.1:7687
COUCHDB_URL=http://127.0.0.1:5984

# GPU acceleration
CUDA_VISIBLE_DEVICES=0                         # GPU index (0 for first GPU)
```

### Required Services

| Service | Port | Purpose |
|---------|------|---------|
| Redis | 6379 | L1 exact-match cache |
| Bifrost | 3040 | L2 semantic cache |
| TurboVec | 8792 | Cluster prefilter |
| Qdrant | 6333 | Vector storage |
| Neo4j | 7687 | Topology mirroring |
| TurboQuant | 8090 | L3 fallback (optional) |
| Ollama | 11434 | L3 fallback (always available) |

## Testing

```bash
npm test
# Tests Bifrost caching, TurboVec routing, GPU operations, SIMD parsing
```

## Troubleshooting

### CUDA not available

```bash
# Check N-API binary
node -e "const addon = require('./native/tensorrt_bridge.node'); console.log('CUDA:', addon.isCudaAvailable());"

# Fallback to CPU (still works, just slower)
# No code changes needed — graceful fallback built in
```

### Bifrost L3 fallback fails

```bash
# Verify TurboQuant or Ollama running
curl http://127.0.0.1:8090/health    # TurboQuant
curl http://127.0.0.1:11434/api/tags # Ollama
```

### JSON parsing slow

```typescript
// Ensure addon is available
if (!isSimdJsonAvailable()) {
  console.warn('simdjson addon not available, using V8');
}

// Or use smaller payloads to avoid parsing overhead
```

## See Also

- [@deeds/parent-atlas-core](../parent-atlas-core/README.md) — Identity contract
- [@deeds/parent-atlas-opencode](../parent-atlas-opencode/README.md) — OpenCode CLI
- [docs/GPU-ACCELERATION-REVIEW-PARENT-ATLAS.md](../../docs/GPU-ACCELERATION-REVIEW-PARENT-ATLAS.md) — Technical deep dive
- [docs/GPU-ACCELERATION-WIRING-CHECKLIST.md](../../docs/GPU-ACCELERATION-WIRING-CHECKLIST.md) — Verification gates

## License

MIT
