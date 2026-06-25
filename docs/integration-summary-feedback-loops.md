# Integration Summary: Feedback Loops A & B

**Commit**: `3d02e39f20`  
**Date**: June 24, 2026  
**Status**: ✅ Ready for testing

---

## What Was Built

### Loop A: Retrieval/Runtime Feedback
Tracks which chunks are selected during research, learns from supervisor decisions.

**Key Components**:
1. **chunk_hit_log table** (Postgres)
   - Stores every chunk selection from every worker
   - Tracks rank, score, lane, usage in supervisor answer
   - Indexed for fast demand-score lookups

2. **Tracing Infrastructure** (SSE stream)
   - Generate `traceId` UUID per research session
   - Emit in all 5 SSE events: `plan`, `worker`, `merging`, `complete`, `error`
   - Non-blocking inserts (fire-and-forget)

3. **Supervisor Feedback** (after merge)
   - Mark chunks as `used_in_answer = true` when supervisor selects them
   - Increment `demand_score` by 0.1 per selection
   - Capped at 1.0

### Loop B: Training/Adaptation Feedback
Collects selection patterns for future LoRA fine-tuning.

**Data Available**:
- `chunk_hit_log`: Which chunks were selected (ranking patterns)
- `context_timeline`: Full lifecycle events (worker_done, supervisor_done, persisted, failed)
- Combined: Complete audit trail of what the agent learned from

---

## Files Modified

### Core Implementation
| File | Change | Lines |
|------|--------|-------|
| `src/lib/server/db/schema-postgres.ts` | Add `chunkHitLog` table + types | +30 |
| `src/routes/api/research/concurrent-deep/stream/+server.ts` | Wire traceId + chunk logging + demand feedback | +63 |
| `src/lib/server/retrieval/hybrid-score.ts` | **NEW** Hybrid score blend formula | +74 |
| `drizzle/manual/0051_chunk_hit_log.sql` | **NEW** Migration for chunk_hit_log table | +24 |

### Documentation
| File | Purpose |
|------|---------|
| `docs/feedback-loops-a-b.md` | Complete architecture + data flow + event timeline |
| `docs/integration-summary-feedback-loops.md` | **This file** — quick reference |

---

## How to Use

### 1. Apply Migration
```bash
psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/manual/0051_chunk_hit_log.sql
```

### 2. Test Loop A (Retrieval Feedback)
```bash
cd sveltekit-frontend
npm run dev

# In another terminal:
curl -X POST http://localhost:5173/api/research/concurrent-deep/stream \
  -H "Content-Type: application/json" \
  -d '{"query":"How does auth work?","domains":["api-routes","database"]}' \
  -N
```

You'll see:
- SSE events with `traceId` included
- `chunk_hit_log` populated after each worker completes
- Supervisor feedback updates after merge

### 3. Query Feedback Data
```sql
-- See all chunks selected in the last hour
SELECT COUNT(*), lane, AVG(score), AVG(demand_score)
FROM chunk_hit_log
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY lane;

-- See chunks that made it into supervisor answers
SELECT COUNT(*), lane, SUM(CASE WHEN used_in_answer THEN 1 ELSE 0 END) as selected
FROM chunk_hit_log
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY lane;

-- See demand_score rise over time
SELECT traceId, COUNT(*) as chunk_count, AVG(demand_score) as avg_demand
FROM chunk_hit_log
WHERE demand_score > 0
GROUP BY traceId
ORDER BY traceId DESC
LIMIT 10;
```

### 4. Integrate Hybrid Score (Optional Today)
```typescript
import { computeHybridScore, decayDemandScore } from '$lib/server/retrieval/hybrid-score';

// When ranking chunks in search:
const finalScore = computeHybridScore({
  qdrantCosine: 0.92,
  pgTrgm: 0.85,
  graphAuthority: 0.78,
  topologyScore: 0.65,
  demandScore: 0.45  // Fetched from chunk_hit_log
});

// Decay old scores
const ageHours = 48;
const decayed = decayDemandScore(0.45, ageHours); // 0.45 * 0.5^(48/168) ≈ 0.38
```

---

## Data Flow At a Glance

```
User queries /api/research/concurrent-deep/stream
  ↓
traceId generated (UUID)
  ↓
Supervisor plan → send('plan', { traceId, domains })
  ↓
Workers search domains in parallel
  ├─ Each worker emits top-20 chunks
  └─ INSERT chunk_hit_log (traceId, packetKey, lane, rank, score, used_in_answer=false)
  ↓
send('worker', { traceId, domain, chunks... })
  ↓
Supervisor merges findings
  ├─ SELECT keyFindings
  └─ UPDATE chunk_hit_log SET used_in_answer=true, demand_score += 0.1 WHERE chunk IN keyFindings
  ↓
send('complete', { traceId, supervisorSummary, keyFindings... })
  ↓
Loop A: chunk_hit_log ready for demand-score reranking
  ↓
Loop B: context_timeline + chunk_hit_log → LoRA dataset (future)
```

---

## Next Steps (Future)

### Immediate (Week 1)
- [ ] Test Loop A in dev server (verify traceId propagation)
- [ ] Query chunk_hit_log to see demand patterns by domain
- [ ] Verify no performance regression (<2ms per research session)

### Short-term (Week 2-3)
- [ ] Wire demand_score into search.hybrid ranking
- [ ] Create `/api/metrics/retrieval-feedback` dashboard
- [ ] Monitor demand_score rise for frequently-used chunks

### Medium-term (Month 2)
- [ ] Monthly export script for LoRA dataset
- [ ] QLoRA fine-tune pipeline on successful traces
- [ ] A/B test: demand-boosted ranking vs baseline

### Long-term (Quarter 2)
- [ ] Decay old demand_scores (half-life = 7 days)
- [ ] Multi-model support (Qwen, Llama as well as Gemma4)
- [ ] Feedback to other components (RAG/KAG/DAG preferences)

---

## Monitoring Checklist

✅ **Loop A Health**:
- `chunk_hit_log` has rows for recent traces
- `demand_score` incrementing for repeated chunks
- No NULL `packet_key` values (all chunks resolvable)
- Tracing latency <2ms

✅ **Loop B Health**:
- `context_timeline` events captured (worker_done, supervisor_done)
- Success vs. failure ratio tracked
- Trace correlation between chunk_hit_log and timeline events

---

## Technical Notes

**Why fire-and-forget logging?**
- Research calls are time-sensitive (45s timeout per worker)
- Blocking on DB inserts would add latency
- Non-blocking allows us to log without impacting supervisor merge
- If a log fails, it's gracefully retried on next research call (demand will catch up)

**Why demand_score capped at 1.0?**
- Prevents runaway feedback loops
- Ensures hybrid score remains 0.0-1.0 range
- Decay function handles decay over time naturally

**Why 5-way blend (not 10-way)?**
- 5 signals are orthogonal: semantic, lexical, authority, topology, learned
- More signals = harder to interpret + slower recompute
- Can always add more signals later if needed

---

## Files to Read for Deep Dive

1. **Architecture**: `docs/feedback-loops-a-b.md` (296 lines, comprehensive)
2. **Utilities**: `src/lib/server/retrieval/hybrid-score.ts` (74 lines, formula + decay)
3. **Endpoint**: `/api/research/concurrent-deep/stream/+server.ts` (full streaming + feedback)
4. **Schema**: `src/lib/server/db/schema-postgres.ts` (chunkHitLog table + types)
5. **Migration**: `drizzle/manual/0051_chunk_hit_log.sql` (exact DDL)

---

## Rollback Plan

If issues arise:

```bash
# Drop chunk_hit_log (safe, only analytical data)
psql -U legal_admin -d legal_ai_db -c "DROP TABLE chunk_hit_log CASCADE;"

# Revert to previous commit
git reset --hard HEAD~1

# Rebuild
npm run build
```

The retrieval system continues to work without Loop A — just loses the feedback signal.

---

**Questions?** Refer to `docs/feedback-loops-a-b.md` for architecture or reach out with specific trace issues.
