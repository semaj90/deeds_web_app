# Test Validation Sequence — April 13, 2026

## Status: READY TO RUN ✅

---

## Quick Validation (10 Minutes Total)

### Step 1: Redis Connectivity Test (30 seconds)

**What it tests:** Basic Redis read/write from SvelteKit

```bash
# Terminal (from repo root)
curl -X POST http://localhost:5173/api/test/redis-write
```

**Expected output:**
```json
{
  "success": true,
  "wrote": "test:1713024000000",
  "retrieved": {
    "test": true,
    "timestamp": "2026-04-13T..."
  },
  "totalKeys": 150
}
```

**✅ Pass criteria:** `success: true` and `totalKeys > 0`

---

### Step 2: L1 Redis Cache Test (2 minutes)

**What it tests:** 3-tier cache system (Redis L1 + Bifrost L2 + Ollama L3)

```bash
# Terminal (from repo root)
cd sveltekit-frontend
node scripts/tests/test-l1-cache.mjs
```

**Expected output:**
```
╔═══════════════════════════════════════════════════════╗
║       L1 Redis Cache Validation Test                 ║
╚═══════════════════════════════════════════════════════╝

Query: "What is hearsay evidence in 5 words?"
Model: gemma3:270m

━━━ Run 1: Cold (Direct Ollama) ━━━
✅ Success
   Server: 2,456ms
   Client: 2,502ms
   Cached: NO
   Content: Hearsay is a piece of evidence that is not sworn to be true...

━━━ Run 2: Warm (Redis L1 Hit Expected) ━━━
✅ Success
   Server: 5ms
   Client: 51ms
   Cached: YES ✨
   Content: Hearsay is a piece of evidence that is not sworn to be true...

━━━ Run 3: Hot (Redis L1 Hit Expected) ━━━
✅ Success
   Server: 5ms
   Client: 52ms
   Cached: YES ✨
   Content: Hearsay is a piece of evidence that is not sworn to be true...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Performance Analysis
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Run 1 (Cold):  2,456ms
Run 2 (Warm):  5ms (491× faster)
Run 3 (Hot):   5ms (491× faster)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Validation Results
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Cold inference (>1s):     ✅ PASS (2,456ms)
Warm cache hit (<100ms):  ✅ PASS (5ms)
Hot cache hit (<100ms):   ✅ PASS (5ms)

🎉 L1 Redis Cache: WORKING! 🚀
   Speedup: 491-491× faster on cache hits
```

**✅ Pass criteria:** All 3 validation checks PASS

---

### Step 3: Professional Analysis UIs (5 minutes)

**What it tests:** Enhanced keyboard shortcuts, toasts, help panels, copy buttons

#### 3A. Audio Analysis Editor

```
URL: http://localhost:5173/audio-analysis/1330f67c-bf15-4e3a-8da3-3565271b70ef
```

**Test checklist:**
- [ ] Press `?` → help panel appears with audio-specific shortcuts
- [ ] Press `ESC` → help panel closes
- [ ] Press `1` → switches to Transcription tab
- [ ] Press `2` → switches to Timeline tab
- [ ] Hover over timeline segment → copy button (📋 icon) appears
- [ ] Click copy button → green toast: "Copied to clipboard"
- [ ] Press `Ctrl+E` → green toast: "Exported audio-analysis-..."
- [ ] Press `ESC` → returns to evidence page

#### 3B. Video Analysis Editor

```
URL: http://localhost:5173/video-analysis/d469e6e2-f916-4a91-9bff-673b9f940beb
```

**Test checklist:**
- [ ] Press `?` → help panel shows video-specific shortcuts
- [ ] Press `1-5` → switches between 5 tabs (Overview/Frames/Scenes/Transcription/Analysis)
- [ ] Press `←` / `→` → navigates between frames
- [ ] Press `Ctrl+E` → green toast: "Exported video-analysis-..."
- [ ] Press `ESC` → returns to evidence page

#### 3C. Document Analysis Editor

```
URL: http://localhost:5173/document-analysis/4fc9c5d1-5678-4def-abcd-123456789abc
```

**Test checklist:**
- [ ] Press `?` → help panel shows document-specific shortcuts
- [ ] Press `Ctrl+F` → search box focused
- [ ] Type "evidence" → highlights appear in document
- [ ] Press `Ctrl+B` → sidebar toggles
- [ ] Press `Ctrl+Plus` → text size increases
- [ ] Press `Ctrl+Minus` → text size decreases
- [ ] Press `Ctrl+E` → green toast: "Exported document-analysis-..."

---

## Infrastructure Health Check (1 minute)

```bash
# Verify all 18 Docker services
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "deeds|phase66"
```

**Expected:** All services show "Up" status

**Check key services:**
- `deeds-redis-prod` — Up (L1 cache)
- `phase66-qdrant` — Up (L2 semantic cache)
- `phase66-neo4j` — Up (graph data)
- `deeds-postgres-prod` — Up (main DB)

---

## Quick Verification Commands

```bash
# Redis stats
docker exec deeds-redis-prod redis-cli INFO stats | grep keyspace_hits

# Bifrost health
curl http://localhost:3040/health

# Qdrant semantic cache collection
curl http://localhost:6333/collections/llm_response_cache | jq '.result.points_count'

# Ollama models
curl http://localhost:11434/api/tags | jq '.models[].name'

# GPU status
nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv,noheader
```

---

## Success Criteria

| Test | Target | Status |
|------|--------|--------|
| Redis write/read | `success: true` | ⏳ |
| L1 cache speedup | >300× | ⏳ |
| Audio shortcuts | All working | ⏳ |
| Video shortcuts | All working | ⏳ |
| Document shortcuts | All working | ⏳ |
| Infrastructure | 18/18 up | ⏳ |

---

## If Tests Fail

### Redis Write Test Fails

```bash
# Check Redis is running
docker ps | grep redis

# Check Redis logs
docker logs deeds-redis-prod --tail 20

# Restart if needed
docker restart deeds-redis-prod
```

### L1 Cache Test Fails

**Symptom:** All runs show >1,000ms latency

**Fix:**
1. Restart dev server: `Ctrl+C` → `npm run dev`
2. Clear Redis cache: `docker exec deeds-redis-prod redis-cli FLUSHDB`
3. Verify endpoint: `curl http://localhost:5173/api/test/ollama-cached`

### Analysis UIs Don't Load

**Symptom:** Page shows layout but no content

**Fix:**
1. Check `.env` has `DEV_BYPASS_AUTH=true`
2. Verify evidence exists: `psql postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db -c "SELECT id, title FROM evidence LIMIT 5"`
3. Check dev server logs for errors

---

## Performance Baselines (Your RTX 3060 Ti Setup)

| Metric | Expected Value | Acceptable Range |
|--------|----------------|------------------|
| Cold inference (gemma3:270m) | 2-3s | <5s |
| Redis L1 hit | 5ms | <50ms |
| Bifrost L2 hit | 2-5s | <10s |
| Cache speedup | 400-600× | >100× |
| GPU memory used | 4-6GB | <7GB |

---

## Next Actions After Tests Pass

1. **Document baseline performance** → Update CACHE_VALIDATION_RESULTS.md
2. **Production deployment prep** → Create deployment checklist
3. **Monitoring setup** → Grafana + Prometheus dashboards
4. **Optional: TRT-LLM roadmap** → Plan Phase 2 integration

---

**Ready to start testing!** Begin with Step 1 (Redis write test). 🚀
