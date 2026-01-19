# Gemini - Phase 78 AST Error Analysis & Svelte 5 Migration

---

## ✅ January 19, 2026 – ai-service.ts Rebuild + Contextual Chat Verification

### ai-service.ts Rebuilt
- **Ollama-driven analysis:** Uses `OllamaService` for embeddings and completions
- **Dynamic DB import:** Lazy-loads drizzle to avoid crashes when DB unavailable
- **Async flow fixed:** Proper handling for embeddings, auto-tags, document chunks
- **Models:** `gemma3-legal:latest` for LLM, `embeddinggemma:latest` for embeddings

### Contextual Chat System Verified
- **chat-store.svelte.ts:** Clean Svelte 5 runes (`$state`, `$derived`, `$derived.by`)
- **ChatSession.svelte.ts:** SSE-based real-time chat with reconnection logic
- **OllamaService:** Proper endpoint configuration via `get-ollama-endpoint.ts`

### Core Files Status (All Clean)
- `sveltekit-frontend/src/lib/services/ai-service.ts` ✅
- `sveltekit-frontend/src/lib/services/ollamaService.ts` ✅
- `sveltekit-frontend/src/lib/stores/chat-store.svelte.ts` ✅
- `sveltekit-frontend/src/lib/models/ChatSession.svelte.ts` ✅
- `sveltekit-frontend/src/routes/chat/+page.svelte` ✅
- `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` ✅

### Stack Configuration
- **Drizzle ORM:** 0.44 with PostgreSQL + pgvector
- **Client Caching:** LokiJS + IndexedDB
- **Server Caching:** Redis + Qdrant
- **Message Queue:** RabbitMQ
- **State Machines:** XState v5
- **Styling:** UnoCSS + bits-ui (Svelte 5 API)

### Known Issues
- Full `svelte-check` and `tsc` commands timeout due to thousands of errors in backup files
- Use `getDiagnostics` on specific files instead of full codebase checks
- Errors concentrated in `.mojibake-backup`, `.phase79.bak`, and parked routes

---

## ✅ January 19, 2026 – Svelte 5 Route Fixes

### Key Fixes Applied
- **Svelte 5 event attributes:** Use `onclick`/`onchange` instead of `on:click`/`on:change`.
- **Case routes repaired:** `cases/[id]` overview + board pages now use valid class syntax and fetch payloads.
- **Evidence upload (case scoped):** Fixed `allowedTypes`, return payload, and case title mapping.
- **Component repairs:**
  - `ContextualChatModal.svelte` payload mapping and CSS `rgba()` fixes
  - `CaseNotesEditor.svelte` function boundaries, handlers, and CSS fixes
  - `NesModal.svelte` supports `children?: Snippet`

### Notes
- Svelte 5 runes are in use (`$props`, `$state`, `$derived`).
- bits-ui uses component-level imports for Svelte 5 (no barrel exports).
- Prefer SSR-safe patterns and Drizzle ORM 0.44 queries.

## 🚨 **CRITICAL: Database Migration Safety Protocol**

### ⛔ **DO NOT PROCEED WITH THIS PUSH**

**STOP** if you see warnings like this during `npm run db:push:dev`:

```
⚠️  Warning  Found data-loss statements:
· You're about to delete kg_nodes table with 2764 items
· You're about to delete ts_errors table with 69311 items
· You're about to delete phase89_embeddings table with 34505 items
· You're about to delete error_topk_index table with 910413 items
```

**Answer NO or press Ctrl+C to abort immediately.**

### Why This Happens

Drizzle ORM compares your TypeScript schema files against the actual database. **Tables that exist in the database but aren't defined in your schema files are marked for deletion.**

This would delete **1.2 million+ records** including:
- **910,413 items** in error_topk_index
- **69,311 items** in ts_errors
- **54,384 items** in cpg_edges
- **40,106 items** in raw_error_embeddings
- All Phase 89 embeddings, clusters, and analysis data

### ✅ Safe Approaches

**Option 1: Add Missing Tables to Schema** (Recommended)
```typescript
// These tables exist in DB but not in schema - add them to prevent deletion
export const kgNodes = pgTable('kg_nodes', { ... });
export const tsErrors = pgTable('ts_errors', { ... });
```

**Option 2: Use `tablesFilter` in drizzle.config.ts**
```typescript
export default {
  tablesFilter: ['!phase89_*', '!kg_*', '!ts_errors', '!error_topk_index'],
} satisfies Config;
```

**Option 3: Use `introspect` to Auto-Generate**
```bash
npx drizzle-kit introspect
```

**Option 4: Raw SQL for Simple Changes** (Safest)
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS hashed_password TEXT;
```

### 🎯 Pre-Flight Checklist

Before running `npm run db:push:dev`:
1. ✅ Review migration SQL in `drizzle/*.sql`
2. ✅ Check for DROP TABLE statements
3. ✅ Check for DROP COLUMN statements
4. ✅ Verify schema includes all existing tables
5. ✅ Test on dev database first

**Remember:** Drizzle will happily delete millions of records if you let it. Always review, always verify, always backup.

---

## 🔬 Analysis Results (January 9, 2026)

### Phase 78: Intelligent Error Ranking

**System Architecture:**
```
svelte-check → Machine Format Log → AST Parser → Dependency Graph → Priority Ranking → Database
     ↓              ↓                    ↓              ↓               ↓              ↓
  84,764        Regex Parse        svelte/compiler   Centrality    0-100 Scale   PostgreSQL
  errors         126 errors         + estree-walker   Metrics      Clustering    + Drizzle
```

**Ranking Algorithm:**
```typescript
priority = baseScore
  + (blastRadius * 20)        // How many files affected?
  + (centralityScore * 15)    // How central to architecture?
  + severityBonus              // Error vs Warning
  - fixComplexity              // Trivial vs Expert
```

**Results:**
- Top ranking: 80.0 (module resolution errors)
- Average ranking: 80.0 across 49 clusters
- Cluster pattern: `unknown + ts` (TypeScript compiler errors)

### Svelte 5 Migration: Root Cause Analysis

**Problem:** bits-ui 2.14.4 changed exports for Svelte 5 compatibility

**Old Structure (bits-ui < 2.0):**
```typescript
// Single barrel export
export { Checkbox, Select, Label } from './components';

// Usage
import { Checkbox } from 'bits-ui';
<Checkbox.Root />
```

**New Structure (bits-ui 2.14.4):**
```typescript
// Component-specific exports
export * from './components/checkbox';
export * from './components/select';

// Required usage
import * as Checkbox from 'bits-ui/components/checkbox';
<Checkbox.Root />
```

**Why TypeScript Fails:**
- Barrel exports create circular dependency risks
- Module bundler cannot tree-shake effectively
- TypeScript's module resolution cache becomes stale
- `ComponentCtor` type doesn't expose `.Root` property in old pattern

**Solution Pattern:**
```typescript
// Direct component imports
import * as Checkbox from "bits-ui/components/checkbox";
import * as Select from "bits-ui/components/select";
import * as Label from "bits-ui/components/label";

// Direct utility imports
import { cn } from "$lib/utils/cn.js";  // Not from barrel export
```

### Error Cascade Analysis

**Single Root Cause → 80+ Errors:**
```
Misconfigured cn() import in index.ts
  ↓
20+ UI components import cn from $lib/utils
  ↓
TypeScript fails module resolution
  ↓
All components using cn() show "Module has no exported member"
  ↓
Cascading failures in 50+ route files importing those components
```

**Fix Impact:**
- Changed 1 import pattern
- Fixed 15 components
- Eliminated 80-90 cascading errors

### Performance Metrics

**AST Parsing:**
- Analyzed: 2,476 files
- Parsed: 126 errors
- Graph nodes: 10 (due to filtering)
- Time: ~5-10 seconds

**Database Operations:**
- Insert: 126 error records
- Update: AST context + priority scores
- Cluster: 49 unique patterns

### Recommendations

1. **Always use direct imports** for Svelte 5 projects
2. **Avoid barrel exports** in `$lib` for utilities
3. **Use machine format** for svelte-check logs (easier parsing)
4. **Monitor centrality metrics** to identify architectural hotspots
5. **Fix high-ranking errors first** (80+ priority score)

---

# Gemini - Legacy Context - Phase 72 AST Error Reduction + CUDA Acceleration

## 🚀 Docker Build & Run for WSL Linux

### Build in WSL

```bash
# Navigate to workspace
cd /mnt/c/path/to/legal-ai

# Build CUDA Docker image
docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:latest .

# Build with no cache
docker build -f docker/Dockerfile.cuda --no-cache -t legal-ai-gpu:latest .

# Build with progress
docker build -f docker/Dockerfile.cuda --progress=plain -t legal-ai-gpu:latest .

# Build with specific tag
docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:v1.0 -t legal-ai-gpu:latest .
```

### Run Container

```bash
# Basic run with GPU
docker run --gpus all -p 8000:8000 legal-ai-gpu:latest

# Run with all services exposed
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
  -v $(pwd)/phase72-ast-reduction:/app/phase72-ast-reduction \
  legal-ai-gpu:latest

# Run with environment variables
docker run --gpus all \
  -p 8000:8000 \
  -e CUDA_VISIBLE_DEVICES=0 \
  -e PYTHONUNBUFFERED=1 \
  -e NEO4J_URI=bolt://localhost:7687 \
  -e OLLAMA_URL=http://localhost:11434 \
  -e QDRANT_URL=http://localhost:6333 \
  -e REDIS_URL=redis://localhost:6379 \
  -e PHASE72_MAX_ITERATIONS=10 \
  legal-ai-gpu:latest

# Run in background with name
docker run -d --gpus all \
  -p 8000:8000 \
  --name legal-ai-gpu \
  --restart unless-stopped \
  legal-ai-gpu:latest

# Run with custom working directory
docker run --gpus all \
  -p 8000:8000 \
  -w /app \
  -v $(pwd):/app \
  legal-ai-gpu:latest

# Run with interactive terminal
docker run -it --gpus all \
  -p 8000:8000 \
  legal-ai-gpu:latest /bin/bash

# Run with resource limits
docker run --gpus all \
  -p 8000:8000 \
  -m 8g \
  --cpus 4 \
  legal-ai-gpu:latest
```

### Docker Compose (Preserved)

```bash
# Start GPU stack (new)
docker-compose -f docker/docker-compose.gpu.yml up -d

# Start existing stack (unchanged)
docker-compose -f docker/docker-compose.yml up -d

# Start both stacks together
docker-compose -f docker/docker-compose.yml up -d
docker-compose -f docker/docker-compose.gpu.yml up -d

# View logs
docker-compose -f docker/docker-compose.gpu.yml logs -f

# View specific service logs
docker-compose -f docker/docker-compose.gpu.yml logs -f legal-ai-gpu

# Stop stack
docker-compose -f docker/docker-compose.gpu.yml down

# Stop with volume cleanup
docker-compose -f docker/docker-compose.gpu.yml down -v

# Rebuild services
docker-compose -f docker/docker-compose.gpu.yml build

# Rebuild without cache
docker-compose -f docker/docker-compose.gpu.yml build --no-cache

# Rebuild specific service
docker-compose -f docker/docker-compose.gpu.yml build --no-cache legal-ai-gpu

# Scale services
docker-compose -f docker/docker-compose.gpu.yml up -d --scale legal-ai-gpu=2

# Pull latest images
docker-compose -f docker/docker-compose.gpu.yml pull

# Update and restart
docker-compose -f docker/docker-compose.gpu.yml pull
docker-compose -f docker/docker-compose.gpu.yml up -d
```

---

## 📊 Phase 72: AST Error Reduction

### What It Does
- Extracts all TypeScript/Svelte errors from codebase
- Clusters similar errors using GPU acceleration
- Generates AI patches using gemma3-legal model
- Applies patches with automatic validation
- Iterates until error count stabilizes

### Expected Outcomes
- **Error Reduction**: 95%+ (80k+ → <1k)
- **Success Rate**: 75-85% patch acceptance
- **Processing Time**: 15-30 minutes per cycle
- **GPU Utilization**: 70-90%

### Architecture
```
Error Extraction (svelte-check)
         ↓
Embedding Generation (Ollama)
         ↓
Neo4j Graph Construction
         ↓
GPU Clustering (CUDA K-means)
         ↓
AI Patch Generation (gemma3-legal)
         ↓
Patch Application (ts-morph)
         ↓
Validation (svelte-check)
         ↓
Self-Healing Loop (iterate)
```

### Key Services
- **Error Extraction**: Automatic svelte-check integration
- **Neo4j Graph**: Error relationship mapping
- **GPU Clustering**: CUDA-accelerated K-means
- **AI Patches**: gemma3-legal model integration
- **Validation**: Automatic rollback on failure
- **Progress Tracking**: Real-time metrics

### Specification
- Requirements: `.kiro/specs/phase-72-ast-error-reduction/requirements.md`
- Design: `.kiro/specs/phase-72-ast-error-reduction/design.md`
- Tasks: `.kiro/specs/phase-72-ast-error-reduction/tasks.md`

---

## ⚡ CUDA Acceleration

### 4-Phase Speedup

| Phase | Component | Current | GPU | Speedup | Week |
|-------|-----------|---------|-----|---------|------|
| A | Tokenization | 100ms | 20ms | 5x | 1 |
| B | Embedding | 500ms | 50ms | 10x | 2 |
| C | Vector Search | 100ms | 30ms | 3x | 3 |
| D | Reranking | 50ms | 6ms | 8x | 4 |
| **Total** | **Pipeline** | **750ms** | **106ms** | **7x** | **4 weeks** |

### Build CUDA Components

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

### Docker Build with CUDA

```bash
# Build CUDA image
docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:cuda12 .

# Run with GPU
docker run --gpus all -p 8000:8000 legal-ai-gpu:cuda12

# Run with CUDA debugging
docker run --gpus all \
  -p 8000:8000 \
  -e CUDA_LAUNCH_BLOCKING=1 \
  legal-ai-gpu:cuda12
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
# Create environment file
cat > .env.docker << 'EOF'
CUDA_VISIBLE_DEVICES=0
PYTHONUNBUFFERED=1
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

# Use with docker-compose
docker-compose -f docker/docker-compose.gpu.yml --env-file .env.docker up -d
```

---

## 📁 File Structure

```
legal-ai/
├── CMakeLists.txt                      # Root CMake
├── CUDA_ACCELERATION_ROADMAP.md        # CUDA plan
├── CUDA_QUICKSTART.md                  # Quick start
├── PHASE_72_AND_CUDA_SUMMARY.md       # Summary
├── IMPLEMENTATION_READY.md             # Checklist
├── claude.md                           # Claude guide
├── copilot.md                          # Copilot guide
├── gemini.md                           # This file
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

## 🚀 Deployment Steps

### Step 1: Build Docker Image

```bash
# In WSL Linux terminal
cd /mnt/c/path/to/legal-ai

# Build image
docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:latest .

# Verify build
docker images | grep legal-ai-gpu
docker image inspect legal-ai-gpu:latest
```

### Step 2: Start Services

```bash
# Option A: Docker run (single container)
docker run --gpus all -p 8000:8000 legal-ai-gpu:latest

# Option B: Docker Compose (full stack)
docker-compose -f docker/docker-compose.gpu.yml up -d

# Option C: Keep existing compose files
docker-compose -f docker/docker-compose.yml up -d
docker-compose -f docker/docker-compose.gpu.yml up -d
```

### Step 3: Verify Deployment

```bash
# Check API health
curl http://localhost:8000/api/health

# Check GPU metrics
curl http://localhost:8000/api/gpu-metrics

# Check services
docker ps

# Check logs
docker logs legal-ai-gpu
```

### Step 4: Run Phase 72

```bash
# Start Phase 72 orchestrator
docker exec legal-ai-gpu npm run phase72:run

# Monitor progress
docker exec legal-ai-gpu npm run phase72:progress

# View dashboard
open http://localhost:5174
```

---

## 📊 Monitoring & Management

### Container Management

```bash
# List containers
docker ps
docker ps -a

# View container details
docker inspect legal-ai-gpu

# View container logs
docker logs legal-ai-gpu
docker logs -f legal-ai-gpu
docker logs --tail 100 legal-ai-gpu

# View container stats
docker stats legal-ai-gpu
docker stats --no-stream legal-ai-gpu

# Execute commands
docker exec legal-ai-gpu nvidia-smi
docker exec legal-ai-gpu python3 -c "import torch; print(torch.cuda.is_available())"

# Stop/Start/Restart
docker stop legal-ai-gpu
docker start legal-ai-gpu
docker restart legal-ai-gpu

# Remove container
docker rm legal-ai-gpu
docker rm -f legal-ai-gpu
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

# GPU utilization
nvidia-smi dmon
```

### Performance Metrics

```bash
# Container resource usage
docker stats legal-ai-gpu

# Memory usage
docker exec legal-ai-gpu free -h

# Disk usage
docker exec legal-ai-gpu df -h

# CPU usage
docker exec legal-ai-gpu top -b -n 1
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

# Check GPU memory
docker exec legal-ai-gpu nvidia-smi --query-gpu=memory.total,memory.used --format=csv,noheader
```

### Build Issues

```bash
# Clean build
docker build -f docker/Dockerfile.cuda --no-cache -t legal-ai-gpu:latest .

# Build with verbose output
docker build -f docker/Dockerfile.cuda --progress=plain -t legal-ai-gpu:latest .

# Check build logs
docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:latest . 2>&1 | tail -100

# Build with specific base image
docker build -f docker/Dockerfile.cuda \
  --build-arg BASE_IMAGE=nvidia/cuda:12.0-devel-ubuntu22.04 \
  -t legal-ai-gpu:latest .
```

### Runtime Issues

```bash
# Check container logs
docker logs legal-ai-gpu

# Check for errors
docker logs legal-ai-gpu 2>&1 | grep -i error

# Inspect container
docker inspect legal-ai-gpu

# Check container processes
docker top legal-ai-gpu

# Check network
docker network inspect bridge
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

# Monitor memory
docker exec legal-ai-gpu watch -n 1 free -h
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

## ✅ Verification Checklist

- [ ] Docker image builds successfully
- [ ] GPU detected in container
- [ ] All services start (Neo4j, Ollama, Qdrant, Redis, Postgres)
- [ ] API health check passes
- [ ] GPU metrics endpoint responds
- [ ] Phase 72 orchestrator initializes
- [ ] Dashboard accessible at localhost:5174
- [ ] Benchmarks run successfully
- [ ] Error reduction working
- [ ] Patches being generated

---

## 🎯 Quick Reference

### Build
```bash
docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:latest .
```

### Run
```bash
docker run --gpus all -p 8000:8000 legal-ai-gpu:latest
```

### Compose
```bash
docker-compose -f docker/docker-compose.gpu.yml up -d
```

### Logs
```bash
docker logs -f legal-ai-gpu
```

### Stats
```bash
docker stats legal-ai-gpu
```

### Stop
```bash
docker stop legal-ai-gpu
```

### Remove
```bash
docker rm legal-ai-gpu
```

---

**Status**: ✅ Ready for Docker deployment in WSL Linux

**Build Command**: `docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:latest .`

**Run Command**: `docker run --gpus all -p 8000:8000 legal-ai-gpu:latest`

**Compose Command**: `docker-compose -f docker/docker-compose.gpu.yml up -d`
