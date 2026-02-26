# Phase 73: Unified Reasoning Engine - Specification Updated ✅

## Summary

Phase 73 specification has been **updated with CMake integration** for seamless integration with the existing YoRHa Legal AI build system.

**Location**: `.kiro/specs/phase-73-unified-reasoning-engine/`

## What's New

### ✅ CMake Integration Added
- **Protocol Buffer generation** with protobuf_generate_cpp and grpc_generate_cpp
- **cuda_clustering static library** target
- **cuda_cluster_server executable** target
- **cuda_cluster_benchmark tool** target
- **Integration with existing targets**: ast_graph_exporter, rag_lora_trainer, tensorrt_llm_integration
- **Build configuration**: CUDA 13.0, sm_86 (Ampere), AVX2 + fast-math

### ✅ Updated Tasks
- **Task 1**: Now includes CMake integration
- **Task 12**: New CMake integration task
- **Task 13**: Docker Compose (previously Task 12)
- **Total**: 21 tasks (13 core + 8 optional)

### ✅ Updated Documentation
- **design.md**: Added CMake Integration section
- **tasks.md**: Updated with CMake tasks and dependencies
- **PHASE_73_CMAKE_INTEGRATION.md**: Complete CMake integration guide

---

## 🎯 Key Features

### CMake Configuration
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

# Integration with existing targets
target_link_libraries(ast_graph_exporter PRIVATE cuda_clustering)
target_link_libraries(rag_lora_trainer PRIVATE cuda_clustering)
target_link_libraries(tensorrt_llm_integration PRIVATE cuda_clustering)
```

### Build Targets
- `cuda_clustering` - Static library for clustering operations
- `cuda_cluster_server` - gRPC service on port 50051
- `cuda_cluster_benchmark` - Performance testing tool

### Dependencies
- gRPC (service framework)
- Protocol Buffers (message serialization)
- CUDA Toolkit 13.0 (GPU computation)
- cuBLAS + cuBLASLt (matrix operations)
- cuDNN 9.16 (neural network operations)
- CUTLASS (tensor operations)
- LibTorch (PyTorch integration)

---

## 📊 Updated Architecture

```
Your Existing YoRHa Build System
├── ast_graph_exporter ──┐
├── rag_lora_trainer ────┼─→ cuda_clustering (NEW)
├── tensorrt_llm_integration ┘
│
└── Phase 73 Components
    ├── cuda_cluster_server (gRPC)
    ├── cuda_cluster_benchmark
    ├── FastAPI Bridge
    ├── Go Re-ranker
    └── SvelteKit UI
```

---

## 🚀 Implementation Timeline

### Phase 1: CMake Setup (1 day)
- Create proto/cuda_cluster.proto
- Add gRPC/Protobuf to CMakeLists.txt
- Configure Protocol Buffer generation

### Phase 2: CUDA & gRPC (3-4 days)
- Implement CUDA kernels
- Create gRPC service
- Build and test

### Phase 3: FastAPI & Caching (2-3 days)
- Implement embedding bridge
- Set up Redis caching

### Phase 4: Go Re-ranking (2-3 days)
- Implement hybrid scoring
- Test re-ranking quality

### Phase 5: UI Integration (1-2 days)
- Create cluster badges
- Integrate with search results

### Phase 6: CMake Integration (2-3 days)
- Link to existing targets
- Test full pipeline

### Phase 7: Docker & Deployment (1-2 days)
- Set up Docker run start add to it, this way builds in wsl2? for sveltekit 2 app
- Test full stack

### Phase 8: Optional Enhancements (3-5 days)
- Quantization
- Performance optimization

**Total**: 15-23 days

---

## 📁 File Structure

```
legal-ai/
├── CMakeLists.txt                          (updated with Phase 73)
├── proto/
│   └── cuda_cluster.proto                  (new)
├── src/
│   ├── cuda_cluster_kernels.cu             (new)
│   ├── cuda_cluster_service.cpp            (new)
│   ├── cuda_cluster_server.cpp             (new)
│   ├── cuda_cluster_benchmark.cpp          (new)
│   └── ... (existing files)
├── include/
│   ├── cuda_cluster_service.h              (new)
│   └── ... (existing headers)
├── build/
│   └── bin/
│       ├── cuda_cluster_server.exe         (generated)
│       ├── cuda_cluster_benchmark.exe      (generated)
│       └── ... (existing executables)
└── .kiro/
    └── specs/
        └── phase-73-unified-reasoning-engine/
            ├── requirements.md
            ├── design.md                   (updated)
            └── tasks.md                    (updated)
```

---

## ✅ Build Commands

### Configure
```bash
cmake -G "Visual Studio 17 2022" \
  -DCMAKE_CUDA_ARCHITECTURES=86 \
  -DCUDNN_ROOT="C:/Program Files/NVIDIA/CUDNN/v9.16" \
  -DCUTLASS_ROOT="C:/cutlass" \
  ..
```

### Build
```bash
cmake --build . --config Release --parallel 8
```

### Run
```bash
./bin/cuda_cluster_server.exe
./bin/cuda_cluster_benchmark.exe
```

---

## 🔗 Integration Points

### Existing Targets
- **ast_graph_exporter**: Can call CUDA clustering
- **rag_lora_trainer**: Can use clustering for training
- **tensorrt_llm_integration**: Can cluster inference results
- **qlora_benchmark**: Can benchmark clustering performance

### New Targets
- **cuda_clustering**: Static library (linked to existing targets)
- **cuda_cluster_server**: gRPC service
- **cuda_cluster_benchmark**: Performance tool

---

## 📊 Performance Targets

| Component | Operation | Target | Status |
|-----------|-----------|--------|--------|
| CUDA | ComputeCentroids | <100ms | ⏳ |
| CUDA | TrainSOM | <500ms | ⏳ |
| CUDA | PredictCluster | <10ms | ⏳ |
| FastAPI | Embedding (cached) | <5ms | ⏳ |
| FastAPI | Embedding (uncached) | <100ms | ⏳ |
| Go | Re-ranking | <50ms | ⏳ |
| UI | Render | <200ms | ⏳ |
| **Total** | **Full Pipeline** | **<500ms** | ⏳ |

---

## 📚 Documentation

### Specifications
- **Requirements**: `.kiro/specs/phase-73-unified-reasoning-engine/requirements.md`
- **Design**: `.kiro/specs/phase-73-unified-reasoning-engine/design.md` (updated)
- **Tasks**: `.kiro/specs/phase-73-unified-reasoning-engine/tasks.md` (updated)

### Guides
- **Summary**: `.kiro/PHASE_73_SPEC_COMPLETE.md`
- **Implementation**: `PHASE_73_IMPLEMENTATION_GUIDE.md`
- **CMake Integration**: `PHASE_73_CMAKE_INTEGRATION.md` (new)
- **This File**: `.kiro/PHASE_73_SPEC_UPDATED.md`

---

## 🎯 Next Steps

1. **Review Updated Spec**: Check design.md and tasks.md
2. **Install Dependencies**: gRPC, Protobuf, CUDA 13.0
3. **Create Proto File**: proto/cuda_cluster.proto
4. **Update CMakeLists.txt**: Add Phase 73 section
5. **Implement CUDA Kernels**: src/cuda_cluster_kernels.cu
6. **Build and Test**: cmake --build . --config Release
7. **Run gRPC Server**: ./bin/cuda_cluster_server.exe
8. **Integrate with Existing Targets**: Link cuda_clustering

---

## ✅ Checklist

- [x] Phase 73 specification created
- [x] CMake integration designed
- [x] Tasks updated with CMake
- [x] Documentation updated
- [ ] Proto file created
- [ ] CMakeLists.txt updated
- [ ] CUDA kernels implemented
- [ ] gRPC service built
- [ ] Integrated with existing targets
- [ ] Full pipeline tested

---

**Status**: ✅ **SPECIFICATION UPDATED WITH CMAKE INTEGRATION**

**Ready for**: Implementation

**Timeline**: 15-23 days for full implementation

**Expected Outcome**: Unified reasoning engine seamlessly integrated with existing YoRHa Legal AI build system
