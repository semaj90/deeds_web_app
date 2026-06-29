# cuVS Installation Research — Executive Summary

**Date**: June 28, 2026  
**Scope**: Evaluate cuVS as experimental GPU ANN backend for retrieval Layer 3  
**Environment**: Windows 10 WSL2 + RTX 3060 Ti 8GB + CUDA 12.1  
**Deliverables**: 3 research documents + implementation checklist

---

## Key Findings

### Installation Methods Ranked

| Rank | Method | Time | Complexity | Recommendation |
|------|--------|------|-----------|-----------------|
| 🥇 | **Docker gRPC** | 20–30 min | Medium | ✅ **PRIMARY** |
| 🥈 | Conda (mamba) | 5–10 min | Low | ⚠️ WSL2 friction |
| 🥉 | Source build | 78–90 min | High | ❌ Not recommended |

### CUDA 12.1 Compatibility

✅ **RAPIDS 24.12 (Dec 2024) officially supports CUDA 12.1**
- Pre-built wheels available for Conda
- Source build optimizations for SM 86 (Ampere, RTX 3060 Ti)
- Container images guaranteed compatible

### Memory Fit Analysis (8GB RTX 3060 Ti)

| Component | Memory | Percentage |
|-----------|--------|-----------|
| Ollama (Gemma4 IQ4_XS) | 5.3GB | 66% |
| cuVS IVF-PQ index (40K vectors) | 1.2GB | 15% |
| Inference headroom | 1.5GB | 19% |
| **Total** | **8.0GB** | **100%** |

**Verdict**: ✅ Fits tight but workable with IVF-PQ index type.

---

## Recommended Approach: Docker cuVS gRPC Service

### Why Docker?

1. **Speed**: 20–30 min (fastest after Conda, no WSL2 friction)
2. **Isolation**: Container lifecycle independent from SvelteKit dev server
3. **Reproducibility**: Same environment across machines
4. **Observability**: Port 50051 gRPC, easy to debug
5. **Fallback**: Node.js client gracefully degrades if service unavailable
6. **Optional**: Can disable without breaking retrieval (Qdrant fallback)

### Architecture

```
Query Vector (768-dim)
    ↓
Retrieval Orchestrator
    ├─ Layer 1: Redis cache (5ms if hit)
    ├─ Layer 2: Bifrost semantic cache (2–5s if hit)
    ├─ Layer 3a: cuVS gRPC (NEW, 50–100ms)  ← experimental
    ├─ Layer 3b: Qdrant ANN (200ms)
    └─ Layer 4: Postgres FTS (fallback)
```

### Performance Expected

| Operation | Latency | Throughput |
|-----------|---------|-----------|
| Query embedding | 50ms | - |
| cuVS IVF-PQ search (k=10) | 50–100ms | 100 QPS |
| Postgres join | 5–10ms | - |
| **Total** | **105–160ms** | **100 QPS** |

**vs. Qdrant alone**: 200ms → 160ms (25% improvement, non-blocking fallback)

---

## Implementation Path (45 min)

### 1. Create Protobuf & Docker Files (10 min)
- `protos/cuvs_service.proto` — gRPC interface
- `docker/cuvs-grpc/Dockerfile` — RAPIDS + Python server
- `docker/cuvs-grpc/src/cuvs_grpc_server.py` — gRPC implementation

### 2. Build Docker Image (5–10 min)
```bash
docker build -t rapids-cuvs-grpc:latest -f docker/cuvs-grpc/Dockerfile .
```

### 3. Add to docker-compose.yml (5 min)
```yaml
cuvs-grpc:
  build: { context: ., dockerfile: docker/cuvs-grpc/Dockerfile }
  ports: ["50051:50051"]
  deploy.resources.reservations.devices[0].count: 1
  depends_on: [legal-ai-postgres]
```

### 4. Create Node.js gRPC Bridge (5 min)
- `src/lib/server/retrieval/cuvs-grpc-bridge.ts`
- Handles proto loading, client connection, graceful fallback

### 5. Integrate into Retrieval Layer (5 min)
- Add cuVS Layer 3a to `retrieval-orchestrator.ts`
- Add fallback logic (cuVS down → Qdrant continues)

### 6. Test & Validate (5 min)
- Docker container startup check
- gRPC health via `grpcurl`
- Node.js client test
- Retrieval path integration test

---

## Alternatives Considered (Not Recommended)

| Alternative | Why Not |
|-----------|----------|
| **Faiss** | CPU-only binaries for Windows; slower on GPU than cuVS |
| **Milvus** | Overkill; adds complexity; Qdrant already in stack |
| **HNSWLIB** | Pure CPU, too slow for 40K vectors |
| **Pip wheels** | Pre-built CUDA 12.1 wheels not published to PyPI |

---

## Risk Mitigation

### Risk 1: GPU memory overload (8GB limit)
**Mitigation**: 
- Use IVF-PQ with int8 quantization (250MB, not 1.2GB)
- Monitor GPU with `nvidia-smi` during search
- Fallback to Qdrant if cuVS uses >2GB

### Risk 2: gRPC service crash
**Mitigation**: 
- `isCuVSHealthy()` returns false, falls back to Qdrant
- No retrieval blocking; Layer 3b (Qdrant) always available

### Risk 3: Docker build takes too long
**Mitigation**: 
- RAPIDS image pulls are cached after first build
- Subsequent `docker-compose up` restarts in <3 seconds

### Risk 4: Port 50051 collision
**Mitigation**: 
- Verify free beforehand: `netstat -an | grep 50051`
- Change EXPOSE if needed (edit Dockerfile)

---

## Success Metrics

✅ **Implementation complete when:**
1. Container running: `docker ps | grep cuvs-grpc` shows "Up"
2. gRPC health: `grpcurl -plaintext localhost:50051 list` works
3. Node.js client: `npm run cuvs:test` passes
4. Retrieval test: 100-query benchmark passes with fallback
5. Performance: p50 latency ≥15% better than Qdrant alone
6. Memory: RTX 3060 Ti shows <2GB cuVS overhead during search

---

## Next Steps

1. ✅ **Approval**: Review research findings (this document)
2. 📋 **Preparation**: Copy code snippets from detailed research doc
3. 🏗️ **Implementation**: Follow 45-min checklist (9 phases)
4. ✓ **Validation**: Run all success metrics
5. 🚀 **Merge**: Tag commit and merge to main

---

## Deliverable Files

| File | Purpose | Location |
|------|---------|----------|
| CUVS-INSTALLATION-WINDOWS-RESEARCH.md | Detailed research (3 methods, CUDA 12.1 compat, code snippets) | `docs/architecture/` |
| CUVS-DOCKER-IMPLEMENTATION-CHECKLIST.md | Step-by-step implementation guide (9 phases, 45 min) | `docs/architecture/` |
| CUVS-RESEARCH-SUMMARY.md | Executive summary (this file) | `docs/architecture/` |

---

## Questions?

**Clarifications on Path 1 (Conda)**:
- Fastest (5–10 min) but requires WSL2 environment variable setup
- Consider if you're frequently rebuilding conda environments
- Not recommended for production deployment

**Clarifications on Path 2 (Source)**:
- Only choose if you need custom CUDA kernels or local debugging
- 78–90 min build time justified only for research/iteration
- Build artifacts 15GB (check disk space first)

**Clarifications on Path 3 (Docker)**:
- Recommended: simplest Docker integration for Node.js
- gRPC service stateless (can scale to multiple containers later)
- Proto definitions forward-compatible with future cuVS versions

---

**Ready to implement?** Start with Phase 1 of the checklist.

**Questions before starting?** Review detailed research doc sections 1–3 for deeper dives.

**Time estimates too optimistic?** Add 50% buffer. Real build times vary by system load.

---

**End of Summary**
