# Session 26: Codebase Health Analysis & Cleanup Roadmap

**Date**: February 13, 2026
**Status**: Analysis complete, ready for execution
**Previous Session**: Session 25 — UnoCSS theme color migration (368 files, 97% coverage)

---

## Executive Summary

The SvelteKit frontend has **3,906 files** but only ~2,000 are actively used. The Svelte 5 migration is **99% complete** (events, slots, props all done). Three cleanup tracks remain:

| Track | Scope | Impact | Effort |
|-------|-------|--------|--------|
| **A: Store Runes Migration** | 16 files → `.svelte.ts` | Eliminates last Svelte 4 API usage | 2-3 hours |
| **B: routes_parked Purge** | 1,612 dead files (41% of codebase) | 38% file count reduction | 30 min |
| **C: Go-Style Consolidation** | Reorganize 99 lib dirs → 15 | Long-term maintainability | 8+ hours |

---

## Track A: Store Runes Migration

### Problem
16 store files still use Svelte 4 `writable`/`derived` from `svelte/store`. These are the **last remaining Svelte 4 API usage** in the active codebase.

### Files to Migrate

**Unified stores** (12 files in `src/lib/stores/unified/`):
| File | Pattern | Importers |
|------|---------|-----------|
| `case-store.ts` | `writable`, `derived` | 30+ case components |
| `evidence-store.ts` | `writable`, `derived` | 15+ evidence components |
| `citation-store.ts` | `writable`, `derived` | 10+ citation components |
| `user-store.ts` | `writable` | 20+ auth-dependent components |
| `notification-store.ts` | `writable` | Global notifications |
| `toast-store.ts` | `writable` | Global toasts |
| `search-store.ts` | `writable`, `derived` | Search components |
| `poi-store.ts` | `writable` | POI components |
| `report-store.ts` | `writable` | Report generation |
| `canvas-store.ts` | `writable` | Canvas/visualization |
| `ai-assistant-store.svelte.ts` | `writable` (despite .svelte.ts name) | AI chat |
| `index.ts` | Barrel re-export | All of the above |

**Other stores** (4 files):
| File | Pattern | Importers |
|------|---------|-----------|
| `app-store.ts` | `writable` | Global app state (20+ components) |
| `DocumentProgressStore.ts` | `writable` | Dashboard only |
| `SSEStatusStore.ts` | `writable` | Dashboard only |
| `notifications.svelte.ts` | `writable` (despite .svelte.ts name) | Global notifications |

### Migration Pattern

```typescript
// BEFORE: src/lib/stores/unified/case-store.ts
import { writable, derived } from 'svelte/store';
export const cases = writable<Case[]>([]);
export const activeCase = derived(cases, $c => $c.find(c => c.active));

// AFTER: src/lib/stores/unified/case-store.svelte.ts
export let cases = $state<Case[]>([]);
export let activeCase = $derived(cases.find(c => c.active));
export function addCase(c: Case) { cases = [...cases, c]; }
```

### Risk Assessment
- **LOW** — Stores are well-isolated behind barrel exports
- Consumer components already use `$storeValue` syntax which maps naturally to direct rune access
- Can be done file-by-file with immediate testing

---

## Track B: routes_parked Audit

### Problem
`src/routes_parked/` contains **1,612 files** — 41% of the entire codebase. These are disabled route groups from experimental features, abandoned UIs, and legacy code.

### Current Structure
```
routes_parked/
├── (admin)_disabled/          # Admin panel experiments
├── (ai)_disabled/             # AI feature experiments
├── (legal)_disabled/          # Legal workflow experiments
├── _archive-command-center/   # Old command center
├── _archive-terminal/         # Old terminal UI
├── _yorha_legacy/             # Legacy YoRHa theme
├── archive/                   # General archive
└── ... (50+ disabled route groups)
```

### Decision Framework
For each parked route group:
1. **Is it referenced by any active import?** → Keep if yes
2. **Does it have unique functionality not in active routes?** → Evaluate
3. **Is it a duplicate of an active route?** → Delete
4. **Is it from a phase that's been superseded?** → Delete

### Expected Outcome
- **Delete**: ~1,200 files (experiments, duplicates, superseded phases)
- **Review**: ~300 files (potentially useful features)
- **Keep**: ~100 files (active development, needed references)

---

## Track C: Go Microservice-Style Consolidation

### Lesson from Go Cleanup (December 2024)
The Go microservice layer had the same disease: **speculative development sprawl**.
- 108 Go executables → 96% were empty stubs
- Consolidated to 4 functional services (96% reduction)
- Build time improved 87%

### Applying Same Strategy to SvelteKit

**Current state**: 99 directories under `src/lib/`

**Proposed consolidation** (99 → 15 directories):

| Current (scattered) | Proposed (consolidated) |
|---------------------|------------------------|
| `src/stores/`, `src/lib/stores/`, `src/lib/lib/stores/` | `src/lib/state/` |
| `src/types/`, `src/lib/types/`, 4 other type dirs | `src/lib/types/` |
| `src/lib/cache/`, `src/lib/components/cache/`, `src/lib/server/cache/` | `src/lib/cache/` |
| `src/tests/`, `src/lib/__tests__/`, `src/lib/tests/`, `test/` | `tests/` (root) |
| `src/lib/3d/`, `src/lib/parallax/`, `src/lib/canvas/` | DELETE (unused) |
| `src/lib/grpc/`, `src/lib/cuda/`, `src/lib/headless/` | DELETE or `src/lib/experimental/` |
| `src/lib/phase14/`, `src/lib/phase72/`, `src/lib/phase78/` | `src/lib/tools/` |

### Cleanup Metrics

| Category | Current | Target | Reduction |
|----------|---------|--------|-----------|
| Total files | 3,906 | ~1,800 | 54% |
| lib directories | 99 | 15 | 85% |
| Service files | 153 | ~50 | 67% |
| Component files | 2,581 | ~1,500 | 42% |
| Parked routes | 1,612 | 0 | 100% |
| Archive files | 266 | 0 | 100% |

---

## Svelte 5 Migration Status (99% Complete)

| Pattern | Status | Remaining |
|---------|--------|-----------|
| `onclick`/`onchange` events | DONE | 0 files |
| `{#snippet}` / `{@render}` | DONE | 0 files |
| `$props()` | DONE | 0 files |
| `$$props`/`$$restProps` | DONE | 0 files |
| `<svelte:component>` → conditional | DONE | 0 files |
| `$:` → `$derived`/`$effect` | 2 files | AIProcessingDashboard, AIChatInterface |
| `createEventDispatcher` | 5 files | Mostly comments, verify usage |
| `writable`/`derived` stores | **16 files** | **Track A above** |

### Other Quality Items Found
- **5 mega-components** (>1,000 lines) — consider splitting
- **21 near-empty barrel exports** — consolidate or remove
- **42 files with commented-out code** — clean up
- **1 empty component** (`EvidenceMemory.svelte`) — delete

---

## Recommended Execution Order

### This Session (30 min)
1. Run Track B audit (routes_parked) — identify what to delete
2. Execute archive cleanup — delete 266 files in `_archive/` dirs
3. Delete empty/stub files

### Next Session (2-3 hours)
4. Execute Track A — migrate 16 store files to runes
5. Fix 2 remaining `$:` reactive statements
6. Verify 5 `createEventDispatcher` files

### Future Session (8+ hours)
7. Execute Track C — directory consolidation (requires import rewrites)

---

## Appendix: File Distribution

```
src/                           3,906 files total
├── lib/                       3,288 (84%)
│   ├── components/            2,581 (66%)
│   ├── services/                153 (4%)
│   ├── stores/                  ~80 (2%)
│   ├── types/                   ~60 (2%)
│   ├── state/                   ~40 (1%)
│   ├── server/                  ~50 (1%)
│   └── other (94 dirs)         ~324 (8%)
├── routes/                      309 (8%)
│   ├── +page.svelte              77
│   ├── +server.ts               131
│   ├── +page.server.ts           44
│   └── +layout.svelte             5
└── routes_parked/             1,612 (41%)  ← DEAD CODE
```