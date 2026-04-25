# 🛠 Svelte-Check Error Remediation Plan (WardenNet)

## 🎯 Goals

- ✅ Eliminate TypeScript + Svelte5 syntax violations
- ✅ Validate all `+server.ts` endpoints
- ✅ Ensure Drizzle type inference correctness
- ✅ Resolve missing exports + invalid imports
- ✅ Fix SSR + client mismatches
- ✅ Reduce error count from 1,000+ to < 100

---

## 📊 Phase 1 — Error Ranking & Analysis

### Step 1: Export Top 1,000 Errors

**Option A: VS Code Task**
```
Ctrl+Shift+P → Tasks: Run Task → Export Top Svelte Errors
```

**Option B: Manual Command**
```bash
pwsh -ExecutionPolicy Bypass -File scripts/export-svelte-errors.ps1
```

**Output Location:**
```
logs/svelte-errors-top1000.txt
```

### Step 2: Categorize Errors

Review the error log and group by error code:

| Code | Type | Count | Priority |
|------|------|-------|----------|
| `TS2305` | Missing imports | ~300 | 🔴 HIGH |
| `TS2554` | Wrong argument types | ~200 | 🔴 HIGH |
| `TS7006` | Implicit any | ~150 | 🟡 MEDIUM |
| `TS2741` | Missing props | ~120 | 🟡 MEDIUM |
| `TS18048` | Invalid SSR usage | ~100 | 🔴 HIGH |
| `TS6133` | Unused variables | ~80 | 🟢 LOW |
| `TS1128` | Declaration expected | ~50 | 🔴 HIGH |

### Step 3: Analyze Error Patterns

```bash
# Count errors by file
grep -o '\-\-> [^:]*' logs/svelte-errors-top1000.txt | sort | uniq -c | sort -rn | head -20

# Count errors by code
grep -o '\[TS[0-9]*\]' logs/svelte-errors-top1000.txt | sort | uniq -c | sort -rn
```

---

## 🔧 Phase 2 — Automated Pattern Fixes

### Fix 1: Missing Imports (TS2305)

**Pattern:** `Cannot find name 'X'` or `Module not found`

**Automated Fix:**
```bash
cd sveltekit-frontend
node scripts/fix-db-imports.mjs
node scripts/fix-svelte-syntax.mjs
```

**Manual Verification:**
```bash
npm run check:svelte 2>&1 | grep "TS2305" | wc -l
```

### Fix 2: Type Mismatches (TS2554)

**Pattern:** `Expected N arguments, got M`

**Root Causes:**
- Drizzle query mismatches
- Event handler type mismatches
- Component prop mismatches

**Solution:**
```bash
# Regenerate Drizzle types
npx drizzle-kit generate

# Regenerate SvelteKit types
npx svelte-kit sync

# Re-check
npm run check:svelte
```

### Fix 3: Implicit Any (TS7006)

**Pattern:** `Parameter 'X' implicitly has an 'any' type`

**Solution:**
```typescript
// ❌ Wrong
function handleClick(e) {
  console.log(e);
}

// ✅ Correct
function handleClick(e: MouseEvent) {
  console.log(e);
}
```

**Bulk Fix:**
```bash
# Find all implicit any
grep -r "function.*(" sveltekit-frontend/src --include="*.ts" --include="*.svelte" | grep -v ": " | head -20
```

### Fix 4: Missing Props (TS2741)

**Pattern:** `Property 'X' is missing in type 'Y'`

**Solution:**
```svelte
<!-- ❌ Wrong -->
<script lang="ts">
  interface Props {
    title: string;
    count: number;
  }
  export let { title }: Props;
</script>

<!-- ✅ Correct -->
<script lang="ts">
  interface Props {
    title: string;
    count?: number;
  }
  export let { title, count = 0 }: Props;
</script>
```

### Fix 5: Invalid SSR Usage (TS18048)

**Pattern:** `Cannot access 'X' before initialization` or `window is not defined`

**Solution:**
```svelte
<!-- ✅ Correct -->
<script>
  import { browser } from '$app/environment';

  if (browser) {
    // Client-side only code
    console.log(window.location);
  }
</script>
```

---

## 📋 Phase 3 — Systematic Error Resolution

### Step 1: Fix High-Priority Errors (TS2305, TS18048, TS1128)

```bash
# 1. Clear caches
rm -r sveltekit-frontend/.svelte-kit
rm -r sveltekit-frontend/node_modules/.vite

# 2. Regenerate types
cd sveltekit-frontend
npx svelte-kit sync
npx drizzle-kit generate

# 3. Check progress
npm run check:svelte 2>&1 | tee ../logs/check-progress-1.txt
```

**Expected Reduction:** 30-40% of errors

### Step 2: Fix Medium-Priority Errors (TS2554, TS2741)

```bash
# 1. Review Drizzle queries
grep -r "db\." sveltekit-frontend/src --include="*.ts" | head -20

# 2. Fix type annotations
# Manually update function signatures and component props

# 3. Re-check
npm run check:svelte 2>&1 | tee ../logs/check-progress-2.txt
```

**Expected Reduction:** 20-30% of remaining errors

### Step 3: Fix Low-Priority Errors (TS7006, TS6133)

```bash
# 1. Add type annotations to all parameters
# 2. Remove unused variables
# 3. Final check
npm run check:svelte 2>&1 | tee ../logs/check-progress-3.txt
```

**Expected Reduction:** 10-20% of remaining errors

---

## 🚀 Phase 4 — Validation & Prevention

### Validation Checklist

```bash
# 1. Full type check
npm run check:typescript

# 2. Svelte check
npm run check:svelte

# 3. Build test
npm run build

# 4. Final error count
npm run check:svelte 2>&1 | grep -c "error TS"
```

### Prevention Setup

**Add Pre-commit Hook:**
```bash
# Create .git/hooks/pre-commit
#!/bin/bash
cd sveltekit-frontend
npm run check:svelte
if [ $? -ne 0 ]; then
  echo "❌ Svelte check failed. Fix errors before committing."
  exit 1
fi
```

**Add CI/CD Check:**
```yaml
# .github/workflows/check.yml
name: Type Check
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run check:svelte
```

---

## 📈 Progress Tracking

### Create Baseline

```bash
# Session 1
npm run check:svelte 2>&1 | tee logs/baseline-session1.txt

# Count errors
grep -c "error TS" logs/baseline-session1.txt
```

### Track Improvements

| Session | Total Errors | TS2305 | TS2554 | TS7006 | TS2741 | TS18048 | Status |
|---------|--------------|--------|--------|--------|--------|---------|--------|
| Baseline | 1,000+ | 300 | 200 | 150 | 120 | 100 | 🔴 |
| After Phase 2 | 600 | 50 | 100 | 100 | 80 | 20 | 🟡 |
| After Phase 3 | 200 | 10 | 20 | 50 | 40 | 5 | 🟢 |
| Target | < 100 | 0 | 0 | 20 | 10 | 0 | ✅ |

---

## 🔍 Troubleshooting

### Issue: Errors Keep Reappearing

**Solution:**
```bash
# Full reset
rm -rf sveltekit-frontend/.svelte-kit sveltekit-frontend/node_modules/.vite
npm install
npx svelte-kit sync
npm run check:svelte
```

### Issue: Type Errors After Updates

**Solution:**
```bash
# Regenerate all types
npx svelte-kit sync
npx drizzle-kit generate
npm run check:typescript
```

### Issue: Circular Dependency Errors

**Solution:**
```typescript
// Use dynamic imports to break cycles
import { onMount } from 'svelte';

let Component;
onMount(async () => {
  Component = (await import('./Component.svelte')).default;
});
```

---

## 📚 Resources

- [Svelte 5 Migration Guide](https://svelte.dev/docs/v5-migration-guide)
- [SvelteKit Type Safety](https://kit.svelte.dev/docs/types)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Drizzle ORM Types](https://orm.drizzle.team/docs/sql-schema-declaration)

---

## ✅ Completion Checklist

- [ ] Export top 1,000 errors
- [ ] Categorize errors by code
- [ ] Run automated fixes (Phase 2)
- [ ] Fix high-priority errors (Phase 3.1)
- [ ] Fix medium-priority errors (Phase 3.2)
- [ ] Fix low-priority errors (Phase 3.3)
- [ ] Validate with full type check
- [ ] Set up prevention (pre-commit hooks)
- [ ] Document final error count
- [ ] Update CI/CD pipeline

---

## 🎯 Success Criteria

- ✅ Error count < 100
- ✅ No TS2305 (missing imports)
- ✅ No TS18048 (invalid SSR)
- ✅ No TS1128 (declaration expected)
- ✅ All builds pass
- ✅ Pre-commit hooks working

---

## 📞 Support

For detailed error analysis:
- Check: `logs/svelte-errors-top1000.txt`
- Review: `SVELTE_CHECK_FIX_GUIDE.md`
- Run: `npm run check:svelte -- --verbose`
