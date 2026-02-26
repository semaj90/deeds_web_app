# Kiro Startup Guide - Phase 72 + CUDA Acceleration

## 🚀 Quick Start

### 1. Verify CMake Installation
```bash
cmake --version
# Expected: cmake version 3.18 or higher
```

### 2. Check CUDA Installation (Optional)
```bash
nvidia-smi
# Expected: NVIDIA RTX 3060 Ti or compatible GPU
```

### 3. Review Specifications
- Phase 72 AST Error Reduction: `.kiro/specs/phase-72-ast-error-reduction/`
- CUDA Acceleration: `CUDA_ACCELERATION_ROADMAP.md`

### 4. Start Implementation
- Phase 72 Task 1: `.kiro/specs/phase-72-ast-error-reduction/tasks.md`
- CUDA Phase A: `CUDA_QUICKSTART.md`

---

## 📋 Project Structure

### Specifications
```
.kiro/
├── PHASE_72_SPEC_COMPLETE.md          # Phase 72 summary
├── STARTUP_GUIDE.md                   # This file
└── specs/
    └── phase-72-ast-error-reduction/
        ├── requirements.md             # 8 EARS-compliant requirements
        ├── design.md                   # System architecture
        └── tasks.md                    # 20 implementation tasks
```

### CUDA Configuration
```
root/
├── CMakeLists.txt                      # Root CMake (CUDA config)
├── CUDA_ACCELERATION_ROADMAP.md        # Complete roadmap
├── CUDA_QUICKSTART.md                  # Quick start guide
├── PHASE_72_AND_CUDA_SUMMARY.md       # Combined summary
├── backend/
│   └── cuda/
│       └── CMakeLists.txt              # Backend CUDA config
└── docker/
    ├── Dockerfile.cuda                 # GPU runtime
    └── docker-compose.gpu.yml          # GPU stack
```

### Phase 72 Implementation
```
phase72-ast-reduction/
├── phase72-orchestrator.ts             # Main coordinator (existing)
├── ast-error-reduction-pipeline.ts     # Pipeline (existing)
├── neo4j-error-graph-service.ts        # Graph service (existing)
├── ai-patch-generation-service.ts      # Patch generation (existing)
├── gpu-clustering-service.ts           # GPU clustering (existing)
└── ... (to be implemented)
```

---

## 🎯 Implementation Phases

### Phase 72: AST Error Reduction (6-9 days)

**Phase 1: Core Services (Days 1-4)**
- Task 1: Project setup
- Task 2: Error extraction
- Task 3: Embedding generation
- Task 4: Neo4j graph service
- Task 5: GPU clustering
- Task 6: AI patch generation
- Task 7: Patch application
- Task 8: Progress tracking
- Task 9: Error handling
- Task 10: Orchestrator

**Phase 2: Frontend & Deployment (Days 5-6)**
- Task 11: Dashboard
- Task 12: Docker Compose

**Phase 3: Testing & Documentation (Days 7-9)**
- Tasks 13-20: Tests, docs, monitoring

### CUDA Acceleration (4 weeks)

**Week 1: Phase A - Tokenizer (5x speedup)**
- Create CUDA tokenizer kernel
- Implement Python bindings
- Integrate with chat service
- Benchmark: 100ms → 20ms

**Week 2: Phase B - Embedding (10x speedup)**
- Create embedding CUDA kernel
- Integrate cuBLAS
- Implement Python bindings
- Benchmark: 500ms → 50ms

**Week 3: Phase C - Vector Search (3x speedup)**
- Create similarity CUDA kernel
- Optimize for batch processing
- Implement Python bindings
- Benchmark: 100ms → 30ms

**Week 4: Phase D - Reranking (8x speedup)**
- Create reranking CUDA kernel
- Integrate Tensor Cores
- Implement Python bindings
- Benchmark: 50ms → 6ms

---

## ✅ Verification Checklist

### CMake Configuration
- [ ] `CMakeLists.txt` exists in root
- [ ] `backend/cuda/CMakeLists.txt` exists
- [ ] CUDA architecture set to 86 (RTX 3060 Ti)
- [ ] pybind11 configuration present
- [ ] cuBLAS library detection configured

### Docker Configuration
- [ ] `docker/Dockerfile.cuda` exists
- [ ] `docker/docker-compose.gpu.yml` exists
- [ ] NVIDIA CUDA base image specified
- [ ] GPU device mapping configured
- [ ] All services defined (Neo4j, Ollama, Qdrant, Redis, Postgres)

### Phase 72 Specification
- [ ] `requirements.md` has 8 EARS-compliant requirements
- [ ] `design.md` has complete architecture
- [ ] `tasks.md` has 20 implementation tasks
- [ ] All requirements referenced in tasks
- [ ] Task dependencies documented

### Documentation
- [ ] `CUDA_ACCELERATION_ROADMAP.md` complete
- [ ] `CUDA_QUICKSTART.md` complete
- [ ] `PHASE_72_AND_CUDA_SUMMARY.md` complete
- [ ] `.kiro/STARTUP_GUIDE.md` (this file) complete

---

## 🔧 Configuration

### Environment Variables

**CUDA Configuration**:
```bash
export CUDA_VISIBLE_DEVICES=0
export CUDA_LAUNCH_BLOCKING=0
export CUDA_DEVICE_ORDER=PCI_BUS_ID
```

**Phase 72 Configuration**:
```bash
export NEO4J_URI=bolt://localhost:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=password
export OLLAMA_URL=http://localhost:11434
export QDRANT_URL=http://localhost:6333
export REDIS_URL=redis://localhost:6379
export PHASE72_MAX_ITERATIONS=10
export PHASE72_MIN_IMPROVEMENT=0.05
```

### CMake Build

**Configure**:
```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release \
                -DCUDA_ARCHITECTURES=86 \
                -DCUTLASS_DIR=/opt/cutlass
```

**Build**:
```bash
cmake --build build --parallel 8
```

**Install**:
```bash
cmake --install build
```

---

## 📊 Performance Targets

### Phase 72
| Metric | Target |
|--------|--------|
| Error Extraction | <30s |
| Embedding Generation | <2min |
| Clustering | <5s |
| Patch Generation | <2s/cluster |
| Validation | <1min |
| Total Iteration | <5min |
| Error Reduction | 95%+ |
| Success Rate | 75-85% |

### CUDA Acceleration
| Phase | Component | Current | GPU | Speedup |
|-------|-----------|---------|-----|---------|
| A | Tokenization | 100ms | 20ms | 5x |
| B | Embedding | 500ms | 50ms | 10x |
| C | Vector Search | 100ms | 30ms | 3x |
| D | Reranking | 50ms | 6ms | 8x |
| **Total** | **Pipeline** | **750ms** | **106ms** | **7x** |

---

## 🚨 Troubleshooting

### CMake Issues

**CUDA not found**:
```bash
# Check CUDA installation
nvcc --version

# Add to PATH
export PATH=/usr/local/cuda/bin:$PATH
export LD_LIBRARY_PATH=/usr/local/cuda/lib64:$LD_LIBRARY_PATH
```

**pybind11 not found**:
```bash
# Install pybind11
pip install pybind11

# Or let CMake download it automatically
```

### Docker Issues

**GPU not available**:
```bash
# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
```

**Out of memory**:
```bash
# Reduce batch sizes in configuration
# Monitor GPU memory
nvidia-smi --query-gpu=memory.used,memory.free --format=csv,noheader -l 1
```

### Phase 72 Issues

**Neo4j connection failed**:
```bash
# Check Neo4j container
docker ps | grep neo4j

# Check logs
docker logs neo4j-phase72
```

**Ollama model not found**:
```bash
# Pull gemma3-legal model
ollama pull gemma3-legal:latest

# List available models
ollama list
```

---

## 📚 Documentation Links

### Phase 72
- Requirements: `.kiro/specs/phase-72-ast-error-reduction/requirements.md`
- Design: `.kiro/specs/phase-72-ast-error-reduction/design.md`
- Tasks: `.kiro/specs/phase-72-ast-error-reduction/tasks.md`
- Summary: `.kiro/PHASE_72_SPEC_COMPLETE.md`

### CUDA Acceleration
- Roadmap: `CUDA_ACCELERATION_ROADMAP.md`
- Quick Start: `CUDA_QUICKSTART.md`
- Summary: `PHASE_72_AND_CUDA_SUMMARY.md`

### Configuration
- Root CMake: `CMakeLists.txt`
- Backend CMake: `backend/cuda/CMakeLists.txt`
- Docker: `docker/Dockerfile.cuda`
- Docker Compose: `docker/docker-compose.gpu.yml`

---

## 🎯 Next Steps

### Immediate (Today)
1. [ ] Review Phase 72 specification
2. [ ] Review CUDA roadmap
3. [ ] Verify CMake configuration
4. [ ] Check CUDA installation (if available)

### This Week
1. [ ] Start Phase 72 Task 1: Project setup
2. [ ] Set up Docker GPU environment
3. [ ] Test CMake build configuration
4. [ ] Verify all services can start

### This Month
1. [ ] Complete Phase 72 core services
2. [ ] Implement CUDA Phase A tokenizer
3. [ ] Deploy Phase 72 dashboard
4. [ ] Begin CUDA Phase B embedding

---

## 💡 Tips

- Start with Phase 72 Task 1 for project setup
- Test each service independently before integration
- Use Docker Compose for easy deployment
- Monitor GPU utilization during CUDA phases
- Refer to design document for architecture questions
- Check tasks document for implementation details

---

**Status**: ✅ Ready for implementation

**Start Here**:
1. Phase 72: `.kiro/specs/phase-72-ast-error-reduction/tasks.md` (Task 1)
2. CUDA: `CUDA_QUICKSTART.md` (Installation)

**Expected Timeline**: 6-9 weeks for full implementation
