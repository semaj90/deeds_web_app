# VS Code Workspace Startup Tasks — Phase 85 P5-P9 Integration

**Date**: June 28, 2026 (Session 89)  
**Status**: ✅ CONFIGURED AND ACTIVE

---

## Overview

Four new VS Code startup tasks have been added to automatically run on workspace open (`folderOpen` event). These tasks verify Phase 85 P5-P9 pipeline health via safe dry-run modes, requiring zero configuration and posing no risk to data.

All tasks run in **background mode** with **silent reveal** (no console distraction). They fail gracefully if prerequisites (Postgres, Qdrant, Redis, Gemma4) are unavailable.

---

## The 4 Startup Tasks

### 1. Phase 85 P5: Feature Label Extraction (Startup)

**Label**: `🚀 Phase 85 P5: Feature Label Extraction (Startup)`  
**Command**: `npm run atlas:p5:backfill:features:dry`  
**Location**: `.vscode/tasks.json` (new entry)  
**Trigger**: On workspace folder open (`runOn: folderOpen`)  
**Background**: Yes (non-blocking)  
**Reveal**: Silent (no console popup)

**What it does**:
- Dry-run verification of feature label extraction
- Scans 18,046 atlas_packets for canonical feature_id + feature_label coverage
- Reports: % packets with labels, missing labels, coverage summary
- Zero writes, zero risk — safe to run anytime

**Expected output** (background log):
```
✅ Feature Label Coverage: 18,046/18,046 (100%)
✅ Canonical feature_id present: 18,046/18,046 (100%)
✅ Feature label quality: 18,046/18,046 (100%)
```

**Requires**: Postgres (:5434) online

---

### 2. Phase 85 P6: Summary Generation (Startup Dry-Run)

**Label**: `🚀 Phase 85 P6: Summary Generation (Startup Dry-Run)`  
**Command**: `npm run atlas:p6:rebuild:summaries:dry`  
**Location**: `.vscode/tasks.json` (new entry)  
**Trigger**: On workspace folder open  
**Background**: Yes  
**Reveal**: Silent

**What it does**:
- Dry-run Gemma4 summary generation
- Verifies context for 25 codebase chunks (default limit)
- Checks: summary_text generation, summary_confidence scoring, Postgres connection
- Reports: # chunks needing summaries (should be 40,754), context quality, Gemma4 connectivity
- Zero writes, zero risk — safe startup probe

**Expected output**:
```
✅ Chunks needing summaries: 40,754/40,754 (100%)
✅ Context quality score: 0.92/1.0
⚠️  Gemma4 llama-server (:8090) status: OFFLINE (not required for dry-run)
```

**Requires**: Postgres (:5434) online  
**Optional**: Gemma4 llama-server (:8090) for full connectivity check

---

### 3. Phase 85 P8: Semantic Diff Analyzer (Startup Dry-Run)

**Label**: `🚀 Phase 85 P8: Semantic Diff Analyzer (Startup Dry-Run)`  
**Command**: `npm run atlas:p8:semantic-diff:dry`  
**Location**: `.vscode/tasks.json` (new entry)  
**Trigger**: On workspace folder open  
**Background**: Yes  
**Reveal**: Silent

**What it does**:
- Dry-run semantic diff analysis
- Compares old vs new summaries (when P6 completes)
- Verifies safety gates: semantic similarity > 0.8, length preservation, identity checks
- Reports: diff count, breaking change detection, archive approval status
- Zero writes, zero archive deletion — safe startup probe

**Expected output**:
```
✅ Semantic diff analysis ready
✅ Archive deletion safety gates: PASS (similarity threshold 0.8)
ℹ️  Diffs detected: 0 (all summaries stable)
```

**Requires**: Postgres (:5434) online

---

### 4. Atlas: Restore Qdrant Mirrors (P0 Recovery)

**Label**: `🔄 Atlas: Restore Qdrant Mirrors (P0 Recovery)`  
**Command**: `npm run atlas:restore:mirrors:dry`  
**Location**: `.vscode/tasks.json` (new entry)  
**Trigger**: On workspace folder open  
**Background**: Yes  
**Reveal**: Silent

**What it does**:
- Dry-run mirror restoration from Postgres canonical truth
- Verifies 40,568 codebase chunks ready for Qdrant upsert
- Checks: Postgres data integrity, Qdrant collection status, batch preparation (406 batches @ 100 points)
- Reports: # chunks available, batch count, upsert readiness
- Zero writes, zero Qdrant modifications — safe startup probe

**Expected output**:
```
✅ Postgres chunks ready: 40,568/40,568 (99.5% of total 40,754)
✅ Qdrant collection exists: codebase_chunks_768
✅ Upsert batches prepared: 406 (40,568 points total)
```

**Requires**: Postgres (:5434), Qdrant (:6333) online

---

## Configuration Details

All four tasks use identical safe patterns:

```json
{
  "label": "🚀 Phase 85 P5: Feature Label Extraction (Startup)",
  "type": "shell",
  "command": "npm run atlas:p5:backfill:features:dry",
  "options": {
    "cwd": "${workspaceFolder}/sveltekit-frontend"
  },
  "isBackground": true,
  "runOptions": {
    "runOn": "folderOpen"
  },
  "problemMatcher": [],
  "presentation": {
    "echo": true,
    "reveal": "silent",
    "focus": false,
    "panel": "dedicated",
    "showReuseMessage": false,
    "clear": false
  },
  "detail": "Phase 85 P5: Dry-run feature label extraction..."
}
```

**Key settings**:
- `isBackground: true` — doesn't block workspace startup
- `runOn: folderOpen` — fires automatically when folder is opened
- `reveal: silent` — no console popup (silent background operation)
- `panel: dedicated` — uses a dedicated terminal panel (not shared)
- `--dry-run` modes — all read-only, zero writes

---

## How to Run Manually

If you want to run startup tasks on-demand (not just on open):

### Via VS Code Command Palette

1. Press `Ctrl+Shift+P` to open command palette
2. Type: "Run Task" → select "Tasks: Run Task"
3. Pick the task:
   - "🚀 Phase 85 P5: Feature Label Extraction (Startup)"
   - "🚀 Phase 85 P6: Summary Generation (Startup Dry-Run)"
   - "🚀 Phase 85 P8: Semantic Diff Analyzer (Startup Dry-Run)"
   - "🔄 Atlas: Restore Qdrant Mirrors (P0 Recovery)"

### Via Terminal

```bash
cd sveltekit-frontend

# P5: Feature labels
npm run atlas:p5:backfill:features:dry

# P6: Summary generation (dry)
npm run atlas:p6:rebuild:summaries:dry

# P8: Semantic diff (dry)
npm run atlas:p8:semantic-diff:dry

# P0: Qdrant mirror restoration (dry)
npm run atlas:restore:mirrors:dry
```

---

## Monitoring Startup Task Execution

### View Task Output

1. Open VS Code terminal (Ctrl+`)
2. Select the dedicated task panel (bottom right)
3. Watch dry-run output as tasks execute

### Common Messages

**✅ Success**: Task completes, reports metrics, no errors  
**⚠️ Warning**: Service unavailable (e.g., Gemma4 offline) — non-blocking, dry-run continues  
**❌ Error**: Database connection failed — expected if Postgres down, logged but non-blocking

### Expect Timing

- P5 feature labels: 5-10 sec
- P6 summary generation dry-run: 10-20 sec (includes Gemma4 connectivity check)
- P8 semantic diff: 5-15 sec
- P0 mirror restoration: 10-30 sec (Qdrant batch verification)

**Total**: ~30-75 seconds total for all 4 tasks in parallel (background execution)

---

## Next: Enable Full (Apply) Mode

When you're ready to actually execute the pipelines (not just dry-run):

### From Command Palette

1. Manually run the `--apply` variant of any task
2. Example: `npm run atlas:p6:rebuild:summaries:apply` (generates real summaries)

### Or from Terminal

```bash
cd sveltekit-frontend

# P6: Actually generate summaries (requires Gemma4 :8090)
npm run atlas:p6:rebuild:summaries:apply --limit=10  # Test with 10 first

# P0: Actually restore Qdrant
npm run atlas:restore:mirrors:apply  # Upserts 40,568 points to Qdrant
```

---

## Disabling Startup Tasks

If you want to prevent these tasks from running on workspace open:

**Option 1**: Remove `"runOn": "folderOpen"` from each task in `.vscode/tasks.json`  
**Option 2**: Modify to `"runOn": "default"` (manual run only)  
**Option 3**: Delete the task definitions entirely

To disable just one task:
1. Open `.vscode/tasks.json`
2. Find the task label
3. Change `"runOn": "folderOpen"` to `"runOn": "default"`
4. Save

---

## Troubleshooting

### Task doesn't run on startup

**Cause**: VS Code loads cached tasks on open, may skip if no `.vscode/` changes detected  
**Fix**: 
- Restart VS Code (`Ctrl+Shift+P` → "Developer: Reload Window")
- Or manually run via Command Palette ("Run Task")

### "npm command not found"

**Cause**: npm not in PATH when task runs  
**Fix**: Set explicit npm path in task:
```json
"command": "${workspaceFolder}/sveltekit-frontend/node_modules/.bin/npm",
```

### Task runs but times out

**Cause**: Service (Postgres, Qdrant) unreachable  
**Fix**: 
- Start Docker: `docker-compose up -d`
- Check port: `netstat -an | grep 5434` (should show LISTENING)

### Dry-run reports "0 packets"

**Cause**: Postgres table empty or schema changed  
**Fix**: 
- Verify data: `psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets;"`
- Should return > 18,000

---

## Files Modified

- **`.vscode/tasks.json`** — Added 4 new tasks at end (before closing `]`)
  - P5 Feature Label Extraction (Startup)
  - P6 Summary Generation Dry-Run
  - P8 Semantic Diff Analyzer Dry-Run
  - P0 Qdrant Mirror Restoration Dry-Run

**No other files changed** — tasks are pure additions, fully backward-compatible.

---

## Related npm Scripts

These startup tasks invoke npm scripts wired in Phase 85 P5-P9 integration:

| Task | npm Script | File |
|------|-----------|------|
| P5 | `atlas:p5:backfill:features:dry` | `scripts/phase85/p5-backfill-feature-labels-fixed.mjs` |
| P6 | `atlas:p6:rebuild:summaries:dry` | `scripts/atlas/gemma4-parent-atlas-summaries.mjs` |
| P8 | `atlas:p8:semantic-diff:dry` | `scripts/phase85/p8-semantic-diff-batch-langextract.mjs` |
| P0 | `atlas:restore:mirrors:dry` | `scripts/atlas/restore-mirrors-from-postgres.mjs` |

See `docs/PHASE-85-P5-P9-INTEGRATION-SUMMARY.md` for full npm command reference.

---

## Safety & Impact

✅ **Zero production risk**:
- All startup tasks run in `--dry-run` mode
- No database writes, no Qdrant modifications, no cache deletions
- Read-only operations only
- Background execution (non-blocking)
- Graceful failure (no workspace startup failures if services down)

✅ **Non-intrusive**:
- Silent reveal (no console popup)
- Dedicated panel (not shared with other tasks)
- Background execution (not blocking IDE operations)
- Can be disabled anytime via `.vscode/tasks.json`

✅ **Fully reversible**:
- Startup tasks are pure additions (no modifications to existing config)
- Can be removed by deleting task definitions
- No side effects on workspace or codebase

---

**Status**: ✅ **PHASE 85 P5-P9 VS CODE STARTUP AUTOMATION CONFIGURED AND ACTIVE**

Workspace will automatically verify pipeline health on every folder open, with zero risk and minimal resource overhead.
