# Quick Start: Restore Corrupted Files

**Time:** 10 minutes to read, 2-4 hours to execute
**Risk:** Low (automatic safety archiving)
**Impact:** Fix 99 corrupted files, reduce errors by ~150

---

## 🎯 What This Does

Restores 99 critical files that have corrupted current versions but clean backup versions:
- **AI Services** (18 files): RAG, Ollama, Qdrant, vector indexing
- **Cache/Storage** (9 files): GPU cache, Redis, MinIO
- **Database/Routing** (6 files): Migrations, API router
- **UI Components** (12 files): Search, upload, 3D visualization

**Why:** Automated migration tools (Phase 72/76/79) introduced corruption when upgrading TS 5.6→5.7 and attempting Svelte 4→5 conversions.

---

## 🚀 5-Minute Quick Start

```powershell
# 1. Navigate to frontend
cd sveltekit-frontend

# 2. Preview changes (DRY RUN - no modifications)
.\scripts\restore-corrupted-files.ps1 -DryRun

# 3. Review output, look for:
#    - Total files: Should be ~99
#    - Systems: AI Services, Cache & Storage, Database & Routing, UI Components

# 4. If output looks good, execute restoration
.\scripts\restore-corrupted-files.ps1 -Execute

# 5. Verify error reduction
npx svelte-check --threshold error

# Expected: 799 errors → ~600-650 errors (150+ fixed)
```

---

## 📋 Full Workflow (Recommended)

### Step 1: Create Safety Snapshot

```bash
# Create git checkpoint (can rollback if needed)
git add -A
git commit -m "Pre-restoration checkpoint: 799 errors baseline"
```

### Step 2: Dry Run (Preview Only)

```powershell
.\scripts\restore-corrupted-files.ps1 -DryRun
```

**Review Output:**
- ✅ Total files to restore
- ✅ Affected systems breakdown
- ✅ Each file's backup path and reason

**Example Output:**
```
🔧 Corrupted File Restoration Tool
═══════════════════════════════════════════════════════════════
Mode: DRY RUN (preview only)

📊 Loading backup analysis...
🔍 Found 99 files to restore
═══════════════════════════════════════════════════════════════

[1/99] 📄 src\intelligent-error-router.ts
   From: src\intelligent-error-router.ts.backup
   Reason: Current is corrupted, backup is clean
   Priority: P1 | System: Database & Routing
   [DRY RUN] Would restore from backup

...

📊 Restoration Summary
═══════════════════════════════════════════════════════════════
Results:
   ✅ Restored: 99
   ⏭️  Skipped: 0
   ❌ Failed: 0

Affected Systems:
   AI Services : 18 files
   Cache & Storage : 9 files
   Database & Routing : 6 files
   UI Components : 12 files
   Other : 54 files
```

### Step 3: Execute Restoration

```powershell
.\scripts\restore-corrupted-files.ps1 -Execute
```

**What Happens:**
1. Creates `corrupted-archive-TIMESTAMP/` folder
2. Copies all corrupted files to archive (safety backup)
3. Restores clean backups to current files
4. Reports success/failure for each file

**Example Output:**
```
📁 Safety archive created: corrupted-archive-20260204-143022

[1/99] 📄 src\intelligent-error-router.ts
   From: src\intelligent-error-router.ts.backup
   Reason: Current is corrupted, backup is clean
   Priority: P1 | System: Database & Routing
   💾 Archived corrupted version
   ✅ Restored from backup

...

📊 Restoration Summary
═══════════════════════════════════════════════════════════════
Results:
   ✅ Restored: 99
   ⏭️  Skipped: 0
   ❌ Failed: 0

📁 Corrupted files archived to: corrupted-archive-20260204-143022

🔄 Next Steps:
   1. Verify error reduction:
      npx svelte-check --threshold error

   2. Run tests:
      npm run test

   3. Test critical services:
      node scripts/test-ai-services.mjs
      node scripts/test-cache-services.mjs
      npm run db:push

   4. If issues found, rollback:
      Copy-Item corrupted-archive-20260204-143022\* src\... -Force
```

### Step 4: Verify Results

```powershell
# 1. Check TypeScript errors (should be ~600-650, down from 799)
npx svelte-check --threshold error

# 2. Run tests (should pass at same or better rate)
npm run test

# 3. Quick smoke test
npm run dev
# Browse to http://localhost:5175
# Check: AI chat, evidence upload, search work
```

### Step 5: Test Critical Services

```bash
# Test AI services
node -e "fetch('http://localhost:5175/api/ollama/health').then(r => r.json()).then(console.log)"

# Test Redis cache
docker exec phase66-redis redis-cli PING

# Test database migrations
npm run db:push

# Test Qdrant vector DB
curl http://localhost:6333/collections/legal_documents
```

---

## 🛡️ Safety & Rollback

### Automatic Safety Features:

1. **Archive Created:** All corrupted files copied to `corrupted-archive-TIMESTAMP/`
2. **Git Checkpoint:** Can revert via `git reset --hard HEAD~1`
3. **Dry Run Mode:** Preview changes before execution
4. **Detailed Logging:** Every file operation logged to console

### If Something Goes Wrong:

**Option 1: Restore from Archive**
```powershell
# Restore specific file
Copy-Item corrupted-archive-TIMESTAMP\intelligent-error-router.ts src\intelligent-error-router.ts -Force

# Restore all files
Copy-Item corrupted-archive-TIMESTAMP\* src\ -Recurse -Force
```

**Option 2: Git Rollback**
```bash
# Rollback all changes
git reset --hard HEAD~1

# Rollback specific file
git checkout HEAD~1 -- src/lib/server/ai/ollama-local-llm.ts
```

**Option 3: Selective Restore**
```powershell
# Restore only AI services (if other systems working)
Get-ChildItem corrupted-archive-TIMESTAMP\*ai* | ForEach-Object {
  Copy-Item $_ src\lib\server\ai\ -Force
}
```

---

## 📊 Expected Outcomes

### Success Indicators:

- ✅ TypeScript errors reduced from 799 to ~600-650 (150-250 fixed)
- ✅ All tests pass (maintain 92%+ pass rate)
- ✅ AI services functional:
  - Ollama chat completions work
  - RAG search returns results
  - Qdrant vector queries succeed
- ✅ Cache services functional:
  - Redis cache operational
  - GPU shader cache loads
  - MinIO file upload works
- ✅ Database services functional:
  - Migrations run successfully
  - API routes resolve correctly
  - Error handling no infinite loops

### What Changes:

**Files Modified:** 99 files
- `src/intelligent-error-router.ts`
- `src/lib/cache/glyph-shader-cache-bridge.ts`
- `src/lib/cache/multi-layer-cache.ts`
- `src/lib/server/ai/ollama-local-llm.ts`
- `src/lib/server/ai/rag-pipeline.ts`
- `src/lib/server/ai/qdrant-vector-store.ts`
- ... and 93 more

**Files Created:** 1 directory
- `corrupted-archive-TIMESTAMP/` (99 files archived)

**Files Deleted:** None (backups remain until Phase 5)

---

## ❓ FAQ

**Q: What if dry run shows 0 files?**
A: The CSV already filtered RESTORE_FROM_BACKUP. Check `reports/backup-analysis.csv` exists.

**Q: What if some files fail to restore?**
A: Script continues with other files. Check error message, may need manual restoration.

**Q: Can I restore only AI services or specific systems?**
A: Yes, edit CSV to filter specific systems, or use `-Limit 20` flag.

**Q: Will this break my local development?**
A: No. Restored files are the CLEAN versions. Current files are corrupted.

**Q: How do I know which files were corrupted?**
A: Check `reports/backup-analysis.md` "High Priority" section or search CSV for "RESTORE_FROM_BACKUP".

**Q: What if error count doesn't reduce?**
A: Some errors may be unrelated to corruption. Check `npx svelte-check` output for new error types.

**Q: Can I run this multiple times?**
A: Yes, safe to re-run. Creates new archive each time with timestamp.

---

## 🔗 Related Documentation

- **Full Plan:** `RESTORATION_PLAN.md` - Complete multi-week strategy
- **Summary:** `RESTORATION_SUMMARY.md` - Executive overview
- **Backup Analysis:** `reports/backup-analysis.md` - Detailed findings
- **Migration Guide:** `GEMINI.md` - Svelte 5 migration strategy

---

## 🎯 What's Next After Restoration

1. **Phase 2: Migration Analysis**
   ```bash
   node scripts/check-svelte5-ready.mjs
   code reports/svelte5-migration-analysis.md
   ```

2. **Phase 3: Manual Review**
   - Review 51 files where backup is larger
   - Document decisions

3. **Phase 4: Svelte 5 Migration**
   ```bash
   npx sv migrate svelte-5
   ```

4. **Phase 5: Safe Deletion**
   - Delete 468 backup files
   - Delete 7 backup directories
   - Final cleanup

---

**Ready to execute? Start with:**
```powershell
cd sveltekit-frontend
.\scripts\restore-corrupted-files.ps1 -DryRun
```
