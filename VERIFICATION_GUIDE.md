# Runtime Matrix Verification Guide

**Status**: Ready to Run
**Duration**: 10-15 minutes
**Last Updated**: 2026-04-12

---

## Quick Start (3 Commands)

```bash
# 1. Run automated infrastructure check
bash scripts/verify-runtime-matrix.sh

# 2. Open interactive verification checklist (in browser)
# http://localhost:5173/scripts/tests/verification-checklist.html

# 3. Update Neo4j graph with results
bash scripts/neo4j/update-verification-status.sh
```

---

## What Gets Verified

### ✅ Automated Checks (Step 1)

**Cache Tiers** (3/3):
- ✅ Redis L1 (port 6379) — 5ms exact-match
- ✅ Bifrost L2 (port 3040) — 2-5s semantic
- ✅ Qdrant L3 (port 6333) — vector search backend

**Infrastructure Services** (4/4):
- ✅ PostgreSQL (port 5434)
- ✅ RabbitMQ (port 5672)
- ✅ Ollama (port 11434)
- ✅ SvelteKit Dev Server (port 5173)

**Optional Services** (0-5):
- ⚠️ Langfuse (port 3030) — observability
- ⚠️ TurboQuant (port 8090) — KV cache compression
- ⚠️ TensorRT (port 8099) — INT4 quantized inference
- ⚠️ LiteRT Sidecar (port 8070) — CPU fallback
- ⚠️ VLM Server (port 8085) — vision + text

---

### 🧪 Manual Tests (Steps 2-5)

**E2B WebGPU** (Step 2):
- Browser: Chrome 113+, Edge 113+, Safari 18+
- WebGPU adapter detection
- Model loading (5-10s first time)
- Inference latency (1-2s)
- **Result**: PASS or FAIL (auto-fallback)

**Unified Generation API** (Step 3):
- Client-side generation cascade
- Bifrost L2 → E2B → LiteRT → ONNX → Server
- Response latency (1-5s depending on tier)
- **Result**: PASS or FAIL

**Cache Performance** (Step 4):
- Redis L1 hit rate (target: 20-30%)
- Bifrost L2 hit rate (target: 70-90%)
- Combined hit rate (target: 90-95%)
- **Result**: PASS or FAIL

**LiteRT Sidecar** (Step 5):
- Optional (only if E2B fails)
- Port 8070 health check
- **Result**: PASS or SKIP

---

## Step-by-Step Instructions

### Step 1: Run Automated Infrastructure Check

```bash
cd c:\Users\james\Videos\deeds-web-app
bash scripts/verify-runtime-matrix.sh
```

**Expected Output**:
```
━━━ TIER 1: Cache Infrastructure ━━━

Redis L1 (port 6379): ✅ PASS
Bifrost L2 (port 3040): ✅ PASS
Qdrant L3 (port 6333): ✅ PASS

━━━ TIER 2: Server Infrastructure ━━━

PostgreSQL (port 5434): ✅ PASS
RabbitMQ (port 5672): ✅ PASS
Ollama (port 11434): ✅ PASS
Langfuse (port 3030): ✅ PASS

━━━ TIER 3: Server Inference Lanes ━━━

TurboQuant (port 8090): ⚠️  OPTIONAL (not running)
TensorRT (port 8099): ⚠️  OPTIONAL (not running)
LiteRT Sidecar (port 8070): ⚠️  OPTIONAL (not running)
VLM Server (port 8085): ⚠️  OPTIONAL (not running)

━━━ Verification Summary ━━━

Core Services: 7/7 passed
Optional Services: 1/5 running

Status: ✅ ALL CORE SERVICES HEALTHY
```

**If any core service fails**: Fix it before proceeding to manual tests.

---

### Step 2: Open Interactive Verification Checklist

**In browser**: http://localhost:5173/scripts/tests/verification-checklist.html

**What it does**:
- Guides you through all 5 verification steps
- Runs automated tests for infrastructure, API, cache
- Provides interactive buttons for E2B/LiteRT manual checks
- Shows real-time progress bar
- Generates downloadable JSON results

**How to use**:
1. Click "Run Auto-Check" for Step 1 (infrastructure)
2. Click "Open E2B Test Page" for Step 2 (opens in new tab)
3. Verify E2B loads correctly, then click "E2B PASS" or "E2B FAIL"
4. Click "Run API Test" for Step 3 (unified generation)
5. Click "Check Cache Stats" for Step 4 (cache performance)
6. Click "Check LiteRT Status" for Step 5 (or skip if not needed)
7. Download results JSON when complete

---

### Step 3: Update Neo4j Graph

```bash
bash scripts/neo4j/update-verification-status.sh
```

**Interactive prompts**:
```
Did E2B WebGPU load successfully? (y/n): y
  → E2B marked as verified ✅

Is LiteRT sidecar running? (y/n): n
  → LiteRT marked as optional (not enabled) ⚠️

What is the L1 hit rate? (0.0-1.0, press Enter to skip): 0.28
  → L1 hit rate: 0.28
```

**What it does**:
- Generates Neo4j Cypher update script
- Updates E2B verification status
- Updates LiteRT enabled status
- Updates Redis L1 hit rate
- Optionally auto-runs via `cypher-shell` (if installed)

**Manual update** (if cypher-shell not installed):
1. Open Neo4j Browser: http://localhost:7474
2. Login: `neo4j` / `legal123`
3. Copy-paste generated `scripts/neo4j/verification-update.cypher`
4. Click Run (Ctrl+Enter)

---

## Troubleshooting

### Core Service Failures

#### Redis L1 FAIL
```bash
# Check if Redis is running
docker ps | grep deeds-redis-prod

# If not running, start it
docker start deeds-redis-prod

# Verify
docker exec deeds-redis-prod redis-cli ping
# Expected: PONG
```

#### Bifrost L2 FAIL
```bash
# Check if Bifrost service is running
curl http://localhost:3040/health

# If not running, check Docker logs
docker logs bifrost-cache

# Restart if needed
docker restart bifrost-cache
```

#### Ollama FAIL
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# If not running, start native Ollama
# (Should auto-start on Windows boot)

# Verify GPU availability
curl http://localhost:11434/api/ps
```

#### Dev Server Not Running
```bash
# Start dev server
cd sveltekit-frontend
npm run dev

# Wait for "ready in <time>ms" message
# Then retry verification
```

---

### E2B WebGPU Failures

#### WebGPU Not Available
**Symptom**: Red status "WebGPU not available"

**Causes**:
- Browser too old (need Chrome 113+, Edge 113+, Safari 18+)
- GPU drivers outdated
- WebGPU disabled in browser flags

**Fix**:
1. Update browser to latest version
2. Update GPU drivers
3. Check `chrome://flags` → enable WebGPU
4. **Fallback**: Mark as FAIL — system will use LiteRT/ONNX/Server

---

#### Model Fails to Load
**Symptom**: Error during "Loading Gemma 4 E2B model..."

**Causes**:
- Model files missing from `static/gemma-4-E2B-it-ONNX/`
- Insufficient VRAM (<2GB free)
- Transformers.js library failed to download

**Fix**:
```bash
# Check model files exist
ls sveltekit-frontend/static/gemma-4-E2B-it-ONNX/

# Expected files:
# - model.onnx
# - model.onnx_data
# - tokenizer.json
# - config.json

# If missing, download from HuggingFace:
# https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX
```

---

#### Inference Timeout
**Symptom**: Model loads but inference never completes

**Causes**:
- GPU memory swap thrashing
- Browser tab throttled (not in foreground)
- WebGPU adapter selection failed

**Fix**:
- Close other GPU-heavy apps
- Keep browser tab in foreground
- Reload page and retry
- **Fallback**: Use LiteRT/ONNX instead

---

### Cache Performance Issues

#### Low Hit Rate (<20%)
**Symptom**: Redis L1 hit rate below 20%

**Causes**:
- Cache just started (needs warm-up)
- TTL too short (evicting before reuse)
- Query diversity too high (all unique)

**Fix**:
```bash
# Check cache memory
docker exec deeds-redis-prod redis-cli info memory

# Increase TTL to 2 hours
# In sveltekit-frontend/.env:
REDIS_CACHE_TTL=7200

# Warm cache with common queries
curl -X POST http://localhost:5173/api/sse/chat \
  -d '{"message":"What is hearsay evidence?"}'
```

---

#### Bifrost L2 Not Caching
**Symptom**: Bifrost L2 hit rate 0%

**Causes**:
- Bifrost service down
- Qdrant backend unavailable
- Threshold too high (0.9+)

**Fix**:
```bash
# Check Bifrost health
curl http://localhost:3040/health

# Check Qdrant backend
curl http://localhost:6333/

# Lower threshold to 0.7
# In request headers: x-bf-cache-threshold: 0.7
```

---

## Success Criteria

### Minimum Requirements (Production)
- ✅ 7/7 core services healthy
- ✅ E2B WebGPU **OR** LiteRT fallback working
- ✅ Unified API returns legal-quality answers
- ✅ Cache hit rate >50% (combined L1+L2)

### Ideal Targets (Optimal)
- ✅ 7/7 core services + 2+ optional services
- ✅ E2B WebGPU working (1-2s latency)
- ✅ TurboQuant running (15-20s latency)
- ✅ Cache hit rate 90-95% (combined L1+L2)
- ✅ Redis L1 latency <5ms
- ✅ Bifrost L2 latency 2-5s

---

## Post-Verification Tasks

### 1. Update Documentation

**Files to update**:
- `RUNTIME_MATRIX.md` — update "Status" fields
- `CLAUDE.md` — update "Current Status" section
- `memory/MEMORY.md` — add verification date

**Example**:
```markdown
- **E2B WebGPU**: ✅ VERIFIED (2026-04-12)
- **Cache Hit Rate**: 92% (L1: 28%, L2: 82%)
- **TurboQuant**: ⚠️ OPTIONAL (not running)
```

---

### 2. Deploy Neo4j Graph

**If not already deployed**:
```bash
# Start Neo4j
docker run -d \
  --name neo4j-runtime \
  -p 7474:7474 \
  -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/legal123 \
  neo4j:5.15

# Load graph
# Open http://localhost:7474
# Copy-paste scripts/neo4j/runtime-architecture-graph.cypher
# Run (Ctrl+Enter)

# Verify
# Run query: MATCH (n) RETURN count(n)
# Expected: 25 nodes
```

---

### 3. Enable Optional Services (If Needed)

**TurboQuant** (large context, VRAM-constrained):
```bash
llama-server \
  -m /models/gemma4-legal-Q4_K_M.gguf \
  --mmproj /models/mmproj-gemma4-BF16.gguf \
  --kv-cache-type turbo3 \
  --port 8090 \
  --ctx-size 32768 \
  --n-gpu-layers 40 \
  --flash-attn
```

**LiteRT Sidecar** (CPU fallback):
```bash
litert-lm serve \
  --model /models/gemma4_e2b_litert_int4.tflite \
  --port 8070 \
  --threads 8
```

**TensorRT** (INT4 quantized):
```bash
# See TensorRT deployment guide
# (Requires TRT engine build + Triton server)
```

---

### 4. Performance Baseline

**Run load test** (after verification):
```bash
# Test cache performance under load
node scripts/tests/load-test-cache.mjs

# Expected:
# - 90%+ cache hit rate after warm-up
# - <5ms avg latency for cache hits
# - 1-5s avg latency for cache misses (tier-dependent)
```

---

## Files Created

| File | Purpose | Lines |
|------|---------|-------|
| `RUNTIME_MATRIX.md` | Text documentation | 500+ |
| `scripts/neo4j/runtime-architecture-graph.cypher` | Neo4j graph schema | 500+ |
| `scripts/neo4j/README.md` | Graph visualization guide | 500+ |
| `scripts/verify-runtime-matrix.sh` | Automated infrastructure check | 250+ |
| `scripts/neo4j/update-verification-status.sh` | Neo4j update script | 150+ |
| `scripts/tests/verification-checklist.html` | Interactive browser checklist | 600+ |
| `VERIFICATION_GUIDE.md` | This guide | 400+ |

**Total**: ~2,900 lines of documentation + automation

---

## Next Steps After Verification

### Immediate (Today)
1. ✅ Run automated infrastructure check
2. ✅ Complete manual E2B/API tests
3. ✅ Update Neo4j graph with results
4. ✅ Document verification status in CLAUDE.md

### Short-Term (This Week)
1. ⚠️ Warm Redis L1 cache with common queries
2. ⚠️ Seed Bifrost L2 cache with 20-30 legal queries
3. ⚠️ Run load test to measure sustained performance
4. ⚠️ Enable TurboQuant if VRAM allows

### Long-Term (Next Month)
1. ⚠️ Add custom Neo4j queries for legal workflows
2. ⚠️ Export graph to Gephi for advanced visualization
3. ⚠️ Create monitoring dashboard (Grafana + Prometheus)
4. ⚠️ Set up alerting for cache hit rate drops

---

## Related Documentation

- `RUNTIME_MATRIX.md` — Complete lane/service reference
- `scripts/neo4j/README.md` — Neo4j graph visualization guide
- `UNIFIED_GENERATION_GUIDE.md` — Client-side generation API
- `BACKEND_INFRASTRUCTURE_AUDIT.md` — 17-gate service health checks
- `CLAUDE.md` — Full project instructions

---

**Last Updated**: 2026-04-12
**Verification Status**: Ready to Run
**Estimated Duration**: 10-15 minutes
