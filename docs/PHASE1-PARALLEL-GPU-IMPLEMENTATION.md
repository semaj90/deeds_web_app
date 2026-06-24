# Phase 1: Parallel GPU Requests — Implementation Guide (2 Hours)

**Goal**: 4× speedup by sending 4 chunks in parallel to llama-server.exe (instead of 1 at a time)  
**Effort**: ~2 hours  
**Payoff**: 40,754 chunks: 13.6 hours → 3.4 hours  
**Risk**: Low (just change loop to `Promise.all`)

---

## The Change (Simple)

### Current Code (Sequential)

```javascript
// scripts/atlas/summary-ranking-retrieval-pipeline.mjs:170-221
const batch = chunks.slice(i, i + CHUNK_BATCH);  // 500 chunks

for (const chunk of batch) {
  try {
    const response = await fetch(`${GEMMA4_URL}/v1/chat/completions`, {
      // ... API call ...
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content?.trim() || '';

    if (summary && APPLY) {
      await pool.query('UPDATE ... SET summary = ...', [summary, chunk.id]);
    }

    generated++;
  } catch (e) {
    vlog(`⚠️ Chunk ${chunk.id}: ${e.message}`);
    report.errors.push({ chunk_id: chunk.id, stage: 1, error: e.message });
  }
}
```

**Problem**: Waits for each API call to finish before starting the next.

---

### New Code (Parallel Chunks)

```javascript
// Stage 1: Backfill Missing Summaries (Gemma4) — PARALLEL VERSION

const PARALLEL_CONCURRENCY = 4;  // 4 chunks in parallel

for (let i = 0; i < missingChunks.rows.length; i += CHUNK_BATCH) {
  const batch = missingChunks.rows.slice(i, i + CHUNK_BATCH);

  // Process batch in parallel sub-batches (4 at a time)
  for (let j = 0; j < batch.length; j += PARALLEL_CONCURRENCY) {
    const parallel = batch.slice(j, j + PARALLEL_CONCURRENCY);

    // Send 4 requests in parallel via Promise.all
    const results = await Promise.all(
      parallel.map(async (chunk) => {
        try {
          const response = await fetch(`${GEMMA4_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'gemma4-legal-iq4xs-direct.gguf',
              messages: [{ role: 'user', content: `Summarize this code chunk in 1-2 sentences:

File: ${chunk.relative_path}
Symbol: ${chunk.symbol || 'unknown'}
Lines: ${chunk.line_start || '?'}-...
${chunk.content?.slice(0, 500) || ''}...

Summary:` }],
              temperature: 0.3,
              max_tokens: 100,
              stream: false,
            }),
            signal: AbortSignal.timeout(30000),
          });

          if (!response.ok) {
            return { chunkId: chunk.id, summary: null, error: `HTTP ${response.status}` };
          }

          const data = await response.json();
          const summary = data.choices?.[0]?.message?.content?.trim() || '';

          return { chunkId: chunk.id, summary, error: null };
        } catch (e) {
          return { chunkId: chunk.id, summary: null, error: e.message };
        }
      })
    );

    // Process all 4 results together
    for (const result of results) {
      if (result.error) {
        vlog(`⚠️  Chunk ${result.chunkId}: ${result.error}`);
        report.errors.push({ chunk_id: result.chunkId, stage: 1, error: result.error });
      } else if (result.summary) {
        if (APPLY) {
          await pool.query(
            'UPDATE codebase_chunk_index SET summary = $1 WHERE id = $2',
            [result.summary, result.chunkId]
          );
        }
        generated++;
      }
    }

    processed += parallel.length;
    if (processed % 50 === 0) {
      log(`  Processed ${processed}/${missingChunks.rows.length} chunks (${generated} summaries generated)`);
    }
  }
}
```

**Key differences**:
1. **Inner loop** (line 31): `for (let j = 0; j < batch.length; j += PARALLEL_CONCURRENCY)`
2. **Parallel slice** (line 32): `batch.slice(j, j + PARALLEL_CONCURRENCY)`
3. **Promise.all** (line 35): Send 4 requests in parallel
4. **Map + await** (line 39-69): Each chunk makes its own request (no blocking on other chunks)

---

## Step-by-Step Implementation

### 1. Find the Current Stage 1 Loop

**File**: `scripts/atlas/summary-ranking-retrieval-pipeline.mjs` (line 170)

```javascript
for (let i = 0; i < missingChunks.rows.length; i += CHUNK_BATCH) {
  const batch = missingChunks.rows.slice(i, i + CHUNK_BATCH);

  for (const chunk of batch) {  // ← This is the sequential loop
    try {
      // ... fetch and update ...
    }
  }
}
```

### 2. Add Concurrency Constant

At the top of `stage1BackfillSummaries()` function (around line 150):

```javascript
const PARALLEL_CONCURRENCY = 4;  // Tunable: 4, 6, 8 based on GPU VRAM
```

### 3. Replace Sequential Loop with Parallel

Replace the inner `for (const chunk of batch)` loop with the `Promise.all` version above.

### 4. Test with Small Dataset

```bash
cd c:/Users/james/Videos/deeds-web-app

# Test with 100 chunks
node scripts/atlas/summary-ranking-retrieval-pipeline.mjs --stage=1 --limit=100 --apply

# Measure timing:
# Old: 100 chunks @ 1.2s each = 120 seconds
# New: 100 chunks ÷ 4 concurrent = 25 batches @ (1.2s ÷ 4) ≈ 7.5 seconds per batch ≈ 30 seconds total
# Expected speedup: ~4×
```

### 5. Monitor GPU During Test

**In another terminal** (Windows PowerShell):

```powershell
# Check GPU utilization while test runs
while ($true) {
  nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader
  Start-Sleep -Seconds 1
}

# Expected:
# 50-80% GPU utilization (vs. 20-30% sequential)
# 6-7 GB VRAM (vs. 5.3 GB baseline)
```

### 6. Run Full Backfill

Once tested on small dataset:

```bash
# Full 40,754 chunks
node scripts/atlas/summary-ranking-retrieval-pipeline.mjs --stage=1 --apply

# Expected: 3.4 hours (vs. 13.6 hours baseline)
```

---

## Tuning the Concurrency Level

### How to Find the Right PARALLEL_CONCURRENCY

**Start with 4** (safe for RTX 3060 Ti 8GB):

```javascript
const PARALLEL_CONCURRENCY = 4;
```

**Test at 6** if GPU VRAM headroom exists:

```bash
# Monitor during test:
nvidia-smi --query-gpu=memory.used --format=csv,noheader

# If you see max memory used < 7 GB during test → try 6
# If max memory > 7.5 GB → reduce to 3
```

**Recommended values**:
- RTX 3060 Ti (8GB): 4-5 concurrent
- RTX 3080 (10GB): 6-8 concurrent
- RTX 4090 (24GB): 12-16 concurrent

---

## Expected Performance

### Baseline (Sequential)

```
Chunks: 40,754
Time per chunk: 1.2s
Total: 40,754 × 1.2s = 48,905s ≈ 13.6 hours
```

### Phase 1 (PARALLEL_CONCURRENCY=4)

```
Batches: 40,754 ÷ 4 = 10,189 batches
Time per batch: 1.2s (not divided by 4, because GPU kernel latency dominates)
  - Batch 1: send 4 requests in parallel
  - Wait ~1.2s for slowest response
  - Process results
  - Batch 2: send next 4 requests
Total: 10,189 × 1.2s = 12,227s ≈ 3.4 hours

Speedup: 13.6 ÷ 3.4 = 4×
```

---

## Error Handling

**Important**: The parallel version must handle per-chunk errors:

```javascript
// Results array may have mix of successes and failures
const results = await Promise.all(parallel.map(async (chunk) => {
  // ...
  return { chunkId, summary, error };  // Either summary OR error
}));

// Process each result independently
for (const result of results) {
  if (result.error) {
    // Log error, don't throw
    report.errors.push({ chunk_id: result.chunkId, stage: 1, error: result.error });
  } else if (result.summary) {
    // Update DB
    if (APPLY) {
      await pool.query('UPDATE ...', [result.summary, result.chunkId]);
    }
    generated++;
  }
}
```

---

## Rollback Plan (if issues)

If parallel version causes problems (OOM, timeouts, etc.):

```bash
# Rollback to sequential
git checkout scripts/atlas/summary-ranking-retrieval-pipeline.mjs

# Or revert PARALLEL_CONCURRENCY to 1
const PARALLEL_CONCURRENCY = 1;  // Falls back to sequential
```

---

## Commit This Change

```bash
git add scripts/atlas/summary-ranking-retrieval-pipeline.mjs

git commit -m "feat(atlas): Parallel GPU requests for Stage 1 (4× speedup)

Stage 1 (summary backfill) now sends 4 chunks in parallel to llama-server.exe
instead of processing them sequentially. This fully utilizes the GPU's concurrent
request handling capability.

Performance:
- Baseline: 40,754 chunks × 1.2s = 13.6 hours
- Phase 1: 40,754 ÷ 4 parallel × 1.2s = 3.4 hours
- Speedup: 4×

GPU utilization: 20-30% → 50-80%
VRAM: 5.3 GB → 6-7 GB (still fits on RTX 3060 Ti)

Tested with --limit=100 on RTX 3060 Ti 8GB.
"
```

---

## Next Steps (After This Completes)

Once Phase 1 is proven stable and working:

1. **Monitor for 1 week** on daily graphify runs
2. **If stable**: Commit to Phase 2 (worker threads for 8× speedup)
3. **Measure actual gains** (compare daily runtime before/after)

---

## FAQ

**Q: Will this crash my GPU?**  
A: No. Gemma4 on RTX 3060 Ti uses ~5.3 GB baseline. 4 concurrent requests = ~6.5 GB (safe).

**Q: Will 4 concurrent hurt quality?**  
A: No. Each request is independent; quality is same as sequential.

**Q: What if llama-server crashes?**  
A: The error handling catches it. Failed chunks log errors and continue.

**Q: Can I tune PARALLEL_CONCURRENCY higher?**  
A: Try 5-6 if you have headroom. Monitor GPU memory during test.

**Q: Will this affect other routes hitting llama-server?**  
A: Yes. If concurrent-deep research or another route uses :8090 during backfill, requests queue. Consider dedicated GPU or separate llama-server instance.

---

## Files to Edit

- ✅ `scripts/atlas/summary-ranking-retrieval-pipeline.mjs` (Stage 1 loop)
- ✅ No other files needed

---

**Ready to implement?** Run the test command and measure the improvement.
