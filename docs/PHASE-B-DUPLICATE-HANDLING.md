# What Happens When Phase B Hits a Duplicate

**Question**: If it can't index because it's a duplicate, what does it do?

**Answer**: It **UPDATES the existing row** instead of failing. This is intentional and safe.

---

## The SQL Contract (Load-Bearing)

```sql
INSERT INTO analysis_pass_results (
  packet_key, pass_key, pass_status, result_json, created_at
) VALUES ($1, $2, $3, $4, NOW())
ON CONFLICT (packet_key, pass_key) DO UPDATE SET
  result_json = $4,
  pass_status = $3,
  updated_at = NOW()
```

This SQL pattern is called **UPSERT** (UPDATE if exists, INSERT if new).

---

## Three Scenarios

### Scenario 1: New Packet (First Run)
```
Packet: ace:packet:auth:001
Pass: pass_1_summarization

Status: NOT in analysis_pass_results

Action: INSERT new row
  ├─ packet_key: ace:packet:auth:001
  ├─ pass_key: pass_1_summarization
  ├─ pass_status: complete
  ├─ result_json: {"summary": "...", "elapsed": 234}
  ├─ created_at: 2026-06-29 21:50:00
  └─ updated_at: 2026-06-29 21:50:00

Result: ✅ ROW CREATED (processed++)
```

### Scenario 2: Duplicate Packet (Re-run Same Pass)
```
Packet: ace:packet:auth:001
Pass: pass_1_summarization

Status: ALREADY in analysis_pass_results (from first run)

Action: UPDATE existing row (ON CONFLICT clause triggers)
  ├─ packet_key: ace:packet:auth:001 (unchanged)
  ├─ pass_key: pass_1_summarization (unchanged)
  ├─ pass_status: complete (OVERWRITTEN)
  ├─ result_json: {"summary": "...", "elapsed": 245} (NEW VALUE)
  ├─ created_at: 2026-06-29 21:50:00 (unchanged, was INSERT time)
  └─ updated_at: 2026-06-29 21:55:30 (UPDATED to current time)

Result: ✅ ROW UPDATED (processed++)
         ⚠️  No error, silently overwrites
         (This is the "duplicate" case, handled gracefully)
```

### Scenario 3: Skip Already-Complete (Read Check Before Write)
```
Packet: ace:packet:auth:001
Pass: pass_1_summarization

Before INSERT attempt:
SELECT * FROM analysis_pass_results
WHERE packet_key = 'ace:packet:auth:001'
AND pass_key LIKE 'pass_1_%'
AND pass_status = 'complete'

Status: FOUND (already complete)

Action: SKIP THIS PACKET (SELECT check in lines 356-361)
  └─ Never reaches the INSERT/UPDATE statement
  └─ Loop continues to next packet

Result: ⊘ PACKET SKIPPED (not in processed++)
        (This is the early exit, most efficient path)
```

---

## The Script Logic (Full Flow)

```typescript
// src: lines 352-365 of multi-pass-enrichment.mjs
const result = await pool.query(
  `
  SELECT p.packet_key, p.source_ref, p.summary, p.content
  FROM atlas_packets p
  WHERE NOT EXISTS (
    SELECT 1 FROM analysis_pass_results r
    WHERE r.packet_key = p.packet_key
    AND r.pass_key = $1
    AND r.pass_status = 'complete'  ← ALREADY COMPLETE?
  )
  LIMIT $2
  `,
  [`pass_${PASS}_*`, LIMIT]
);

// Only packets with NO complete pass_1_summarization row are returned
const packets = result.rows;  // Filtered list
```

**Effect**: 
- First run: All 57K packets fetched (not in DB yet)
- Second run: Only failed packets fetched (skips complete ones)
- Third run: Only new packets + failed packets fetched

---

## What Actually Happens in Each Case

### First Execution (All 57K Packets)
```
Loop through 57K packets:
  ├─ SELECT check: NOT EXISTS (no results yet)
  ├─ Gemma4 summarization: 234ms
  ├─ INSERT new row (ON CONFLICT: not triggered)
  ├─ processed++ (57000)
  └─ Log: "✓ ace:packet:auth:001: ..."

Result: 57,000 rows inserted
```

### Re-run Same Pass (Crash Recovery)
```
Scenario: Pass 1 completes 30K packets, then crashes

Loop through 57K packets:
  ├─ SELECT check for packets 1-30K: NOT EXISTS = False (SKIP)
  ├─ SELECT check for packets 30K-57K: NOT EXISTS = True (PROCESS)
  ├─ Gemma4 summarization for packets 30K+: ~180ms each
  ├─ INSERT on conflict UPDATE (if somehow same packet gets reprocessed)
  └─ processed++ (27000)

Result: 27,000 additional rows inserted
        Total: 30K (first run) + 27K (restart) = 57K ✅
```

### Duplicate Attempt (Why ON CONFLICT EXISTS)
```
Scenario: Bug in loop somehow processes same packet twice in same run

First attempt for packet:
  ├─ INSERT analysis_pass_results
  ├─ Row created: (ace:packet:auth:001, pass_1_summarization, complete, {...})
  └─ processed++

Second attempt for SAME packet (hypothetical bug):
  ├─ INSERT same values
  ├─ PRIMARY KEY (packet_key, pass_key) violation
  ├─ ON CONFLICT triggers
  ├─ UPDATE: result_json = new_value, updated_at = now()
  └─ processed++ (again)

Result: Row updated (not duplicated)
        No error thrown
        No database constraint violation
```

---

## Truth Table: What Happens

| Scenario | Packet Status | Action | DB Result | Outcome |
|----------|---------------|--------|-----------|---------|
| **First run, new packet** | Not in DB | INSERT | Row created | ✅ Success |
| **First run, same packet (hypothetical duplicate)** | Already created | ON CONFLICT → UPDATE | Row updated | ✅ Safe (no duplicate) |
| **Restart after crash** | Partially complete | SELECT filters it | Skipped in fetch | ⊘ Retried only failed ones |
| **Re-run full pass** | All complete | SELECT filters all | All skipped in fetch | ⊘ No writes (already done) |

---

## Why This Design

### Without ON CONFLICT (Dangerous)
```sql
INSERT INTO analysis_pass_results (...) VALUES (...)
-- If duplicate PRIMARY KEY: ❌ ERROR (PostgreSQL error code 23505)
-- Script crashes, no recovery
```

### With ON CONFLICT (Safe)
```sql
INSERT ... ON CONFLICT (...) DO UPDATE SET ...
-- If duplicate PRIMARY KEY: ✅ Updates silently
-- Script continues, no error
-- Re-run is safe
```

---

## In Your Scenario (P3.1 Indexing)

**Q: If it can't index because it's a duplicate, what does it do?**

**A**: It UPSERTS (UPDATE if exists, INSERT if new):

```
Phase B tries to write: (packet_key='X', pass_key='pass_1', result='summary...')

If NOT in DB:
  → INSERT (creates row)
  → Counted in processed
  → Log: ✓ packet_key: ...

If ALREADY in DB (from prior run):
  → UPDATE (overwrites result_json, sets updated_at)
  → Counted in processed
  → Log: ✓ packet_key: ...
  → No error, no failure

Either way:
  → Row exists with latest result
  → No duplicate (PRIMARY KEY prevents it)
  → Script continues normally
```

**Result**: Phase B is idempotent. No crashes, no duplicates, no skipped packets on re-run.

---

## How to Verify This in Action

**First run** (watch row count grow):
```bash
watch -n 2 "docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \"SELECT COUNT(*) FROM analysis_pass_results WHERE pass_key='pass_1_summarization';\""

# Output: 0 → 1000 → 2000 → ... → 57000
```

**Second run (restart)** on same pass (should find skipped ones):
```bash
node scripts/phase-b/multi-pass-enrichment.mjs --pass=1 --limit=57000

# Log output:
#   Fetched 0 packets needing Pass 1
#   (all 57K already complete)
#   No writes, script exits cleanly
```

**Crash recovery** (simulate mid-run failure, restart):
```bash
# Terminal 1: Start pass 1
node scripts/phase-b/multi-pass-enrichment.mjs --pass=1 --limit=57000
# (let it run for a few minutes, then Ctrl+C to kill)

# Terminal 2: Check progress
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM analysis_pass_results WHERE pass_key='pass_1_summarization';"
# Output: 12043 (or wherever it stopped)

# Terminal 3: Restart (resumes from packet 12044)
node scripts/phase-b/multi-pass-enrichment.mjs --pass=1 --limit=57000
# Fetches only uncompleted packets (12044-57000)
# Processes remaining ~45K packets
# Final count: 57,000 ✅
```

---

## Bottom Line

**Phase B doesn't fail on duplicates.** It safely handles them via UPSERT:

- **First time**: Inserts row
- **Subsequent times**: Updates existing row (no error)
- **Early SELECT filter**: Skips already-complete packets (most efficient)
- **Crash recovery**: Re-run picks up where it left off

This is intentional, load-bearing design for idempotency.
