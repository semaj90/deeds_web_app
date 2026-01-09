# Copilot - Phase 78 AST-Aware Error Ranking + Svelte 5 Migration

## 🎯 Latest Session Summary (January 9, 2026)

### Implemented: AST-Aware Error Ranking System

**What We Built:**
- Complete AST analysis engine for Svelte 5 error prioritization
- Machine-format log parser for `svelte-check --output machine`
- Dependency graph with centrality metrics
- Priority ranking (0-100 scale) based on architectural impact
- Database integration for persistent error tracking

**Key Files Created:**
- `scripts/phase78-ast-aware-ranker.mts` (688 lines)
- `scripts/test-ast-ranker.mjs` (validation suite)
- Updated `package.json` with phase78:* scripts

**Error Reduction:**
- **Before:** ~80,000 svelte-check errors
- **After fixes:** Eliminated 80-90 cascading errors
- **Components fixed:** 15+ UI components (Checkbox, Label, Select, etc.)

### Svelte 5 + bits-ui Migration Patterns

**Import Pattern Changes:**
```typescript
// OLD Pattern (Breaking in Svelte 5)
import { Component } from "bits-ui";
import { cn } from "$lib/utils";

// NEW Pattern (Working)
import * as Component from "bits-ui/components/component";
import { cn } from "$lib/utils/cn.js";
```

**Why This Matters:**
- bits-ui 2.14.4 changed export structure for Svelte 5
- Barrel exports (`$lib/utils`) cause TypeScript module resolution issues
- Direct imports (`$lib/utils/cn.js`) work reliably

**Components Updated:**
- ✅ Checkbox (5 errors → 0)
- ✅ Label (errors eliminated)
- ✅ Select (9 files updated)
- 🔄 ~12 remaining (dropdowns, buttons, switches)

### Database Schema Fixes

**Common Syntax Errors Fixed:**
```typescript
// ❌ BEFORE (Missing closing parentheses)
id: uuid('id').defaultRandom().primaryKey( caseId: uuid('case_id')

// ✅ AFTER
id: uuid('id').defaultRandom().primaryKey(),
caseId: uuid('case_id')
```

**Files Fixed:**
- `src/lib/server/db/schema/legal-cases.ts`
- `src/lib/server/db/schema/persons.ts`
- `src/lib/server/db/schema/reports.ts`

### Phase 78 Pipeline Commands

```bash
# Validation
npm run phase78:ast-rank:test

# Analyze all errors with AST ranking
npm run phase78:ast-rank

# Focus on top 50 files
npm run phase78:ast-rank:top50

# Complete pipeline (rank → insert → cluster → suggest)
npm run phase78:full
```

### Next Steps

1. **Batch-fix remaining UI components** (dropdowns, alerts, tooltips)
2. **Run full pipeline:** `npm run phase78:full`
3. **Validate fixes:** `npm run phase78:ast-rank:test`
4. **Monitor error count** reduction

---

## 🚀 Phase 72 Legacy - Docker Deployment for WSL Linux

### Build Phase

```bash
# WSL Linux terminal
cd /mnt/c/path/to/legal-ai

# Build CUDA-enabled Docker image
docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:latest .

# Build with progress output
docker build -f docker/Dockerfile.cuda --progress=plain -t legal-ai-gpu:latest .

# Build with specific tag
docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:v1.0 .
```

### Run Phase

```bash
# Basic run with GPU
docker run --gpus all \
  -p 8000:8000 \
  legal-ai-gpu:latest

# Run with all ports exposed
docker run --gpus all \
  -p 8000:8000 \
  -p 5174:5174 \
  -p 6333:6333 \
  -p 7687:7687 \
  -p 6379:6379 \
  -p 5432:5432 \
  -p 9000:9000 \
  -p 5672:5672 \
  legal-ai-gpu:latest

# Run with volume mounts
docker run --gpus all \
  -p 8000:8000 \
  -v $(pwd)/backend:/app/backend \
  -v $(pwd)/sveltekit-frontend:/app/frontend \
  legal-ai-gpu:latest

# Run with environment variables
docker run --gpus all \
  -p 8000:8000 \
  -e CUDA_VISIBLE_DEVICES=0 \
  -e NEO4J_URI=bolt://localhost:7687 \
  -e OLLAMA_URL=http://localhost:11434 \
  -e QDRANT_URL=http://localhost:6333 \
  -e PHASE72_MAX_ITERATIONS=10 \
  legal-ai-gpu:latest

# Run in background
docker run -d --gpus all \
  -p 8000:8000 \
  --name legal-ai-gpu \
  legal-ai-gpu:latest

# Run with custom name and restart policy
docker run -d --gpus all \
  -p 8000:8000 \
  --name legal-ai-gpu \
  --restart unless-stopped \
  legal-ai-gpu:latest
```

### Docker Compose (Preserved)

```bash
# Start full GPU stack (new)
docker-compose -f docker/docker-compose.gpu.yml up -d

# Start existing stack (unchanged)
docker-compose -f docker/docker-compose.yml up -d

# Start both stacks
docker-compose -f docker/docker-compose.yml up -d
docker-compose -f docker/docker-compose.gpu.yml up -d

# View logs
docker-compose -f docker/docker-compose.gpu.yml logs -f

# Stop stack
docker-compose -f docker/docker-compose.gpu.yml down

# Rebuild without cache
docker-compose -f docker/docker-compose.gpu.yml build --no-cache

# Rebuild specific service
docker-compose -f docker/docker-compose.gpu.yml build --no-cache legal-ai-gpu
```

---

## 📊 Phase 72: AST Error Reduction

### Overview
Self-healing codebase agent that reduces 80k+ TypeScript/Svelte errors to <1k

### Architecture
```
Error Extraction → Embedding → Neo4j Graph → GPU Clustering
                                                    ↓
                                        AI Patch Generation
                                                    ↓
                                        Patch Application
                                                    ↓
                                        Validation & Loop
```

### Key Features
- **Error Extraction**: Automatic svelte-check integration
- **Graph Analysis**: Neo4j relationship mapping
- **GPU Clustering**: CUDA-accelerated K-means
- **AI Patches**: gemma3-legal model integration
- **Validation**: Automatic rollback on failure
- **Self-Healing**: Iterative error reduction

### Performance Targets
- Error reduction: 95%+ (80k → <1k)
- Success rate: 75-85%
- Processing time: 15-30 min per cycle
- GPU utilization: 70-90%

### Specification Files
- Requirements: `.kiro/specs/phase-72-ast-error-reduction/requirements.md`
- Design: `.kiro/specs/phase-72-ast-error-reduction/design.md`
- Tasks: `.kiro/specs/phase-72-ast-error-reduction/tasks.md`

---

## ⚡ CUDA Acceleration

### 4-Phase Implementation

**Phase A: Tokenizer (5x speedup)**
- Current: 100ms/page
- GPU: 20ms/page
- Timeline: Week 1

**Phase B: Embedding (10x speedup)**
- Current: 500ms/batch
- GPU: 50ms/batch
- Timeline: Week 2

**Phase C: Vector Search (3x speedup)**
- Current: 100ms
- GPU: 30ms
- Timeline: Week 3

**Phase D: Reranking (8x speedup)**
- Current: 50ms
- GPU: 6ms
- Timeline: Week 4

### Total Impact
- **Current Pipeline**: 750ms end-to-end
- **GPU-Accelerated**: 106ms end-to-end
- **Total Speedup**: 7x faster

### Build Commands

```bash
# Configure CMake
cmake -B build -DCMAKE_BUILD_TYPE=Release \
                -DCUDA_ARCHITECTURES=86 \
                -DCUTLASS_DIR=/opt/cutlass

# Build all targets
cmake --build build --parallel 8

# Install
cmake --install build

# Run benchmarks
./build/benchmark_tokenizer --batch-size 32 --iterations 100
./build/benchmark_embedding --batch-size 32 --iterations 100
./build/benchmark_search --num-candidates 1000 --iterations 100
./build/benchmark_reranker --batch-size 32 --iterations 100
```

---

## 🔧 Configuration

### Environment Variables

```bash
# CUDA Configuration
export CUDA_VISIBLE_DEVICES=0
export CUDA_LAUNCH_BLOCKING=0
export CUDA_DEVICE_ORDER=PCI_BUS_ID

# Phase 72 Configuration
export NEO4J_URI=bolt://localhost:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=password
export OLLAMA_URL=http://localhost:11434
export QDRANT_URL=http://localhost:6333
export REDIS_URL=redis://localhost:6379
export PHASE72_MAX_ITERATIONS=10
export PHASE72_MIN_IMPROVEMENT=0.05
```

### Docker Environment File

```bash
# Create .env file
cat > .env.docker << EOF
CUDA_VISIBLE_DEVICES=0
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
OLLAMA_URL=http://localhost:11434
QDRANT_URL=http://localhost:6333
REDIS_URL=redis://localhost:6379
PHASE72_MAX_ITERATIONS=10
PHASE72_MIN_IMPROVEMENT=0.05
EOF

# Use with docker run
docker run --gpus all \
  -p 8000:8000 \
  --env-file .env.docker \
  legal-ai-gpu:latest
```

---

## 📁 Project Structure

```
legal-ai/
├── CMakeLists.txt                      # Root CMake
├── CUDA_ACCELERATION_ROADMAP.md        # CUDA plan
├── CUDA_QUICKSTART.md                  # Quick start
├── PHASE_72_AND_CUDA_SUMMARY.md       # Summary
├── IMPLEMENTATION_READY.md             # Checklist
├── claude.md                           # Claude guide
├── copilot.md                          # This file
├── gemini.md                           # Gemini guide
│
├── backend/
│   ├── cuda/
│   │   └── CMakeLists.txt
│   └── ... (existing services)
│
├── docker/
│   ├── Dockerfile.cuda                # GPU runtime
│   ├── docker-compose.gpu.yml         # GPU stack
│   ├── docker-compose.yml             # Existing (preserved)
│   └── ... (other configs - preserved)
│
├── .kiro/
│   ├── INDEX.md
│   ├── STARTUP_GUIDE.md
│   ├── PHASE_72_SPEC_COMPLETE.md
│   └── specs/
│       └── phase-72-ast-error-reduction/
│           ├── requirements.md
│           ├── design.md
│           └── tasks.md
│
└── phase72-ast-reduction/
    ├── phase72-orchestrator.ts
    └── ... (to be implemented)
```

---

## 🚀 Deployment Workflow

### Step 1: Build Docker Image

```bash
# In WSL Linux
cd /mnt/c/path/to/legal-ai

# Build image
docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:latest .

# Verify
docker images | grep legal-ai-gpu
```

### Step 2: Start Services

```bash
# Option A: Docker run
docker run --gpus all -p 8000:8000 legal-ai-gpu:latest

# Option B: Docker Compose (GPU stack)
docker-compose -f docker/docker-compose.gpu.yml up -d

# Option C: Docker Compose (existing + GPU)
docker-compose -f docker/docker-compose.yml up -d
docker-compose -f docker/docker-compose.gpu.yml up -d
```

### Step 3: Verify Deployment

```bash
# Check API
curl http://localhost:8000/api/health

# Check GPU
curl http://localhost:8000/api/gpu-metrics

# Check services
docker ps

# Check logs
docker logs legal-ai-gpu
```

### Step 4: Run Phase 72

```bash
# Start Phase 72
docker exec legal-ai-gpu npm run phase72:run

# Monitor progress
docker exec legal-ai-gpu npm run phase72:progress

# View dashboard
open http://localhost:5174
```

---

## 📊 Monitoring

### Docker Commands

```bash
# View running containers
docker ps

# View all containers
docker ps -a

# View container logs
docker logs legal-ai-gpu

# Follow logs
docker logs -f legal-ai-gpu

# View container stats
docker stats legal-ai-gpu

# Execute command in container
docker exec legal-ai-gpu nvidia-smi

# Stop container
docker stop legal-ai-gpu

# Start container
docker start legal-ai-gpu

# Remove container
docker rm legal-ai-gpu
```

### GPU Monitoring

```bash
# Real-time GPU stats
nvidia-smi -l 1

# GPU memory
nvidia-smi --query-gpu=memory.used,memory.free --format=csv,noheader -l 1

# GPU processes
nvidia-smi pmon

# Detailed GPU info
nvidia-smi -q
```

### Performance Metrics

```bash
# Container resource usage
docker stats legal-ai-gpu

# Network usage
docker stats --no-stream legal-ai-gpu

# Memory usage
docker exec legal-ai-gpu free -h

# Disk usage
docker exec legal-ai-gpu df -h
```

---

## 🔧 Troubleshooting

### GPU Issues

```bash
# Check NVIDIA Docker runtime
docker run --rm --gpus all nvidia/cuda:12.0-runtime-ubuntu22.04 nvidia-smi

# Check GPU in container
docker exec legal-ai-gpu nvidia-smi

# Check CUDA availability
docker exec legal-ai-gpu python3 -c "import torch; print(torch.cuda.is_available())"
```

### Build Issues

```bash
# Clean build
docker build -f docker/Dockerfile.cuda --no-cache -t legal-ai-gpu:latest .

# Build with verbose output
docker build -f docker/Dockerfile.cuda --progress=plain -t legal-ai-gpu:latest .

# Check build logs
docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:latest . 2>&1 | tail -100
```

### Runtime Issues

```bash
# Check container logs
docker logs legal-ai-gpu

# Check container errors
docker logs legal-ai-gpu 2>&1 | grep -i error

# Inspect container
docker inspect legal-ai-gpu

# Check container processes
docker top legal-ai-gpu
```

### Memory Issues

```bash
# Check memory usage
docker stats legal-ai-gpu

# Reduce batch size
docker run --gpus all \
  -e BATCH_SIZE=16 \
  legal-ai-gpu:latest

# Limit memory
docker run --gpus all \
  -m 8g \
  legal-ai-gpu:latest
```

---

## 📚 Documentation

### Phase 72
- Specification: `.kiro/specs/phase-72-ast-error-reduction/`
- Summary: `.kiro/PHASE_72_SPEC_COMPLETE.md`
- Tasks: `.kiro/specs/phase-72-ast-error-reduction/tasks.md`

### CUDA
- Roadmap: `CUDA_ACCELERATION_ROADMAP.md`
- Quick Start: `CUDA_QUICKSTART.md`
- CMake: `CMakeLists.txt`

### Guides
- Startup: `.kiro/STARTUP_GUIDE.md`
- Index: `.kiro/INDEX.md`
- Implementation: `IMPLEMENTATION_READY.md`

---

## ✅ Checklist

- [ ] Docker image builds successfully
- [ ] GPU detected in container
- [ ] All services start
- [ ] API health check passes
- [ ] GPU metrics available
- [ ] Phase 72 initializes
- [ ] Dashboard accessible
- [ ] Benchmarks run

---

## 🎯 Quick Commands

```bash
# Build
docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:latest .

# Run
docker run --gpus all -p 8000:8000 legal-ai-gpu:latest

# Compose
docker-compose -f docker/docker-compose.gpu.yml up -d

# Logs
docker logs -f legal-ai-gpu

# Stats
docker stats legal-ai-gpu

# Stop
docker stop legal-ai-gpu

# Remove
docker rm legal-ai-gpu
```

---

**Status**: ✅ Ready for Docker deployment

**Build**: `docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:latest .`

**Run**: `docker run --gpus all -p 8000:8000 legal-ai-gpu:latest`

**Compose**: `docker-compose -f docker/docker-compose.gpu.yml up -d`
