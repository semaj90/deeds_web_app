# Svelte Check Error Fixes

## Summary

I've created scripts to fix the errors found by `npm run check`. The main issues were:

### 1. Import Path Errors (412 errors)

- Incorrect imports like `$lib/components/ui/index.js/index`
- Component imports with `.svelte/index` suffix
- These should all import from `$lib/components/ui` directly

### 2. CSS Issues (warnings)

- `@apply` directives which are Tailwind-specific but the project uses UnoCSS
- These need to be converted to standard CSS properties

### 3. Accessibility Warnings

- Labels not associated with form controls
- These are warnings but should be fixed for better accessibility

## Fix Scripts Created

### 1. `fix-svelte-check-errors.mjs`

This is the main fix script that:

- Fixes all import path errors
- Converts @apply CSS to standard CSS
- Fixes accessibility issues
- Updates tooltip imports

### 2. `run-check.mjs`

Helper script to run svelte-check and capture output

### 3. `fix-check-errors.mjs`

Generic error fixing script with patterns

## How to Fix All Errors

Run the following commands in order:

```bash
# 1. Apply all fixes
node fix-svelte-check-errors.mjs

# 2. Run check again to see remaining issues
npm run check

# 3. If there are still errors, check the specific files
```

## Expected Results

After running the fix script:

- All import errors should be resolved
- CSS @apply warnings should be fixed
- Accessibility warning for the label should be fixed
- Some CSS warnings about unused selectors may remain (these are OK - they're for dark mode)

## Manual Fixes May Be Needed For

1. Any complex import patterns not covered by the script
2. Type errors that require understanding the component API
3. Any new errors introduced after the initial scan

## Notes

- The project uses UnoCSS, not Tailwind CSS
- All UI components should be imported from `$lib/components/ui`
- The index.ts file properly exports all components
- Dark mode CSS selectors appearing as "unused" is normal
