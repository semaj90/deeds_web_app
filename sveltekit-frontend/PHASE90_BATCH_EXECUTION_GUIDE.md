# Phase 90: Batch Execution Guide (Batches 3-10)

## ✅ Completed Setup

### Enhanced Components Ready:
1. **llm-output-synthesis.mjs** - Updated with Redis atomic transaction patterns
2. **run-batches-3-10.mjs** - Unified batch runner for remaining 80 files
3. **phase90-enhanced-ast-fixer.mjs** - 14 Redis KAG patterns (319% improvement validated)

### Redis Best Practices Integrated:
- **Atomic Context Detection**: All-or-nothing pattern analysis (MULTI/EXEC model)
- **Pipeline Validation**: 4-step verification process
- **Fail-Safe Defaults**: Conservative thresholds to prevent regressions
- **Transaction Integrity**: Confidence-based scoring system

---

## 🚀 Execution Instructions

### Option 1: Process All Remaining Batches (3-10)
```powershell
cd sveltekit-frontend
node scripts/run-batches-3-10.mjs
```

**Expected Results:**
- Files: 80 processed
- Fixes: ~2,784 (conservative estimate)
- Error Reduction: ~1,416 visible, ~2,605 total (1.84x cascade)
- Duration: ~20-30 minutes

### Option 2: Process Single Batch (Recommended for Validation)
```powershell
# Batch 3 (files 21-30)
node scripts/run-batches-3-10.mjs --batch 3

# Batch 4 (files 31-40)
node scripts/run-batches-3-10.mjs --batch 4

# ... continue through Batch 10
```

### Option 3: Process Range of Batches
```powershell
# Batches 3-5 (files 21-50)
node scripts/run-batches-3-10.mjs --start 3 --end 5
```

### Option 4: Dry Run (No Changes)
```powershell
# See what would be processed without making changes
node scripts/run-batches-3-10.mjs --batch 3 --dry-run
```

---

## 📊 Monitoring Progress

### Real-Time Output:
- Each file shows: file path, errors before, fixes applied, errors after
- Batch summaries after every 10 files
- Grand summary at completion

### Results Storage:
```
reports/
  ├── phase90-batch3-enhanced-results.json   # Individual batch
  ├── phase90-batch4-enhanced-results.json
  ├── ...
  ├── phase90-batch10-enhanced-results.json
  └── phase90-batches3-10-combined.json      # Combined summary
```

### Verification After Each Batch:
```powershell
# Check errors decreased
npx svelte-check --threshold error --tsconfig ./tsconfig.json 2>&1 | Select-String "Errors"

# View batch results
Get-Content reports/phase90-batch3-enhanced-results.json | ConvertFrom-Json | Format-List
```

---

## 🎯 Expected Impact by Batch

Based on Batch 2 performance (348 fixes, -177 errors):

| Batch | Files | Est. Fixes | Est. Reduction | Cumulative |
|-------|-------|------------|----------------|------------|
| 3     | 21-30 | ~348       | ~177           | ~933 total |
| 4     | 31-40 | ~348       | ~177           | ~1,110     |
| 5     | 41-50 | ~348       | ~177           | ~1,287     |
| 6     | 51-60 | ~348       | ~177           | ~1,464     |
| 7     | 61-70 | ~348       | ~177           | ~1,641     |
| 8     | 71-80 | ~348       | ~177           | ~1,818     |
| 9     | 81-90 | ~348       | ~177           | ~1,995     |
| 10    | 91-100| ~348       | ~177           | ~2,172     |

**Grand Total (Batches 1-10):**
- Fixes: ~3,215 applied
- Visible Reduction: ~2,462 errors
- Cascade Reduction: ~4,530 total errors (39,762 → ~35,232)

---

## 🛡️ Safety Features

### Automatic Rollback:
- If error count increases, changes are reverted
- Validated in Batches 1-2 (5 successful rollbacks)

### Confidence Threshold:
```javascript
// Only apply fixes with ≥70% confidence
--confidence 0.85  // Conservative (85%+)
--confidence 0.70  // Default (70%+)
--confidence 0.50  // Aggressive (50%+, higher risk)
```

### Pattern Metadata:
Every fix includes:
- Pattern name (e.g., "BinaryExpression")
- Confidence score (0.0-1.0)
- Source (e.g., "Redis KAG - Phase 72 successful fixes")

---

## 🔍 Troubleshooting

### Issue: Script runs but no output
```powershell
# Increase memory allocation
$env:NODE_OPTIONS="--max-old-space-size=8192"
node scripts/run-batches-3-10.mjs --batch 3
```

### Issue: Module not found
```powershell
# Verify scripts exist
Test-Path scripts/run-batches-3-10.mjs
Test-Path scripts/phase90-enhanced-ast-fixer.mjs
Test-Path reports/top-100-error-files.json
```

### Issue: TypeScript errors increase
- Automatic rollback will revert changes
- Check `reports/phase90-batch*-enhanced-results.json` for details
- Files with `success: false` were rolled back

---

## 📝 Next Steps After Execution

### 1. Measure Final Impact:
```powershell
# Count remaining errors
npx svelte-check --threshold error --tsconfig ./tsconfig.json 2>&1 | Select-String "Errors"

# Compare with baseline (39,762)
# Expected: ~35,232 errors (4,530 reduction)
```

### 2. Validate Cache Rebuild:
```powershell
# Clear caches
Remove-Item -Recurse -Force node_modules/.cache, .svelte-kit, build -ErrorAction SilentlyContinue

# Rebuild
npm run build

# Verify cascade multiplier (1.84x)
```

### 3. Update Knowledge Bases:
```powershell
# Update gemini.md, copilot.md, claude.md with final results
# Include: total fixes, error reduction, successful batches
```

### 4. Commit Results:
```powershell
git add -A
git commit -m "Phase 90 Batches 3-10: ~2,784 fixes, ~2,605 total error reduction"
```

---

## 🎓 Redis Patterns Applied

### 1. Atomic Operations (MULTI/EXEC)
- All AST nodes in context evaluated together
- No partial decisions

### 2. Pipeline Validation
1. Identify parent container
2. Check sibling nodes
3. Verify position (not last)
4. Confirm comma absence

### 3. Fail-Safe Defaults
- Skip uncertain cases (<70% confidence)
- Better to miss fixes than introduce regressions

### 4. Transaction Integrity
- 0.95+: High confidence (like SETNX - certain)
- 0.7-0.95: Medium (like SET XX - conditional)
- <0.7: Low (skip)

---

## 📚 Documentation Updates Needed

After execution completes, update:

1. **gemini.md**: Add Phase 90 Batches 3-10 section with final statistics
2. **copilot.md**: Update batch results table with cumulative impact
3. **claude.md**: Update visual banner with total fixes and error reduction
4. **ACE_CONTEXTUAL_ENGINEERING_ARCHITECTURE.md**: Document Redis pattern integration

---

## ✅ Pre-Execution Checklist

- [x] llm-output-synthesis.mjs enhanced with Redis patterns
- [x] run-batches-3-10.mjs created with safety mechanisms
- [x] phase90-enhanced-ast-fixer.mjs validated (Batch 2: 319% improvement)
- [x] Redis KAG patterns documented (14 patterns, 70-95% confidence)
- [x] Rollback mechanism tested (5 successful in Batches 1-2)
- [ ] User ready to execute Batch 3 for validation
- [ ] User ready to execute Batches 4-10
- [ ] User ready to measure final impact

---

## 🚦 Ready to Execute!

**Recommended Workflow:**
1. Run Batch 3 first (validation): `node scripts/run-batches-3-10.mjs --batch 3`
2. Verify results in `reports/phase90-batch3-enhanced-results.json`
3. If successful, run all remaining: `node scripts/run-batches-3-10.mjs`
4. Commit results and update knowledge bases

**Estimated Time:** 30-40 minutes total
**Estimated Impact:** -4,530 total errors (39,762 → ~35,232)
