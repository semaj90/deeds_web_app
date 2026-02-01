# 🎯 PHASE 99: ERROR RECOVERY & SVELTE 5 MIGRATION
**Generated**: 2025-01-31 20:45:00
**Status**: 🚨 CRITICAL - 1,618 errors requiring systematic fixes
**Priority**: WebGPU SSR + File Corruption + Svelte 5 Migration

---

## 📊 ERROR ANALYSIS SUMMARY

### Current State
- **Total Errors**: 1,618 errors in 452 files
- **Error Types**:
  - File corruption (UTF-8 encoding issues, mangled tokens)
  - Incomplete Svelte 5 migration (event handlers, props, slots→snippets)
  - WebGPU SSR/browser detection failures
  - Type definition mismatches
  - bits-ui migration needed

### Critical Files Already Repaired (8 files)
✅ Successfully repaired 8 critical files with severe corruption:
- WebGPU initialization logic
- Dashboard visualization components
- Core Svelte 5 runes patterns

---

## 🔍 TOP ERROR CATEGORIES

### 1️⃣ **WebGPU SSR/Browser Detection** (HIGHEST PRIORITY)
**Issue**: `navigator.gpu` accessed during SSR causes Playwright test failures

**Pattern**:
```svelte
<!-- ❌ WRONG: No SSR check -->
<script>
  const gpu = navigator.gpu; // Crashes on server
</script>

<!-- ✅ CORRECT: Browser detection -->
<script>
  import { browser } from '$app/environment';

  let gpu: GPU | null = $state(null);

  $effect(() => {
    if (browser && 'gpu' in navigator) {
      gpu = navigator.gpu;
    }
  });
</script>
```

**Fix Strategy** (from claude.md knowledge base):
```typescript
// lib/webgpu/init.ts
import { browser } from '$app/environment';

export async function initWebGPU() {
  if (!browser || !navigator.gpu) {
    console.warn('WebGPU not available');
    return null;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance'
    });
    if (!adapter) return null;

    const device = await adapter.requestDevice();

    // Handle device loss
    device.lost.then((info) => {
      console.error('GPU lost:', info.reason, info.message);
    });

    return { adapter, device };
  } catch (error) {
    console.error('WebGPU init failed:', error);
    return null;
  }
}
```

---

### 2️⃣ **Svelte 5 Event Handler Migration** (HIGH PRIORITY)
**Issue**: `on:click` directive must become `onclick` property

**Patterns Found** (from svelte-check output):
```svelte
<!-- ❌ OLD: Svelte 4 -->
<button on:click={handler}>Click</button>
<button on:click={() => count++}>Click</button>
<div on:inflate={(e) => size += e.detail}>Inflate</div>

<!-- ✅ NEW: Svelte 5 -->
<button onclick={handler}>Click</button>
<button onclick={() => count++}>Click</button>
<div inflate={(power) => size += power}>Inflate</div>
```

**Component Events** (critical pattern change):
```svelte
<!-- ❌ OLD: createEventDispatcher -->
<script>
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
</script>
<button onclick={() => dispatch('inflate', power)}>Inflate</button>

<!-- ✅ NEW: Callback props -->
<script>
  let { inflate } = $props();
</script>
<button onclick={() => inflate(power)}>Inflate</button>
```

---

### 3️⃣ **Slots → Snippets Migration** (HIGH PRIORITY)
**Issue**: `<slot />` and `slot="name"` deprecated in Svelte 5

**Pattern**:
```svelte
<!-- ❌ OLD: Slots -->
<!-- Parent.svelte -->
<Child>
  <span slot="header">Title</span>
  <span slot="footer">Footer</span>
</Child>

<!-- Child.svelte -->
<header><slot name="header" /></header>
<footer><slot name="footer" /></footer>

<!-- ✅ NEW: Snippets -->
<!-- Parent.svelte -->
<Child>
  {#snippet header()}
    <span>Title</span>
  {/snippet}
  {#snippet footer()}
    <span>Footer</span>
  {/snippet}
</Child>

<!-- Child.svelte -->
<script>
  let { header, footer } = $props();
</script>
<header>{@render header()}</header>
<footer>{@render footer()}</footer>
```

---

### 4️⃣ **shadcn-svelte → bits-ui Migration** (HIGH PRIORITY)
**Issue**: shadcn-svelte not compatible with Svelte 5; must use bits-ui

**Current Usage**:
```typescript
// ❌ OLD: shadcn-svelte imports
import { Button, Card, Input } from '$lib/components/ui';
```

**Target** (bits-ui Svelte 5 API):
```typescript
// ✅ NEW: bits-ui imports
import { Button, Card } from 'bits-ui';
import { Input } from '$lib/components/ui/input'; // Custom wrapper

// bits-ui Svelte 5 pattern (builder pattern)
<Button.Root variant="default" size="lg">
  Click me
</Button.Root>

<Card.Root>
  <Card.Header>
    <Card.Title>Title</Card.Title>
  </Card.Header>
  <Card.Content>
    Content here
  </Card.Content>
</Card.Root>
```

---

### 5️⃣ **File Corruption Issues** (MEDIUM PRIORITY)
**Issue**: Mangled UTF-8, repeated tokens, invalid syntax

**Examples Found**:
```svelte
<!-- CORRUPTED: Repeated tokens -->
import { createDocumentUploadForm: FORM_STORAGE_KEYS: FormStatePersistence }

<!-- CORRUPTED: Mangled UTF-8 -->
├ó┼ôΓÇª Upload successful
├░┼╕ΓÇ£┼á Overview
├ó┼íΓÇô├»┬╕┬Å Cases

<!-- CORRUPTED: Invalid syntax -->
<button onclick={() => dispatch('inflate', power)inflate(power)}>

<!-- FIXED VERSIONS -->
import {
  createDocumentUploadForm,
  FORM_STORAGE_KEYS,
  FormStatePersistence
} from '$lib/forms/superforms-xstate-integration';

// ✓ Upload successful
// ● Overview
// ⚖ Cases

<button onclick={() => inflate(power)}>
```

---

## 🛠️ SYSTEMATIC FIX PLAN

### Phase 1: Critical WebGPU SSR Fixes (20 min)
**Files to Fix**:
1. `src/lib/webgpu/init.ts` - Add browser detection wrapper
2. `src/lib/components/visualizations/WebGPUEvidenceGraphVisualization.svelte` - Wrap GPU access in `$effect` with browser check
3. `src/lib/components/visualization/LegalDocumentGraphViewer.svelte` - Same pattern
4. All files importing WebGPU - Add SSR guards

**Pattern to Apply**:
```typescript
import { browser } from '$app/environment';

let gpuContext = $state<{ device: GPUDevice; adapter: GPUAdapter } | null>(null);
let error = $state<string | null>(null);

$effect(() => {
  if (browser && 'gpu' in navigator) {
    initWebGPU().then(ctx => gpuContext = ctx).catch(err => error = err.message);
  }
});
```

---

### Phase 2: Event Handler Migration (30 min)
**Strategy**: Use multi_replace_string_in_file for batch fixes

**Common Patterns**:
```typescript
// Pattern 1: Simple handlers
on:click={handler} → onclick={handler}
on:keydown={handler} → onkeydown={handler}

// Pattern 2: Inline functions
on:click={() => ...} → onclick={() => ...}

// Pattern 3: Event modifiers
on:click|preventDefault={handler} → onclick={(e) => { e.preventDefault(); handler(e); }}
on:click|stopPropagation={handler} → onclick={(e) => { e.stopPropagation(); handler(e); }}

// Pattern 4: Component events (manual fix)
createEventDispatcher() → callback props pattern
```

---

### Phase 3: Slots → Snippets Migration (30 min)
**Files with Slot Usage** (from grep search):
- Document upload components
- Dashboard widgets
- List components with empty states

**Migration Steps**:
1. Find all `<slot name="..." />` → Convert to `{@render propName()}`
2. Find all `<div slot="...">` → Convert to `{#snippet propName()}`
3. Add prop destructuring: `let { snippetName } = $props();`
4. Handle optional snippets: `{@render snippetName?.()}`

---

### Phase 4: bits-ui Migration (45 min)
**Steps**:
1. Install bits-ui: `npm install bits-ui`
2. Create wrapper components for commonly used patterns
3. Update imports across codebase
4. Test component functionality

**Wrapper Example** (`src/lib/components/ui/button/index.ts`):
```typescript
import { Button as BitsButton } from 'bits-ui';

export { BitsButton as Button };

// Re-export with consistent API
export { Root, type Props } from 'bits-ui/button';
```

---

### Phase 5: File Corruption Cleanup (20 min)
**Strategy**: Regex replacements for common corruption patterns

```powershell
# Fix mangled UTF-8 checkmarks
├ó┼ôΓÇª → ✓
├░┼╕ΓÇ£┼á → ●
├ó┼íΓÇô├»┬╕┬Å → ⚖
├ó┬¥┼Æ → ✗

# Fix repeated imports
Find: (\w+: ){2,}
Replace: Manual review needed

# Fix doubled event handlers
Find: dispatch\('(\w+)', (\w+)\)(\w+)\(
Replace: $3(
```

---

## 🎯 IMMEDIATE ACTION PLAN (Next 2 Hours)

### Step 1: WebGPU SSR Guard (15 min)
```bash
# Create centralized WebGPU init module
touch src/lib/webgpu/init.ts

# Add browser detection wrapper
# Update all WebGPU components to use wrapper
```

### Step 2: Run Migration Script (10 min)
```bash
cd sveltekit-frontend
npx sv migrate svelte-5

# This will auto-fix:
# - let → $state
# - on:click → onclick
# - export let → $props destructuring
# - Many slot → snippet conversions
```

### Step 3: Manual Cleanup (30 min)
- Fix createEventDispatcher → callback props (cannot be automated)
- Fix complex slot patterns
- Review and fix file corruption issues

### Step 4: Install & Configure bits-ui (20 min)
```bash
npm install bits-ui
npm uninstall @rgossiaux/svelte-headlessui # Conflicting package

# Update tsconfig.json for bits-ui types
# Create wrapper components
```

### Step 5: Test & Validate (25 min)
```bash
# Clear caches again
Remove-Item -Recurse -Force .svelte-kit, node_modules\.cache

# Run svelte-check
npx svelte-check --threshold error

# Run Playwright tests (WebGPU-specific)
npx playwright test tests/webgpu-*.spec.ts
```

---

## 📚 KNOWLEDGE BASE REFERENCES

### From claude.md (WebGPU Patterns)
- ✓ SSR detection pattern: `if (browser && 'gpu' in navigator)`
- ✓ Device loss handling: `device.lost.then(info => ...)`
- ✓ CPU fallback for compute: Return regular Float32Array if GPU unavailable

### From Svelte 5 Migration Guide
- ✓ Events are properties now: `onclick` not `on:click`
- ✓ Snippets replace slots: `{@render children?.()}`
- ✓ Component events use callbacks: `let { onevent } = $props()`
- ✓ `$effect` replaces `$:` for side effects
- ✓ Browser detection in `$effect` for client-only code

### From bits-ui Docs
- ✓ Builder pattern: `<Button.Root>` not `<Button>`
- ✓ Composable components: Header, Content, Footer sub-components
- ✓ Svelte 5 native: Uses runes internally

---

## 🔬 TESTING STRATEGY

### WebGPU Playwright Tests
```typescript
// tests/webgpu-ssr.spec.ts
import { test, expect } from '@playwright/test';

test('WebGPU components render without SSR errors', async ({ page }) => {
  // Should NOT crash on initial load
  await page.goto('/visualization');

  // Check for WebGPU fallback message if GPU unavailable
  const fallback = page.locator('[data-testid="gpu-fallback"]');
  const canvas = page.locator('canvas[data-gpu="true"]');

  // Either GPU works or fallback is shown
  await expect(fallback.or(canvas)).toBeVisible();
});

test('WebGPU initializes only in browser', async ({ page }) => {
  // Enable console monitoring
  const gpuErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && msg.text().includes('navigator')) {
      gpuErrors.push(msg.text());
    }
  });

  await page.goto('/dashboard');

  // No SSR-related navigator errors
  expect(gpuErrors).toHaveLength(0);
});
```

---

## 📊 SUCCESS METRICS

### Target State (End of Session)
- **Errors Reduced**: From 1,618 → < 200 errors (87% reduction)
- **WebGPU SSR**: 0 Playwright failures
- **Svelte 5 Migration**: 80% complete (automated fixes done)
- **bits-ui**: Core components migrated
- **File Corruption**: All critical files cleaned

### Validation Checks
```bash
# 1. TypeScript compilation
npx tsc --noEmit # Should show < 200 errors

# 2. Svelte component validation
npx svelte-check --threshold error # Should pass or < 200 errors

# 3. Playwright tests
npx playwright test # Should pass WebGPU tests

# 4. Build test
npm run build # Should complete successfully
```

---

## 🚀 EXECUTION LOG

### Started: 2025-01-31 20:45:00
### Target Completion: 2025-01-31 22:45:00 (2 hours)

**Progress will be tracked here...**

---

## 📝 NOTES & DISCOVERIES

### Key Learnings
1. **WebGPU SSR Guard Pattern**:
   - ALWAYS wrap in `$effect` with `browser` check
   - Use `?. optional chaining` for safety
   - Provide CPU fallback when possible

2. **Svelte 5 Migration Gotchas**:
   - `createEventDispatcher` MUST be manually migrated
   - Some slot patterns too complex for auto-migration
   - Event modifiers need wrapper functions

3. **File Corruption Sources**:
   - Likely caused by broken git merge or encoding issues
   - UTF-8 BOM markers got corrupted
   - Some files have mixed line endings

4. **bits-ui Integration**:
   - Builder pattern more verbose but more flexible
   - Need wrapper layer for DX improvement
   - Types are excellent in Svelte 5

---

**Report Status**: 🟢 Ready for execution
**Next Action**: Begin Phase 1 - WebGPU SSR Fixes
