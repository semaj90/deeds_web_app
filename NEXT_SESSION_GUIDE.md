# Next Session Quick Start Guide

**Date Created**: April 13, 2026
**Prerequisites**: Load testing suite complete, gemma3:270m validated

---

## Immediate Task: Cache Layer Validation

**Goal**: Test L1 (Redis) + L2 (Bifrost) + L3 (Ollama) cache system with real traffic

**Time Required**: 15-30 minutes

---

## Option A: TurboQuant llama-server (Recommended) ⭐

### Why TurboQuant?
- Bypasses Bifrost 120s timeout issue
- 2× faster than Ollama (80 tok/s vs 40 tok/s)
- Supports Flash Attention + Q4_0 KV cache
- Wired into inference router at priority #4

### Step 1: Start llama-server

```bash
# Find gemma4-legal GGUF file
ls ~/.ollama/models/blobs/ | grep sha256

# Copy to workspace (largest file, ~7GB)
cp ~/.ollama/models/blobs/sha256-XXXXX ./gemma4-legal.gguf

# Start llama-server on port 8090
llama-server \
  -m ./gemma4-legal.gguf \
  --port 8090 \
  -ngl 99 \
  --flash-attn \
  -c 8192 \
  -ctk q4_0 \
  -ctv q4_0 \
  --parallel 4
```

**Expected Output**:
```
llama server listening at http://0.0.0.0:8090
```

### Step 2: Verify Health

```bash
# Check server is responding
curl http://localhost:8090/health

# Expected: {"status":"ok"}
```

### Step 3: Run Load Test

```bash
# Test with main /api/ai/chat endpoint (uses inference router)
cd scripts/tests
node redis-load-test.mjs --duration=60 --concurrency=10
```

**Expected Results**:
- Requests routed through: Bifrost cache check (500ms) → TurboQuant (:8090)
- Bypasses Bifrost 120s timeout
- L1 (Redis) hits: 20-30%
- L2 (Bifrost) hits: 60-70%
- L3 (TurboQuant) hits: 10-20%
- Combined hit rate: 80-90%
- Average latency: <5s

### Step 4: Analyze Results

Check load test report for:
```json
{
  "hitRates": {
    "l1": 25.5,      // Redis exact match
    "l2": 65.3,      // Bifrost semantic
    "combined": 90.8 // ✅ Target met!
  },
  "latency": {
    "p99": 18.5      // ✅ Under 20ms target
  }
}
```

---

## Option B: Fix Inference Router (Alternative)

**If TurboQuant doesn't work**, quick-fix the router timeout:

### Step 1: Reduce Bifrost Timeout

Edit `src/lib/server/inference/inference-router.ts`:

```typescript
// Line 267: Change timeout from 120s → 10s
const content = await bifrostChat(messages, model, {
  temperature: request.temperature,
  maxTokens: request.maxTokens,
  timeoutMs: 10_000  // Was 120_000
});
```

### Step 2: Restart Dev Server

```bash
# Kill current server
pkill -f "vite dev"

# Restart
npm run dev
```

### Step 3: Test with Ollama Fallback

```bash
# Load test now routes: Bifrost (10s timeout) → Ollama (:11434)
node scripts/tests/redis-load-test.mjs --duration=60 --concurrency=5
```

**Expected**:
- Some requests timeout (Ollama still slow)
- But no 120s hangs
- Cache layers partially validated

---

## Option C: Continue with gemma3:270m

**If both above fail**, keep using fast model:

### Already Working

```bash
# Current setup (from last session)
# - /api/ai/chat-direct endpoint
# - gemma3:270m model
# - 100% success rate

node scripts/tests/redis-load-test.mjs --duration=60 --concurrency=10
```

**Trade-off**:
- ✅ Validates infrastructure
- ✅ Tests throughput
- ⚠️ Bypasses L1+L2 cache (direct Ollama)
- ⚠️ Not production model

---

## Short-Term Tasks (This Week)

### 1. TensorRT Conversion 📔

**Notebook**: `scripts/unsloth-training/Gemma4_TensorRT_INT4_Export.ipynb`

**Steps**:
1. Open in Colab (recommended) or local Jupyter
2. Run all cells sequentially
3. Expected time: 30-45 minutes
4. Output: TensorRT engine (~3GB)

**Result**: gemma4-legal 3-5× faster (34s → 5-10s)

### 2. Redis Direct Benchmark

```bash
# Test Redis performance directly
docker exec deeds-redis-prod redis-benchmark \
  -h localhost -p 6379 \
  -t get,set \
  -n 100000 \
  -q

# Expected: >50,000 ops/sec
```

### 3. Fix Inference Router (Production)

Update `inference-router.ts`:

```typescript
// Add fast-fail health checks
const TRT_HEALTH_TIMEOUT_MS = 500;
const TRITON_HEALTH_TIMEOUT_MS = 500;
const BIFROST_TIMEOUT_MS = 10_000;  // Reduce from 120s

// Add circuit breakers
const MAX_FAILURES_BEFORE_SKIP = 3;
```

---

## Success Criteria

### Cache Layer Validation ✅

| Metric | Target | How to Verify |
|--------|--------|---------------|
| **Combined Hit Rate** | ≥90% | Load test report `hitRates.combined` |
| **p99 Latency** | <20ms | Load test report `latency.p99` |
| **L1 (Redis) Hits** | 20-30% | Report `hitRates.l1` |
| **L2 (Bifrost) Hits** | 60-70% | Report `hitRates.l2` |
| **Zero Failures** | 0 | Report `requests.failed` |

### TensorRT Conversion ✅

| Metric | Target | How to Verify |
|--------|--------|---------------|
| **Latency** | <10s | Benchmark in notebook |
| **Speedup** | 3-5× | Compare to Ollama baseline |
| **VRAM** | <4GB | `nvidia-smi` during inference |
| **Quality** | >95% accuracy | Legal benchmark suite |

---

## Quick Commands Reference

```bash
# Start TurboQuant
llama-server -m gemma4-legal.gguf --port 8090 -ngl 99 --flash-attn

# Check health
curl localhost:8090/health

# Run load test (router)
node scripts/tests/redis-load-test.mjs --duration=60 --concurrency=10

# Run load test (direct)
node scripts/tests/redis-load-test.mjs --duration=60 --concurrency=5

# Monitor GPU
nvidia-smi dmon -s u -c 60

# Monitor Redis
watch -n 5 'docker exec deeds-redis-prod redis-cli INFO stats | grep keyspace'

# Check Bifrost
curl http://localhost:3040/health
```

---

## Troubleshooting

### TurboQuant won't start

**Error**: `llama-server: command not found`

**Fix**:
```bash
# Install llama.cpp with CUDA
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp
make LLAMA_CUDA=1
sudo cp llama-server /usr/local/bin/
```

### Load test times out

**Check**:
1. Dev server running: `curl localhost:5173/api/health`
2. TurboQuant responding: `curl localhost:8090/health`
3. Bifrost running: `curl localhost:3040/health`

**Fix**: Restart services and retry

### Cache hit rate 0%

**Possible causes**:
1. Using `/api/ai/chat-direct` (bypasses cache) → Use `/api/ai/chat`
2. Redis not configured → Check `docker ps | grep redis`
3. Bifrost not running → Check `docker ps | grep bifrost`

**Fix**: Verify all services running, use correct endpoint

---

## Expected Timeline

**Immediate** (15-30 min):
- ✅ Start TurboQuant
- ✅ Run load test
- ✅ Validate cache layers

**Today** (1-2 hrs):
- ⏳ TensorRT conversion (notebook)
- ⏳ Benchmark Redis directly
- ⏳ Document results

**This Week** (3-5 hrs):
- ⏳ Deploy TensorRT server
- ⏳ Fix inference router
- ⏳ Full load test suite with production model

---

**Last Updated**: April 13, 2026, 12:45 AM
**Ready to Run**: Yes — all prerequisites met
**Recommended**: Start with Option A (TurboQuant)
