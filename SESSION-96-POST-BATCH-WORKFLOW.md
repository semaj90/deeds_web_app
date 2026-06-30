# Session 96: Post-Batch Workflow Checklist

**Status**: 🟡 BATCH IN PROGRESS (170/57,976 packets = 0.3%)  
**Expected Completion**: July 1, 2026 ~06:00 UTC (~32 hours from start)  
**This Guide**: Execute in order once batch completes

---

## Pre-Flight Checks (Do Before Batch Completes)

✅ **Redis Health**
```bash
docker ps | grep valkey
# Should show: legal-ai-valkey running

docker exec legal-ai-valkey redis-cli ping
# Should return: PONG
```

✅ **Postgres Health**
```bash
docker ps | grep postgres
# Should show: legal-ai-postgres running

docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets"
# Should return: 58304 (or greater)
```

✅ **Batch Output File**
```bash
ls -lh .tmp/gemma4-production-summaries.ndjson
# Should be: 500MB+ (for full 57,976 packets)

# Count lines to verify completion
wc -l .tmp/gemma4-production-summaries.ndjson
# Should return: 57977 (57,976 packets + 1 header/footer if any)
```

---

## PHASE 1: Verify Batch Completion (5 minutes)

**Trigger**: Batch log shows `[Complete]: Total packets: 57976 Processed: 57976`

```bash
# Step 1: Check batch.log for completion marker
tail -20 .tmp/batch.log | grep -i "complete"
# Should see: [Complete]: Total packets: 57976

# Step 2: Verify output file line count
wc -l .tmp/gemma4-production-summaries.ndjson
# Expected: 57977 lines (57,976 packets)

# Step 3: Sample last packet to confirm format
tail -1 .tmp/gemma4-production-summaries.ndjson | jq '.packet_key, .summary' 2>/dev/null | head -5
# Should print packet_key and summary (or JSON parse error if tail is header)

# Step 4: Sanity check — verify all lines are valid JSON
node -e "
const fs = require('fs');
const lines = fs.readFileSync('.tmp/gemma4-production-summaries.ndjson', 'utf8').trim().split('\\n');
let valid = 0, invalid = 0;
for (const line of lines.slice(0, 10)) {
  try { JSON.parse(line); valid++; } catch { invalid++; }
}
console.log(\`Sample check (first 10): \${valid} valid, \${invalid} invalid\`);
"
# Expected: 10 valid, 0 invalid
```

**Decision**: 
- ✅ All checks pass → proceed to PHASE 2
- ❌ Batch incomplete → continue monitoring
- ❌ Batch errors → check `scripts/gemma4/offline_summary_worker.py` logs

---

## PHASE 2: Import to Postgres (10 minutes)

**Goal**: Transform Gemma4 output (NDJSON) into `analysis_pass_results` table rows.

```bash
cd sveltekit-frontend

# Step 1: Dry-run the import (no writes)
POSTGRES_PASSWORD=123456 npx tsx ../scripts/atlas/analysis-pass-orchestrator.mts
# Expected output:
#   [Dry-run] Ready to import 57976 packets
#   [Estimate] ~5-10 minutes, 300MB Postgres writes
#   Processing batch 1/58 (1000 packets)
#   ...
#   [Summary] Dry-run complete. 0 rows written (dry-run mode)

# Step 2: Execute import
POSTGRES_PASSWORD=123456 npx tsx ../scripts/atlas/analysis-pass-orchestrator.mts --apply
# Expected output:
#   [Import] Starting batch insert...
#   Processing batch 1/58 (1000 packets)
#   Processing batch 2/58 (1000 packets)
#   ...
#   [Summary] Imported 57976 packets. 57976 rows written to analysis_pass_results.

# Step 3: Verify Postgres rows
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='success') as success 
   FROM analysis_pass_results WHERE pass_key='gemma4_summary_v1';"
# Expected: total=57976, success=57976
```

**Decision**:
- ✅ Row count matches → proceed to PHASE 3
- ❌ Row count < 57976 → check orchestrator logs for errors
- ❌ Status != 'success' → verify Gemma4 response format

---

## PHASE 3: Warm BitFrost Cache (2.5 minutes)

**Goal**: Populate Redis with 4-tier hierarchical indexes for fast retrieval.

```bash
cd sveltekit-frontend

# Step 1: Dry-run the upsert (preview)
REDIS_PASSWORD=redis node ../../scripts/atlas/bitfrost-packet-upsert-optimized.mjs \
  sveltekit-frontend/.tmp/gemma4-production-summaries.ndjson --dry-run
# Expected output:
#   [Batch 1] Dry-run: ~4001 Redis commands (1000 packets, 0 skipped)
#   [Batch 2] Dry-run: ~4001 Redis commands (1000 packets, 0 skipped)
#   ...
#   [Summary] Batches processed: 58, Packets upserted: 57976, Duration: 12.3s

# Step 2: Clean up old keys + execute upsert
REDIS_PASSWORD=redis node ../../scripts/atlas/bitfrost-packet-upsert-optimized.mjs \
  sveltekit-frontend/.tmp/gemma4-production-summaries.ndjson --cleanup
# Expected output:
#   [Cleanup] Removed 25463 keys
#   [Batch 1] ✅ Upserted 1000 packets (~4001 commands)
#   [Batch 2] ✅ Upserted 1000 packets (~4001 commands)
#   ...
#   [Summary] Batches processed: 58, Duration: 150.2s

# Step 3: Verify Redis structure
docker exec legal-ai-valkey redis-cli DBSIZE
# Expected: 150000+ keys

docker exec legal-ai-valkey redis-cli KEYS "bifrost:feature:*" | wc -l
# Expected: 1000+ feature indexes

docker exec legal-ai-valkey redis-cli ZCARD "bifrost:index:all"
# Expected: 57976 packets in sorted index
```

**Decision**:
- ✅ All indexes populated → proceed to PHASE 4
- ❌ Key count < 150K → check for upsert errors
- ❌ Feature count = 0 → verify NDJSON has feature_id field

---

## PHASE 4: Final Verification (5 minutes)

**Goal**: End-to-end validation that all systems are aligned.

```bash
# Step 1: Verify Postgres ↔ Redis count match
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM analysis_pass_results WHERE pass_key='gemma4_summary_v1';"
# Expected: 57976

docker exec legal-ai-valkey redis-cli ZCARD "bifrost:index:all"
# Expected: 57976 (same count)

# Step 2: Sample cache hit (verify L1 retrieval)
docker exec legal-ai-valkey redis-cli KEYS "bifrost:packet:*" | head -1 | xargs \
  docker exec -i legal-ai-valkey redis-cli GET
# Expected: JSON envelope with packet_key, summary, feature_id, etc.

# Step 3: Test feature discovery (Tier 2 index)
docker exec legal-ai-valkey redis-cli SMEMBERS "bifrost:feature:auth.sessions" | head -5
# Expected: 5-10 packet_keys in set

# Step 4: Check directory grouping (Tier 3 index)
docker exec legal-ai-valkey redis-cli KEYS "bifrost:dir:*" | wc -l
# Expected: 100+ directory groups

# Step 5: Verify stats
docker exec legal-ai-valkey redis-cli HGETALL bifrost:stats
# Expected:
#   last_updated: {timestamp}
#   packet_count: 57976
```

**Decision**:
- ✅ All counts match → PHASE 4 COMPLETE ✅
- ⚠️  Postgres count ≠ Redis count → debug via analysis_pass_results query
- ⚠️  Cache stats missing → verify upsert's final step ran

---

## PHASE 5: Test 6-Layer Retrieval Chain (Optional, 5 minutes)

**Goal**: Verify end-to-end retrieval from BitFrost through Gemma4.

```bash
# Start dev server if not running
npm run dev &

# Wait for SvelteKit startup
sleep 5

# Test Layer 1 (BitFrost L1 exact-match cache)
curl -s http://localhost:5173/api/retrieval/cache/test?feature=auth.sessions | jq '.cache_hits, .latency_ms'
# Expected: cache_hits > 0, latency_ms 2-5

# Test Layer 3 (Qdrant semantic search)
curl -s http://localhost:5173/api/codebase/search?q=authentication | jq '.results | length, .[0].similarity'
# Expected: results > 0, similarity > 0.8

# Test Layer 5 (Gemma4 synthesis, if time permits)
curl -s -X POST http://localhost:5173/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"what handles auth?"}],"stream":false}' | jq '.response | .[0:100]'
# Expected: Gemma4 response starting with text
```

**Decision**:
- ✅ All layers working → 🎯 SESSION 96 COMPLETE
- ⚠️  Layer 1 slow (>10ms) → check Redis connection
- ⚠️  Layer 5 timeout → Gemma4 may need warming (llama-server restart)

---

## Rollback Plan (If Issues Arise)

### Revert Postgres Import
```bash
# Delete the import
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "DELETE FROM analysis_pass_results WHERE pass_key='gemma4_summary_v1' AND created_at > NOW() - INTERVAL '1 hour';"

# Verify deletion
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM analysis_pass_results WHERE pass_key='gemma4_summary_v1';"
```

### Revert Redis Warmup
```bash
# Delete bifrost keys (done via upsert --cleanup, safe to re-run)
docker exec legal-ai-valkey redis-cli DEL "bifrost:*"

# Verify
docker exec legal-ai-valkey redis-cli DBSIZE
```

---

## Timeline & Parallelization

```
Batch Running (32 hours) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━→ [Complete]
                                                                           ↓
                                                                    [PHASE 1: Verify]
                                                                           ↓
                                          [PHASE 2: Import] (10 min)       ↓
                                                  + Postgres writes         ↓
                                                    (can parallelize 3)     ↓
                                                           ↓                ↓
                                                    [PHASE 3: Warmup]      ↓
                                                     (2.5 min, Redis)       ↓
                                                           ↓                ↓
                                                    [PHASE 4: Verify]      ↓
                                                     (5 min, sanity)        ↓
                                                           ↓                ↓
                                                 🎯 [COMPLETE]  ←──────────┘

Total post-batch time: ~32-35 minutes (can run 2 & 3 in parallel if needed)
```

---

## Monitoring Commands (Run in Terminal Tab)

**Watch batch progress** (run continuously during batch):
```bash
tail -f .tmp/batch.log
```

**Monitor Postgres writes** (run during PHASE 2):
```bash
watch -n 2 "docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c 'SELECT COUNT(*) FROM analysis_pass_results'"
```

**Monitor Redis growth** (run during PHASE 3):
```bash
watch -n 1 "docker exec legal-ai-valkey redis-cli DBSIZE"
```

---

## Critical Environment Variables

**Must be set before each command**:

```bash
# Postgres
export POSTGRES_PASSWORD=123456

# Redis
export REDIS_PASSWORD=redis
export REDIS_HOST=localhost
export REDIS_PORT=6379
```

**Or pass inline** (easier, shown in examples above):
```bash
POSTGRES_PASSWORD=123456 npx tsx ...
REDIS_PASSWORD=redis node ...
```

---

## Success Criteria

| Phase | Success Indicator | Rollback If |
|-------|-------------------|------------|
| 1 | Batch log shows `[Complete]` | Batch still running at 36h mark |
| 2 | Postgres row count = 57976 | Row count < 50000 OR status != 'success' |
| 3 | Redis DBSIZE > 150000 | DBSIZE < 100000 OR upsert errors |
| 4 | Postgres ↔ Redis counts match | Mismatch > 1000 rows |
| 5 | Layer 1 latency 2-5ms | Latency > 10ms indicates connection issue |

---

## Documentation Generated

- ✅ `SESSION-96-PRODUCTION-BATCH-STARTED.md` — Batch execution details
- ✅ `SESSION-96-FINAL-VERIFICATION.md` — 6-layer retrieval chain verification
- ✅ `SESSION-96-REDIS-PACKET-ORGANIZATION-STRATEGY.md` — Redis architecture guide
- ✅ `SESSION-96-POST-BATCH-WORKFLOW.md` — This file (step-by-step checklist)

---

## Key Files Modified

| File | Change |
|------|--------|
| `scripts/atlas/bitfrost-packet-upsert-optimized.mjs` | NEW: Redis upsert orchestrator |
| `sveltekit-frontend/package.json` | NEW: 3 npm scripts for upsert |
| Session docs | NEW: 4 comprehensive guides |

---

## Next Steps (After PHASE 5)

1. **Document final results** in a Session 96 summary commit
2. **Monitor BitFrost hit rate** over 24 hours (target: 90%+)
3. **Baseline performance metrics** (e2e latency before/after)
4. **Plan Phase 97**: Higher-hop enrichment, Neo4j topology verification, Gemma4 reranking

---

**Expected Completion**: July 1, 2026 ~06:30 UTC (after ~32.5 hour batch + 35 min post-batch)  
**Status**: 🟡 BATCH IN PROGRESS — This checklist ready for execution

Monitor `.tmp/batch.log` and re-check this file when batch shows `[Complete]`.
