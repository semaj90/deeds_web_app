# SvelteKit 5 Migration & Core Routes Spec

**YoRHa Legal AI Frontend**

Canonical guide for migrating legacy SvelteKit code to Svelte 5, defining core routes, and eliminating ts-check / svelte-check noise.

---

## 0. Scope & Goals

This spec defines:
- What routes are considered "core"
- What legacy Svelte patterns are forbidden
- Exact migration rules for Svelte 5
- Known error classes and how to fix them
- Execution order (tests first, UI later)

**Primary goal**: Get svelte-check from 71k errors → actionable errors only.

---

## 1. Canonical Core Routes (Phase 06)

These routes must compile cleanly before any UI polish work.

### 1.1 Application Routes

```
src/routes/
├─ (app)/
│  ├─ cases/
│  │  └─ [id]/
│  │     ├─ +layout.svelte
│  │     ├─ +page.svelte
│  │     └─ +page.server.ts
│  ├─ evidence/
│  │  ├─ +page.svelte
│  │  └─ +page.server.ts
│  ├─ terminal/
│  │  └─ +page.svelte
│  └─ yorha-detective/
│     └─ +page.svelte   ← boot screen / main shell
```

These define the runtime app surface.

### 1.2 API Routes (Authoritative)

```
src/routes/api/
├─ ai/
│  └─ yorha/
│     ├─ context-chat/
│     │  └─ +server.ts
│     ├─ enhanced-rag/
│     │  └─ +server.ts
│     └─ docling/
│        └─ +server.ts
├─ legal/
│  ├─ ingest/
│  ├─ research/
│  └─ workflow/
├─ rag/
│  └─ query/
├─ v1/
│  ├─ evidence/
│  ├─ storage/
│  ├─ vector/
│  └─ telemetry/
└─ routes/
   └─ +page.server.ts   ← route introspection / command center
```

**Anything outside this tree is either:**
- experimental
- archived
- or must move under `_archive/`

---

## 2. Svelte 5 Migration Rules (Non-Negotiable)

### 2.1 Forbidden Legacy Patterns

These must not exist after migration:

```svelte
❌ export let foo
❌ $: reactive labels
❌ on:event={}
❌ import type { fade } from 'svelte/transition'
❌ implicit stores via $store without $state
```

### 2.2 Required Svelte 5 Patterns

#### Props

```svelte
<script lang="ts">
  let { caseId, user } = $props<{
    caseId: string;
    user: User;
  }>();
</script>
```

#### State

```svelte
let isBooting = $state(true);
let errors = $state<string[]>([]);
```

#### Derived

```svelte
let errorCount = $derived(errors.length);
```

#### Effects (side-effects only)

```svelte
$effect(() => {
  console.log('Boot state:', isBooting);
});
```

---

## 3. Known Error Class: `import type` vs Runtime Usage

### 3.1 The Error You're Seeing

```
Error: 'fade' cannot be used as a value because it was imported using 'import type'
```

Example (WRONG):

```svelte
<script lang="ts">
  import type { fade } from 'svelte/transition';
</script>

<div transition:fade={{ duration: 500 }}>
  This is invalid in Svelte 5.
</div>
```

### 3.2 Correct Fix (MANDATORY)

Transitions are runtime values, never type.

```svelte
<script lang="ts">
  import { fade } from 'svelte/transition';
</script>

<div transition:fade={{ duration: 500 }}>
  ✅ Correct
</div>
```

### 3.3 Codemod Rule

Search & replace:

```
- import type { fade } from 'svelte/transition';
+ import { fade } from 'svelte/transition';
```

Same rule applies to:
- `fly`
- `slide`
- `blur`
- `scale`
- `crossfade`

---

## 4. Boot / Splash Screens (yorha-detective)

### Canonical Pattern

```svelte
<script lang="ts">
  import { fade } from 'svelte/transition';

  let isBooting = $state(true);

  $effect(() => {
    const t = setTimeout(() => (isBooting = false), 1200);
    return () => clearTimeout(t);
  });
</script>

{#if isBooting}
  <div class="boot-screen" transition:fade={{ duration: 500 }}>
    <div class="boot-logo">YoRHa</div>
  </div>
{/if}
```

**Key points:**
- ❗ No `$:`
- ❗ No `onMount`
- ❗ No `import type`

---

## 5. Duplicate Function Errors (TS2393)

### Symptom

```
Duplicate function implementation
```

Usually seen in:
```
src/routes/api/yorha/enhanced-rag/+server.ts
```

### Root Causes

- Copied helper functions inside the same file
- Re-declared handlers (POST, GET)
- Legacy refactors pasted inline

### Rule

Each file may only export:
- `GET`
- `POST`
- helpers declared once

### Fix Pattern

Move helpers to:

```
src/lib/server/yorha/
├─ rag-helpers.ts
├─ vlm-helpers.ts
└─ prompt-builders.ts
```

Then import.

---

## 6. Execution Order (IMPORTANT)

You already noted this correctly.

### Phase Order

1. Tests FIRST
2. CRUD
3. tags
4. RAG
5. audit
6. Then frontend components

### Why

- Tests surface broken imports instantly
- UI churn hides real failures
- Phase 72 depends on stable routes

---

## 7. Phase 6 Success Criteria

Phase 06 is done when:

- [ ] `npm run phase6:core` completes
- [ ] svelte-check errors are:
  - real
  - localized
  - < 500 (not 71k)
- [ ] Core routes render in browser via `npm run dev:quic`
  - Specifically: `/terminal`, `/cases/[id]`, `/yorha-detective`

---

## 8. Codemod Checklist

### Automated Fixes

Run these in order:

```bash
# 1. Fix import type for transitions
node scripts/fix-transition-imports.mjs

# 2. Fix export let → $props
node scripts/fix-export-let.mjs

# 3. Fix $: → $derived / $effect
node scripts/fix-reactive-labels.mjs

# 4. Fix on:event → onevent
node scripts/fix-event-handlers.mjs
```

### Manual Review

After running codemods:

```bash
# Check for remaining issues
npm run svelte-check -- --threshold warning

# List files still using legacy syntax
grep -r "export let" src/routes --include="*.svelte"
grep -r "import type.*transition" src --include="*.svelte"
grep -r "\$:" src --include="*.svelte"
```

---

## 9. Error Classification Guide

### Category A: Import Type Errors

**Pattern**: `import type { X } from 'svelte/...'` where X is used at runtime

**Fix**: Remove `type` keyword

**Files affected**: Any component using transitions, animations, stores

### Category B: Reactive Label Errors

**Pattern**: `$: variable = ...` or `$: { ... }`

**Fix**: Use `$derived` or `$effect`

**Files affected**: Components with computed values or side effects

### Category C: Export Let Errors

**Pattern**: `export let prop;`

**Fix**: Use `let { prop } = $props();`

**Files affected**: All components with props

### Category D: Event Handler Errors

**Pattern**: `on:click={handler}` with legacy syntax

**Fix**: Use `onclick` or `onchange` directly

**Files affected**: Interactive components

### Category E: Duplicate Declaration Errors

**Pattern**: Same function declared twice in same file

**Fix**: Move to separate file, import

**Files affected**: API routes with helper functions

---

## 10. Next Spec (Phase 07 / 08)

Once this passes, next documents should be:

- **Phase 07** – Frontend Component Migration
- **Phase 08** – UI State Machines (XState v5 + Svelte 5)

---

## 11. Quick Reference

### Before (Legacy)

```svelte
<script>
  export let caseId;
  let count = 0;
  $: doubled = count * 2;

  import type { fade } from 'svelte/transition';

  onMount(() => {
    console.log('mounted');
  });
</script>

<div transition:fade on:click={() => count++}>
  {doubled}
</div>
```

### After (Svelte 5)

```svelte
<script lang="ts">
  import { fade } from 'svelte/transition';

  let { caseId } = $props<{ caseId: string }>();
  let count = $state(0);
  let doubled = $derived(count * 2);

  $effect(() => {
    console.log('mounted');
  });
</script>

<div transition:fade onclick={() => count++}>
  {doubled}
</div>
```

---

## 12. TL;DR

You're not "behind" — you're exactly where a serious Svelte 5 migration should be:

- ✅ Core routes identified
- ✅ Infra stable
- ✅ Errors now classifiable
- ✅ GPU + RAG already solved (hard part)

**Next steps:**
1. Run codemods on core routes
2. Fix remaining Category A-E errors
3. Get svelte-check < 500 errors
4. Verify core routes render
5. Move to Phase 07 (component migration)

---

**Document Version**: 1.0
**Last Updated**: December 13, 2025
**Status**: Ready for Execution

