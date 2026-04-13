# Cache Warm-Up System — Current Status

**Date**: April 13, 2026
**Time**: 08:55 UTC
**Session**: CLI Fixes + Troubleshooting

---

## ✅ Completed

### 1. CLI Script Updates
- **Fixed domain validation** — Added 'evidence-analysis' to validDomains array (line 131)
- **Fixed async response handling** — Updated to work with fire-and-forget API (lines 202-222)
- **Tested successfully** — Both `evidence-analysis` and `evidence` domains accepted

### 2. Server Files
- **API endpoint** — `/api/cache/warm-up/+server.ts` correctly validates 6 domains
- **Warm-up module** — `warm-up.ts` has all 120 queries across 6 domains
- **UI component** — `CacheWarmUpSimple.svelte` shows all 6 domain options

### 3. Test Runs
```bash
# Run 1: evidence-analysis domain (gemma4-legal, batch 3)
node scripts/cache-warmup.mjs --domain evidence-analysis --batch-size 3 --delay 500
✅ Started successfully (~3 min estimated)

# Run 2: evidence domain (gemma3:270m, batch 2)
node scripts/cache-warmup.mjs --domain evidence --batch-size 2 --model gemma3:270m
✅ Started successfully (~3 min estimated)
```

---

## ❌ Current Issue: Cache Keys Not Increasing

### Symptoms
- Warm-up API returns success immediately
- CLI confirms background processing started
- **BUT**: Cache keys remain at **4** (no increase after 2-5 minutes)

### Timeline
| Time | Event | Cache Keys |
|------|-------|------------|
| 08:49 | Started evidence-analysis (gemma4-legal) | 4 |
| 08:50 | Check after 15s | 4 |
| 08:51 | Check after 45s | 4 |
| 08:53 | Started evidence (gemma3:270m) | 4 |
| 08:54 | Check after 15s | 4 |
| 08:55 | Check after 45s | 4 |

### Expected Behavior
- **gemma3:270m**: ~3s/query, batch size 2 → first batch should complete in ~6s
- After 45 seconds: should have processed ~7-8 queries → cache keys should be ~11-12
- **Actual**: 0 new keys added

### Cache Stats API Response
```json
{
  "success": true,
  "stats": {
    "totalKeys": 4,
    "memoryUsedMB": 0,
    "avgTtlMinutes": 24,
    "rawBytes": 4640,
    "rawTtlSeconds": 1424
  },
  "timestamp": "2026-04-13T08:55:21.847Z"
}
```

---

## 🔍 Root Cause Analysis

### Hypothesis 1: Background Process Not Running
**Evidence**:
- Fire-and-forget pattern means API returns immediately
- No way to verify process actually started from API response
- Server console logs would show warm-up progress

**Check**:
```bash
# Look for these console messages in dev server output:
[warm-up] Starting cache warm-up
[warm-up] Total queries: 20
[warm-up] Processing batch 1/10 (2 queries)
  [1/20] "What is hearsay evidence..."
  ✓ [1] Success (150 chars)
[API warm-up] Background warm-up completed
```

### Hypothesis 2: bifrostChat() Not Writing to Cache
**Evidence**:
- Import exists: `import { bifrostChat } from '$lib/server/ollama.js'`
- Function exported correctly at line 208 of ollama.ts
- But L1 Redis cache write may not be triggered

**Check**:
```typescript
// In ollama.ts bifrostChat() function
// Should have L1 cache write like:
await setExactMatchCache(cacheKey, response, { ttl: 3600 });
```

### Hypothesis 3: Silent Errors in Background
**Evidence**:
- Promise.allSettled() catches errors but doesn't propagate
- try/catch in warm-up loop marks queries as failed but continues
- No error visibility without console access

**Check**: Look for error logs in server console

### Hypothesis 4: HMR Reload Interrupted Process
**Evidence**:
- File modifications trigger Vite HMR
- Background promises may not survive HMR
- Previous session had this issue when user edited warm-up.ts mid-run

**Check**: Restart dev server with `npm run dev` before triggering warm-up

---

## 🛠️ Immediate Debugging Steps

### Step 1: Check Server Console (CRITICAL)
**Action**: Look at the dev server terminal output

**Expected Output (Success)**:
```
[API warm-up] Starting background warm-up: {
  batchSize: 2,
  delayMs: 1000,
  model: 'gemma3:270m',
  domain: 'evidence',
  ...
}
[warm-up] Starting cache warm-up
[warm-up] Total queries: 20
[warm-up] Batch size: 2
[warm-up] Processing batch 1/10 (2 queries)
  [1/20] "What is hearsay evidence..."
  ✓ [1] Success (142 chars)
  [2/20] "Define preponderance of evidence..."
  ✓ [2] Success (156 chars)
[warm-up] Batch 1 complete: 2 success, 0 failed
[warm-up] Waiting 1000ms before next batch...
...
[warm-up] ═══════════════════════════════════════════
[warm-up] Cache Warm-Up Complete
[warm-up] Total queries:   20
[warm-up] Successful:      20 (100.0%)
[warm-up] Failed:          0
[warm-up] Duration:        65.2s
[API warm-up] Background warm-up completed: {
  totalQueries: 20,
  successful: 20,
  failed: 0,
  durationMs: 65234
}
```

**Expected Output (Failure)**:
```
[warm-up] Starting cache warm-up
  [1/20] "What is hearsay evidence..."
  ✗ [1] Error: Cannot read property 'messages' of undefined
[warm-up] Batch 1 complete: 0 success, 2 failed
...
[API warm-up] Background warm-up failed: TypeError: ...
```

**If No Output**: Process never started → import/export issue or route not mounted

### Step 2: Verify bifrostChat() Cache Write
**Action**: Check if bifrostChat() actually writes to L1 Redis cache

**File**: `sveltekit-frontend/src/lib/server/ollama.ts`

**Look for** (around line 208-250):
```typescript
export async function bifrostChat(
  messages: Message[],
  model: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  // Generate cache key
  const cacheKey = generateCacheKey({ model, messages, ...options });

  // L1: Check Redis exact-match cache
  const cachedResponse = await getExactMatchCache(cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }

  // L2/L3: Bifrost → Ollama fallback
  const response = await /* ... */;

  // ⚠️ CRITICAL: Write to L1 cache
  await setExactMatchCache(cacheKey, response, { ttl: 3600 });

  return response;
}
```

**Missing**: If no `setExactMatchCache()` call → cache writes not happening

### Step 3: Test Single Query Manually
**Action**: Call warm-up with dry-run first, then single query

```bash
# Dry run to verify queries
node scripts/cache-warmup.mjs --domain evidence --dry-run

# Single query test (batch size 1)
node scripts/cache-warmup.mjs --domain evidence --batch-size 1 --model gemma3:270m

# Wait 10 seconds
sleep 10

# Check cache - should go from 4 → 5 keys
curl http://localhost:5173/api/cache/exact-match/stats
```

### Step 4: Restart Dev Server
**Action**: Fresh start to eliminate HMR issues

```bash
# Terminal 1: Stop dev server
Ctrl+C

# Clear terminal
clear

# Restart dev server
npm run dev

# Wait for "ready in Xms" message

# Terminal 2: Run warm-up
node scripts/cache-warmup.mjs --domain evidence --batch-size 1 --model gemma3:270m
```

### Step 5: Test Cache-Demo Endpoint
**Action**: Verify cache writes work via direct endpoint

```bash
# This endpoint should write to cache
curl -X POST http://localhost:5173/api/test/cache-demo \
  -H "Content-Type: application/json" \
  -d '{"model":"gemma3:270m"}' \
  --max-time 60

# Check if cache keys increased
curl http://localhost:5173/api/cache/exact-match/stats
```

---

## 📊 Alternative: Monitor via Browser UI

**URL**: http://localhost:5173/cache-monitor

**Steps**:
1. Open cache monitor page
2. Note current "Total Keys" value
3. Click "Evidence (20 queries)" dropdown option
4. Click "▶️ Start Warm-Up" button
5. Watch "Total Keys" widget (updates every 3 seconds)
6. Should see keys increase from 4 → 6 → 8 → 10...

**Expected**: Keys increase as queries complete
**Actual**: Keys stay at 4 → confirms issue

---

## 📝 Files Created/Modified This Session

### Modified Files
1. `scripts/cache-warmup.mjs`
   - Line 131: Added 'evidence-analysis' to validDomains
   - Lines 202-222: Fixed async response handling

### New Files
1. `CACHE_WARMUP_STATUS.md` (this file)

### Previously Modified (Session Dependencies)
1. `src/lib/server/cache/warm-up.ts` — Added evidence-analysis queries (user)
2. `src/routes/api/cache/warm-up/+server.ts` — Added domain to Zod schema
3. `src/lib/components/monitoring/CacheWarmUpSimple.svelte` — UI component
4. `src/routes/(app)/cache-monitor/+page.svelte` — Integrated UI component

---

## 🎯 Next Actions

### Priority 1: Diagnose Why Background Process Isn't Adding Keys
1. **Check server console output** — Look for warm-up log messages
2. **Verify bifrostChat() writes to cache** — Check ollama.ts for setExactMatchCache()
3. **Test single query** — Batch size 1 to isolate issue

### Priority 2: If Process Is Running But Not Caching
1. Verify Redis connection in bifrostChat()
2. Check if `generateCacheKey()` is creating valid keys
3. Verify `setExactMatchCache()` is being called

### Priority 3: If Process Isn't Running At All
1. Check if warm-up functions are exported correctly
2. Verify fire-and-forget promise isn't being GC'd
3. Try synchronous version (revert to awaiting completion)

---

## 💡 Recommendations

### Short Term (Next 10 Minutes)
- **Check dev server console** — Most likely to reveal root cause
- **Restart dev server** — Eliminate HMR issues
- **Test with batch-size 1** — Simplify to isolate problem

### Medium Term (Next Session)
- Add progress tracking endpoint `/api/cache/warm-up/status/:jobId`
- Store warm-up jobs in Redis with status updates
- Add real-time progress via SSE or polling

### Long Term (Production)
- Run warm-up on server startup (not user-triggered)
- Schedule daily cache refresh via cron
- Add Langfuse traces to warm-up process
- Monitor cache hit rates in production dashboard

---

**Status**: 🔴 **BLOCKED** — Waiting for server console diagnosis

The CLI tool is working correctly, but the background warm-up process is not adding keys to Redis cache. Server console logs are needed to determine root cause.
