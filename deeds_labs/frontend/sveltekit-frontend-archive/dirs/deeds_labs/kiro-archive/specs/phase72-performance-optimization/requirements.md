# Phase 72 Performance Optimization – Requirements

**Feature:** Phase 72 GPU-Accelerated Error Vectorization (Performance Layer)
**Status:** Specification
**Date:** December 2, 2025

## User Stories

### US-1: Fast Error Log Parsing with Go + ripgrep + SIMD
**As a** Phase 72 orchestrator
**I want to** parse svelte-check logs using Go + ripgrep + SIMD JSON
**So that** error extraction is 10-100x faster than Node regex

**Acceptance Criteria:**
- [ ] Go microservice exposes gRPC `ParseSvelteCheckLog(raw_log) → []Error`
- [ ] Uses ripgrep for pattern matching (concurrent, AVX2)
- [ ] Uses simdjson-go for JSON parsing (SIMD accelerated)
- [ ] Returns normalized Error objects (file, line, column, code, message)
- [ ] Latency: <100ms for 10k errors (vs ~1s in Node)
- [ ] Handles both raw svelte-check output and JSON format

### US-2: Long-Lived Python GPU Vectorizer Service
**As a** Phase 72 pipeline
**I want to** keep the PyTorch model in GPU memory across multiple calls
**So that** I avoid model reload overhead (currently ~500ms per run)

**Acceptance Criteria:**
- [ ] FastAPI service wraps phase72_gpu_vectorizer.py
- [ ] `/embed` endpoint accepts batch of error texts
- [ ] Returns vectors without reloading model
- [ ] Latency: ~1.5s for 10k errors (no reload cost)
- [ ] Handles concurrent requests (thread pool)
- [ ] Health check endpoint for monitoring

### US-3: Qdrant Integration for Error Clustering
**As a** Phase 72 clustering step
**I want to** use Qdrant for nearest-neighbor search and clustering
**So that** I avoid O(N²) distance computations

**Acceptance Criteria:**
- [ ] Node script uploads error vectors to Qdrant
- [ ] Queries Qdrant for K nearest neighbors per error
- [ ] Builds local clustering graph from neighborhoods
- [ ] Latency: <500ms for 10k errors (vs ~2s for full SOM)
- [ ] Identifies error clusters (TS2304, TS2339, etc.)
- [ ] Exports cluster assignments for ACE

### US-4: Redis Caching for Error Vectors
**As a** Phase 72 pipeline
**I want to** cache error vectors across runs
**So that** I don't re-embed identical errors

**Acceptance Criteria:**
- [ ] Redis stores error → vector mappings
- [ ] Key: hash(error_message), Value: vector
- [ ] Before embedding, check Redis cache
- [ ] Hit rate: >80% on repeated errors
- [ ] Latency: <1ms per cache lookup
- [ ] TTL: 24 hours per cached vector

### US-5: AST Topology Graph for Error Context
**As a** Phase 72 analysis step
**I want to** build an AST graph linking errors to code structure
**So that** fixes can be applied with full context

**Acceptance Criteria:**
- [ ] ts-morph parses each error location
- [ ] Builds graph: Error → AST Node → Related Nodes
- [ ] Stores in Neo4j or in-memory graph
- [ ] Enables "fix this error + related errors" patterns
- [ ] Latency: <100ms per error (cached)

### US-6: Unified Phase 72 Orchestrator
**As a** developer
**I want to** run Phase 72 with all optimizations enabled
**So that** I get fast, accurate error reduction

**Acceptance Criteria:**
- [ ] Single npm script: `npm run phase72:optimized`
- [ ] Orchestrates: Go parser → Python vectorizer → Qdrant clustering → Redis cache → AST graph
- [ ] Logs all steps to JSONL
- [ ] Reports: errors found, vectors cached, clusters identified, time per step
- [ ] Graceful fallback if any service is unavailable

## Acceptance Criteria (Overall)

- [ ] Phase 72 latency: <5s for 10k errors (vs ~30-60s today)
- [ ] Error extraction: <100ms (Go + ripgrep + SIMD)
- [ ] Vectorization: ~1.5s (long-lived service, no reload)
- [ ] Clustering: <500ms (Qdrant nearest-neighbor)
- [ ] Caching: >80% hit rate on repeated errors
- [ ] All services have health checks
- [ ] Graceful degradation if services unavailable
- [ ] Full JSONL logging for ACE analysis
- [ ] Documentation complete

## Non-Functional Requirements

- **Performance:** 10-100x faster than current Phase 72
- **Reliability:** Graceful fallback to TS/WASM if Go/Python services fail
- **Observability:** JSONL logging, metrics, health checks
- **Scalability:** Handle 100k+ errors without memory issues
- **Maintainability:** Clear separation of concerns (Go, Python, Node)

## Dependencies

- Go 1.21+ (ripgrep, simdjson-go)
- Python 3.10+ (FastAPI, PyTorch)
- Node 22+ (orchestrator)
- Qdrant (vector DB)
- Redis (cache)
- Neo4j (optional, AST graph)

## Out of Scope

- Building LibTorch N-API addon (already in progress)
- Rewriting ACE fix logic
- Changing Phase 73+ architecture
- Production deployment (this is optimization layer)
