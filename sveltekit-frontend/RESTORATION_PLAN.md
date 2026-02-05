# Backup Restoration & Migration Plan
**Date:** February 4, 2026
**Branch:** `feature/directory-migration-consolidation`
**Status:** Ready for execution

---

## 🎯 Overview

**Discovery:** Backup analysis revealed **99 corrupted current files** with clean backups available.

**Critical Systems Affected:**
- AI/ML Services (18 files) - RAG, Ollama, Qdrant, vector indexing
- Cache & Storage (9 files) - GPU cache, Redis, MinIO, IndexedDB
- Database & Routing (6 files) - Migrations, API router, error handling
- UI Components (12 files) - Search, upload, 3D visualization

**Impact:** 799 TypeScript errors → estimated 600-650 after restoration (150-250 errors from corruption)

---

## 📊 Analysis Summary

### File Categories:

| Category | Count | Action | Priority |
|----------|-------|--------|----------|
| **Corrupted (restore from backup)** | 99 | RESTORE | P0 - Critical |
| **Manual review (backup larger)** | 51 | REVIEW | P1 - High |
| **Safe to delete (identical/old)** | 468 | DELETE | P2 - Medium |
| **Backup directories** | 7 | DELETE | P3 - Low |

### Current Stack (Target):
- **Svelte:** 5.x (runes: `$state`, `$derived`, `$effect`, `$props`)
- **SvelteKit:** 2.x
- **TypeScript:** 5.7.x
- **Drizzle ORM:** 0.44.7
- **Bits-UI:** v2 (Svelte 5 compatible)
- **XState:** v5

---

## 🚨 Phase 1: Critical File Restoration (Priority 0)

### Restoration Order (by dependency):

```
1. Database & Routing (foundation layer)
   ├── migration-system.ts
   ├── unified-api-router.ts
   ├── intelligent-error-router.ts
   └── localDocs.svelte.ts

2. Cache & Storage (infrastructure layer)
   ├── multi-layer-cache.ts
   ├── glyph-shader-cache-bridge.ts (2 backups)
   ├── minio-service.ts (3 backups)
   └── secure-storage-client.ts

3. AI/ML Services (business logic layer)
   ├── qdrant-vector-store.ts
   ├── rag-pipeline.ts (2 backups)
   ├── contextual-understanding-service.ts (2 backups)
   ├── hmm-state-machine.ts (2 backups)
   ├── ollama-local-llm.ts
   ├── pgvector-indexing-service.ts
   └── som-bitmap-visualizer.ts

4. UI Components (presentation layer)
   ├── CudaSearch.svelte
   ├── EnhancedRAGDemo.svelte
   ├── NeuralTopology3DDemo.svelte
   └── SimpleFileUpload.svelte
```

### Automated Restoration Script:

```powershell
# Script: scripts/restore-corrupted-files.ps1

param(
    [switch]$DryRun = $false,
    [switch]$Execute = $false
)

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

if (-not $DryRun -and -not $Execute) {
    Write-Host "Usage: .\restore-corrupted-files.ps1 -DryRun OR -Execute" -ForegroundColor Yellow
    exit 1
}

# Safety: Create archive of corrupted files
if ($Execute) {
    $archiveDir = "corrupted-archive-$timestamp"
    New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null
    Write-Host "📁 Created safety archive: $archiveDir" -ForegroundColor Cyan
}

# Load CSV and filter RESTORE_FROM_BACKUP
$restorations = Import-Csv "reports\backup-analysis.csv" |
    Where-Object { $_.Recommendation -eq "RESTORE_FROM_BACKUP" } |
    Sort-Object Priority

Write-Host "`n🔍 Found $($restorations.Count) files to restore" -ForegroundColor Yellow
Write-Host "═" * 60

$restored = 0
$failed = 0

foreach ($item in $restorations) {
    $backupPath = $item.'Backup Path'
    $currentPath = $item.'Current Path'

    Write-Host "`n📄 Processing: $currentPath" -ForegroundColor Cyan
    Write-Host "   Backup: $backupPath"
    Write-Host "   Reason: $($item.Reasons)"
    Write-Host "   Priority: P$($item.Priority)"

    if ($DryRun) {
        Write-Host "   [DRY RUN] Would restore from backup" -ForegroundColor Yellow
        continue
    }

    try {
        # Verify backup exists
        if (-not (Test-Path $backupPath)) {
            Write-Host "   ❌ Backup not found!" -ForegroundColor Red
            $failed++
            continue
        }

        # Archive corrupted current
        $archivePath = Join-Path $archiveDir (Split-Path $currentPath -Leaf)
        if (Test-Path $currentPath) {
            Copy-Item $currentPath $archivePath -Force
            Write-Host "   💾 Archived corrupted version" -ForegroundColor Gray
        }

        # Restore clean backup
        Copy-Item $backupPath $currentPath -Force
        Write-Host "   ✅ Restored from backup" -ForegroundColor Green
        $restored++

    } catch {
        Write-Host "   ❌ Error: $_" -ForegroundColor Red
        $failed++
    }
}

Write-Host "`n" + ("═" * 60)
Write-Host "📊 Summary:" -ForegroundColor Cyan
Write-Host "   Restored: $restored" -ForegroundColor Green
Write-Host "   Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Gray" })

if ($Execute) {
    Write-Host "`n📁 Corrupted files archived to: $archiveDir" -ForegroundColor Cyan
    Write-Host "`n🔄 Next steps:" -ForegroundColor Yellow
    Write-Host "   1. Run: npx svelte-check --threshold error"
    Write-Host "   2. Run: npm run test"
    Write-Host "   3. Compare error count reduction"
}
```

### Validation After Restoration:

```powershell
# Before restoration
npx svelte-check --threshold error 2>&1 | Tee-Object -FilePath "errors-before.txt"
npm run test 2>&1 | Tee-Object -FilePath "tests-before.txt"

# Execute restoration
.\scripts\restore-corrupted-files.ps1 -Execute

# After restoration
npx svelte-check --threshold error 2>&1 | Tee-Object -FilePath "errors-after.txt"
npm run test 2>&1 | Tee-Object -FilePath "tests-after.txt"

# Compare
$before = (Get-Content errors-before.txt | Select-String "found \d+ error").Matches.Value
$after = (Get-Content errors-after.txt | Select-String "found \d+ error").Matches.Value
Write-Host "`n📊 Error Reduction: $before → $after" -ForegroundColor Cyan
```

---

## 👀 Phase 2: Manual Review Files (Priority 1)

### 51 Files Where Backup is Larger

**Why Review Needed:** Backup has more content than current. Could be:
1. Accidental feature loss (restore from backup)
2. Intentional refactoring (keep current, delete backup)
3. Hybrid state (manual merge needed)

### High-Priority Review Targets:

#### 1. Core Components (10 files):
```
src/lib/components/MonacoEditor.svelte
src/lib/components/EnhancedDocumentUpload.svelte
src/lib/components/EvidenceUpload.svelte
src/lib/components/_archive/test-demo/demo/PerformanceOptimizedEvidenceBoard.svelte
```

#### 2. AI Services (8 files):
```
src/lib/server/ai/agentic-stream.ts
src/lib/server/webgpu-langchain-bridge.ts
src/lib/server/workers/legal-ai-worker.ts
```

#### 3. Machine States (5 files):
```
src/lib/machines/ingestion-workflow-machine.ts
src/lib/machines/vectorJobMachine.ts
```

### Review Process:

```bash
# For each flagged file:

# 1. Visual diff
code --diff backup.svelte current.svelte

# 2. Check git history
git log --follow --oneline -10 -- src/lib/components/MonacoEditor.svelte

# 3. Check for Svelte 5 compatibility
rg "\$state|\$derived|\$effect|\$props" backup.svelte
rg "export let|reactive:" backup.svelte  # Svelte 4 patterns

# 4. Check usage in codebase
rg "MonacoEditor" --type svelte --type ts

# 5. Decision:
# IF backup is Svelte 5 AND has features → RESTORE
# IF current is Svelte 5 AND backup is Svelte 4 → DELETE BACKUP
# IF both Svelte 4 OR unclear → MANUAL MERGE
```

### Review Checklist Template:

```markdown
## File: MonacoEditor.svelte

- [ ] Diff reviewed (code --diff)
- [ ] Git history checked
- [ ] Backup Svelte version: [ ] 4 [ ] 5 [ ] Hybrid
- [ ] Current Svelte version: [ ] 4 [ ] 5 [ ] Hybrid
- [ ] Backup has features not in current: [ ] Yes [ ] No
- [ ] Current has features not in backup: [ ] Yes [ ] No
- [ ] Tests exist: [ ] Yes [ ] No
- [ ] Tests pass with backup: [ ] Yes [ ] No [ ] N/A
- [ ] Tests pass with current: [ ] Yes [ ] No [ ] N/A

**Decision:** [ ] RESTORE [ ] DELETE BACKUP [ ] MANUAL MERGE

**Rationale:**
```

---

## 🔄 Phase 3: Legacy File Analysis (Priority 2)

### 468 Files Safe to Delete (After Svelte 5 Check)

**Strategy:** Before deleting, verify current file is Svelte 5 compatible.

### Svelte 5 Migration Patterns:

```typescript
// Detection script: scripts/check-svelte5-ready.mjs

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const svelte4Patterns = [
  /export let\s+\w+/,           // export let props
  /\$:\s*\w+\s*=/,              // reactive statements
  /on:\w+=/,                    // on:event
  /bind:this=/,                 // bind:this
  /new\s+\w+Component/,         // new Component()
];

const svelte5Patterns = [
  /\$props\(\)/,                // $props()
  /\$state\(/,                  // $state()
  /\$derived\(/,                // $derived()
  /\$effect\(/,                 // $effect()
  /let\s+\{\s*\w+.*\}\s*=\s*\$props/, // destructured props
];

function analyzeSvelteFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');

  const hasSvelte4 = svelte4Patterns.some(p => p.test(content));
  const hasSvelte5 = svelte5Patterns.some(p => p.test(content));

  if (hasSvelte5 && !hasSvelte4) return 'SVELTE_5';
  if (hasSvelte4 && !hasSvelte5) return 'SVELTE_4';
  if (hasSvelte5 && hasSvelte4) return 'HYBRID';
  return 'UNKNOWN';
}

// Load safe-to-delete list
const safeToDelete = readFileSync('reports/safe-to-delete.txt', 'utf-8')
  .split('\n')
  .filter(Boolean);

const results = {
  svelte4_can_delete: [],
  svelte5_current_good: [],
  hybrid_needs_review: [],
  unknown: []
};

safeToDelete.forEach(backupPath => {
  const currentPath = backupPath.replace(/\.(backup|bak|corruption-backup).*$/, '');

  if (!currentPath.endsWith('.svelte')) {
    results.unknown.push(currentPath);
    return;
  }

  const version = analyzeSvelteFile(currentPath);

  if (version === 'SVELTE_5') {
    results.svelte5_current_good.push(backupPath);
  } else if (version === 'SVELTE_4') {
    results.svelte4_can_delete.push(backupPath);
  } else if (version === 'HYBRID') {
    results.hybrid_needs_review.push(backupPath);
  } else {
    results.unknown.push(backupPath);
  }
});

console.log('📊 Svelte 5 Migration Analysis:');
console.log(`   Svelte 5 (current good, safe to delete backup): ${results.svelte5_current_good.length}`);
console.log(`   Svelte 4 (needs migration before deletion): ${results.svelte4_can_delete.length}`);
console.log(`   Hybrid (manual review): ${results.hybrid_needs_review.length}`);
console.log(`   Unknown: ${results.unknown.length}`);
```

### Safe Deletion Criteria:

**DELETE BACKUP if ALL true:**
- [ ] Current file uses Svelte 5 syntax (`$props`, `$state`, `$derived`)
- [ ] Current file has no `@ts-ignore` or `@ts-expect-error`
- [ ] Current file compiles without errors
- [ ] Backup is confirmed older (timestamp) or identical (diff)
- [ ] Git history shows intentional upgrade

**DELETE in Phases:**
```powershell
# Phase 3a: Delete backup directories (7 dirs, ~500 files)
Remove-Item -Recurse -Force "src\lib\.corrupted_backups"
Remove-Item -Recurse -Force "src\lib\archived-components"
# ... etc

# Phase 3b: Delete identical backups (analyze-backups.mjs Priority 5)
Get-Content reports\backup-analysis.csv |
    Where-Object { $_.Priority -eq 5 } |
    ForEach-Object { Remove-Item $_.'Backup Path' }

# Phase 3c: Delete older/legacy backups (Priority 4)
# Only after Svelte 5 migration verified
```

---

## 📋 Phase 4: Documentation Updates

### Files to Update:

1. **COPILOT.md** - Task-oriented restoration guide
2. **CLAUDE.md** - Analytical risk assessment
3. **ACE.md** - Automated restoration approach
4. **GEMINI.md** - Migration strategy with web search context

### Update Strategy:

```markdown
# Each file should include:

## Current Analysis
- Backup analysis summary
- Corrupted file count and impact
- Manual review requirements

## Restoration Approach
- File-specific restoration strategy
- Validation steps
- Rollback plan

## Migration Path
- Svelte 5 compatibility check
- Legacy file analysis
- Safe deletion criteria

## Success Metrics
- Error reduction target
- Test coverage maintenance
- File count reduction
```

---

## 🎯 Success Metrics

### Quantitative Goals:

| Metric | Before | Target | Stretch |
|--------|--------|--------|---------|
| TypeScript Errors | 799 | 600 | 400 |
| Test Pass Rate | ~92% | 97% | 100% |
| File Count | 7,277 | 6,800 | 6,300 |
| Svelte 5 Ready | 0% | 50% | 80% |
| Backup Files | 618 | 200 | 0 |

### Qualitative Goals:

- **System Stability:** Critical AI/cache/DB services functional
- **Developer Experience:** Clear error messages, no false positives
- **Code Quality:** No `@ts-ignore` suppressions in restored files
- **Architecture:** Clean separation of Svelte 4 (legacy) vs Svelte 5 (current)

---

## 🚀 Execution Timeline

### Week 1: Critical Restoration
- **Day 1:** Restore 99 corrupted files, validate error reduction
- **Day 2:** Test AI services (Ollama, RAG, Qdrant)
- **Day 3:** Test cache/storage (Redis, MinIO, WebGPU)
- **Day 4:** Test DB migrations and API routing
- **Day 5:** Test UI components

### Week 2: Manual Review
- **Day 1-2:** Review 51 flagged components (backup larger)
- **Day 3-4:** Review service/worker backups
- **Day 5:** Document decisions, create merge plan

### Week 3-4: Legacy Migration
- **Week 3:** Analyze 468 legacy files for Svelte 5 compatibility
- **Week 4:** Execute safe deletions, migrate remaining Svelte 4

---

## 🛠️ Scripts to Generate

1. `scripts/restore-corrupted-files.ps1` - Automated restoration
2. `scripts/check-svelte5-ready.mjs` - Svelte version detection
3. `scripts/compare-backup-current.mjs` - Manual review helper
4. `scripts/safe-delete-backups.ps1` - Phased deletion
5. `scripts/smoke-test.mjs` - Validation suite

---

## 📚 References

- **Backup Analysis:** `reports/backup-analysis.md`
- **CSV Data:** `reports/backup-analysis.csv`
- **Route Audit:** `reports/route-audit.csv`
- **Migration Plan:** `DIRECTORY_MIGRATION_PLAN.md`
- **Svelte 5 Guide:** https://svelte.dev/docs/svelte/v5-migration-guide
