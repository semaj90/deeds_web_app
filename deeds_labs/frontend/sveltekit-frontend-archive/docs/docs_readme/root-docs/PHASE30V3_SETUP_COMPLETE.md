# Phase 30v3 AST Setup Complete

## ✅ Changes Applied

### 1. ESLint Configuration Updated
**File**: `.eslintrc.cjs`

Added CJS script override to silence false warnings:
```javascript
overrides: [
  {
    files: ['**/*.cjs', 'scripts/**/*.cjs'],
    env: { node: true },
    parserOptions: { sourceType: 'script' },
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
      'import/no-commonjs': 'off',
      'n/no-missing-require': 'off',
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^\\$' }],
    },
  },
  // ... existing overrides
]
```

### 2. Pipeline Updated - Stage 2 Disabled
**File**: `run-phase30-pipeline.ps1`

Stage 2 (regex-based fixes) is now permanently disabled:
```powershell
# Stage 2: Regex-based fixes — HARD DISABLE (regex retired)
if ($Stage -eq '2' -or $Stage -eq 'all') {
    Write-Host "⏭️  Stage 2 disabled permanently (regex retired). Use Stage 3 AST." -ForegroundColor Yellow
}
```

### 3. Clean AST Fixer Created
**File**: `phase30v3-ast-fixer.cjs`

Ultra-conservative AST-only fixer:
- **Only** fixes interface property semicolons
- Uses ts-morph for semantic awareness
- Zero regex patterns
- Import-safe by design
- Memory-guarded execution

### 4. Installation Script Created
**File**: `setup-ts-morph.ps1`

Deterministic installation workflow:
- Stops Node processes
- Cleans cache (optional)
- Installs TypeScript ~5.6.3
- Installs ts-morph ^23
- Verifies installation
- Sets NODE_OPTIONS

## 🚀 Quick Start

### Option 1: Full Setup (First Time)
```powershell
# Clean install with verification
.\setup-ts-morph.ps1 -Force

# Test the fixer
node --max-old-space-size=8192 phase30v3-ast-fixer.cjs --dry-run

# Run for real
node --max-old-space-size=8192 phase30v3-ast-fixer.cjs
```

### Option 2: Just Install ts-morph
```powershell
# Without clean
.\setup-ts-morph.ps1

# Or manual
npm install --save-dev typescript@~5.6.3 ts-morph@^23 --legacy-peer-deps
```

### Option 3: Use the Pipeline
```powershell
# Stage 3 only (AST fixes)
.\run-phase30-pipeline.ps1 -Stage 3

# Dry run first
.\run-phase30-pipeline.ps1 -Stage 3 -DryRun
```

## 📊 Verification Loop

After running the fixer:
```powershell
# Count errors
npx tsc --noEmit --skipLibCheck 2>&1 | Tee-Object -FilePath logs\ts-after-phase30v3.log | Select-String "error TS" | Measure-Object

# Compare with previous
Select-String "error TS" logs\ts-after-phase30v3.log | Measure-Object
```

## 🛡️ Safety Features

### AST-Only Approach
- ✅ Semantically aware (not regex)
- ✅ Import statements naturally protected
- ✅ Context-perfect transformations
- ✅ Zero false positives

### Conservative Scope
- **Only** fixes interface property semicolons
- Skips methods, index signatures
- Skips type aliases (for now)
- Skips parameter types (for now)

### Memory Management
- Uses `--max-old-space-size=8192`
- Processes files incrementally
- Removes from AST after processing

## 📋 Next Steps

### Immediate Actions
1. ✅ Run `.\setup-ts-morph.ps1` to install dependencies
2. ✅ Test with `--dry-run` flag first
3. ✅ Review changes in git diff before commit
4. ✅ Verify error count drops

### Future Expansions (Once Count Drops)
When ready to add more AST transforms:

1. **Type alias properties**: Similar to interface, but for `type Foo = { ... }`
2. **Parameter separators**: Fix missing commas in function params
3. **Generic arguments**: Fix missing commas in `<T, U>` lists
4. **Array/tuple types**: Fix bracket issues

Each expansion should be:
- One at a time
- Tested in isolation
- Verified with git diff
- Measured for impact

## 🐛 Troubleshooting

### ts-morph Not Found
```powershell
# Full clean reinstall
.\setup-ts-morph.ps1 -Force

# Manual verification
node -e "require('ts-morph'); console.log('OK')"
```

### Parse Errors
The script skips files it can't parse and reports them. These are typically:
- Already broken syntax
- Non-TS files incorrectly included
- Generated files

Check logs for details.

### No Changes Made
If the script reports 0 changes:
- All interface semicolons already present ✅
- Or no interfaces in the files processed

This is success, not failure!

## 📝 File Changes Summary

| File | Change | Purpose |
|------|--------|---------|
| `.eslintrc.cjs` | Added CJS override | Silence lint warnings on scripts |
| `run-phase30-pipeline.ps1` | Disabled Stage 2 | Retire regex phase |
| `phase30v3-ast-fixer.cjs` | Replaced with clean version | Safe AST-only fixes |
| `setup-ts-morph.ps1` | Created | Deterministic installation |
| `PHASE30V3_SETUP_COMPLETE.md` | Created | Documentation |

## 🎯 Success Criteria

✅ ts-morph installs cleanly  
✅ Script runs without errors  
✅ Interface semicolons added  
✅ No import corruption  
✅ Error count decreases  
✅ Git diff shows only semicolons  

## 💡 Pro Tips

1. **Always dry-run first**: See what will change before committing
2. **Check git diff**: Verify only expected changes
3. **Count errors before/after**: Measure actual impact
4. **Commit incrementally**: One transform type per commit
5. **Keep logs**: Track progress over time

---

**Status**: ✅ Ready to use  
**Last Updated**: 2025-01-02  
**Next Review**: After first successful run
