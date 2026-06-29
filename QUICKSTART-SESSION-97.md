# Session 97 Quick Start: Offline Summary Pipeline Execution

**Ready to run**: 50 → 500 → 5,000+ packet summarization with full caching.

---

## Prerequisites Check (5 min)

```bash
# 1. Verify llama-server running
curl -s http://127.0.0.1:8090/health && echo "✓ llama-server OK" || echo "✗ Start with scripts/launch-turboquant.ps1"

# 2. Verify Postgres
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets" && echo "✓ Postgres OK"

# 3. Verify Redis/Valkey
docker exec legal-ai-valkey redis-cli PING && echo "✓ Redis OK"

# 4. Verify Python environment
python -c "import aiohttp; print('✓ aiohttp OK')" || pip install aiohttp orjson tqdm

# 5. Check GPU
node -e "const a=require('./simd-bridge/cpp/build/Release/tensorrt_bridge.node'); console.log('✓ CUDA:', a.checkCudaAvailable()===1 ? 'ON' : 'OFF')"
```

---

## Phase 1: 50-Packet Pilot (Dry-Run) — 10 min

**Goal**: Verify entire pipeline with no writes to Postgres.

```powershell
# PowerShell: Full orchestration (dry-run)
cd C:\Users\james\Videos\deeds-web-app
.\scripts\gemma4\Invoke-OfflineSummarization.ps1 `
  -Limit 50 `
  -Concurrency 1 `
  -MaxTokens 256 `
  -DryRun

# Expected output:
# ✓ Phase 1: Export Backlog — found 50 unsummarized packets
# ✓ Phase 2: Cache Check — cache hits/misses
# ✓ Phase 3: Gemma4 Worker — 50 packets summarized in 30-50s
# ✓ Phase 4: Embed Summaries — 50 embeddings cached in Redis
# ✓ Phase 5: Update Metadata — 5-10 centroids cached
# ✓ Phase 6: Import (DRY-RUN) — 50 rows, no writes
```

**If successful**: Proceed to Phase 2

**If failed**: 
- Check `curl http://127.0.0.1:8090/health` (llama-server running?)
- Check `.tmp/pipeline-backlog.ndjson` (valid packets exported?)
- Check `.tmp/pipeline-summaries.ndjson` (summaries generated?)

---

## Phase 2: 500-Packet Batch (Apply) — 15 min

**Goal**: First production batch with Postgres writes.

```powershell
# PowerShell: Apply mode (writes to Postgres)
.\scripts\gemma4\Invoke-OfflineSummarization.ps1 `
  -Limit 500 `
  -Concurrency 2 `
  -MaxTokens 256 `
  -DryRun:$false

# Expected duration: 10-20 minutes
# Bottleneck: Gemma4 inference @ 1-3s/packet
# 500 packets / 2 concurrent = 250-750 seconds = 4-12 minutes

# Monitor progress (in separate terminal):
watch -n 2 "psql -U legal_admin -d legal_ai_db -c \"SELECT COUNT(*) FROM atlas_summary_layers WHERE layer_type='gemma4_offline'\""
```

**Verify success**:
```sql
SELECT COUNT(*) FROM atlas_summary_layers WHERE layer_type = 'gemma4_offline';
-- Should return: 500

SELECT COUNT(*) FROM atlas_summary_layers;
-- Should return: 347 (old) + 500 (new) = 847
```

**Redis cache check**:
```bash
docker exec legal-ai-valkey redis-cli KEYS "summary:embedding:*" | wc -l
# Should return: ~500 (one per summary)
```

---

## Phase 3: 5,000-Packet Batch (Incremental) — 1-2 hours

**Goal**: Significant coverage expansion (1.5% → 9%).

```powershell
# Run iteratively (resumable after crashes)
.\scripts\gemma4\Invoke-OfflineSummarization.ps1 `
  -Limit 5000 `
  -Concurrency 2 `
  -SkipExport:$true `  # Reuse existing backlog if possible
  -DryRun:$false

# Or run smaller batches for finer control:
.\scripts\gemma4\Invoke-OfflineSummarization.ps1 -Limit 1000 -Concurrency 2
.\scripts\gemma4\Invoke-OfflineSummarization.ps1 -Limit 1000 -Concurrency 2
.\scripts\gemma4\Invoke-OfflineSummarization.ps1 -Limit 1000 -Concurrency 2
.\scripts\gemma4\Invoke-OfflineSummarization.ps1 -Limit 1000 -Concurrency 2
.\scripts\gemma4\Invoke-OfflineSummarization.ps1 -Limit 1000 -Concurrency 2
```

**Monitor coverage**:
```bash
# Watch summary growth
watch -n 60 "psql -U legal_admin -d legal_ai_db -c \"SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN summary IS NOT NULL THEN 1 END) as summarized,
  ROUND(100.0 * COUNT(CASE WHEN summary IS NOT NULL THEN 1 END) / COUNT(*), 2) as pct
FROM atlas_packets ap
LEFT JOIN atlas_summary_layers asl ON ap.packet_key = asl.packet_key;\""
```

**Expected progression**:
- After 500: 1.5% (847 / 58,304)
- After 2,500: 6% (3,500 / 58,304)
- After 5,000: 9% (5,500 / 58,304)

---

## Phase 4: Full Corpus (Optional, Overnight) — 20-40 hours

**Goal**: Near-complete coverage for validation.

```powershell
# Run overnight with maximum concurrency
.\scripts\gemma4\Invoke-OfflineSummarization.ps1 `
  -Limit 50000 `
  -Concurrency 2 `
  -DryRun:$false

# Better: Run as background job
Start-Job -ScriptBlock {
  cd C:\Users\james\Videos\deeds-web-app
  .\scripts\gemma4\Invoke-OfflineSummarization.ps1 -Limit 50000 -Concurrency 2
} -Name "OfflineSummarization"

# Check progress
Get-Job -Name "OfflineSummarization" | Receive-Job
```

---

## Manual Commands (If Pipeline Fails)

### Export only (Node)
```bash
node scripts/atlas/export-summary-backlog.mjs \
  --limit=500 \
  --output=.tmp/summary-backlog.ndjson
```

### Gemma4 worker only (Python)
```bash
# Activate venv first
.venv-gemma4\Scripts\activate

python scripts/gemma4/offline_summary_worker.py \
  --input=.tmp/summary-backlog.ndjson \
  --output=.tmp/gemma4-summaries.ndjson \
  --endpoint=http://127.0.0.1:8090/v1/completions \
  --concurrency=2 \
  --max-tokens=256
```

### Import only (Node)
```bash
# Dry-run
node scripts/atlas/import-gemma4-summaries.mjs \
  --input=.tmp/gemma4-summaries.ndjson \
  --dry-run

# Apply
node scripts/atlas/import-gemma4-summaries.mjs \
  --input=.tmp/gemma4-summaries.ndjson \
  --apply
```

---

## Troubleshooting

### Problem: "llama-server not responding"
```bash
# Start llama-server
cd C:\Users\james\Videos\deeds-web-app
.\scripts\launch-turboquant.ps1
```

### Problem: "Postgres connection failed"
```bash
# Check Docker
docker ps | grep legal-ai-postgres

# Verify connection
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT 1"
```

### Problem: "Python module not found (aiohttp, orjson)"
```bash
python -m venv .venv-gemma4
.venv-gemma4\Scripts\activate
pip install aiohttp orjson tqdm
```

### Problem: "CUDA not available"
```bash
# TensorRT Bridge will still work (CPU fallback), but GPU clustering will be slow
node -e "const a=require('./simd-bridge/cpp/build/Release/tensorrt_bridge.node'); console.log(a.checkCudaAvailable())"
# Should print 1 (yes) or 0 (no)
```

### Problem: "Redis authentication failed"
```bash
# Check Redis password in .env
cat .env | grep REDIS_PASSWORD

# Test Redis
docker exec legal-ai-valkey redis-cli -a redis PING
```

---

## Performance Expectations

| Batch | Duration | Coverage | Incremental |
|-------|----------|----------|-------------|
| 50 (pilot) | 5-10 min | 0.9% | First pass validation |
| 500 | 10-20 min | 1.5% | Fast batch |
| 1,000 | 20-40 min | 3% | 1 batch |
| 5,000 | 50-150 min | 9% | 5 batches |
| 10,000 | 100-300 min | 17% | Incremental |
| 50,000 | 500-1500 min | 86% | Overnight |
| 58,304 | 600-1800 min | 100% | Full corpus (1-3 days) |

**Bottleneck**: Gemma4 inference (1-3s per packet with bounded concurrency=2)

---

## After Summary Coverage Reaches 5,000+

1. **Revisit GPU clustering proof** (Session 97+)
   ```bash
   # Re-run k-means with richer feature vectors
   node scripts/test-tensorrt-bridge-validation.mjs --full
   
   # Compare against CPU baseline
   # Document as: tensorrt_bridge_proven (vs candidate)
   ```

2. **Update OpenSpec specifications**
   - Layer 1-4 materialization (canonical flow)
   - GPU clustering (with proof depth)
   - Summary enrichment (Gemma4 integration)

3. **Proceed with downstream work**
   - Chrom97 packet generation
   - Feature envelope enrichment
   - Agent Scheduler job validation

---

## Key Files Reference

| File | Purpose | Phase |
|------|---------|-------|
| `Invoke-OfflineSummarization.ps1` | Main orchestrator (all-in-one) | All |
| `offline_summary_worker.py` | Gemma4 inference worker | 3 |
| `offline-summary-pipeline.mjs` | Full Node integration | 1-6 |
| `export-summary-backlog.mjs` | Postgres export | 1 |
| `import-gemma4-summaries.mjs` | Postgres import | 6 |

---

## Quick Links

- **Comprehensive Guide**: `docs/OFFLINE-SUMMARY-OPTIMIZATION-GUIDE.md`
- **GPU Validation**: `docs/SESSION-96-SUMMARY-GPU-VALIDATED.md`
- **Cache Architecture**: `docs/OFFLINE-SUMMARY-OPTIMIZATION-GUIDE.md#cache-architecture-l1-l3`
- **Monitoring**: `docs/OFFLINE-SUMMARY-OPTIMIZATION-GUIDE.md#monitoring--debugging`

---

## Status: READY TO EXECUTE

✅ Prerequisites checked  
✅ Pipeline architecture complete  
✅ GPU functions validated  
✅ Python async worker ready  
✅ Cache optimization documented  

**Go**: Phase 1 (50-packet pilot) — 10 minutes to first validation.
