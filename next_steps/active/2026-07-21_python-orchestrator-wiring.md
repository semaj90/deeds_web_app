# Python Orchestrator Wiring (Phase 4 Integration)

**Date**: July 21, 2026  
**Status**: 🟢 WIRED  
**Milestone**: Phase 107 Feature Layer Schema Alignment → Phase 4 External Python Integration

---

## What Was Done

### 1. Fixed Imports & DB Connection
**File**: `scripts/atlas/python-orchestrator.mjs`

| Change | Before | After |
|--------|--------|-------|
| **DB import** | Broken (missing Pool import, hardcoded creds) | Dynamic import via `$lib/server/db/client.js` |
| **Path resolution** | `fileURLToPath` missing | Added `fileURLToPath`, `__dirname`, `resolve` |
| **Error handling** | None on import failure | Graceful fallback with warning |

**Result**: ✅ Module now imports cleanly and connects to SvelteKit DB pool dynamically

### 2. Implemented Result Persistence
**New Function**: `persistResults(pool, stageName, resultData, isDryRun)`

**Responsibility**:
- Validates result structure (expects `{ success: boolean, records: [], count: number, ... }`)
- Logs orchestration execution to Postgres table `atlas_orchestration_log`
- Skips writes if `isDryRun=true` or pool unavailable
- Returns summary: `{ written, stage, logId }`

**Required Table** (create in next Phase E migration):
```sql
CREATE TABLE IF NOT EXISTS atlas_orchestration_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_name text NOT NULL,
  record_count integer NOT NULL,
  status text NOT NULL DEFAULT 'completed', -- or 'failed', 'pending'
  result_data jsonb NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT NOW()
);
```

### 3. Enhanced Main Orchestration Function
**Updated Signature**:
```typescript
export async function runOrchestrationStage(
  stageName: string,
  limit: number,
  isDryRun: boolean,
  options?: { pythonScript?: string }
): Promise<object>
```

**Improvements**:
- Accepts optional `pythonScript` path (defaults to `phase4-model-inference.py`)
- Returns structured result object with metadata
- Validates JSON output from Python subprocess
- Checks `resultData.success` flag before persisting
- Includes timestamp, record counts, and log ID in response
- Better error messages and stack traces

### 4. Usage Pattern
```typescript
// Basic usage (dry-run)
const result = await runOrchestrationStage('feature-extraction', 1000, true);

// With custom Python script
const result = await runOrchestrationStage(
  'custom-inference',
  5000,
  false, // apply writes
  { pythonScript: 'path/to/my_script.py' }
);

// Check result
if (result.success) {
  console.log(`Processed: ${result.recordsProcessed}, Written: ${result.recordsWritten}`);
}
```

---

## Integration Points

### Where to Call
1. **Lazy loading from Phase 3 materialization** (once cheap lanes complete)
   ```typescript
   // In scripts/atlas/phase-107-unified-orchestrator.mts
   const pyOrch = await import('./python-orchestrator.mjs');
   await pyOrch.runOrchestrationStage('phase4-model', 10000, isDryRun);
   ```

2. **CI/CD pipeline** (for nightly model updates)
   ```bash
   npx tsx scripts/atlas/python-orchestrator.mjs --stage=phase4 --limit=50000
   ```

3. **Admin dashboard** (manual trigger for advanced users)
   ```typescript
   // src/routes/api/admin/orchestration/trigger/+server.ts
   import { runOrchestrationStage } from '$lib/atlas/orchestrator.js';
   const result = await runOrchestrationStage(stageName, limit, isDryRun);
   ```

### Python Script Contract
**Expected Output** (stdout, JSON):
```json
{
  "success": true,
  "stage": "phase4-model-inference",
  "count": 15234,
  "records": [
    { "packet_key": "...", "feature_key": "...", "confidence": 0.95, ... },
    ...
  ],
  "summary": { "processed": 15234, "failed": 0 },
  "timestamp": "2026-07-21T15:30:00Z"
}
```

**Exit codes**:
- `0`: Success (stdout must be valid JSON)
- `non-zero`: Failure (stderr captured and re-thrown)

---

## Blocked Dependencies

| Dependency | Status | Impact | Notes |
|------------|--------|--------|-------|
| **Phase 3 completion** | ⏳ In progress | Materialize cheap lanes first | Must run validation before Phase 4 |
| **Phase E migration** | ⏳ Pending | `atlas_orchestration_log` table | Create table before first write |
| **Python environment** | ⚠️ External | Requires Python 3.7+ + deps | Must be in `$PATH` |

---

## Verification

### Test Dry-Run
```bash
# From workspace root
cd sveltekit-frontend
npx tsx ../scripts/atlas/python-orchestrator.mjs \
  --stage=test-phase4 \
  --limit=100 \
  --dry-run
```

### Expected Output
```
========================================================
STARTING ATLAS ORCHESTRATION: test-phase4 DRY RUN
========================================================
[Orchestrator] Starting subprocess for Stage test-phase4 ...
[SUBPROCESS] Running: python3 .../phase4-model-inference.py
[SUCCESS] Subprocess for test-phase4 completed successfully.
[PERSIST DRY RUN] Would write XXX records for stage: test-phase4
========================================================
[COMPLETE] Orchestration Stage test-phase4 finished.
Records processed: XXX, Written: 0
========================================================
```

---

## Next Actions

### Immediate (Session 139+)
1. ✅ Wire python-orchestrator (`runOrchestrationStage` exported, DB pool dynamic)
2. ⏳ Add CLI entry point (`scripts/atlas/run-orchestrator-cli.mjs`) for manual execution
3. ⏳ Create Phase E migration for `atlas_orchestration_log` table
4. ⏳ Wire into Phase 3 unified orchestrator (after Phase C/D validation passes)

### Later (Phase 4+)
5. **Implement Python scripts** that produce the expected JSON output
6. **Add Langfuse tracing** to track subprocess execution time
7. **Add retry logic** for transient Python failures
8. **Create monitoring dashboard** for orchestration history (`/admin/orchestration/logs`)
9. **Implement streaming updates** (SSE) for long-running Python jobs

---

## Files Modified

| File | Status | Change |
|------|--------|--------|
| `scripts/atlas/python-orchestrator.mjs` | ✅ Wired | Imports fixed, DB pool dynamic, result persistence added |
| `next_steps/active/2026-07-21_python-orchestrator-wiring.md` | ✅ Created | This document |

---

## Reference

- **Phase 107**: Feature Layer Schema Alignment (Phases A-F)
- **Phase 4**: External Python Integration (model inference, advanced backfill)
- **Blocking on**: Phase 3 completion (materializer validation)
- **Blocked by**: Phase E migration (table creation)

---

**Confidence**: 🟢 HIGH — All wiring complete, ready for Phase 3 → 4 integration once validation passes.
