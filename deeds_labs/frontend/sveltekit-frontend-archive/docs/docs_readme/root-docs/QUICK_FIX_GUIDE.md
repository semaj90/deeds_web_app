# Quick Fix Guide - TypeScript Syntax Errors

## Quick Commands

### Check Remaining Errors
```bash
node scripts/prioritize-error-fixes.mjs | head -50
```

### Run Auto-Fixer
```bash
cd sveltekit-frontend
.\scripts\fix-syntax-errors.ps1
```

### Validate TypeScript
```bash
npm run check
```

## Common Patterns to Avoid

### ❌ Don't: Double Closing Braces with Imports
```typescript
import { json }}from '@sveltejs/kit';
import type { User }}from '$lib/types';
```

### ✅ Do: Single Closing Brace
```typescript
import { json } from '@sveltejs/kit';
import type { User } from '$lib/types';
```

---

### ❌ Don't: Opening Brace with Comma
```typescript
export interface Config {, host: string; port: number; }
```

### ✅ Do: Clean Opening Brace
```typescript
export interface Config { host: string; port: number; }
```

---

### ❌ Don't: Stray Quotes After Statements
```typescript
console.error('Error:', err);'
if (condition) { action(); }''
```

### ✅ Do: Clean Statement Endings
```typescript
console.error('Error:', err);
if (condition) { action(); }
```

---

### ❌ Don't: Semicolon Followed by Comma
```typescript
const result = await fetch(url);,
return json({ success: true });,
```

### ✅ Do: Semicolon Only
```typescript
const result = await fetch(url);
return json({ success: true });
```

---

### ❌ Don't: Type Annotation with Colon-Space
```typescript
const user as: User = getUser();
const value as: unknown = data;
```

### ✅ Do: Type Annotation with 'as'
```typescript
const user as User = getUser();
const value as unknown = data;
```

---

### ❌ Don't: Malformed Function Return Types
```typescript
function getData()}): Promise<Data> {
async getData()}): Promise<Data> {
```

### ✅ Do: Correct Return Type Syntax
```typescript
function getData(): Promise<Data> {
async getData(): Promise<Data> {
```

---

### ❌ Don't: Trailing Commas Before Closing Braces
```typescript
const config = { host: 'localhost', port: 3000, };
interface User { id: string; name: string; }
```

### ✅ Do: No Trailing Comma (or consistent style)
```typescript
const config = { host: 'localhost', port: 3000 };
interface User { id: string; name: string }
```

---

### ❌ Don't: Mixed Quote Styles in Same Context
```typescript
const message = `Error occurred`;
const code = ``INVALID_INPUT``;
```

### ✅ Do: Consistent Quote Style
```typescript
const message = 'Error occurred';
const code = 'INVALID_INPUT';
```

## Manual Fix Workflow

When auto-fixer doesn't catch an error:

1. **Open the file in VS Code**
   ```bash
   code src/lib/types/external-services.ts
   ```

2. **Use VS Code Quick Fix** (Ctrl+.)
   - Hover over red squiggles
   - Press `Ctrl+.` or click lightbulb
   - Select "Fix all in file" when available

3. **Verify the fix**
   ```bash
   npx tsc --noEmit --skipLibCheck
   ```

4. **Commit incrementally**
   ```bash
   git add src/lib/types/external-services.ts
   git commit -m "fix: resolve TypeScript syntax errors in external-services.ts"
   ```

## ESLint Integration (Recommended)

Add to `.eslintrc.json`:
```json
{
  "rules": {
    "no-unexpected-multiline": "error",
    "no-extra-semi": "error",
    "semi": ["error", "always"],
    "quotes": ["error", "single", { "avoidEscape": true }]
  }
}
```

## Pre-commit Hook (Recommended)

Create `.husky/pre-commit`:
```bash
#!/bin/sh
npm run check
if [ $? -ne 0 ]; then
  echo "TypeScript errors detected. Run 'npm run check' to see details."
  exit 1
fi
```

## Priority Order for Manual Fixes

Fix in this order for maximum impact:

1. **Type Definition Files** (`lib/types/`)
   - Affects entire codebase
   - High reuse across files

2. **Service Files** (`lib/services/`)
   - Core business logic
   - Used by multiple routes

3. **API Routes** (`routes/api/`)
   - Production endpoints
   - Customer-facing

4. **Component Files** (`lib/components/`)
   - UI layer
   - User experience impact

5. **Archive/Legacy** (`_archive/`)
   - Low priority
   - May be deleted

## Tips & Tricks

### Find Files with Most Errors
```bash
node scripts/prioritize-error-fixes.mjs | grep "pts.*Error"
```

### Check Specific File Type
```bash
# Only check .svelte files
find src -name "*.svelte" -exec npx tsc --noEmit {} \;
```

### Diff Before Committing
```bash
git diff --color-words
```

### Revert if Needed
```bash
# Revert all changes
git checkout -- .

# Revert specific file
git checkout -- src/lib/types/external-services.ts
```

## Common Error Codes

| Code | Meaning | Quick Fix |
|------|---------|-----------|
| TS1005 | Expected token | Check for missing/extra braces |
| TS1128 | Declaration expected | Check for stray semicolons |
| TS2304 | Cannot find name | Import missing type |
| TS2322 | Type mismatch | Add type assertion |
| TS2339 | Property doesn't exist | Check spelling/import |

## Getting Help

If auto-fixer breaks something:

1. **Check the git diff**
   ```bash
   git diff src/path/to/file.ts
   ```

2. **Revert the file**
   ```bash
   git checkout -- src/path/to/file.ts
   ```

3. **Report the pattern**
   - File an issue with the pattern that failed
   - Include before/after code snippets
   - Mention which regex pattern caused the issue

## Success Metrics

Track your progress:
```bash
# Before fixes
Total files with errors: 1465
Top 30 error score: 49450

# After auto-fix
Total files with errors: 508 (-65.3%)
Top 30 error score: 15460 (-68.7%)

# Goal
Total files with errors: <100
Top 30 error score: <5000
```

---

**Last Updated:** 2025-11-02  
**Script Version:** fix-syntax-errors.ps1 v1.0
