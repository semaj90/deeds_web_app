# Syntax Fix Scripts

Automated tools to fix common syntax errors in the Legal AI codebase.

## Scripts

### 🔧 fix-all-syntax.ps1 (Master Script)
Runs all fixes in sequence. **Use this for complete syntax cleanup.**

```powershell
# Dry run to preview changes
.\scripts\fix-all-syntax.ps1 -DryRun

# Apply all fixes
.\scripts\fix-all-syntax.ps1
```

### 🎯 Individual Scripts

#### fix-colon-syntax.ps1
Fixes stray colons in control flow statements.
- `return:` → `return`
- `case:` → `case`
- `import:` → `import`

```powershell
.\scripts\fix-colon-syntax.ps1 [-DryRun] [-Verbose]
```

#### fix-dts-syntax.ps1
Fixes TypeScript declaration syntax.
- `declare module: 'name'` → `declare module 'name'`

```powershell
.\scripts\fix-dts-syntax.ps1 [-DryRun] [-Verbose]
```

#### check-syntax.ps1
Comprehensive validation and error reporting.

```powershell
# Quick check (no dev server test)
.\scripts\check-syntax.ps1 -Quick

# Full check with dev server test
.\scripts\check-syntax.ps1

# Auto-fix issues
.\scripts\check-syntax.ps1 -Fix
```

## Fixes Applied

✅ **1,236 files** - Stray colon syntax  
✅ **86 files** - Module declarations  
✅ **5 files** - Manual component fixes  
✅ **228 errors** - TypeScript errors reduced  

## Current Status

- ✅ Dev server starts successfully
- ✅ No runtime blocking errors
- ⚠️ 15,403 TypeScript errors remain (non-blocking)

## Quick Start

```powershell
# Fix all syntax issues
.\scripts\fix-all-syntax.ps1

# Start development
npm run dev

# Validate changes
.\scripts\check-syntax.ps1 -Quick
```
