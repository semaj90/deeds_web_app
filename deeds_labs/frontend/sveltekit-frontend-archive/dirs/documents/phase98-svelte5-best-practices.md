# Phase 98: Svelte 5 + SvelteKit 2 Best Practices
**Updated:** 2026-01-13
**Based on web research for current best practices**

---

## 🔑 Key Findings from Research

### 1. Barrel Exports: USE SPARINGLY
**Verdict:** Barrel exports can **hurt tree-shaking** and cause **circular dependencies**.

| Pattern | Recommendation |
|---------|---------------|
| `export * from './module'` | ❌ **AVOID** - breaks tree-shaking |
| `export { A, B } from './module'` | ⚠️ **Use sparingly** |
| Direct imports | ✅ **PREFERRED** for bundle size |

**For Your Project:**
- Keep existing barrel exports for **component libraries** (`bits-ui`)
- Use **direct imports** for services and utilities
- Don't create new barrel exports for every folder

---

### 2. Svelte 5 Runes Replace Stores
**Verdict:** `$state` and `$derived` replace `writable` and `derived` stores for most cases.

```svelte
<!-- OLD: Svelte 3/4 Stores -->
<script>
  import { writable, derived } from 'svelte/store';
  const count = writable(0);
  const doubled = derived(count, $c => $c * 2);
</script>
<button on:click={() => count.update(n => n + 1)}>
  {$count} x 2 = {$doubled}
</button>

<!-- NEW: Svelte 5 Runes -->
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
<button onclick={() => count++}>
  {count} x 2 = {doubled}
</button>
```

**When to STILL use stores:**
- ✅ SvelteKit `load` functions (can't return `$state`)
- ✅ Complex async streams (RxJS integration)
- ✅ Global state that needs manual subscription control

**When to use runes:**
- ✅ Local component state
- ✅ Computed values
- ✅ Cross-component reactivity in `.ts` files

---

### 3. SSR Considerations
**Critical:** `$effect` runs **ONLY on client**. Never use for SSR-critical state.

| Rune | SSR Safe? | Use Case |
|------|-----------|----------|
| `$state` | ✅ Yes | All reactive state |
| `$derived` | ✅ Yes | Computed values |
| `$props` | ✅ Yes | Component inputs |
| `$effect` | ❌ Client only | Side effects, DOM access |

**Your Legal AI App:**
- Use `$derived` for case/evidence filtering (SSR compatible)
- Use `$effect` only for browser-only features (charts, WebSocket)
- Use SvelteKit `load` functions for data fetching

---

### 4. bits-ui > melt-ui
**Verdict:** bits-ui is built ON TOP of melt-ui. Use bits-ui for components.

| Library | Level | Use Case |
|---------|-------|----------|
| `melt-ui` | Low-level | Maximum control, custom components |
| `bits-ui` | High-level | Ready-to-use headless components |
| `shadcn-svelte` | Styled | bits-ui + Tailwind defaults |

**bits-ui v2 (Svelte 5) Changes:**
- `el` prop → `ref` prop
- `asChild` → `child` snippet
- Event handlers → `onclick` (not `on:click`)

**Your Setup:** Already has `bits-ui@2.14.4` ✅

---

## 📋 Action Plan for Your Legal AI App

### Phase 1: Fix Critical Services (DO FIRST)
1. **Fix contextual-chat.ts** - Minified/corrupted
2. **Fix conversation-service.ts** - Has syntax errors
3. **Fix qdrant-client.ts** - Already fixed ✅

### Phase 2: Svelte 5 Migration (462 files remaining)
Priority files to migrate:
- [ ] `src/routes/(app)/cases/+page.svelte`
- [ ] `src/routes/(app)/evidence/+page.svelte`
- [ ] `src/lib/components/ai/EnhancedContextualChat.svelte`
- [ ] `src/lib/components/cases/CasesList.svelte`

### Phase 3: Organize Imports (NOT barrel exports)
Instead of barrel exports, use:
```typescript
// GOOD: Direct imports
import { conversationService } from '$lib/server/services/conversation-service';
import { EnhancedContextualChat } from '$lib/components/ai/EnhancedContextualChat.svelte';

// AVOID: Barrel imports for services
import { conversationService } from '$lib/server/services'; // ❌
```

### Phase 4: Convert Stores to Runes
Files using old store patterns:
- `src/lib/stores/*.ts` → Convert to `$state` where appropriate
- Keep stores for:
  - `$page` (SvelteKit built-in)
  - Global app state loaded via `+layout.ts`

---

## 🎯 Feature Priority Matrix for Legal AI App

### Tier 1: ESSENTIAL (Make Work First)
| Feature | Files | Status |
|---------|-------|--------|
| Cases CRUD | `/routes/(app)/cases/` | 🔴 500 error |
| Evidence Board | `/routes/(app)/evidence/` | 🔴 500 error |
| Contextual Chat | `EnhancedContextualChat.svelte` | ⚠️ Has errors |
| Auth/Login | `src/lib/auth/` | ⚠️ Needs testing |
| Database | `src/lib/server/db/` | ⚠️ Schema drift |

### Tier 2: IMPORTANT (Core Features)
| Feature | Files | Status |
|---------|-------|--------|
| AI Analysis | `src/lib/services/ai-service.ts` | ✅ 16KB, implemented |
| Vector Search | `src/lib/services/qdrant-client.ts` | ✅ Fixed |
| Case Ranking | `CaseRankingService.ts` | ✅ 27KB, implemented |
| Citations | `citation.service.ts` | ✅ 9KB, implemented |

### Tier 3: NICE TO HAVE (Later)
| Feature | Files | Status |
|---------|-------|--------|
| RabbitMQ Queue | `src/lib/server/queue/` | ⏸️ Empty stubs |
| XState Machines | `src/lib/state/` | ⏸️ Empty stubs |
| Neo4j Graph | `src/lib/server/graph/` | ⏸️ Empty stub |
| GPU Acceleration | `src/lib/cuda/` | ⏸️ Experimental |

---

## 📁 Recommended Project Structure

```
src/lib/
├── components/
│   ├── ai/                 # AI chat components
│   ├── cases/              # Case management
│   ├── evidence/           # Evidence board
│   └── ui/
│       └── bits/           # bits-ui components (keep barrel)
├── server/
│   ├── db/                 # Drizzle schema & client
│   ├── services/           # Business logic (direct imports)
│   └── llm/                # LLM providers
├── services/               # Client-side services
└── types/                  # TypeScript types (can use barrel)
```

---

## ✅ Summary

1. **DON'T** create more barrel exports - use direct imports
2. **DO** migrate stores to `$state`/`$derived` runes
3. **DO** use bits-ui v2 API (ref, child snippets)
4. **DO** fix Tier 1 features first (DB + Cases + Evidence)
5. **DON'T** delete empty stubs - they're feature placeholders
