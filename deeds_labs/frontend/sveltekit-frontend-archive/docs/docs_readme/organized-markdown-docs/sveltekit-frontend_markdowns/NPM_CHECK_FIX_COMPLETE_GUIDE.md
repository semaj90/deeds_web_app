# Complete Guide to Fix All npm run check Errors

## Overview

I've created a comprehensive solution to fix all the errors reported by `npm run check` (svelte-check). The main issues were:

1. **412 Import Errors** - Incorrect module paths
2. **CSS Warnings** - @apply directives (Tailwind syntax in a UnoCSS project)
3. **Accessibility Warnings** - Labels not associated with controls
4. **Type Errors** - Missing TypeScript type declarations

## Quick Fix - One Command

Simply run one of these:

```bash
# Windows Command Prompt
FIX-ALL-ERRORS.bat

# Or directly with Node
node fix-all-svelte-errors.mjs
```

This will automatically:

1. Sync SvelteKit files
2. Fix all import path errors
3. Fix CSS issues
4. Fix TypeScript issues
5. Run a final check to show remaining issues

## Created Scripts

### Main Fix Scripts

1. **`fix-all-svelte-errors.mjs`** - Comprehensive fixer that runs everything
2. **`fix-svelte-check-errors.mjs`** - Fixes import and CSS errors
3. **`fix-typescript-issues.mjs`** - Fixes TypeScript-specific issues
4. **`FIX-ALL-ERRORS.bat`** - Simple batch file to run the comprehensive fix

### Helper Scripts

- `run-check.mjs` - Runs svelte-check and captures output
- `fix-check-errors.mjs` - Generic pattern-based error fixer
- `fix-check-errors.bat` - Batch file for running fixes
- `fix-check-errors.ps1` - PowerShell version

## What Gets Fixed

### Import Errors

- `$lib/components/ui/index.js/index` → `$lib/components/ui`
- `$lib/components/ui/Component.svelte/index` → `$lib/components/ui`
- All UI components now import from the central index.ts

### CSS Issues

- `@apply` directives converted to standard CSS
- UnoCSS classes properly referenced

### TypeScript Issues

- Missing PageData/LayoutData imports added
- Proper type annotations for data props
- Store access syntax fixed

### Accessibility

- Label elements properly associated with form controls
- Radio button groups wrapped in fieldsets

## Expected Results

After running the fix:

- ✅ All 412 import errors should be resolved
- ✅ CSS @apply warnings fixed
- ✅ TypeScript type errors fixed
- ⚠️ Some CSS warnings about unused selectors will remain (these are for dark mode and are OK)

## If Issues Remain

Some issues may need manual intervention:

1. Complex type mismatches
2. Custom component prop types
3. Missing npm packages

Check `remaining-check-errors.txt` after running the fix for any remaining issues.

## Project Notes

- This project uses **UnoCSS**, not Tailwind CSS
- All UI components are exported from `$lib/components/ui/index.ts`
- Dark mode CSS selectors appearing as "unused" is normal behavior

## Running the Fix

1. Open a terminal in the project directory
2. Run: `node fix-all-svelte-errors.mjs`
3. Wait for the process to complete
4. Check the output for any remaining issues

The entire process should take less than a minute and fix most errors automatically.
