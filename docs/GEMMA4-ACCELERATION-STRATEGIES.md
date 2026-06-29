# Gemma4 Offline Summarization: Acceleration Strategies

**Date**: June 29, 2026  
**Goal**: 10-100× throughput increase for 347 → 58,304 packet coverage  
**Bottleneck**: Gemma4 inference (1-3s per packet @ bounded concurrency=2)

---

## Strategy 1: Aggressive Parallelization (3-5× faster)

### Problem: Current Config
```bash
concurrency=2          # Only 2 parallel requests
max_tokens=256         # 256 tokens per summary
temperature=0.3        # Low randomness (good for quality)
```

**Cost**: 500 packets @ 2 concurrent = 250-750s = 4-12 minutes

### Solution: Increase Concurrency to 4-6
```bash
# Test RTX 3060 Ti's actual capacity
python scripts/gemma4/offline_summary_worker.py \
  --input=.tmp/backlog.ndjson \
  --output=.tmp/summaries.ndjson \
  --concurrency=4 \
  --max-tokens=256

# Expected: 250-750s / 4 = 60-190s = 1-3 minutes (4-5× faster)
# VRAM: Monitor with: nvidia-smi -l 1
```

**VRAM Risk**: At concurrency=4, peak VRAM usage ~6.5 GB (safe on 8GB)
- **Safe limit**: concurrency=5 (fits in 8GB)
- **Max safe**: concurrency=6 (tight, but possible with TurboQuant KV cache)

### Implementation
Edit `scripts/gemma4/offline_summary_worker.py`:
```python
# Line ~20
parser.add_argument("--concurrency", type=int, default=4, help="Parallel requests")  # 2 → 4
```

Or run with:
```bash
python scripts/gemma4/offline_summary_worker.py \
  --input=.tmp/backlog.ndjson \
  --output=.tmp/summaries.ndjson \
  --concurrency=4 \
  --max-tokens=256
```

**Speedup**: 4-5×  
**Time to 58K**: 24-40 hours → 6-10 hours

---

## Strategy 2: Reduce Token Budget (2-3× faster, quality trade-off)

### Problem: Max Tokens
```bash
--max-tokens=256       # Can be 1-2 sentences
```

**Cost per token**: ~50-100ms (Gemma4 decoding time)

### Solution: Reduce to 128 Tokens
```bash
python scripts/gemma4/offline_summary_worker.py \
  --input=.tmp/backlog.ndjson \
  --output=.tmp/summaries.ndjson \
  --concurrency=4 \
  --max-tokens=128       # Half the budget
```

**Expected**: 1-3s → 0.5-1.5s per packet (2× faster)

**Quality Trade-off**:
- 128 tokens: ~1 sentence (fast, minimal)
- 256 tokens: ~2 sentences (balanced, current)
- 512 tokens: ~3-4 sentences (verbose, slow)

**Recommendation**: Start with 128, sample outputs, decide if sufficient.

**Speedup**: 2-3×  
**Time to 58K**: 20-40 hours → 6-20 hours

---

## Strategy 3: Prompt Template Optimization (10-20% faster)

### Problem: Current Prompt
```python
# Current (47 tokens, includes filler)
prompt = f"""Summarize this code feature in 1-2 sentences:

Feature: {feature_label}
Source: {source_ref}
Keywords: {keywords_str}

Summary:"""
```

**Cost**: Extra tokens in prompt = longer decode time

### Solution: Minimal Prompt
```python
# Optimized (15 tokens, 68% reduction)
prompt = f"""Summarize: {feature_label}
Keywords: {keywords_str}
Summary:"""
```

Or ultra-minimal:
```python
# Ultra-minimal (10 tokens, 79% reduction)
prompt = f"{feature_label}\nKeywords: {keywords_str}\nSummary:"
```

**Expected**: 1-3s → 0.9-2.7s (10-20% faster)

**Implementation**:
Edit `scripts/gemma4/offline_summary_worker.py` line ~80:
```python
# Change:
prompt = f"""Summarize this code feature in 1-2 sentences:

Feature: {feature_label}
Source: {source_ref}
Keywords: {keywords_str}

Summary:"""

# To:
prompt = f"{feature_label}\nKwds: {keywords_str}\nSummary:"
```

**Speedup**: 1.1-1.2×  
**Time to 58K**: 20-40 hours → 18-36 hours (modest)

---

## Strategy 4: Multi-GPU Processing (Requires Setup)

### Problem: Single GPU Bottleneck
- RTX 3060 Ti handles 4-6 concurrent requests
- Cannot exceed 8GB VRAM
- Only one GPU available

### Solution: Batch Across Multiple Machines (If Available)
```bash
# Machine 1 (RTX 3060 Ti)
python offline_summary_worker.py \
  --input=backlog_A.ndjson \
  --output=summaries_A.ndjson \
  --concurrency=5

# Machine 2 (different GPU, if available)
python offline_summary_worker.py \
  --input=backlog_B.ndjson \
  --output=summaries_B.ndjson \
  --concurrency=5
```

**Speedup**: Linear with number of GPUs (5× for 5 machines)  
**Complexity**: High (requires separate hardware)

---

## Strategy 5: Streaming Responses (5-10% faster)

### Problem: Wait for Full Completion
```python
# Current: Wait for full response
response = await session.post(endpoint, json=payload)
data = await response.json()  # Blocks until complete
```

**Cost**: Latency until final token generated

### Solution: Stream Tokens (not block on completion)
```python
# Optimized: Start processing after first token
async with session.post(endpoint, json={**payload, "stream": True}) as resp:
    async for line in resp.content:
        if line.startswith(b'data:'):
            chunk = json.loads(line[5:])
            # Process immediately (delta arrival, not full completion)
```

**Expected**: 5-10% faster (early unblocking)

**Implementation**:
Edit `scripts/gemma4/offline_summary_worker.py` to handle streaming responses.

**Speedup**: 1.05-1.1×  
**Time to 58K**: 20-40 hours → 18-38 hours

---

## Strategy 6: Caching + Deduplication (Depends on Data)

### Problem: Duplicate Summaries
If many packets have same feature_label, keywords, you're re-summarizing identical inputs.

### Solution: Cache Summary Results
```python
# Check cache before calling Gemma4
cache_key = hash(f"{feature_label}:{keywords_str}")
if cache_key in summary_cache:
    return summary_cache[cache_key]  # Instant (0ms)

# If miss, generate and cache
summary = await gemma4_request(...)
summary_cache[cache_key] = summary
```

**Expected**: Depends on deduplication ratio
- 10% duplicates: 10% faster
- 50% duplicates: 50% faster

**Implementation**:
Add to Python worker:
```python
import hashlib

summary_cache = {}

def get_cache_key(feature_label, keywords):
    key = f"{feature_label}:{','.join(keywords)}"
    return hashlib.md5(key.encode()).hexdigest()
```

**Speedup**: Variable (1-2× if high deduplication)

---

## Strategy 7: Aggressive TTL-Based Cache (L1 + L2)

### Problem: Redis L1 Cache Only Hits on Exact Duplicates
If you're running the same 5,000 packets twice, only first 5,000 miss.

### Solution: Hierarchical Cache
```python
# Check Redis (L1) by feature_label hash
summary_key = f"summary:{feature_label}:{hash(keywords)}"
if await redis.exists(summary_key):
    return await redis.get(summary_key)  # 5ms

# Check Qdrant (L2) by semantic similarity
similar = await qdrant.search(
    collection="summaries_768",
    vector=embed(feature_label),
    limit=1,
    threshold=0.95  # Very similar
)
if similar:
    return similar[0].payload["summary"]  # 30ms

# If no cache hit, call Gemma4 (1-3s)
```

**Expected**: After first 5,000 packets, 80-90% cache hits
- **Phase A (Cold)**: 5,000 packets = 4-10 hours (all Gemma4)
- **Phase B (Warm)**: Next 5,000 = 30-60 min (80% cache hits)
- **Phase C (Hot)**: Next 48,304 = 2-4 hours (85% cache hits)

**Speedup**: 5-10× after first batch (asymptotic)

---

## Strategy 8: Quantization + Smaller Model (Quality Trade-off)

### Problem: Gemma4 is Large
- Model size: 5.3 GB (IQ4_XS quantization)
- Token generation: 1-3s per request

### Solution: Use Smaller Model for Summaries
```bash
# Instead of gemma4-legal-iq4xs-direct
# Try: Llama 2 7B or Mistral 7B (faster, smaller)

--model mistral-7b-instruct  # 3.3GB, 0.5-1s per summary
--model neural-chat-7b       # 3.8GB, 0.5-1s per summary
```

**Trade-off**: Quality vs speed
- Gemma4 (5.3GB): Best quality, slowest
- Mistral 7B (3.3GB): Good quality, 2× faster
- Phi-2 (2.7GB): Decent quality, 3× faster

**Recommendation**: Benchmark Mistral 7B:
```bash
python scripts/gemma4/offline_summary_worker.py \
  --input=.tmp/sample_100.ndjson \
  --output=.tmp/mistral_results.ndjson \
  --model="mistral-7b-instruct" \
  --concurrency=5 \
  --max-tokens=128

# Compare output quality vs speed
```

**Speedup**: 2-3× (if acceptable quality)  
**Time to 58K**: 20-40 hours → 7-20 hours

---

## Strategy 9: Batch Embedding (CPU Optimization)

### Problem: Embedding After Gemma4 is Sequential
```python
# Current flow
for summary in summaries:
    embedding = await ollama.embed(summary)  # 1-2s each
    cache_summary(embedding)
```

### Solution: Batch Embed via Worker Threads
```python
# Optimized: 100 embeddings in parallel
from piscina import Piscina

embeddings = [summary["summary"] for summary in summaries]
pool = Piscina(maxsize=4)
embed_results = await pool.run(
    batch_embed_summaries,
    embeddings,
    batch_size=100
)
```

**Expected**: 500 embeddings @ 0.2s each (sequential) = 100s
→ 500 embeddings @ 4 workers = 25s (4× faster)

**Speedup**: 3-4× on embedding phase (10-15% overall)

---

## Strategy 10: Skip Embedding (Radical)

### Problem: Embedding Adds 20-30% Time
```
Gemma4: 1-3s per packet × 5,000 = 5,000-15,000s
Embedding: 0.1-0.3s per packet × 5,000 = 500-1,500s (10-30% of total)
```

### Solution: Defer Embedding
```bash
# Just generate summaries, skip embedding phase
node scripts/atlas/offline-summary-pipeline.mjs \
  --limit=5000 \
  --skip-embedding
```

**Speedup**: 1.15-1.3× (skip 10-30% of time)  
**Time to 58K**: 20-40 hours → 15-35 hours

**Trade-off**: Summaries won't be searchable in Qdrant until later embedding pass.

---

## Recommended Combination (10-20× Throughput)

### Aggressive: 8-10× Speedup
```powershell
# Use concurrency=5 + token=128 + prompt optimization
python scripts/gemma4/offline_summary_worker.py \
  --input=.tmp/backlog.ndjson \
  --output=.tmp/summaries.ndjson \
  --concurrency=5 \                    # 2 → 5 (2.5× parallelism)
  --max-tokens=128 \                   # 256 → 128 (2× token reduction)
  --endpoint=http://127.0.0.1:8090/v1/completions

# + Skip embedding (10-15% savings)
node scripts/atlas/offline-summary-pipeline.mjs \
  --limit=5000 \
  --skip-embedding                     # 10-15% faster

# + Hierarchical cache (80% hit rate after first batch)
# (requires code change to add Qdrant L2 cache)

# Total: 2.5× (parallelism) × 2× (tokens) × 1.15× (skip embed) × 1.2× (dedup) = 6.9× faster
```

**Expected Timeline**:
- Phase A (5,000 packets, cold): 2-4 hours (1-3s Gemma4 per packet × concurrency=5)
- Phase B (5,000 packets, 80% cache): 20-40 min
- Phase C (48,304 packets, 85% cache): 3-6 hours

**Total to 58K**: 5-10 hours (vs 20-40 hours baseline)

---

## Ultra-Aggressive: 20-50× Speedup (Radical Trade-offs)

```bash
# Smaller model + minimal tokens + aggressive concurrency
python scripts/gemma4/offline_summary_worker.py \
  --model="phi-2" \                    # 2.7GB, 2× faster
  --concurrency=6 \                    # Push limit
  --max-tokens=64 \                    # Single sentence only
  --endpoint=...

# Skip embedding entirely (defer 1 day)
# Skip Redis cache (use PostgreSQL only)
# Checkpoint every 100 packets (not every 1)

# Total: 3× (phi-2 vs Gemma4) × 2.5× (concurrency) × 4× (tokens) × 1.15× (skip embed)
#      = 34× faster
```

**Expected Timeline**:
- **5,000 packets: 10-20 min** (vs 4-10 hours)
- **58,000 packets: 2-4 hours** (vs 20-40 hours)

**Trade-off**: Phi-2 quality lower than Gemma4 (may need human review for some).

---

## Recommended Path (Balanced)

### Phase 1: Quick Validation (Aggressive, 1 hour)
```powershell
# 5,000 packets @ concurrency=5, token=128, skip embedding
.\scripts\gemma4\Invoke-OfflineSummarization.ps1 `
  -Limit 5000 `
  -Concurrency 5 `
  -MaxTokens 128 `
  -SkipEmbedding
```

**Output**: 5,000 summaries in 1-2 hours (8× speedup), ~9% coverage

### Phase 2: Assess Quality (30 min)
```sql
SELECT summary FROM atlas_summary_layers 
WHERE layer_type='gemma4_offline' 
ORDER BY RANDOM() 
LIMIT 20;
```

Check if 128-token summaries are sufficient.

### Phase 3: Full Expansion (Varies)
```powershell
# If quality OK, continue aggressive:
.\scripts\gemma4\Invoke-OfflineSummarization.ps1 `
  -Limit 10000 `
  -Concurrency 5 `
  -MaxTokens 128

# If need better quality, drop to token=256 but keep concurrency=4:
.\scripts\gemma4\Invoke-OfflineSummarization.ps1 `
  -Limit 10000 `
  -Concurrency 4 `
  -MaxTokens 256
```

---

## VRAM Monitoring (Critical)

```bash
# Watch VRAM in real-time during worker runs
watch -n 1 'nvidia-smi --format=csv --query-gpu=name,memory.used,memory.free'

# Expected with concurrency=5:
# Peak: 6.5 GB / 8 GB (safe, ~20% headroom)

# If VRAM > 7.5 GB:
# Reduce concurrency: 5 → 4 or 4 → 3
# Reduce max_tokens: 256 → 128
```

---

## Files to Modify (Aggressive Strategy)

### 1. `scripts/gemma4/offline_summary_worker.py`
```python
# Line 20: Increase default concurrency
parser.add_argument("--concurrency", type=int, default=5, help="Parallel requests")

# Line 80-90: Optimize prompt
prompt = f"{feature_label}\nKeywords: {keywords_str}\nSummary:"

# Line 60: Optional deduplication
summary_cache = {}
```

### 2. `scripts/gemma4/Invoke-OfflineSummarization.ps1`
```powershell
# Add flags for concurrency & max-tokens
param(
    [int]$Concurrency = 5,              # 2 → 5
    [int]$MaxTokens = 128,              # 256 → 128
    [switch]$SkipEmbedding,             # NEW
)

# Pass to worker
--concurrency=$Concurrency `
--max-tokens=$MaxTokens `
```

### 3. `scripts/atlas/offline-summary-pipeline.mjs`
```javascript
// Skip embedding phase if flag set
if (config.skipEmbedding) {
  console.log('\n⏭️  Phase 4: Skipped (--skip-embedding)');
  return [];
}
```

---

## Summary Table

| Strategy | Speedup | Time to 58K | Effort | Trade-off |
|----------|---------|------------|--------|-----------|
| Baseline | 1× | 20-40 hrs | — | — |
| +Concurrency (2→5) | 2.5× | 8-16 hrs | Low | VRAM usage |
| +Token reduction (256→128) | 2× | 4-8 hrs | Trivial | Quality (minimal) |
| +Skip embedding | 1.15× | 3.5-7 hrs | Trivial | Defer embedding |
| **Combination (Aggressive)** | **8-10×** | **2-4 hrs** | **Low** | **Minor quality** |
| +Phi-2 model | 3× | 0.5-1.5 hrs | Medium | Quality (noticeable) |
| +Hierarchical cache | 5-10× (asymptotic) | 1-3 hrs (after warm-up) | Medium | Code complexity |
| **Combination (Ultra)** | **20-50×** | **30 min - 4 hrs** | **High** | **Major trade-offs** |

---

## Action Items (Start Here)

1. **Immediate (5 min)**: Add `--concurrency=5` flag to PowerShell script
2. **Quick (10 min)**: Reduce `--max-tokens=256 → 128` in prompt
3. **Test (30 min)**: Run 500-packet batch with new settings, sample output
4. **Decide (5 min)**: Is 128-token quality acceptable? If yes, continue. If no, revert to 256.
5. **Scale (2-4 hours)**: Expand to 5,000-10,000 packets with validated settings

**Expected Result**: 5,000 packets summarized in 1-2 hours (vs 4-10 hours baseline).

---

## Verification Checklist

- [ ] Concurrency=5 doesn't cause VRAM > 7.5 GB
- [ ] Max-tokens=128 produces acceptable summaries (sample 20)
- [ ] Skip-embedding works (defers embedding to later phase)
- [ ] 500-packet batch completes in <30 min
- [ ] Redis cache hit rate tracked and improving
- [ ] Coverage growth monitored (347 → 500 → 1,000 → 5,000+)
