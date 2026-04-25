# SvelteKit Internal Module Fix Guide

## Problem
Error: `Cannot find module '__SERVER__/internal.js'`

This happens when SvelteKit's generated files are missing or corrupted.

## Quick Fix

```powershell
# Stop dev server (Ctrl+C)

# Clean everything
Remove-Item -Recurse .svelte-kit, node_modules/.vite, build

# Regenerate
npx svelte-kit sync

# If that doesn't work, start dev server briefly
npm run dev
# Wait 10 seconds, then stop (Ctrl+C)

# Check if file exists
Test-Path .svelte-kit/generated/server/internal.js
# Should return: True

# Start dev server again
npm run dev
```

## Automated Fix Script

We've created an automated fix that you just ran:

```powershell
.\scripts\fix-sveltekit-internal.ps1
```

## Why This Happens

1. **Cache corruption** - Vite or SvelteKit cache gets corrupted
2. **Interrupted build** - Dev server stopped during file generation
3. **File watcher issues** - Multiple configs trigger endless rebuilds
4. **Memory issues** - Not enough RAM for svelte-kit sync

## Prevention

1. **Always clean before starting** if you encounter issues
2. **Don't modify files** while dev server is starting
3. **Remove conflicting configs** (like js_tests/svelte.config.js)
4. **Use enough memory** - Set NODE_OPTIONS if needed

## Verification

After the fix, verify these files exist:

```
✓ .svelte-kit/tsconfig.json
✓ .svelte-kit/generated/client/app.js
✓ .svelte-kit/generated/server/internal.js
```

## Current Status

✅ **internal.js has been regenerated**
✅ **All critical SvelteKit files exist**
✅ **Dev server should start without errors**

## Next Steps

```powershell
npm run dev
```

If you still see the error:
1. Check for running node processes: `Get-Process node`
2. Kill all: `Stop-Process -Name node -Force`
3. Try again

## Related Issues Fixed

- ✅ Removed conflicting js_tests/svelte.config.js
- ✅ Generated .svelte-kit/tsconfig.json
- ✅ Cleared all caches
- ✅ Regenerated server internals
