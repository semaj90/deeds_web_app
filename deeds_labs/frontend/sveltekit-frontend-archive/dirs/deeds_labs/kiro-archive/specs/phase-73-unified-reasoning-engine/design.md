# Phase 73: Unified Reasoning Engine - Design

## Overview

Phase 73 creates a unified reasoning engine that orchestrates CUDA clustering, semantic search, legal precedence analysis, and intelligent re-ranking. The architecture uses C++ gRPC for GPU operations, FastAPI for embeddings, Go for hybrid search, and SvelteKit for visualization.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SvelteKit UI Layer                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Search Results with Cluster Badges                       │   │
│  │ 🔖 Precedent | 💰 Restitution | ⚠️ Kidnapping          │   │
│  └──────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                    Node API Routes                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ /search → /cluster → /rerank → /results                 │   │
│  └──────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                    Go Hybrid Search Service                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ BM25 (40%) + Semantic (40%) + Cluster (20%)             │   │
│  │ Recursive Re-ranking with Cluster Affinity              │   │
│  └──────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                    FastAPI Python Bridge                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Embedding Generation + Citation Extraction              │   │
│  │ Redis Cache: embeddings, centroids, citations           │   │
│  │ gRPC Client: calls CUDA clustering service              │   │
│  └──────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                    C++ CUDA gRPC Service                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ ComputeCentroids (cuBLAS GEMM)                           │   │
│  │ TrainSOM (Self-Organizing Map)                          │   │
│  │ PredictCluster (Cosine Similarity)                      │   │
│  └──────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                    Data Layer                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐      │
│  │ Redis        │  │ Qdrant       │  │ PostgreSQL       │      │
│  │ (cache)      │  │ (vectors)    │  │ (metadata)       │      │
│  └──────────────┘  └──────────────┘  └──────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

## Component Specifications

### 1. C++ CUDA gRPC Service

**File**: `cpp-ast-exporter/cuda_cluster_service.cpp`

**Protocol Buffer Definition** (`cuda_cluster.proto`):
```protobuf
syntax = "proto3";

service ClusterEngine {
  rpc ComputeCentroids (EmbeddingBatch) returns (CentroidResponse);
  rpc TrainSOM (SOMRequest) returns (SOMResponse);
  rpc PredictCluster (EmbeddingVector) returns (ClusterLabel);
}

message EmbeddingVector {
  repeated float values = 1;
}

message EmbeddingBatch {
  repeated EmbeddingVector vectors = 1;
}

message SOMRequest {
  int32 grid_size = 1;
  repeated EmbeddingVector vectors = 2;
}

message SOMResponse {
  repeated int32 bmu_indices = 1;
}

message CentroidResponse {
  repeated EmbeddingVector centroids = 1;
}

message ClusterLabel {
  int32 label = 1;
}
```

**Implementation Details**:
- Use cuBLAS GEMM for matrix multiplication
- Use CUDA kernels for cosine similarity
- Use cuBLAS reduction for centroid computation
- Support batch processing for efficiency
- Implement graceful CPU fallback

**Performance Targets**:
- ComputeCentroids: <100ms for 1000 embeddings
- TrainSOM: <500ms for 10x10 grid
- PredictCluster: <10ms per embedding

### 2. FastAPI Embedding Bridge

**File**: `backend/cluster_bridge.py`

**Key Functions**:
```python
import redis
import grpc
from proto import cuda_cluster_pb2, cuda_cluster_pb2_grpc

cache = redis.Redis(host="redis", decode_responses=False)
channel = grpc.insecure_channel("cuda-cluster:50051")
cuda = cuda_cluster_pb2_grpc.ClusterEngineStub(channel)

async def get_cluster(embedding: List[float]) -> int:
    """Get cluster assignment with Redis caching"""
    key = f"cluster:{hash(str(embedding))}"

    if cached := cache.get(key):
        return int.from_bytes(cached)

    req = cuda_cluster_pb2.EmbeddingVector(values=embedding)
    res = cuda.PredictCluster(req)

    cache.set(key, res.label, ex=86400)  # 24h TTL
    return res.label

async def compute_centroids(embeddings: List[List[float]]) -> List[List[float]]:
    """Compute centroids using CUDA"""
    vectors = [cuda_cluster_pb2.EmbeddingVector(values=e) for e in embeddings]
    batch = cuda_cluster_pb2.EmbeddingBatch(vectors=vectors)

    res = cuda.ComputeCentroids(batch)
    return [list(c.values) for c in res.centroids]
```

**Features**:
- Redis caching with TTL
- Consistent hashing for keys
- Exponential backoff retry logic
- Error logging and monitoring
- Batch processing support

### 3. Go Hybrid Re-ranking Engine

**File**: `go-services/hybrid_reranker.go`

**Key Algorithm**:
```go
type RankingScore struct {
    BM25Score      float64
    SemanticScore  float64
    ClusterScore   float64
    FinalScore     float64
}

func (r *Reranker) ComputeScore(result SearchResult) RankingScore {
    bm25 := r.computeBM25(result)           // 40% weight
    semantic := r.computeSemantic(result)   // 40% weight
    cluster := r.computeCluster(result)     // 20% weight

    final := (bm25 * 0.4) + (semantic * 0.4) + (cluster * 0.2)

    return RankingScore{
        BM25Score:     bm25,
        SemanticScore: semantic,
        ClusterScore:  cluster,
        FinalScore:    final,
    }
}

func (r *Reranker) computeCluster(result SearchResult) float64 {
    cluster := r.pythonBridge.GetCluster(result.Embedding)
    affinity := r.clusterGraph.GetAffinity(cluster, result.CaseType)
    return affinity
}
```

**Features**:
- Weighted combination of scores
- Cluster affinity computation
- Recursive re-ranking
- Fallback handling
- Performance optimization

### 4. SvelteKit UI Cluster Badges

**File**: `sveltekit-frontend/src/lib/components/ClusterBadge.svelte`

**Implementation**:
```svelte
<script>
  export let cluster: string;

  const badgeMap = {
    'precedent_cluster': { icon: '🔖', label: 'Precedent', color: 'badge-primary' },
    'restitution_cluster': { icon: '💰', label: 'Restitution', color: 'badge-success' },
    'kidnapping_cluster': { icon: '⚠️', label: 'Kidnapping', color: 'badge-warning' },
    'forced_labor_cluster': { icon: '🚫', label: 'Forced Labor', color: 'badge-danger' },
  };

  $: badge = badgeMap[cluster] || { icon: '📋', label: 'Case', color: 'badge-info' };
</script>

<span class="badge {badge.color}">
  {badge.icon} {badge.label}
</span>

<style>
  .badge {
    padding: 0.5rem 1rem;
    border-radius: 0.25rem;
    font-weight: 600;
    display: inline-block;
  }
</style>
```

**Features**:
- Dynamic badge rendering
- Color-coded by cluster type
- Icon indicators
- Responsive design

### 5. Redis Caching Strategy

**Cache Keys**:
- `embedding:{hash}` → embedding vector (24h TTL)
- `centroid:{cluster_id}` → centroid vector (7d TTL)
- `cluster:{hash}` → cluster label (24h TTL)
- `citation:{doc_id}` → citation graph (7d TTL)

**Eviction Policy**: LRU (Least Recently Used)

**Memory Limits**: 8GB default, configurable

### 6. SIMD JSON Preprocessing

**File**: `backend/simd_json_parser.py`

**Implementation**:
```python
import simdjson

def parse_legal_document(json_data: str) -> Dict:
    """Parse legal document using SIMD JSON"""
    parser = simdjson.Parser()
    doc = parser.parse(json_data)

    return {
        'text': doc['content'],
        'metadata': doc['metadata'],
        'citations': extract_citations(doc['citations']),
        'precedents': doc.get('precedents', []),
    }
```

**Performance**:
- Gigabytes/second parsing speed
- SIMD acceleration for JSON parsing
- Fallback to standard parser if unavailable

## Data Models

### Embedding
```typescript
interface Embedding {
  id: string;
  vector: number[];
  documentId: string;
  timestamp: Date;
  cached: boolean;
}
```

### Cluster
```typescript
interface Cluster {
  id: string;
  label: string;
  centroid: number[];
  size: number;
  silhouetteScore: number;
  legalCategory: string;
}
```

### RankingScore
```typescript
interface RankingScore {
  bm25: number;
  semantic: number;
  cluster: number;
  final: number;
}
```

## Integration Flow

1. **User Search** → SvelteKit UI
2. **Query Processing** → Node API Routes
3. **Embedding Generation** → FastAPI (with Redis cache)
4. **CUDA Clustering** → gRPC Service (with Redis cache)
5. **Hybrid Re-ranking** → Go Service
6. **Result Display** → SvelteKit with Cluster Badges

## Performance Targets

| Component | Operation | Target | Notes |
|-----------|-----------|--------|-------|
| CUDA | ComputeCentroids | <100ms | 1000 embeddings |
| CUDA | TrainSOM | <500ms | 10x10 grid |
| CUDA | PredictCluster | <10ms | Per embedding |
| FastAPI | Embedding (cached) | <5ms | Redis hit |
| FastAPI | Embedding (uncached) | <100ms | CUDA call |
| Go | Re-ranking | <50ms | Per result |
| UI | Render | <200ms | With badges |

## Testing Strategy

### Unit Tests
- CUDA kernel correctness
- FastAPI caching logic
- Go re-ranking algorithm
- UI badge rendering

### Integration Tests
- End-to-end search pipeline
- CUDA → FastAPI → Go → UI
- Cache invalidation
- Error handling

### Performance Tests
- Clustering speed
- Cache hit rate
- Re-ranking latency
- UI responsiveness

## CMake Integration

### Build Configuration
- **CMake Version**: 3.25+
- **C++ Standard**: C++20
- **CUDA Standard**: 14
- **GPU Architecture**: sm_86 (Ampere RTX 3060 Ti)
- **Compiler**: MSVC with AVX2 + fast-math

### CMake Targets
```cmake
# Protocol Buffer generation
protobuf_generate_cpp(PROTO_SRCS PROTO_HDRS proto/cuda_cluster.proto)
grpc_generate_cpp(GRPC_SRCS GRPC_HDRS proto/cuda_cluster.proto)

# CUDA Clustering Library
add_library(cuda_clustering STATIC
    src/cuda_cluster_kernels.cu
    src/cuda_cluster_service.cpp
    ${PROTO_SRCS}
    ${GRPC_SRCS}
)

# gRPC Server
add_executable(cuda_cluster_server src/cuda_cluster_server.cpp)

# Benchmark Tool
add_executable(cuda_cluster_benchmark src/cuda_cluster_benchmark.cpp)

# Integration with existing targets
target_link_libraries(ast_graph_exporter PRIVATE cuda_clustering)
target_link_libraries(rag_lora_trainer PRIVATE cuda_clustering)
target_link_libraries(tensorrt_llm_integration PRIVATE cuda_clustering)
```

### Build Commands
```bash
# Configure
cmake -G "Visual Studio 17 2022" \
  -DCMAKE_CUDA_ARCHITECTURES=86 \
  -DCUDNN_ROOT="C:/Program Files/NVIDIA/CUDNN/v9.16" \
  -DCUTLASS_ROOT="C:/cutlass" \
  ..

# Build
cmake --build . --config Release --parallel 8

# Run gRPC Server
./bin/cuda_cluster_server.exe

# Run Benchmark
./bin/cuda_cluster_benchmark.exe
```

### Dependencies
- **gRPC**: For service framework
- **Protocol Buffers**: For message serialization
- **CUDA Toolkit 13.0**: For GPU computation
- **cuBLAS + cuBLASLt**: For matrix operations
- **cuDNN 9.16**: For neural network operations
- **CUTLASS**: For tensor operations (header-only)
- **LibTorch**: For PyTorch integration

## Deployment Architecture

### Docker Services
- `cuda-cluster` (C++ gRPC)
- `fastapi-bridge` (Python)
- `go-reranker` (Go)
- `redis` (Cache)
- `qdrant` (Vectors)
- `postgres` (Metadata)

### Resource Requirements
- GPU: NVIDIA RTX 3060 Ti or better
- Memory: 16GB+ RAM
- CPU: 8+ cores
- Storage: 50GB+ for vectors
- CUDA Toolkit: 13.0+
- cuDNN: 9.16+

## Monitoring and Observability

### Metrics
- Clustering latency
- Cache hit rate
- Re-ranking score distribution
- GPU utilization
- Memory usage

### Logging
- CUDA kernel execution
- gRPC call traces
- Cache operations
- Re-ranking decisions

### Dashboards
- Real-time clustering performance
- Cache statistics
- Re-ranking score distribution
- System health metrics
