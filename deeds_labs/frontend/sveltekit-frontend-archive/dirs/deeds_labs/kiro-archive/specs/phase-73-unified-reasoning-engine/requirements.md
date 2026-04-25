# Phase 73: Unified Reasoning Engine - Requirements

## Introduction

Phase 73 implements a unified reasoning engine that integrates CUDA clustering, semantic search, legal precedence analysis, and intelligent re-ranking into a single coherent system. The engine combines C++ CUDA kernels (gRPC), FastAPI embeddings, Go hybrid search, and SvelteKit UI to deliver production-grade legal document analysis with real-time cluster visualization and precedence badges.

## Glossary

- **CUDA Clustering**: GPU-accelerated K-means, SOM, and centroid computation
- **gRPC Service**: C++ microservice exposing CUDA operations via Protocol Buffers
- **Hybrid Re-ranking**: Weighted combination of BM25, semantic similarity, and cluster affinity
- **Cluster Badge**: Visual indicator of legal precedence (e.g., "precedent_cluster", "restitution_cluster")
- **Centroid**: Center point of a cluster in embedding space
- **SOM (Self-Organizing Map)**: Neural network for clustering and dimensionality reduction
- **Embedding**: Vector representation of legal text
- **SIMD JSON**: SIMD-accelerated JSON parsing for ultra-fast preprocessing
- **cuBLAS**: NVIDIA CUDA Basic Linear Algebra Subroutines
- **NCCL**: NVIDIA Collective Communications Library for multi-GPU

## Requirements

### Requirement 1: CUDA Clustering gRPC Service

**User Story**: As a system architect, I want a high-performance C++ gRPC service that exposes CUDA clustering operations, so that I can compute semantic clusters with zero Python/Node overhead.

#### Acceptance Criteria

1. WHEN the gRPC service starts, THE service SHALL expose ClusterEngine with ComputeCentroids, TrainSOM, and PredictCluster RPCs
2. WHEN ComputeCentroids is called with embeddings, THE service SHALL compute centroids using cuBLAS GEMM and return results in <100ms
3. WHEN TrainSOM is called with grid_size and embeddings, THE service SHALL train a Self-Organizing Map and return BMU indices
4. WHEN PredictCluster is called with an embedding, THE service SHALL predict cluster label using cosine similarity in <10ms
5. IF CUDA is unavailable, THEN THE service SHALL fall back to CPU computation with graceful degradation

### Requirement 2: FastAPI Embedding Bridge with Redis Caching

**User Story**: As a backend service, I want FastAPI to call CUDA clustering via gRPC and cache results in Redis, so that repeated queries are served instantly.

#### Acceptance Criteria

1. WHEN an embedding is received, THE FastAPI service SHALL check Redis cache for cluster assignment
2. WHEN cache miss occurs, THE service SHALL call CUDA gRPC service and store result in Redis with TTL
3. WHILE caching, THE service SHALL use consistent hashing for embedding keys
4. WHEN cache hit occurs, THE service SHALL return result in <5ms
5. IF gRPC call fails, THEN THE service SHALL retry with exponential backoff and log error

### Requirement 3: Go Hybrid Re-ranking Engine

**User Story**: As a search service, I want Go microservice to combine BM25, semantic similarity, and cluster affinity scores, so that results are ranked by legal relevance.

#### Acceptance Criteria

1. WHEN search results are retrieved, THE Go service SHALL compute BM25 score (40% weight)
2. WHEN semantic embeddings are available, THE service SHALL compute cosine similarity (40% weight)
3. WHEN cluster information is available, THE service SHALL compute cluster affinity (20% weight)
4. WHEN all scores are computed, THE service SHALL combine them into final ranking score
5. IF any score component fails, THEN THE service SHALL use fallback weights and continue

### Requirement 4: Cluster Badge Generation and Display

**User Story**: As a UI developer, I want cluster badges to display legal precedence categories, so that users can quickly identify case types.

#### Acceptance Criteria

1. WHEN search results are displayed, THE UI SHALL show cluster badge for each result
2. WHEN cluster label is "precedent_cluster", THE badge SHALL display "🔖 Precedent"
3. WHEN cluster label is "restitution_cluster", THE badge SHALL display "💰 Restitution"
4. WHEN cluster label is "kidnapping_cluster", THE badge SHALL display "⚠️ Kidnapping"
5. WHEN cluster label is "forced_labor_cluster", THE badge SHALL display "🚫 Forced Labor"

### Requirement 5: Redis Caching for Embeddings and Centroids

**User Story**: As a performance engineer, I want Redis to cache embeddings and centroids, so that repeated queries avoid expensive recomputation.

#### Acceptance Criteria

1. WHEN an embedding is computed, THE system SHALL store it in Redis with key "embedding:{hash}"
2. WHEN a centroid is computed, THE system SHALL store it in Redis with key "centroid:{cluster_id}"
3. WHILE caching, THE system SHALL use 24-hour TTL for embeddings and 7-day TTL for centroids
4. WHEN cache is full, THE system SHALL evict least-recently-used entries
5. IF Redis is unavailable, THEN THE system SHALL continue without caching

### Requirement 6: SIMD JSON Preprocessing Pipeline

**User Story**: As a data engineer, I want SIMD JSON to parse legal documents ultra-fast, so that preprocessing doesn't become a bottleneck.

#### Acceptance Criteria

1. WHEN a JSON document is received, THE system SHALL parse it using SIMD JSON at gigabytes/second speed
2. WHEN parsing completes, THE system SHALL extract text, metadata, and citations
3. WHILE parsing, THE system SHALL validate JSON structure and handle malformed input
4. WHEN parsing fails, THEN THE system SHALL log error and skip document
5. IF SIMD JSON is unavailable, THEN THE system SHALL fall back to standard JSON parser

### Requirement 7: Multi-GPU Scaling with NCCL (Optional)

**User Story**: As a system architect, I want NCCL to enable multi-GPU clustering, so that I can scale to larger datasets.

#### Acceptance Criteria

1. WHEN multiple GPUs are available, THE system SHALL detect and initialize NCCL
2. WHEN clustering large batches, THE system SHALL distribute computation across GPUs
3. WHILE distributing, THE system SHALL synchronize results using NCCL AllReduce
4. WHEN computation completes, THE system SHALL aggregate results from all GPUs
5. IF NCCL initialization fails, THEN THE system SHALL fall back to single-GPU mode

### Requirement 8: Integration Testing and Performance Validation

**User Story**: As a QA engineer, I want end-to-end tests that validate the entire reasoning engine, so that I can ensure correctness and performance.

#### Acceptance Criteria

1. WHEN integration tests run, THE system SHALL test CUDA → FastAPI → Go → UI pipeline
2. WHEN performance tests run, THE system SHALL measure latency for each component
3. WHILE testing, THE system SHALL validate cluster quality using silhouette scores
4. WHEN all tests pass, THE system SHALL report performance metrics and cluster statistics
5. IF any test fails, THEN THE system SHALL log detailed error information and halt

