# Library Code Cleanup Plan

**Date:** February 4, 2026
**Branch:** `feature/directory-migration-consolidation`

---

## 🔍 The Problem

**Library code (src/lib/) has 5,065 files:**
- **1,164 backup/corrupt files** (23% of lib!) ← **Primary cleanup target**
- 1,826 component files (36%)
- 826 server files (16%)
- 665 service files (13%)
- Remaining: utils, stores, types, etc.

**Total codebase:**
- Active routes: 290 files (4%)
- Parked routes: 1,922 files (26%)
- Library: 5,065 files (70%)
- **Grand total: 7,277 files**

---

## 🎯 Cleanup Impact Estimate

### Backup Files in lib/ (1,164 files)

**Patterns found:**
```
*.backup
*.bak
*.corrupt
*.phase*.bak
*.ast-backup
*.svelte4.backup
.corrupted_backups/
archived-components/
components-backup/
phase-backups/
```

**After cleanup:**
- lib/: 5,065 → ~3,900 files (-23%)
- Total src/: 7,277 → ~6,100 files (-16%)

---

## 📋 Cleanup Strategy

### Phase A: Safe Library Cleanup (1,164 files)

#### 1. Backup Directories (Low Risk)
```powershell
Remove-Item -Recurse -Force src/lib/.corrupted_backups
Remove-Item -Recurse -Force src/lib/archived-components
Remove-Item -Recurse -Force src/lib/components-backup
Remove-Item -Recurse -Force src/lib/stores/phase-backups
Remove-Item -Recurse -Force src/lib/stores/phase2-backups
Remove-Item -Recurse -Force src/lib/stores/_archive
```

**Estimate:** ~400-500 files

#### 2. Individual Backup Files (Medium Risk)
```powershell
# Find all backup files
Get-ChildItem src/lib -Recurse -File -Include '*.backup*','*.bak','*.corrupt*'

# Delete after review
Remove-Item src/lib -Recurse -Include '*.backup*','*.bak','*.corrupt*'
```

**Estimate:** ~600-700 files

#### 3. Migration Reports (Low Risk)
```powershell
# These are documentation, safe to move
New-Item -ItemType Directory -Path docs/migration-history -Force
Move-Item src/lib/**/*.migration-report.md docs/migration-history/
```

**Estimate:** ~50-100 files

---

### Phase B: Route Cleanup (1,922 files in routes_parked)

From MIGRATION_REVIEW.md:

#### 1. Delete Obsolete Routes (~500-700 files)
- 31 routes: disabled (8) + archives (3) + backups (1) + demos (13)

#### 2. Migrate Core Features (~400-600 files)
- 9 routes: evidence-board, graph-mode, memory-palace, investigation, detective, legal-ai

#### 3. Merge Duplicates (~150-250 files)
- 8 routes: chat variants, search variants, yorha variants

#### 4. Extract Tests (~150-250 files)
- 13 test routes → migrate to src/tests/

---

## 🚀 Execution Plan

### Step 1: Library Backup Cleanup (Today)

**Safe operations (no review needed):**

```powershell
# 1. Delete backup directories
Remove-Item -Recurse -Force `
    src/lib/.corrupted_backups, `
    src/lib/archived-components, `
    src/lib/components-backup, `
    src/lib/stores/phase-backups, `
    src/lib/stores/phase2-backups, `
    src/lib/stores/_archive `
    -ErrorAction SilentlyContinue

Write-Host "✅ Deleted backup directories"

# 2. Move migration reports to docs
New-Item -ItemType Directory -Path docs/migration-history -Force
Get-ChildItem src/lib -Recurse -Filter '*.migration-report.md' |
    Move-Item -Destination docs/migration-history/

Write-Host "✅ Moved migration reports"

# 3. Find remaining backup files (for review)
$backups = Get-ChildItem src/lib -Recurse -File -Include '*.backup*','*.bak','*.corrupt*'
Write-Host "`n📊 Remaining backup files: $($backups.Count)"
$backups | Group-Object Extension | Format-Table Count, Name -AutoSize
```

**Expected reduction:** ~500-700 files

---

### Step 2: Review Remaining Backups (This Week)

**Before deleting, check each backup:**

```powershell
# For each .backup file, compare with current
function Compare-Backup {
    param($BackupFile)

    $current = $BackupFile.FullName -replace '\.backup.*$', ''

    if (Test-Path $current) {
        $backupSize = $BackupFile.Length
        $currentSize = (Get-Item $current).Length

        [PSCustomObject]@{
            Backup = $BackupFile.Name
            BackupSize = $backupSize
            CurrentSize = $currentSize
            Difference = $currentSize - $backupSize
            Recommendation = if ($currentSize -gt $backupSize) { "DELETE backup" } else { "REVIEW manually" }
        }
    } else {
        [PSCustomObject]@{
            Backup = $BackupFile.Name
            Recommendation = "DELETE (no current file)"
        }
    }
}

# Run comparison
$backups | ForEach-Object { Compare-Backup $_ } | Format-Table -AutoSize
```

---

### Step 3: Route Cleanup (Week 1-2)

Follow MIGRATION_REVIEW.md plan

---

### Step 4: Final Cleanup (Week 4)

**After all migrations complete:**

```powershell
# Verify no active code references deleted routes
rg "from.*routes_parked" src/routes --json
rg "from.*\.backup" src/ --json

# Delete empty directories
Get-ChildItem src -Recurse -Directory |
    Where-Object { (Get-ChildItem $_.FullName -Force).Count -eq 0 } |
    Remove-Item -Force

# Final count
Write-Host "`n📊 Final File Count:"
Write-Host "  routes: $(( Get-ChildItem src/routes -Recurse -File | Measure-Object).Count)"
Write-Host "  lib:    $(( Get-ChildItem src/lib -Recurse -File | Measure-Object).Count)"
Write-Host "  Total:  $(( Get-ChildItem src -Recurse -File | Measure-Object).Count)"
```

---

## ✅ Success Metrics

### Week 1 Target
- ✅ Delete backup directories from lib/ (~500 files)
- ✅ Move migration reports to docs/ (~50 files)
- ⏳ Review individual backup files (~600 files)
- ⏳ Delete obsolete routes (~500 files)

**Expected:** 7,277 → ~6,100 files (-16%)

### Week 2 Target
- ⏳ Delete reviewed backup files
- ⏳ Migrate core features
- ⏳ Extract test code

**Expected:** ~6,100 → ~5,500 files (-9%)

### Week 4 Target (Final)
- ⏳ All cleanup complete
- ⏳ routes_parked/ empty or <10 routes
- ⏳ lib/ has zero backup files

**Expected:** ~5,500 → ~5,000 files (-7%)

**Total reduction:** 7,277 → 5,000 files (-31%)

---

## 📊 Answer to "What is this library code?"

### src/lib/ Breakdown (5,065 files)

**Components (1,826 files - 36%)**
- Svelte UI components
- Includes duplicates and archived versions
- **Cleanup potential:** 200-300 files (archived-components, components-backup)

**Server (826 files - 16%)**
- Server-side API logic
- Database access
- Authentication
- **Cleanup potential:** 50-100 files (backup files)

**Services (665 files - 13%)**
- Business logic services
- Pattern search (ripgrep integration)
- LLM orchestration
- RAG/KAG pipelines
- **Cleanup potential:** 50-100 files (backup files)

**Utils (224 files - 4%)**
- Utility functions
- Helper scripts
- **Includes:** Many backup/restore scripts (can be moved to scripts/)

**Stores (192 files - 4%)**
- Svelte stores
- State management
- **Includes:** phase-backups/, phase2-backups/ (should be deleted)

**Types (153 files - 3%)**
- TypeScript type definitions
- **Cleanup potential:** 20-30 files (backup files)

**Other (2,179 files - 43%)**
- Machines, workers, WebGPU, WASM, configs, etc.
- **Includes:** ~600-800 backup files scattered throughout

---

## 🚨 Risks & Mitigations

### Risk 1: Deleting Active Backup Files
**Mitigation:**
- Use git to track deletions
- Review backup vs current before deleting
- Keep git history (can restore if needed)

### Risk 2: Breaking Import References
**Mitigation:**
- Search for imports before deleting: `rg "from.*FILENAME" src/`
- Run `npm run check` after each cleanup phase

### Risk 3: Losing Valuable Code
**Mitigation:**
- Use comparison script to check backup vs current
- Only delete if current is newer/larger
- Manual review for edge cases

---

## 💡 Recommendations

### Option 1: Conservative (Recommended)
1. Delete backup **directories** only (low risk, ~500 files)
2. Move migration reports to docs/
3. Review individual backup files manually
4. Delete after git commit

**Timeline:** 1-2 weeks
**Reduction:** 7,277 → 6,400 files (-12%)

### Option 2: Aggressive
1. Delete all backup directories
2. Delete all .backup files (use comparison script first)
3. Delete all .bak, .corrupt files
4. Clean up routes_parked simultaneously

**Timeline:** 3-5 days
**Reduction:** 7,277 → 5,500 files (-24%)

### Option 3: Nuclear (Not Recommended Without Review)
1. Everything in Option 2
2. Plus: delete all parked routes immediately
3. Plus: delete all archived/old directories

**Timeline:** 1-2 days
**Reduction:** 7,277 → 4,500 files (-38%)
**Risk:** HIGH - could break active code

---

## 🎯 Decision Points

### 1. Demos Strategy
**Question:** Extract to separate repo or delete?

**Options:**
- **A. Delete** - Fastest, assumes demos have no unique value
- **B. Extract** - Preserves demos for documentation
- **C. Review** - Check each demo manually

**Recommendation:** Review top 5 demos, delete rest

---

### 2. Backup Files
**Question:** Delete all or review manually?

**Options:**
- **A. Delete directories only** (safest)
- **B. Use comparison script** + delete automatically
- **C. Manual review** each file

**Recommendation:** Option B (comparison script)

---

### 3. Timeline
**Question:** Fast cleanup or phased approach?

**Options:**
- **A. 1 week sprint** - Delete everything in Phase 1
- **B. 2-3 week phased** - Review + migrate + cleanup
- **C. 4 week careful** - Full manual review

**Recommendation:** Option B (2-3 weeks)

---

## 📝 Next Steps

### Immediate (Now)
1. Review this plan
2. Decide on option (Conservative vs Aggressive)
3. Create backup comparison script
4. Run initial directory cleanup (if approved)

### This Week
1. Execute Step 1 (library backup cleanup)
2. Generate backup comparison report
3. Start route migration (evidence-board)
4. Extract test code

### Next Week
1. Delete reviewed backup files
2. Migrate core features
3. Merge duplicates
4. Continue route review

---

**Status:** Draft - Awaiting Approval
**Estimated Impact:** -1,500 to -2,300 files (-21% to -31%)
**Risk Level:** Low to Medium (depends on chosen option)
