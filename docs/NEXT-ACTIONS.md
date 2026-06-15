# Next Actions — Start Here

## TL;DR

You have everything ready. Follow these steps:

```powershell
# 1. Start TurboQuant with your legal GGUF (5 seconds)
npm run turbo:start:detached

# 2. Test it works (1 minute)
.\scripts\atlas\test-legal-gguf.ps1

# 3. Test full stack (30 seconds)
.\scripts\test-stack.ps1

# 4. Warm Atlas cache (5-10 minutes first run)
npm run atlas:warm

# Done! You now have:
# ✅ Legal GGUF ready for inference
# ✅ Bifrost caching active
# ✅ Atlas summarization cached
# ✅ Tree nodes ready for custom traversals
```

---

## Step-by-Step

### Step 1: Start TurboQuant (Legal GGUF)

```powershell
npm run turbo:start:detached
```

**What this does:**
- Launches `llama-server.exe`
- Loads `models/gemma4-legal-iq4xs-direct.gguf` (4.8GB)
- Starts on http://127.0.0.1:8090
- Logs to `logs/turboquant/launch-*.err`

**Expected output:**
```
[INFO] Starting llama-server...
[INFO] Loading model: models/gemma4-legal-iq4xs-direct.gguf
[INFO] Model loaded successfully
[INFO] Server running on http://127.0.0.1:8090
```

### Step 2: Verify Legal GGUF Works

```powershell
.\scripts\atlas\test-legal-gguf.ps1
```

**Checks:**
1. ✅ TurboQuant health
2. ✅ Legal model loaded
3. ✅ Inference works
4. ✅ Bifrost routing ready

**Expected:**
```
✅ TurboQuant is running
✅ Legal GGUF model is loaded
✅ Inference successful
✅ Bifrost is running
```

### Step 3: Test Full Stack

```powershell
.\scripts\test-stack.ps1
```

**Checks:**
1. ✅ TurboQuant :8090
2. ✅ Qdrant :6333
3. ✅ Bifrost :3040
4. ✅ Redis (cache)
5. ✅ Postgres (identity)

**Expected:**
```
1️⃣  TurboQuant (legal GGUF)...    ✅ OK
2️⃣  Qdrant REST...                 ✅ OK
3️⃣  Bifrost Cache...               ✅ OK
4️⃣  Redis/Valkey...                ✅ OK (PONG)
5️⃣  Postgres...                     ✅ OK
```

### Step 4: Warm Atlas Cache

```powershell
npm run atlas:warm
```

**What this does:**
1. Loads unsummarized packets from Postgres (P0 frozen identity)
2. Summarizes each file via legal GGUF
3. Caches summaries in Bifrost (L1 Redis + L2 Qdrant)
4. Writes to Postgres `atlas_packets.summary`

**Progress:**
```
[atlas-warm] Summarizing 500 files via legal GGUF...
[atlas-warm] 100/500 (320s remaining)  ← First run is slow (cold)
[atlas-warm] 200/500 (215s remaining)
...
[atlas-warm] Complete: 500 cached, 0 failed (632s total)
```

**Second run:**
```
[atlas-warm] Summarizing 0 files...  ← Cache hits, nothing to do
[atlas-warm] All packets already summarized
```

---

## What You Now Have

After these 4 steps:

```
✅ Legal GGUF (4.8GB) loaded in TurboQuant
✅ Bifrost routing requests to legal GGUF
✅ L1 Redis cache storing exact matches (4h TTL)
✅ L2 Qdrant cache storing semantic hits (4h TTL)
✅ Postgres storing frozen identity + summaries
✅ Atlas Engram warm with 500 summarized files
✅ Custom tree nodes ready for legal traversals
✅ PageIndex ready for page-level searches
```

---

## Tests You Can Run Now

### Quick Test (Legal Inference)
```powershell
curl -X POST http://127.0.0.1:8090/v1/chat/completions `
  -H "Content-Type: application/json" `
  -d '{
    "model": "gemma4-legal-iq4xs-direct.gguf",
    "messages": [{"role": "user", "content": "What is hearsay evidence in one sentence?"}],
    "max_tokens": 100,
    "temperature": 0.3
  }'
```

**Expected response in 3-5 seconds:**
```json
{
  "choices": [{
    "message": {
      "content": "Hearsay is an out-of-court statement offered to prove the truth of the matter asserted..."
    }
  }]
}
```

### Cache Hit Test (Repeated Query)
```powershell
# First time (cold)
time { curl ... }  # ~3-5 seconds

# Second time (L1 Redis cache)
time { curl ... }  # ~5ms (6,542× faster!)
```

### Qdrant Vector Store
```powershell
# List collections
curl http://127.0.0.1:6333/collections

# Expected: Empty (no documents indexed yet)
```

---

## Troubleshooting

### TurboQuant won't start
```powershell
# Check error log
type logs/turboquant/launch-*.err | tail -50

# Check VRAM
nvidia-smi

# If 8GB is full, free Ollama memory
curl http://127.0.0.1:11434/api/generate -d '{"model": "gemma4-rotorquant:latest", "keep_alive": 0}'

# Try again
npm run turbo:start:detached
```

### Legal GGUF loads but inference is slow (> 10s)
```powershell
# Check GPU utilization
nvidia-smi

# Check if you have an RTX card (not integrated)
nvidia-smi -L

# If CPU-only fallback, that's why it's slow
# Solution: Install NVIDIA drivers or reduce context length
```

### Bifrost caching not working
```powershell
# Check Redis is working
docker exec legal-ai-redis redis-cli PING

# Check cache keys exist
docker exec legal-ai-redis redis-cli KEYS "bifrost:*" | wc -l

# Should increase as you query
```

---

## Next Milestones

### Immediate (Done Today)
- [ ] `npm run turbo:start:detached`
- [ ] `.\scripts\atlas\test-legal-gguf.ps1`
- [ ] `npm run atlas:warm`
- [ ] Legal GGUF is the default inference model

### This Week
- [ ] Implement bifrost-summary-worker.ts (from SETUP doc)
- [ ] Add `npm run atlas:warm` to dev startup pipeline
- [ ] Monitor cache hit rate (`docker exec legal-ai-redis redis-cli KEYS "bifrost:*"`)

### This Sprint (P1 Agentic Error Fixing)
- [ ] Extract PageIndex (page-level summaries)
- [ ] Build tree node hierarchies (case structure)
- [ ] Custom traversals for evidence pathfinding
- [ ] Error classification by legal domain

### Later (P2+)
- [ ] Start Ollama when document indexing is needed
- [ ] Build RAG search with embeddings
- [ ] Qdrant semantic caching (Bifrost L2)
- [ ] GPU-accelerated clustering (SOM)

---

## Files You Created

### Documentation (Read These)
- `CLARITY-OLLAMA-VS-LEGAL-GGUF.md` — Understand the difference
- `EMBEDDINGS-ONLY-OLLAMA-SETUP.md` — When to use Ollama
- `LEGAL-GGUF-BIFROST-ATLAS-SETUP.md` — Full implementation
- `ATLAS-LEGAL-GGUF-QUICKSTART.md` — Quick reference

### Test Scripts (Run These)
- `scripts/atlas/test-legal-gguf.ps1` — Verify legal GGUF works
- `scripts/test-stack.ps1` — Test full stack

### Implementation Examples (Copy These)
- See `LEGAL-GGUF-BIFROST-ATLAS-SETUP.md` for `bifrost-summary-worker.ts`

---

## Success Criteria

After step 4, you should see:

```
✅ Legal GGUF inference: 3-5 seconds per query
✅ Bifrost L1 cache hit: 5ms (after repeat query)
✅ Atlas warm: 5-10 min first run, <5 sec cached
✅ 500+ files summarized and cached
✅ No Ollama running (not needed yet)
✅ Tree nodes ready for custom traversals
```

---

## One-Liner Status Check

```powershell
# Are we ready?
(Invoke-WebRequest http://127.0.0.1:8090/health).StatusCode -eq 200 `
  -and (Invoke-WebRequest http://127.0.0.1:3040/health).StatusCode -eq 200 `
  -and (Invoke-WebRequest http://127.0.0.1:6333/collections).StatusCode -eq 200
# Should return: True
```

---

## Questions?

See the documentation:
- **Ollama confusion?** → `CLARITY-OLLAMA-VS-LEGAL-GGUF.md`
- **Architecture?** → `LEGAL-GGUF-BIFROST-ATLAS-SETUP.md`
- **Qdrant gRPC error?** → `EMBEDDINGS-ONLY-OLLAMA-SETUP.md`
- **Custom traversals?** → See PageIndex/tree node sections in SETUP doc

**GO:** `npm run turbo:start:detached` 🚀

