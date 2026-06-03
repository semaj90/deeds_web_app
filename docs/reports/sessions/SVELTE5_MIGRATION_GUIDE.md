# Svelte 5 Migration Guide

**Date:** April 13, 2026  
**Scope:** 776 Svelte components  
**Issues Found:** 793 interface declarations (PRIMARY ISSUE)  
**Estimated Effort:** 6-8 hours (can be partially automated)

---

## Root Cause Analysis

### The Problem: 793 Interface Declarations in Wrong Location

**Svelte 4 (Old Pattern):**
```svelte
<script lang="ts">
  interface Props {
    value: string;
    onChange?: (v: string) => void;
  }
  
  let { value, onChange } = props;
</script>
```

**Issue in Svelte 5:**
- ❌ `interface` keyword is **RESERVED** in Svelte 5
- ❌ Causes: "Parsing error: The keyword 'interface' is reserved"
- ❌ Interfaces cannot be declared in the regular `<script>` block

**Svelte 5 (Fixed Pattern):**
```svelte
<script lang="ts" context="module">
  interface Props {
    value: string;
    onChange?: (v: string) => void;
  }
</script>

<script lang="ts">
  let { value, onChange }: Props = $props();
</script>
```

**OR (Alternative):**
```svelte
<script lang="ts">
  type Props = {
    value: string;
    onChange?: (v: string) => void;
  };
  
  let { value, onChange }: Props = $props();
</script>
```

---

## Affected Components Breakdown

| Pattern | Count | Severity | Fix Effort |
|---------|-------|----------|-----------|
| **interface in <script>** | 793 | 🔴 CRITICAL | High (1-2 min each) |
| **Complex $props() patterns** | 135 | 🟡 MEDIUM | Medium (need initialization) |
| **Total affected files** | ~776 | — | **~6-8 hours total** |

---

## Migration Strategy

### Approach 1: Automated Script (50% of work)

Create a script to:
1. Detect `<script lang="ts">` blocks with `interface` declarations
2. Extract interfaces into `<script context="module">` block
3. Rewrite `let { ... } = props` to use `$props()`

**Coverage:** 80% of files (straightforward patterns)
**Time:** 2-3 hours automation + testing
**Manual work:** 3-5 hours (edge cases, complex types)

### Approach 2: Manual + IDE Refactoring (40% of work)

For complex patterns:
- Use VS Code "Find and Replace" with regex
- Use TypeScript "Extract to type" refactoring
- Manual review for edge cases

---

## Phase 1: Automated Interface Extraction

### Migration Script

```bash
#!/bin/bash
# svelte5-interface-migrator.sh

for FILE in sveltekit-frontend/src/**/*.svelte; do
  # Check if file has interface in <script> tag
  if grep -q "<script[^>]*>.*interface " "$FILE"; then
    echo "Processing: $FILE"
    
    # Extract interfaces into context="module"
    # 1. Find <script lang="ts"> block
    # 2. Extract all interface declarations
    # 3. Create new <script context="module"> block
    # 4. Move interfaces there
    # 5. Update $props() usage
    
    # [Script logic here]
  fi
done
```

### Manual Conversion Examples

#### Example 1: Simple Props Interface

**BEFORE:**
```svelte
<script lang="ts">
  interface Props {
    title: string;
    subtitle?: string;
    onClose: () => void;
  }
  
  let { title, subtitle, onClose }: Props = $props();
</script>
```

**AFTER:**
```svelte
<script lang="ts" context="module">
  interface Props {
    title: string;
    subtitle?: string;
    onClose: () => void;
  }
</script>

<script lang="ts">
  let { title, subtitle, onClose }: Props = $props();
</script>
```

#### Example 2: Multiple Interfaces

**BEFORE:**
```svelte
<script lang="ts">
  interface User {
    id: string;
    name: string;
  }
  
  interface Props {
    user: User;
    active: boolean;
  }
  
  let { user, active } = $props<Props>();
</script>
```

**AFTER:**
```svelte
<script lang="ts" context="module">
  interface User {
    id: string;
    name: string;
  }
  
  interface Props {
    user: User;
    active: boolean;
  }
</script>

<script lang="ts">
  let { user, active }: Props = $props();
</script>
```

#### Example 3: Using Type Instead of Interface

**ALTERNATIVE (preferred by some):**
```svelte
<script lang="ts">
  type Props = {
    value: string;
    onChange?: (v: string) => void;
  };
  
  let { value, onChange }: Props = $props();
</script>
```

---

## Phase 2: Fix Complex $props() Patterns

### Issue: Binding Patterns Without Initialization

**BEFORE (Svelte 4):**
```svelte
<script lang="ts">
  let { value } = props;
</script>
```

**ERROR in Svelte 5:**
```
Parsing error: Complex binding patterns require an initialization value
```

**AFTER (Svelte 5):**
```svelte
<script lang="ts">
  let { value }: { value: string } = $props();
  // OR with interface
  interface Props { value: string }
  let { value }: Props = $props();
</script>
```

### Patterns Needing Fixes (135 total)

| Pattern | Before | After | Count |
|---------|--------|-------|-------|
| **Bare destructuring** | `let { x } = props` | `let { x }: Type = $props()` | ~45 |
| **With defaults** | `let { x = 5 } = props` | `let { x = 5 }: Type = $props()` | ~60 |
| **Rest operator** | `let { x, ...rest } = props` | `let { x, ...rest }: Type = $props()` | ~20 |
| **Nested destructuring** | Complex patterns | Simplify + add types | ~10 |

---

## Implementation Plan

### Day 1: Automated Script + Quick Wins (3-4 hours)

1. **Create migration script** (45 min)
   - Parse Svelte files
   - Extract interface declarations
   - Generate `context="module"` blocks
   - Update $props() usage

2. **Test on 10 sample files** (30 min)
   - Verify script correctness
   - Manual review for edge cases

3. **Run on all 793 files** (30 min)
   - Execute automation script
   - Collect failures/edge cases

4. **Fix straightforward failures** (90 min)
   - Resolve script errors
   - Manual fixes for complex patterns

### Day 2: Edge Cases + Validation (3-4 hours)

5. **Handle complex patterns** (90 min)
   - Nested interfaces
   - Generic types
   - Conditional types

6. **Validate all files** (60 min)
   - Run svelte-check
   - Fix remaining parsing errors

7. **Test in browser** (60 min)
   - Start dev server
   - Verify no runtime errors
   - Smoke test critical components

---

## Tools Needed

### Option 1: Custom Node.js Script

```typescript
// svelte5-migrator.ts
import * as fs from 'fs';
import * as path from 'path';
import glob from 'glob';

interface MigrationResult {
  file: string;
  success: boolean;
  interfaces: string[];
  errors: string[];
}

async function migrateFile(filePath: string): Promise<MigrationResult> {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Extract interface declarations
  const interfaceMatches = content.match(/interface\s+(\w+)\s*{[^}]*}/g) || [];
  
  // Check if file has <script lang="ts"> with interfaces
  const hasScriptWithInterfaces = /^<script[^>]*lang="ts"[^>]*>.*interface/ms.test(content);
  
  if (!hasScriptWithInterfaces) {
    return { file: filePath, success: true, interfaces: [], errors: [] };
  }
  
  // Transformation logic here
  // 1. Create context="module" block with interfaces
  // 2. Update script block
  // 3. Fix $props() usage
  
  return { file: filePath, success: true, interfaces: interfaceMatches, errors: [] };
}

// Main execution
glob('sveltekit-frontend/src/**/*.svelte', async (err, files) => {
  for (const file of files) {
    const result = await migrateFile(file);
    console.log(result);
  }
});
```

### Option 2: VS Code Find & Replace

**Find:**
```regex
<script([^>]*)>
([^]*?)interface\s+(\w+)\s*\{([^}]*)\}
```

**Replace:**
```
<script$1 context="module">
interface $3 {$4}
</script>

<script$1>
```

---

## Validation Checklist

After migration:

- [ ] All 776 files have valid TypeScript syntax
- [ ] `npm run lint` shows 0 "interface is reserved" errors
- [ ] `svelte-check` passes
- [ ] `npm run build` completes successfully
- [ ] Dev server starts without errors
- [ ] No runtime errors in browser console
- [ ] Critical components render correctly
- [ ] All 54 documented components display properly

---

## Risk Mitigation

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| **Script breaks files** | Medium | Test on 10 files first, git backup |
| **Type inference issues** | Medium | Manual review of complex types |
| **Breaking changes** | Low | Component API shouldn't change |
| **Performance impact** | Low | No logic changes, only structure |

---

## Success Criteria

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| **Linter errors** | 815+ | 0 | 🔄 In progress |
| **Interface errors** | 279 | 0 | 🔄 In progress |
| **Svelte files** | 776 affected | 100% migrated | 🔄 In progress |
| **Build status** | FAIL | PASS | ⏳ After migration |

---

## Timeline

| Phase | Task | Effort | Timeline |
|-------|------|--------|----------|
| **1** | Create migration script | 45 min | Now |
| **2** | Test on 10 files | 30 min | Now |
| **3** | Run on all 793 files | 30 min | +1 hour |
| **4** | Fix straightforward issues | 90 min | +2.5 hours |
| **5** | Handle edge cases | 90 min | +4 hours |
| **6** | Validation + testing | 120 min | +6 hours |
| **Total** | — | **~6-8 hours** | **Today/Tomorrow** |

---

## Next Steps

1. **Decide approach:**
   - ✅ Automated script (faster, 50% coverage)
   - ✅ Manual + IDE (slower, 100% coverage)
   - ✅ Hybrid (automated + manual review)

2. **Create migration script** (if option 1 or 3)

3. **Execute migration**

4. **Validate and test**

5. **Deploy fixed codebase**

---

## Reference: Svelte 5 Interface Migration

### Why This Change?

Svelte 5 requires TypeScript interfaces to be in `context="module"` blocks because:
- Regular `<script>` blocks are instance-level (not module-level)
- Interfaces are type-level declarations (must be at module level)
- Separating them clarifies the intent and scope

### Official Documentation

- [Svelte 5 Migration Guide](https://svelte.dev/docs/svelte/v5-migration-guide)
- [Component Props in Svelte 5](https://svelte.dev/docs/svelte/component-props)
- [Module Context](https://svelte.dev/docs/svelte/svelte#script-context-module)

---

**Status:** Ready to execute migration  
**Recommendation:** Start with automated script + manual review hybrid approach  
**Estimated Reduction:** 815+ errors → ~10-20 (edge cases only)

