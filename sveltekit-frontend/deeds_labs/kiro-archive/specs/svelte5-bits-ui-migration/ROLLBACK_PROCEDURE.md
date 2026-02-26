# Svelte 5 + Bits-UI v2 Migration - Rollback Procedure

## Overview

This document describes how to rollback the migration if critical issues are encountered.

## Backup Location

- **Backup Path**: `sveltekit-frontend/src.backup`
- **Created**: Before Phase 2 (Automated Codemods)
- **Size**: ~99 MB (5500+ files)

## Rollback Steps

### Option 1: Full Rollback (Restore from Backup)

If the migration introduces critical errors that cannot be fixed:

```powershell
# 1. Remove the modified src directory
Remove-Item -Recurse -Force "sveltekit-frontend/src"

# 2. Restore from backup
Copy-Item -Recurse "sveltekit-frontend/src.backup" "sveltekit-frontend/src"

# 3. Verify restoration
npm run build
npm run svelte-check
```

### Option 2: Partial Rollback (Revert Specific Codemods)

If only certain codemods caused issues:

```powershell
# 1. Identify which codemod caused the issue
# 2. Restore from backup
Copy-Item -Recurse "sveltekit-frontend/src.backup" "sveltekit-frontend/src"

# 3. Re-run codemods selectively (skip the problematic one)
node scripts/codemod-svelte5-events.mjs
# Skip: node scripts/codemod-svelte5-dynamic-components.mjs
node scripts/codemod-svelte5-nonvoid-selfclose.mjs
node scripts/codemod-svelte5-import-type.mjs

# 4. Verify build
npm run build
```

### Option 3: Git Rollback (If Changes Committed)

If changes were committed to git:

```powershell
# 1. Identify the commit before migration started
git log --oneline | head -20

# 2. Revert to that commit
git revert <commit-hash>

# 3. Or reset hard (if not pushed)
git reset --hard <commit-hash>
```

## Verification After Rollback

After rolling back, verify the system is in a working state:

```powershell
# 1. Check build
npm run build

# 2. Check svelte-check
npm run svelte-check

# 3. Start dev server
npm run dev

# 4. Test core routes in browser
# - http://localhost:5173/terminal
# - http://localhost:5173/cases/[id]
# - http://localhost:5173/yorha-detective
```

## Backup Cleanup

Once migration is complete and verified:

```powershell
# Remove backup to save disk space
Remove-Item -Recurse -Force "sveltekit-frontend/src.backup"
```

## Checkpoint System

The migration uses a checkpoint system to save state after each phase:

- **Phase 1**: Route conflicts resolved
- **Phase 2**: Automated codemods complete
- **Phase 3**: Runes migration complete
- **Phase 4**: Bits-UI v2 migration complete
- **Phase 5**: Styling standardization complete
- **Phase 6**: Verification & testing complete

If an issue is discovered at any checkpoint, rollback to the previous checkpoint by:

1. Restoring from backup
2. Re-running codemods up to (but not including) the problematic phase
3. Manually fixing the issue
4. Proceeding to the next phase

## Common Issues & Fixes

### Issue: Build fails after codemods

**Cause**: Regex patterns may have missed edge cases

**Fix**:
1. Identify the problematic file
2. Manually fix the issue
3. Re-run build to verify
4. Continue with next phase

### Issue: Event handlers not working

**Cause**: Event attribute conversion may have missed modifiers

**Fix**:
1. Check for `on:event|modifier` patterns
2. Update codemod to handle modifiers
3. Re-run codemod on affected files
4. Verify event handlers work

### Issue: Components not rendering

**Cause**: Bits-UI v2 API changes may require additional updates

**Fix**:
1. Check Bits-UI v2 documentation
2. Update component usage manually
3. Verify component renders
4. Continue with next phase

## Support

For issues during rollback:

1. Check the error message carefully
2. Review the relevant codemod script
3. Manually fix the issue if needed
4. Document the fix for future reference
5. Continue with migration

## Backup Verification

To verify the backup is valid:

```powershell
# Check backup exists
Test-Path "sveltekit-frontend/src.backup"

# Check backup size
(Get-Item "sveltekit-frontend/src.backup" -Recurse | Measure-Object -Sum Length).Sum / 1MB

# Check backup contains expected files
Get-ChildItem "sveltekit-frontend/src.backup" | Measure-Object
```

Expected output:
- Backup exists: True
- Backup size: ~99 MB
- File count: ~5500 files
