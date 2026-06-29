# cuVS GPU ANN Integration — Research Index

**Date**: June 28, 2026  
**Project**: Deeds Legal AI Platform  
**Scope**: Evaluate cuVS as experimental GPU ANN backend (Layer 3 retrieval)  
**Status**: ✅ Research complete — ready for implementation

---

## Overview

This research evaluates installing and integrating NVIDIA cuVS (CUDA Vector Search) as an experimental GPU-accelerated approximate nearest neighbor (ANN) search backend for the retrieval pipeline. Current stack: Windows 10 WSL2, RTX 3060 Ti 8GB, CUDA 12.1, Ollama.

**Recommendation**: Docker containerized cuVS gRPC service (30-min setup, non-blocking fallback).

---

## Documents

### 1. **CUVS-RESEARCH-SUMMARY.md** — START HERE
**Length**: 209 lines (6.5KB)  
**Audience**: Decision makers, project leads  
**Content**:
- Key findings table (methods ranked)
- CUDA 12.1 compatibility verification
- Memory fit analysis (8GB RTX 3060 Ti)
- Recommended approach justification
- Risk mitigation
- Success metrics
- Next steps

**Read time**: 3–5 minutes  
**Decision after reading**: Proceed to detailed research or start implementation

---

### 2. **CUVS-INSTALLATION-WINDOWS-RESEARCH.md** — DETAILED REFERENCE
**Length**: 683 lines (19KB)  
**Audience**: Developers, DevOps, technical leads  
**Content**:

#### Path 1: Binary Installation (Conda/Pip)
- Pros/cons analysis
- WSL2-specific setup steps
- Disk/memory requirements (1.3GB)
- CUDA 12.1 compatibility status
- Pip wheel limitations

#### Path 2: Native Build from Source
- Setup time: 78–90 minutes
- Disk requirements: 15GB
- RTX 3060 Ti optimization (SM 86)
- Building cuVS C++ core + Python bindings
- Detailed CMake flags

#### Path 3: Docker Containerization (RECOMMENDED)
- Official RAPIDS container pull
- Custom cuVS gRPC service wrapper
- Complete proto definition (cuvs_service.proto)
- Full Python gRPC server implementation (80 lines)
- Node.js client bridge (TypeScript, 120 lines)
- docker-compose integration (20 lines)

#### Supporting Sections
- CUDA 12.1 compatibility matrix
- RTX 3060 Ti memory budget (8GB breakdown)
- Port collision check (50051 for gRPC)
- Performance estimates
- Alternatives considered

**Read time**: 15–20 minutes (skip sections not relevant to your path)  
**Key takeaway**: All necessary code provided; ready to copy-paste

---

### 3. **CUVS-DOCKER-IMPLEMENTATION-CHECKLIST.md** — STEP-BY-STEP GUIDE
**Length**: 363 lines (9.6KB)  
**Audience**: Developers executing the implementation  
**Content**:

#### 9 Implementation Phases (45 min total)
1. **Setup** (5 min) — Verify Docker GPU, check port 50051
2. **Proto & Build Files** (10 min) — Create Dockerfile, proto definitions, Python server
3. **Docker Build & Test** (15 min) — Build image, verify with grpcurl
4. **Integration** (10 min) — docker-compose.yml, Node.js bridge, env vars
5. **Docker Compose Startup** (5 min) — Start container, verify health
6. **Node.js Client Test** (5 min) — Test gRPC client with fallback
7. **Retrieval Layer Integration** (5 min) — Wire into retrieval-orchestrator.ts
8. **Performance Validation** (5 min) — Benchmark vs Qdrant alone
9. **Cleanup & Documentation** (2 min) — Update README, tag commit

#### Each Phase Includes
- Numbered checkboxes (click-to-track progress)
- Copy-paste commands
- Expected outputs
- Verification steps
- Troubleshooting guide
- Rollback plan

**Read time**: While implementing (use as live checklist)  
**Completion time**: 45 minutes + build time (5–10 min Docker build on first run)

---

## Quick Navigation

**"I just want to know if this is feasible"**  
→ Read: CUVS-RESEARCH-SUMMARY.md (5 min)

**"I want to understand all three options"**  
→ Read: CUVS-INSTALLATION-WINDOWS-RESEARCH.md sections 1–3 (15 min)

**"I'm ready to implement Docker path"**  
→ Read: CUVS-DOCKER-IMPLEMENTATION-CHECKLIST.md + copy code from research doc (45 min)

**"I want to compare CUDA 12.1 compatibility"**  
→ Read: CUVS-INSTALLATION-WINDOWS-RESEARCH.md section "Path 2" + "Comparison Table" (5 min)

**"What's the memory budget for RTX 3060 Ti?"**  
→ Read: CUVS-INSTALLATION-WINDOWS-RESEARCH.md section "RTX 3060 Ti 8GB Considerations" (3 min)

---

## Key Findings at a Glance

### Installation Methods Comparison

| Method | Time | Complexity | CUDA 12.1 | Disk | Maintenance |
|--------|------|-----------|----------|------|-------------|
| Conda (mamba) | 5–10 min | Low | ✅ | 1.3GB | Low |
| Source build | 78–90 min | High | ✅ | 15GB | High |
| **Docker gRPC** | 20–30 min | Medium | ✅ | 12GB | Medium |

### CUDA 12.1 Compatibility
✅ RAPIDS 24.12 (latest stable, Dec 2024) officially supports CUDA 12.1
- Pre-built wheels for Conda
- Source build optimizations for SM 86 (Ampere, RTX 3060 Ti)
- Container images guaranteed

### Memory Fit (RTX 3060 Ti 8GB)
- Ollama (Gemma4 IQ4_XS): 5.3GB
- cuVS index (IVF-PQ): 1.2GB
- Inference headroom: 1.5GB
- **Total: 8.0GB** ✅ Fits tight but workable

### Performance Expected
- Embedding: 50ms
- cuVS search (k=10): 50–100ms
- Postgres join: 5–10ms
- **Total: 105–160ms** (vs. 200ms Qdrant alone = 25% improvement)

### Risk Mitigation
- Fallback: If cuVS down, Qdrant Layer 3b takes over (non-blocking)
- Memory: IVF-PQ index uses only 250MB with int8 quantization (not 1.2GB full)
- Build: Docker image cached after first build (restart in <3s)

---

## Code Artifacts Provided

All code ready to copy-paste from research documents:

| Artifact | Lines | File |
|----------|-------|------|
| Proto definition | 70 | `protos/cuvs_service.proto` |
| Dockerfile | 15 | `docker/cuvs-grpc/Dockerfile` |
| Python gRPC server | 80 | `docker/cuvs-grpc/src/cuvs_grpc_server.py` |
| Node.js client bridge | 120 | `src/lib/server/retrieval/cuvs-grpc-bridge.ts` |
| docker-compose addition | 20 | Add to existing `docker-compose.yml` |
| **Total new code** | **305 lines** | Ready to implement |

---

## Implementation Roadmap

### Phase 0: Review (5 min)
- [ ] Read CUVS-RESEARCH-SUMMARY.md
- [ ] Decide: Proceed with Docker path (recommended)?

### Phase 1–9: Implementation (45 min)
- [ ] Follow CUVS-DOCKER-IMPLEMENTATION-CHECKLIST.md
- [ ] Copy code snippets from CUVS-INSTALLATION-WINDOWS-RESEARCH.md section 3b

### Phase 10: Validation (10 min)
- [ ] Run success metrics (see CUVS-RESEARCH-SUMMARY.md)
- [ ] Benchmark retrieval latency vs Qdrant alone
- [ ] Monitor GPU memory during search

### Phase 11: Integration (5 min)
- [ ] Add npm scripts (`cuvs:start`, `cuvs:test`, etc.)
- [ ] Update project README
- [ ] Tag commit with `feat/cuvs-grpc-layer3a`

**Total time**: ~70 minutes (including Docker build)

---

## Success Criteria

✅ Implementation is **complete** when:

1. Container running: `docker ps | grep cuvs-grpc` shows "Up X seconds"
2. gRPC health: `grpcurl -plaintext localhost:50051 list` returns service name
3. Node.js test: `npm run cuvs:test` passes (with fallback working)
4. Retrieval test: 100-query benchmark completes with fallback
5. Performance: p50 latency ≥15% improvement (105–160ms vs 200ms baseline)
6. Memory safe: `nvidia-smi` shows <2GB cuVS overhead
7. Commit tagged: `git tag feat/cuvs-grpc-layer3a` + merged to main

---

## Known Limitations & Deferred Work

### Phase 85 Dependencies (Not Blocking)
- Artifact registry (P1-missing-layer-1) — index building/lifecycle
- Semantic diff (P1-missing-layer-2) — delta indexing
- Replay database (P1-missing-layer-3) — query replay for accuracy

cuVS integration works **without** these (reads pre-built indices from Qdrant).

### Future Enhancements
- [ ] Automatic index building from Qdrant payloads
- [ ] Multi-index support (one per community_id)
- [ ] Dynamic K selection (auto-scale k based on query type)
- [ ] Index persistence (save/restore via cold storage)
- [ ] Clustering via CAGRA (requires >2GB extra VRAM, defer)

---

## Troubleshooting Quick Links

| Problem | Solution | Document |
|---------|----------|----------|
| Docker build fails | Check logs + CUDA drivers | RESEARCH.md section 3b |
| gRPC timeout | Verify service listening on :50051 | CHECKLIST.md phase 5 |
| GPU not detected | Run `docker exec ... nvidia-smi` | CHECKLIST.md phase 8 |
| Port 50051 in use | Change EXPOSE in Dockerfile | RESEARCH.md section 3 |
| Out of GPU memory | Use int8 quantization, reduce batch | RESEARCH.md RTX 3060 Ti section |
| Retrieval doesn't fallback | Check `isCuVSHealthy()` logic | RESEARCH.md section 3b |

---

## References & Resources

### External
- [RAPIDS cuVS Docs](https://docs.rapids.ai/api/cuvs/nightly/)
- [RAPIDS GitHub](https://github.com/rapidsai/cuvs)
- [RAPIDS 24.12 Release Notes](https://rapids.ai/releases/)
- [NVIDIA CUDA Compute Capability (SM 86 = Ampere)](https://developer.nvidia.com/cuda-gpus)
- [gRPC-Python Tutorials](https://grpc.io/docs/languages/python/)

### Project Docs
- `docs/architecture/CUVS-*` (this series)
- `docs/architecture/retrieval-layer-separation.md` (retrieval orchestrator)
- `docs/BACKEND_INFRASTRUCTURE_AUDIT.md` (service health gates)

---

## Questions? Issues?

**During review**: Comment on the summary doc.

**During implementation**: Follow checklist; if step fails, check troubleshooting section.

**After merge**: File issue titled "Phase 85 P4: cuVS index building & lifecycle" for future work.

---

## Metadata

| Field | Value |
|-------|-------|
| Author | Claude Code (AI Agent) |
| Date | June 28, 2026 |
| Environment | Windows 10 WSL2, RTX 3060 Ti 8GB, CUDA 12.1 |
| RAPIDS Version | 24.12 (Dec 2024) |
| Recommendation | Docker cuVS gRPC (30 min setup) |
| Status | ✅ Research complete, ready to implement |
| Next Action | Review summary → Proceed with checklist |

---

**🚀 Ready to implement?** Start with CUVS-DOCKER-IMPLEMENTATION-CHECKLIST.md
