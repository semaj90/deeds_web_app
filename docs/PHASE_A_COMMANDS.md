# Phase A Execution Commands

## Quick Start

### Option 1: Run Gemma4 Only (Phase A)

```bash
cd sveltekit-frontend
npm run startup:phase-a:gemma4-only
```

**Output**: Summary generation progress in console
**Duration**: ~1-2 hours
**Result**: ~1,000 packets written to `atlas_packets.summary`

---

### Option 2: Run Phase A + TurboVec Baseline Test

```bash
cd sveltekit-frontend
npm run startup:phase-a:with-baseline
```

**Output**: 
- Gemma4 progress in foreground console
- TurboVec baseline test runs detached in background
- Both logs available simultaneously

**Duration**: Gemma4 ~1-2 hours (foreground) + baseline ~5 min (background)

---

### Option 3: Dry-Run Mode (No Writes)

```bash
cd sveltekit-frontend
npm run startup:phase-a:with-baseline:dry
```

**Output**: Infrastructure validation only
**Duration**: < 1 minute
**Result**: Confirms Gemma4 at :8090 is accessible

---

## Individual Commands

### Just Run Gemma4 Summarizer

```bash
cd sveltekit-frontend

# Dry-run (preview, 500 packet limit)
npm run atlas:summaries:gemma4:500:dry

# Apply (write summaries, 500 packet limit)
npm run atlas:summaries:gemma4:500:apply

# Full script directly (all 1000 packets)
node scripts/atlas/gemma4-batch-summarize-packets.mjs --apply
```

### Just Run TurboVec Baseline

```bash
cd sveltekit-frontend

# Foreground (blocking, verbose output)
npm run eval:turbovec:baseline:verbose

# Background (detached, logs only)
npm run eval:turbovec:baseline:detached

# Dry-run (infrastructure check)
npm run eval:turbovec:baseline:dry
```

---

## Monitoring Commands

### Monitor Gemma4 Progress (Real-Time)

```bash
# Watch the background task output
tail -f C:\Users\james\AppData\Local\Temp\claude\c--Users-james-Videos-deeds-web-app\b503a3f2-50b5-4621-afea-31d259dddb6a\tasks\ba17qvkie.output

# Check line count (quick progress indicator)
wc -l C:\Users\james\AppData\Local\Temp\claude\c--Users-james-Videos-deeds-web-app\b503a3f2-50b5-4621-afea-31d259dddb6a\tasks\ba17qvkie.output
```

### Monitor TurboVec Baseline (Once Running)

```bash
# Real-time log monitoring
tail -f logs/task-output/pipeline-test/eval-turbovec-baseline.out.log

# Error log (if any)
tail -f logs/task-output/pipeline-test/eval-turbovec-baseline.err.log
```

### Verify Postgres Writes (While Running)

```sql
-- Check summary count
SELECT count(*) as total, count(summary) as with_summary
FROM atlas_packets;

-- Check recent writes
SELECT packet_key, summary, updated_at
FROM atlas_packets
WHERE summary IS NOT NULL
ORDER BY updated_at DESC
LIMIT 10;
```

---

## Expected Output

### Gemma4 Summary Generation

```
📝 Gemma4 Batch Summarizer (APPLY MODE)

📦 Found 1000 packets needing summaries

🔄 Processing batch 1/100
   ✅ 10/10 summaries generated

🔄 Processing batch 2/100
   ✅ 10/10 summaries generated

...

✅ Backfill complete: 1000 processed, 0 failed (92.5 min)
```

### TurboVec Baseline Test

```
🔬 TurboVec Baseline Test

API: http://127.0.0.1:5173
Mode: LIVE

📡 Checking API health...
✅ API is up

📊 Checking metrics API...
✅ Metrics API is available

🔍 Running 10 baseline searches...

[1/10] validation session Lucia auth    ... ✅ 20 candidates (247ms)
[2/10] database transaction isolation   ... ✅ 18 candidates (255ms)
...

📈 Summary:
Success rate: 10/10
Latency (P50): 251ms
Latency (P95): 318ms
Latency (P99): 402ms
Avg candidates: 19.3
```

---

## Troubleshooting

### "Cannot find module" Error

**Cause**: Wrong working directory
**Fix**: 
```bash
cd sveltekit-frontend
# Then run npm scripts
```

### "HTTP 502 Bad Gateway" from Gemma4

**Cause**: TurboQuant (:8090) not running
**Fix**:
```bash
npm run turbo:start
# Wait for llama-server to start (30-60 sec)
# Then retry Gemma4 command
```

### Gemma4 Stuck on One Batch

**Cause**: Network timeout or Gemma4 hanging
**Fix**:
```bash
# Check if TurboQuant is responsive
curl http://127.0.0.1:8090/v1/models

# Restart if needed
npm run turbo:start
```

### TurboVec Baseline Test Not Starting

**Cause**: SvelteKit dev server not running
**Fix**:
```bash
# In another terminal
cd sveltekit-frontend && npm run dev

# Then try baseline again
npm run eval:turbovec:baseline:detached
```

---

## Logs and Reports

### Phase A Completion Report

After Gemma4 finishes, check:
```
.tmp/gemma4-summary-report.json
```

Contains:
- Timestamp
- Packets processed
- Success/failure counts
- Tokens used
- Average latency
- Summary length stats

### Baseline Test Report

After baseline finishes, check:
```
.tmp/turbovec-baseline-test.json
```

Contains:
- 10 test queries
- Per-query latency
- Candidate counts
- P50/P95/P99 percentiles
- Success rate

---

## Next Steps After Phase A

Once summaries are written to `atlas_packets.summary`:

```bash
# Phase B: Backfill summary embeddings (384-dim)
npm run atlas:phase1:backfill:summary:apply

# Phase C: Sync summary vectors to Qdrant
npm run atlas:phase2:sync:summaries:apply

# Phase D: Warm RFF cache
npm run atlas:phase4:rff:warm-cache:apply

# Phase E: Verify RFF end-to-end
npm run atlas:phase4:rff:verify:apply
```

---

**Ready to execute Phase A?** Choose one of the three options above and run!
