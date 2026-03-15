# P3/P4 Completion Plan - Production UX Polish

**Session 93r28i continuation**
**Status**: 0 errors, 396 warnings, production-ready codebase

After completing all critical P0-P2 items (APIs, corruption fixes, error elimination), these P3/P4 enhancements will provide production-quality UX.

---

## 🎯 Current Status

| Category | Completed | Remaining | Priority |
|----------|-----------|-----------|----------|
| **P3 UX** | 60% | 40% | High |
| **P4 Infrastructure** | 70% | 30% | Medium |

---

## 📋 Remaining P3: UX Enhancements

### **1. Search/Filter in Modals** 🔍
**Impact**: High - Improves usability when selecting from large lists

#### **Priority Modal: AttachToCaseModal.svelte**
**Current state:**
- Uses basic `<select>` dropdown
- Loads 50 cases (limit 50)
- No search/filter - hard to find specific case
- Found at: `src/lib/components/legal-ai/AttachToCaseModal.svelte`

**Required changes:**
```typescript
// Add search state
let searchQuery = $state('');

// Filter cases based on search
let filteredCases = $derived.by(() => {
  if (!searchQuery.trim()) return cases;
  const query = searchQuery.toLowerCase();
  return cases.filter(c =>
    c.title.toLowerCase().includes(query) ||
    c.number.toLowerCase().includes(query)
  );
});
```

**UI update:**
```html
<!-- Replace <select> with searchable list -->
<div class="form-group">
  <label for="case-search">Select Case *</label>
  <input
    type="text"
    id="case-search"
    bind:value={searchQuery}
    placeholder="Search by case number or title..."
    class="search-input"
  />
  <div class="case-list">
    {#each filteredCases as caseItem}
      <button
        type="button"
        class="case-item"
        class:selected={selectedCaseId === caseItem.id}
        onclick={() => selectedCaseId = caseItem.id}
      >
        <div class="case-number">{caseItem.number}</div>
        <div class="case-title">{caseItem.title}</div>
      </button>
    {/each}
  </div>
</div>
```

**Estimated effort**: 30-45 minutes

---

#### **Other Modals Needing Search** (Lower Priority)

| Modal | Location | Use Case | Effort |
|-------|----------|----------|--------|
| EvidenceUploadModal | `src/lib/components/evidence/` | Select case for evidence | 20 min |
| AddPoiModal | `src/lib/components/poi/` | Link POI to case | 15 min |
| CitationSaveModal | `src/lib/components/legal-ai/` | Save citation to case | 20 min |

**Total P3.1 effort**: ~2 hours for all 4 modals

---

### **2. Loading Skeletons** ⏳
**Impact**: Medium - Perceived performance improvement

#### **Current state:**
- 10 routes use `{#if isLoading}` with simple text
- 0 routes use skeleton loaders
- Users see "Loading..." text instead of layout preview

#### **Target routes** (high-traffic pages):

| Route | Current | Needed |
|-------|---------|--------|
| `/evidence` | "Loading..." text | Evidence card skeletons |
| `/cases/[id]` | Spinner + text | Case detail skeleton |
| `/citations` | "Loading..." | Citation list skeleton |
| `/dashboard` | None | Stats card skeletons |
| `/ai-dashboard` | None | Panel skeletons |

**Implementation:**

**Create reusable Skeleton component:**
```typescript
// src/lib/components/ui/Skeleton.svelte
<script lang="ts">
  interface Props {
    variant?: 'text' | 'card' | 'rect' | 'circle';
    width?: string;
    height?: string;
    className?: string;
  }

  let {
    variant = 'text',
    width = '100%',
    height = variant === 'text' ? '1em' : '200px',
    className = ''
  }: Props = $props();
</script>

<div
  class="skeleton skeleton-{variant} {className}"
  style:width
  style:height
></div>

<style>
  .skeleton {
    background: linear-gradient(
      90deg,
      var(--panel) 25%,
      var(--panel-soft) 50%,
      var(--panel) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
```

**Usage example (evidence page):**
```html
{#if isLoading}
  <div class="evidence-grid">
    {#each Array(6) as _, i}
      <div class="evidence-card-skeleton">
        <Skeleton variant="rect" height="200px" />
        <Skeleton variant="text" width="80%" />
        <Skeleton variant="text" width="60%" />
      </div>
    {/each}
  </div>
{:else}
  <!-- Actual evidence cards -->
{/if}
```

**Estimated effort**: 2 hours (1 hour for component, 1 hour for 5 routes)

---

### **3. Keyboard Navigation** ⌨️
**Impact**: Medium - Accessibility & power user experience

#### **Current state:**
- Escape key works in most modals
- No Tab/Arrow key navigation in custom dropdowns
- No keyboard shortcuts for common actions

#### **Target improvements:**

**A. Modal Keyboard Support** (Quick Win)
- ✅ Escape to close (already works)
- ➕ Enter to submit forms
- ➕ Tab to cycle through inputs
- ➕ Arrow keys for list selection

**B. Dropdown/List Navigation**
```typescript
// Add to AttachToCaseModal after adding search/filter
function handleListKeydown(e: KeyboardEvent) {
  const items = filteredCases;
  const currentIndex = items.findIndex(c => c.id === selectedCaseId);

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      if (currentIndex < items.length - 1) {
        selectedCaseId = items[currentIndex + 1].id;
      }
      break;
    case 'ArrowUp':
      e.preventDefault();
      if (currentIndex > 0) {
        selectedCaseId = items[currentIndex - 1].id;
      }
      break;
    case 'Enter':
      e.preventDefault();
      if (selectedCaseId) {
        handleSubmit();
      }
      break;
  }
}
```

**C. Global Keyboard Shortcuts** (Optional)
```typescript
// src/routes/+layout.svelte
function handleGlobalKeyboard(e: KeyboardEvent) {
  // Ctrl/Cmd + K: Open global search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    openGlobalSearch();
  }

  // Ctrl/Cmd + N: New case/evidence (context-aware)
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    openNewItemModal();
  }
}
```

**Estimated effort**: 2 hours (modals + lists), +1 hour if adding global shortcuts

---

## 🔧 Remaining P4: Infrastructure

### **4. routes_parked Cleanup** 📦
**Impact**: Low - Code hygiene, no user-facing impact

#### **Current state:**
- 588 corrupted files remain in `routes_parked/`
- Already archived many to `deeds_labs/`
- Not blocking production

#### **Completion strategy:**

**Option A: Full Archive** (Recommended)
```bash
# Move entire routes_parked to deeds_labs
mv routes_parked/ deeds_labs/routes_parked_archive/
```

**Option B: Selective Recovery**
- Audit for any salvageable components
- Move salvageable files to active codebase
- Archive the rest

**Estimated effort**: 30 minutes (Option A), 2-3 hours (Option B)

---

## 📊 Implementation Priority

### **Phase 1: Quick Wins** (2-3 hours)
1. ✅ Search/filter in AttachToCaseModal (highest user impact)
2. ✅ Loading skeletons for 3 main routes (evidence, cases, citations)
3. ✅ Basic keyboard navigation (Enter to submit, Arrow keys in lists)

### **Phase 2: Polish** (2-3 hours)
4. Search/filter in other 3 modals
5. Loading skeletons for remaining 2 routes
6. Enhanced keyboard shortcuts (optional)

### **Phase 3: Cleanup** (30 min - 3 hours)
7. routes_parked archive

---

## 🎯 Production-Ready Checklist

After completing Phase 1:

- ✅ 0 errors (already complete)
- ✅ All P0 APIs implemented (already complete)
- ✅ All corruption eliminated (already complete)
- 🔲 Search in critical modals (AttachToCaseModal)
- 🔲 Loading states for main routes
- 🔲 Basic keyboard navigation
- ✅ Production deployment ready (already complete)

**Estimated total time**: 4-6 hours for Phase 1 + Phase 2

---

## 🚀 Implementation Order

**Recommended sequence:**

1. **AttachToCaseModal search** (30 min) - Highest impact, frequently used
2. **Skeleton component** (1 hour) - Reusable across all routes
3. **3 route skeletons** (1 hour) - Evidence, cases, citations
4. **Keyboard navigation in modals** (1 hour) - Accessibility win
5. **Search in other modals** (1 hour) - Complete the pattern
6. **routes_parked cleanup** (30 min) - Quick archive

**Total: ~4.5 hours for complete P3/P4**

---

## 📝 Notes

### **Why P3/P4 Matter**

Even though codebase is error-free and production-ready:
- Search/filter prevents user frustration with long lists
- Skeletons improve perceived performance (users feel it's faster)
- Keyboard nav = accessibility + power user satisfaction
- Infrastructure cleanup = long-term maintainability

### **What's Already Great**

- ✅ 0 TypeScript errors
- ✅ All critical APIs working
- ✅ Production build successful
- ✅ Docker deployment ready
- ✅ All Session 93r28i optimizations active

### **Low-Hanging Fruit**

If short on time, just do:
1. AttachToCaseModal search (30 min)
2. Skeleton component (30 min)
3. Evidence page skeleton (15 min)

**Total: 75 minutes for biggest user-facing wins**

---

**Last Updated**: 2026-02-28
**Next**: Start with AttachToCaseModal search/filter implementation