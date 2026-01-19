# Copilot - Phase 78 AST-Aware Error Ranking + Svelte 5 Migration

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

## 🎯 Phase 67-68 Error Reduction (January 11, 2026)

### Massive Reduction Achieved
- **Starting:** 150,925 errors
- **After Phase 67-68:** ~89,000 errors
- **Reduction:** -61,000 errors (**-41%**)

### Iteration Summary
| Iteration | Focus | Tool | Impact |
|-----------|-------|------|--------|
| 1. Legacy | Archive `ai.bak` | git mv | -27,134 |
| 2. Corruption | Phantom commas | regex | -34,511 |
| 3. Imports | Auto-import | ts-morph | -14 |
| 4. Types | Implicit any | ts-morph | +354 fixed params |

### Key Corruption Patterns Discovered
```typescript
// 1. Phantom Start Comma
Promise<{, valid: boolean }> // ❌ BAD
Promise<{ valid: boolean }>  // ✅ GOOD

// 2. Double Question Marks
status?? 'pending'  // ❌ BAD
status?: 'pending'  // ✅ GOOD

// 3. Colon in Generics
ActorRef<Snapshot: Event>  // ❌ BAD
ActorRef<Snapshot, Event>  // ✅ GOOD
```

### Error Distribution (89k remaining)
| Pattern | Count | % |
|---------|-------|---|
| `',' expected` | 26,414 | 30% |
| `Cannot find name` | 18,741 | 21% |
| `Declaration expected` | 4,953 | 5.5% |
| `Type refers to...` | 3,330 | 3.7% |

### 2025 Best Practices Applied

**TypeScript 5.7:**
- Enhanced variable initialization checks
- Path rewriting for relative imports
- ES2024 support (`Object.groupBy`, `Promise.withResolvers`)

**Svelte 5 Runes:**
```svelte
// OLD: export let name;
// NEW: let { name } = $props();

// OLD: $: doubled = count * 2;
// NEW: let doubled = $derived(count * 2);
```

**ts-morph v27:**
- `findReferencesAsNodes()` for safe refactoring
- `setType()` for annotations
- `addImportDeclaration()` for auto-imports

### Fixer Scripts Created
- `scripts/fix-syntax-corruption.mjs` (2080 files)
- `scripts/fix-syntax-patterns.mjs` (2038 files)
- `scripts/fix-missing-imports-enhanced.ts` (50+ files)
- `scripts/fix-implicit-any.ts` (354 files)

---

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

### Next Steps

1. **Continue Iteration 5:** Fix remaining Type-Import misuse (`import type` used as value)
2. **Run full pipeline:** `npm run phase78:full`
3. **Validate fixes:** `npm run phase78:ast-rank:test`

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
