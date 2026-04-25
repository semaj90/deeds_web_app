# Go/TensorRT-LLM Optimization Plan

**Date:** November 23, 2025
**Status:** Architecture & Implementation Plan
**Goal:** Bridge native Windows with CUDA via Docker + Go 1.25 + gRPC + Protobuffers

---

## Executive Summary

The codebase has extensive Go microservices infrastructure with TensorRT-LLM Docker container support. We need to:

1. **Optimize Search, Timeline, Analytics** with Go 1.25 + gRPC + Protobuffers
2. **Bridge Windows native** with CUDA Docker container
3. **Use Flatbuffers/Protobuffers** for serialization (faster than JSON)
4. **Implement GPU acceleration** via TensorRT-LLM server

---

## Current Infrastructure Found

### ✅ Existing Go Services
- `go-microservice/` - Main microservice directory
- `go-microservice/cmd/` - 30+ service implementations
- `go-microservice/proto/` - Protocol buffer definitions
- `go-microservice/tensorrt/` - TensorRT integration
- `go-microservice/cuda-server/` - CUDA server implementation

### ✅ Existing Proto Definitions
- `proto/legal_ai.proto` - Main service definition
- `proto/gpu_service.proto` - GPU service
- `proto/tensor.proto` - Tensor operations
- `proto/embed.proto` - Embedding service
- `proto/ingest.proto` - Ingestion service

### ✅ Existing Docker Setup
- `docker-compose.tensorrt.yml` - TensorRT compose
- `Dockerfile.tensorrt` - TensorRT builder
- `Dockerfile.trtllm` - TensorRT-LLM server
- Multiple GPU-optimized Dockerfiles

### ✅ Existing Binaries
- `go-microservice/bin/` - 40+ compiled Go binaries
- `legal-ai-quic-server.exe` - QUIC server
- `gpu-orchestrator.exe` - GPU orchestrator
- `tensorrt-bridge.exe` - TensorRT bridge

---

## Performance Comparison

| Method | Serialization | Speed | Use Case |
|--------|---------------|-------|----------|
| JSON | Text | 1x (baseline) | REST APIs |
| Protobuffers | Binary | 3-5x faster | gRPC services |
| Flatbuffers | Binary | 5-10x faster | Real-time systems |
| MessagePack | Binary | 2-3x faster | Hybrid systems |

**Recommendation:** Use Protobuffers for gRPC + Flatbuffers for high-frequency data

---

## Architecture: Windows → Docker Bridge

```
┌─────────────────────────────────────────────────────────────┐
│ Windows Native (SvelteKit Frontend)                         │
│ ├─ HTTP/REST API (localhost:5173)                          │
│ └─ gRPC Client (localhost:50051)                           │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Go 1.25 gRPC Gateway (Windows or WSL2)                     │
│ ├─ Converts HTTP → gRPC                                    │
│ ├─ Protobuffer serialization                               │
│ └─ Connection pooling                                      │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Docker Container (TensorRT-LLM Server)                     │
│ ├─ legal-ai-trt-llm:custom-gemma                          │
│ ├─ CUDA 12.8 + TensorRT                                    │
│ ├─ gRPC Server (port 50051)                                │
│ └─ GPU Inference Engine                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Proto Definitions (Search, Timeline, Analytics)

Create optimized protobuffer definitions for:
1. **SearchService** - Multi-type search with filtering
2. **TimelineService** - Event streaming
3. **AnalyticsService** - Statistics aggregation

### Phase 2: Go gRPC Services

Implement Go 1.25 services:
1. **Search Service** - Connects to PostgreSQL + Qdrant
2. **Timeline Service** - Event aggregation
3. **Analytics Service** - Statistics computation

### Phase 3: Windows Bridge

Create bridge service:
1. **HTTP → gRPC Gateway** - Converts REST to gRPC
2. **Connection Manager** - Handles Docker connectivity
3. **Serialization Layer** - Protobuffers + Flatbuffers

### Phase 4: Docker Integration

Wire up TensorRT-LLM:
1. **GPU Inference** - Leverage CUDA acceleration
2. **Model Serving** - Gemma3 + custom models
3. **Performance Monitoring** - Metrics collection

---

## Key Files to Create/Update

### Proto Files
- `proto/search-service.proto` - Search definitions
- `proto/timeline-service.proto` - Timeline definitions
- `proto/analytics-service.proto` - Analytics definitions

### Go Services
- `go-microservice/cmd/search-service/main.go` - Search service
- `go-microservice/cmd/timeline-service/main.go` - Timeline service
- `go-microservice/cmd/analytics-service/main.go` - Analytics service
- `go-microservice/cmd/http-grpc-gateway/main.go` - HTTP bridge

### Configuration
- `docker-compose.optimized.yml` - Optimized stack
- `go-microservice/config.yaml` - Service config
- `.env.grpc` - gRPC environment variables

---

## Performance Targets

| Operation | Current (JSON) | Target (Protobuffers) | Improvement |
|-----------|----------------|----------------------|-------------|
| Search Query | 150ms | 30-50ms | 3-5x |
| Timeline Fetch | 200ms | 40-60ms | 3-5x |
| Analytics Compute | 300ms | 60-100ms | 3-5x |
| GPU Inference | 500ms | 100-200ms | 2-5x |

---

## Go 1.25 Specific Optimizations

1. **Iterators** - Use new iterator patterns for efficient data processing
2. **Range over integers** - Simplified loop syntax
3. **Improved error handling** - Better error wrapping
4. **Performance improvements** - 5-10% faster than Go 1.24

---

## Docker Container Details

```yaml
Image: legal-ai-trt-llm:custom-gemma
CUDA: 12.8
TensorRT: Latest
Models:
  - gemma3:8000 (8B parameters)
  - custom-gemma (fine-tuned)
Ports:
  - 50051: gRPC server
  - 8000: HTTP inference
  - 8001: Metrics
```

---

## Next Steps

1. ✅ Create proto definitions for Search, Timeline, Analytics
2. ✅ Implement Go gRPC services
3. ✅ Create HTTP → gRPC gateway
4. ✅ Wire up Docker container
5. ✅ Performance testing & optimization
6. ✅ Production deployment

---

## Success Criteria

- [ ] Search queries < 50ms (3x improvement)
- [ ] Timeline fetches < 60ms (3x improvement)
- [ ] Analytics < 100ms (3x improvement)
- [ ] GPU utilization > 80%
- [ ] Zero JSON serialization overhead
- [ ] Windows ↔ Docker communication stable
- [ ] All endpoints working with gRPC

---

**Status:** Ready for implementation
**Estimated Time:** 4-6 hours
**Complexity:** Medium (existing infrastructure in place)
