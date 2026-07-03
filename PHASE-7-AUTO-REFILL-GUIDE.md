# Phase 7 Auto-Refill Integration

**Goal**: Automatically trigger queue refills when:
1. Queue depth drops below 200 messages
2. Recent summaries pass contamination validation (95%+ clean)
3. Workers are healthy (no DLQ errors, 4+ consumers active)

---

## How It Works

### Monitor Loop (30-second interval)
```
Check Queue Depth
  ├─ If > 200 msgs → continue monitoring
  ├─ If 0 msgs & no errors → Phase 7 COMPLETE
  └─ If < 200 msgs & healthy:
      ├─ Validate last 20 summaries for contamination
      ├─ If 95%+ clean → REFILL (500 msgs, --limit=2000)
      └─ If <95% clean → PAUSE (manual review required)
```

### Validation Rules
- **Sample size**: Last 20 summaries (by `updated_at`)
- **Contamination patterns**: `<end_of_turn>`, `<start_of_turn>`, `<thinking>`, etc.
- **Pass threshold**: 95%+ clean (tolerance: 1 contaminated per 20)
- **Fail action**: Pause refill, log error, wait 60s then retry

### Refill Behavior
- **Batch size**: 500 unsummarized chunks
- **Safety limit**: --limit=2000 (don't exceed 2K msgs in flight)
- **Min interval**: 5 minutes between refills (prevent thrashing)
- **Backpressure**: Respects RabbitMQ drain events

---

## Usage

### Option A: Manual Monitoring + Auto-Refill (Recommended)
Run monitor + auto-refill in separate terminals:

**Terminal 1 — Manual monitor (visual feedback):**
```bash
npm run phase7:monitor
```
Output:
```
[2026-07-03 06:21:30] Queue: 876 msgs | Consumers: 4 | DLQ: 0 | Postgres: 14470 summarized
[2026-07-03 06:21:50] Queue: 834 msgs | Consumers: 4 | DLQ: 0 | Postgres: 14501 summarized
⚠️  REFILL ALERT: Queue at 195 (threshold: 200)
Run: node sveltekit-frontend/scripts/atlas/phase7-rabbitmq-summary-queue.mjs --produce --batch=500 --limit=2000
```

**Terminal 2 — Auto-refill (autonomous):**
```bash
npm run phase7:auto-refill
```
Output:
```
✅ Connected to RabbitMQ
📊 Monitoring phase7.summarization (refill at 200 msgs)
[2026-07-03 06:21:30] Queue: 876 msgs | Consumers: 4 | DLQ: 0
[2026-07-03 06:21:50] Queue: 834 msgs | Consumers: 4 | DLQ: 0
⚠️ Queue below threshold (195 < 200)
✅ Validation: 20 recent summaries, 100.0% clean
🔄 Starting auto-refill: --batch=500 --limit=2000
✅ Published 500 messages to phase7.summarization
✅ Refill complete, next check in 30s
```

---

### Option B: Auto-Refill Only (Silent Mode)
```bash
npm run phase7:auto-refill &
# Runs in background, logs to stdout, only alerts on errors
```

---

## Safety Gates

### ❌ Refill BLOCKED if:
| Condition | Action | Recovery |
|-----------|--------|----------|
| Validation fails (<95% clean) | Pause refill, log contamination details | Manual review required, then restart auto-refill |
| DLQ has errors | Pause refill | Fix worker error, clear DLQ, restart auto-refill |
| 0 consumers | Pause refill | Restart workers, restart auto-refill |
| Queue is 0 but DLQ > 0 | Phase 7 FAILED | Check worker logs, fix errors, restart from Phase 7 beginning |

### ✅ Refill TRIGGERED if:
- Queue depth: **< 200 messages**
- Last write age: **recent (< 5 min old)**
- Validation: **95%+ clean**
- Workers: **all 4 connected**
- DLQ: **empty (0 errors)**

---

## Configuration

Edit `scripts/phase7-auto-refill.mjs` to adjust:

```javascript
const REFILL_THRESHOLD = 200;           // msgs — when to refill
const CHECK_INTERVAL_MS = 30_000;       // 30s between checks
const VALIDATION_SAMPLE_SIZE = 20;      // check last 20 summaries
const MIN_REFILL_INTERVAL_MS = 300_000; // 5 min between refills
```

---

## Monitoring Scenarios

### Scenario 1: Normal Drain + Auto-Refill
```
[06:21:30] Queue: 876 msgs | Rate: 69/min
[06:22:00] Queue: 834 msgs ↓ 42
[06:22:30] Queue: 792 msgs ↓ 42
...
[06:34:00] Queue: 198 msgs (below 200 threshold)
✅ Validation: 100% clean
🔄 Auto-refill: +500 msgs
[06:34:30] Queue: 650 msgs (refilled)
```

### Scenario 2: Contamination Detected
```
[06:34:00] Queue: 195 msgs (below 200 threshold)
✅ Validating recent summaries...
❌ Contamination detected: '<end_of_turn>' in chunk e9917be7...
❌ Validation failed: 85% clean (threshold: 95%)
⚠️ Pausing auto-refill (manual review required)

# Fix: Check contaminated chunks
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT id, summary FROM codebase_chunk_index WHERE summary LIKE '%<end_of_turn>%';"

# Restart auto-refill once fixed
npm run phase7:auto-refill
```

### Scenario 3: Phase 7 Complete
```
[06:45:00] Queue: 5 msgs | Consumers: 4 | DLQ: 0
[06:45:10] Queue: 3 msgs | Consumers: 4 | DLQ: 0
[06:45:15] Queue: 0 msgs | Consumers: 0 | DLQ: 0
🎉 PHASE 7 COMPLETE: Queue empty, no errors, workers idle
📋 Next: Run Phase 8 pipeline (sanitize → verify → Qdrant sync)
```

---

## Error Handling

### Connection Lost
```
❌ Fatal error: connect ECONNREFUSED 127.0.0.1:5672
✋ Shutting down...
# Restart RabbitMQ, then restart auto-refill
```

### Database Error
```
❌ Validation failed: error: password authentication failed
# Check DATABASE_PASSWORD env var, restart auto-refill
```

### Queue Query Timeout
```
❌ Monitor cycle error: Error: socket timeout
# Retries automatically every 30s
```

---

## Next Steps

After Phase 7 completes (queue = 0, DLQ = 0):

1. **Verify summary quality:**
   ```bash
   npm run verify:summary-storage
   npm run atlas:summary-surface:verify
   npm run atlas:audit:summary-quality
   ```

2. **Run Phase 8 pipeline:**
   ```bash
   npm run phase8-5:sanitize:apply:batch
   npm run atlas:qdrant-payload:sync:apply
   npm run atlas:bitfrost-semantic-cache:warm:apply
   ```

3. **Build reranker (XGBoost):**
   ```bash
   npm run atlas:xgboost:export
   npm run atlas:xgboost:train
   npm run atlas:gpu-rerank-cache:audit
   ```

---

## Debugging

### Check live queue status
```bash
curl -s -u guest:guest http://127.0.0.1:15672/api/queues/phase7.summarization | jq '{messages, consumers}'
```

### Check recent summaries
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT id, SUBSTRING(summary FROM 1 FOR 60), updated_at FROM codebase_chunk_index WHERE summary IS NOT NULL ORDER BY updated_at DESC LIMIT 5;"
```

### Check for contamination
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) as contaminated FROM codebase_chunk_index WHERE summary LIKE '%<end_of_turn>%' OR summary LIKE '%<start_of_turn>%';"
```

### Kill auto-refill
```bash
# In terminal running auto-refill: Ctrl+C
# Or: pkill -f "phase7-auto-refill"
```

---

## Safety Checklist

Before running auto-refill:
- [ ] Phase 7 workers are running (4 consumers active)
- [ ] llama-server is healthy (context_length != null)
- [ ] Postgres is accessible (summarized > 10K)
- [ ] RabbitMQ is healthy (DLQ = 0)
- [ ] No contaminated summaries in existing data (or few enough to tolerate)

Once auto-refill is running:
- [ ] Monitor queue depth every 5 min (or watch real-time output)
- [ ] Check for contamination alerts (if any, pause and review)
- [ ] Verify worker logs for errors
- [ ] Stop auto-refill when queue reaches 0 (Phase 7 complete)
