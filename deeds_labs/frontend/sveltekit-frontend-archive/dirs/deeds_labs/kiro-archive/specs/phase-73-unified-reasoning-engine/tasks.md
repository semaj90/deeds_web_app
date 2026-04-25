# Phase 73: Unified Reasoning Engine - Implementation Tasks

## Overview

This task list breaks down the Unified Reasoning Engine into discrete, actionable coding steps. Each task builds on previous tasks to create a complete reasoning engine integrating CUDA clustering, semantic search, and intelligent re-ranking. Includes CMake integration with existing YoRHa Legal AI build system.

---

## Core Implementation Tasks (13 tasks)

- [ ] 1. Create Protocol Buffer Definitions and CMake Integration
  - Create `proto/cuda_cluster.proto` with ClusterEngine service
  - Define message types: EmbeddingVector, EmbeddingBatch, SOMRequest, SOMResponse, CentroidResponse, ClusterLabel
  - Add gRPC/Protobuf to CMakeLists.txt
  - Configure protobuf_generate_cpp and grpc_generate_cpp
  - Set up gRPC server infrastructure
  - Verify Protocol Buffer generation
  - _Requirements: 1.1_

- [ ] 2. Implement CUDA Clustering Kernels
  - Create `cuda_cluster_kernels.cu` with cosine similarity kernel
  - Implement K-means centroid computation using cuBLAS GEMM
  - Implement Self-Organizing Map (SOM) training kernel
  - Add CUDA error handling and memory management
  - _Requirements: 1.2, 1.3, 1.4_

- [ ] 3. Implement C++ gRPC Service
  - Create `cuda_cluster_service.cpp` with ClusterEngine implementation
  - Implement ComputeCentroids RPC using cuBLAS
  - Implement TrainSOM RPC using CUDA kernels
  - Implement PredictCluster RPC using cosine similarity
  - Add CPU fallback for non-GPU systems
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 4. Implement FastAPI Embedding Bridge
  - Create `backend/cluster_bridge.py` with gRPC client
  - Implement `get_cluster()` function with Redis caching
  - Implement `compute_centroids()` function
  - Add exponential backoff retry logic
  - Implement consistent hashing for cache keys
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 5. Implement Redis Caching Layer
  - Create `backend/redis_cache.py` with cache operations
  - Implement embedding cache with 24h TTL
  - Implement centroid cache with 7d TTL
  - Implement LRU eviction policy
  - Add cache statistics and monitoring
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 6. Implement Go Hybrid Re-ranking Engine
  - Create `go-services/hybrid_reranker.go` with Reranker struct
  - Implement `ComputeScore()` with weighted combination (BM25 40%, semantic 40%, cluster 20%)
  - Implement `computeBM25()` function
  - Implement `computeSemantic()` function
  - Implement `computeCluster()` function with cluster affinity
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 7. Implement Python FastAPI to Go Bridge
  - Create `backend/go_bridge.py` with HTTP client
  - Implement function to call Go re-ranking service
  - Add error handling and retry logic
  - Implement result caching
  - _Requirements: 3.1, 3.2_

- [ ] 8. Implement SvelteKit Cluster Badge Component
  - Create `sveltekit-frontend/src/lib/components/ClusterBadge.svelte`
  - Implement badge mapping for cluster types
  - Add icon and color coding
  - Implement responsive styling
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 9. Integrate Cluster Badges into Search Results
  - Modify search results component to display ClusterBadge
  - Pass cluster data from API to UI
  - Implement cluster badge styling
  - Add hover tooltips with cluster information
  - _Requirements: 4.1, 4.2_

- [ ] 10. Implement SIMD JSON Preprocessing
  - Create `backend/simd_json_parser.py` with SIMD JSON integration
  - Implement `parse_legal_document()` function
  - Add citation extraction
  - Implement fallback to standard JSON parser
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 11. Create Node API Routes for Unified Search
  - Create `/api/search/unified` endpoint
  - Implement pipeline: embedding → clustering → re-ranking → results
  - Add error handling and logging
  - Implement response formatting with cluster badges
  - _Requirements: 1.1, 2.1, 3.1, 4.1_

- [ ] 12. Integrate with Existing CMake Build System
  - Add gRPC and Protobuf find_package() calls
  - Create cuda_clustering static library target
  - Create cuda_cluster_server executable target
  - Create cuda_cluster_benchmark executable target
  - Link cuda_clustering to existing targets (ast_graph_exporter, rag_lora_trainer, tensorrt_llm_integration)
  - Configure CUDA architecture (sm_86) and optimization flags
  - Test CMake configuration and build
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 13. Implement Docker Compose for Unified Stack
  - Create `docker-compose.reasoning-engine.yml`
  - Configure CUDA cluster service
  - Configure FastAPI bridge
  - Configure Go re-ranker
  - Configure Redis, Qdrant, PostgreSQL
  - _Requirements: 1.1, 2.1, 3.1, 5.1_

---

## Optional Enhancement Tasks

- [ ]* 14. Implement Multi-GPU Scaling with NCCL
  - Create `cuda_cluster_nccl.cu` with NCCL integration
  - Implement GPU detection and initialization
  - Implement AllReduce for result aggregation
  - Add fallback to single-GPU mode
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ]* 15. Implement INT4/FP8 Quantization for Clustering
  - Create quantization kernels for embeddings
  - Implement dequantization for clustering
  - Add quantization error analysis
  - Benchmark quantized vs. full precision
  - _Requirements: 1.2, 1.3_

- [ ]* 16. Implement FlashAttention for Legal Paragraphs
  - Integrate FlashAttention into embedding pipeline
  - Implement attention-based clustering
  - Add performance benchmarks
  - _Requirements: 1.2, 1.3_

- [ ]* 17. Implement TensorRT Inference for Gemma
  - Create TensorRT engine for Gemma model
  - Implement fast summary generation
  - Add model optimization
  - _Requirements: 1.2_

- [ ]* 18. Write Unit Tests for CUDA Kernels
  - Create test suite for cosine similarity kernel
  - Create test suite for centroid computation
  - Create test suite for SOM training
  - Create test suite for cluster prediction
  - _Requirements: 1.2, 1.3, 1.4_

- [ ]* 19. Write Integration Tests for Reasoning Engine
  - Create end-to-end pipeline test
  - Create CUDA → FastAPI → Go → UI test
  - Create cache invalidation test
  - Create error handling test
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ]* 20. Write Performance Tests and Benchmarks
  - Create clustering performance benchmark
  - Create re-ranking latency test
  - Create cache hit rate analysis
  - Create GPU utilization profiling
  - _Requirements: 1.2, 3.1, 5.1_

- [ ]* 21. Create Monitoring and Observability Setup
  - Set up Prometheus metrics collection
  - Create Grafana dashboards
  - Implement distributed tracing
  - Create alerting rules
  - _Requirements: 8.1, 8.2_

---

## Task Dependencies

```
1. Protocol Buffers + CMake
   ├─ 2. CUDA Kernels
   │  └─ 3. C++ gRPC Service
   │     ├─ 4. FastAPI Bridge
   │     │  ├─ 5. Redis Cache
   │     │  └─ 10. SIMD JSON
   │     │     └─ 11. Node API Routes
   │     │        ├─ 6. Go Re-ranker
   │     │        │  └─ 7. FastAPI→Go Bridge
   │     │        ├─ 8. Cluster Badges
   │     │        └─ 9. Badge Integration
   │     │           ├─ 12. CMake Integration
   │     │           └─ 13. Docker Compose
   │     └─ 14-21. Optional Tasks
```

---

## Execution Notes

### Phase 1: Protocol Buffers & CMake (Task 1)
- Create proto/cuda_cluster.proto
- Add gRPC/Protobuf to CMakeLists.txt
- Configure Protocol Buffer generation
- Verify proto compilation
- Estimated time: 1 day

### Phase 2: Core CUDA & gRPC (Tasks 2-3)
- Focus on CUDA kernel correctness
- Ensure gRPC service stability
- Test with various batch sizes
- Estimated time: 3-4 days

### Phase 3: FastAPI & Caching (Tasks 4-5)
- Implement Redis caching
- Test cache hit rates
- Verify exponential backoff
- Estimated time: 2-3 days

### Phase 4: Go Re-ranking (Tasks 6-7)
- Implement hybrid scoring
- Test re-ranking quality
- Optimize performance
- Estimated time: 2-3 days

### Phase 5: UI Integration (Tasks 8-9)
- Create cluster badges
- Integrate with search results
- Test responsiveness
- Estimated time: 1-2 days

### Phase 6: API & CMake Integration (Tasks 10-12)
- Create unified search endpoint
- Integrate with existing CMake build
- Link to ast_graph_exporter, rag_lora_trainer, tensorrt_llm_integration
- Test full pipeline
- Estimated time: 2-3 days

### Phase 7: Docker & Deployment (Task 13)
- Set up Docker Compose
- Configure all services
- Test full stack
- Estimated time: 1-2 days

### Phase 8: Optional Enhancements (Tasks 14-21)
- Multi-GPU scaling
- Quantization
- Performance optimization
- Testing and monitoring
- Estimated time: 3-5 days

---

## Success Criteria

- [ ] Protocol Buffers compile without errors
- [ ] CMake configuration succeeds
- [ ] cuda_clustering library builds
- [ ] cuda_cluster_server executable runs
- [ ] CUDA kernels compute correctly
- [ ] gRPC service responds in <100ms
- [ ] FastAPI caching works with >80% hit rate
- [ ] Go re-ranking produces valid scores
- [ ] Cluster badges display correctly
- [ ] Full pipeline latency <500ms
- [ ] All tests pass
- [ ] Docker stack deploys successfully
- [ ] GPU utilization 70-90%
- [ ] No memory leaks
- [ ] Integration with existing targets successful

---

## Performance Targets

| Component | Operation | Target | Status |
|-----------|-----------|--------|--------|
| CUDA | ComputeCentroids | <100ms | - |
| CUDA | TrainSOM | <500ms | - |
| CUDA | PredictCluster | <10ms | - |
| FastAPI | Embedding (cached) | <5ms | - |
| FastAPI | Embedding (uncached) | <100ms | - |
| Go | Re-ranking | <50ms | - |
| UI | Render | <200ms | - |
| **Total** | **Full Pipeline** | **<500ms** | - |

---

## Notes

- Start with Task 1 to set up Protocol Buffers
- Each task builds on previous tasks
- Test incrementally as you implement
- Use the design document as reference
- Refer to requirements for acceptance criteria
- Monitor performance targets throughout implementation
- Optional tasks can be done in parallel after core tasks
