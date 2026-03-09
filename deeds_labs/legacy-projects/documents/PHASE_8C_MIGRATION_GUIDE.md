# Phase 8C: Component Migration Guide - Svelte 5 Runes Edition

**Status:** Ready for Implementation
**Date:** October 17, 2025
**Target:** Migrate 42+ old store imports to unified stores

---

## 🎯 Svelte 5 Rune Patterns for Unified Stores

### Pattern 1: Reading Store State with `$derived`

**Old Pattern (Fragmented Stores):**
```svelte
<script>
  import { notifications } from '$lib/stores/notification'

  let notificationList = []
  notifications.subscribe(value => {
    notificationList = value.notifications
  })
</script>

{#each notificationList as notif}
  <div>{notif.message}</div>
{/each}
```

**New Pattern (Unified Stores + Svelte 5):**
```svelte
<script>
  import { notificationStore } from '$lib/stores/unified'

  let notifs = $derived(notificationStore.getNotifications?.() || [])
</script>

{#each notifs as notif}
  <div>{notif.message}</div>
{/each}
```

---

### Pattern 2: Updating Store State with Store Methods

**Old Pattern:**
```svelte
<script>
  import { notifications } from '$lib/stores/notification'

  function showNotification() {
    notifications.add({
      type: 'success',
      title: 'Success!',
      message: 'Operation completed'
    })
  }
</script>

<button onclick={showNotification}>Show</button>
```

**New Pattern (Unified):**
```svelte
<script>
  import { notificationStore } from '$lib/stores/unified'

  function showNotification() {
    notificationStore.addNotification({
      type: 'success',
      title: 'Success!',
      message: 'Operation completed'
    })
  }
</script>

<button onclick={showNotification}>Show</button>
```

---

### Pattern 3: Multiple Store Subscriptions

**Old Pattern:**
```svelte
<script>
  import { user } from '$lib/stores/auth'
  import { evidence } from '$lib/stores/evidence'
  import { cases } from '$lib/stores/cases'

  let currentUser
  let userEvidence = []
  let userCases = []

  user.subscribe(u => currentUser = u)
  evidence.subscribe(e => userEvidence = e)
  cases.subscribe(c => userCases = c)
</script>
```

**New Pattern (Unified + Svelte 5):**
```svelte
<script>
  import { userStore, evidenceStore, caseStore } from '$lib/stores/unified'

  let currentUser = $state(null)
  let userEvidence = $derived(evidenceStore.getEvidence?.() || [])
  let userCases = $derived(caseStore.getCases?.() || [])

  // Subscribe once on mount if needed
  $effect(() => {
    userStore.subscribe(u => {
      currentUser = u
    })()
  })
</script>
```

---

## 🔄 Migration Checklist

### Step 1: Identify Old Imports
```bash
# Find all old store imports
grep -r "from '\$lib/stores" src/routes --include="*.svelte" | grep -v "unified"
```

### Step 2: Map to New Stores

| Old Import | New Store | New Import |
|-----------|-----------|-----------|
| `$lib/stores/notification` | NotificationStore | `import { notificationStore } from '$lib/stores/unified'` |
| `$lib/stores/auth` | UserStore | `import { userStore } from '$lib/stores/unified'` |
| `$lib/stores/evidence` | EvidenceStore | `import { evidenceStore } from '$lib/stores/unified'` |
| `$lib/stores/cases` | CaseStore | `import { caseStore } from '$lib/stores/unified'` |
| `$lib/stores/citation` | CitationStore | `import { citationStore } from '$lib/stores/unified'` |
| `$lib/stores/reports` | ReportStore | `import { reportStore } from '$lib/stores/unified'` |
| `$lib/stores/poi` | POIStore | `import { poiStore } from '$lib/stores/unified'` |
| `$lib/stores/search` | SearchStore | `import { searchStore } from '$lib/stores/unified'` |
| `$lib/stores/canvas` | CanvasStore | `import { canvasStore } from '$lib/stores/unified'` |
| `$lib/stores/ai-assistant` | AIAssistantStore | `import { aiAssistantStore } from '$lib/stores/unified'` |

### Step 3: Update Import Statements
```svelte
// BEFORE
import { notifications } from '$lib/stores/notification'

// AFTER
import { notificationStore } from '$lib/stores/unified'
```

### Step 4: Update Store Method Calls
```svelte
// BEFORE
notifications.add({ ... })
notifications.remove(id)
notifications.markAsRead(id)

// AFTER
notificationStore.addNotification({ ... })
notificationStore.removeNotification(id)
notificationStore.markAsRead(id)
```

### Step 5: Validate with TypeScript
```bash
npm run check
```

---

## 📋 API Mapping by Store

### NotificationStore
```typescript
// OLD API → NEW API
notifications.add(notif)          → notificationStore.addNotification(notif)
notifications.remove(id)          → notificationStore.removeNotification(id)
notifications.markAsRead(id)      → notificationStore.markAsRead(id)
notifications.showToast(msg)      → notificationStore.showToast(msg)
notifications.clear()             → notificationStore.clear()
```

### UserStore
```typescript
// OLD API → NEW API
auth.login(credentials)           → userStore.login(credentials)
auth.logout()                      → userStore.logout()
auth.updateProfile(data)          → userStore.updateProfile(data)
isAuthenticated()                 → $derived(userStore.isAuthenticated())
currentUser()                      → $derived(userStore.currentUser())
```

### EvidenceStore
```typescript
// OLD API → NEW API
evidence.upload(file)             → evidenceStore.uploadEvidence(file)
evidence.analyze(id)              → evidenceStore.analyzeEvidence(id)
evidence.getChainOfCustody(id)    → evidenceStore.getChainOfCustody(id)
evidence.delete(id)               → evidenceStore.deleteEvidence(id)
```

### CaseStore
```typescript
// OLD API → NEW API
cases.select(id)                  → caseStore.selectCase(id)
cases.search(query)               → caseStore.searchCases(query)
cases.filter(criteria)            → caseStore.filterCases(criteria)
cases.update(id, data)            → caseStore.updateCase(id, data)
```

### CitationStore
```typescript
// OLD API → NEW API
citations.search(query)           → citationStore.searchCitations(query)
citations.findSimilar(id)         → citationStore.findSimilarCitations(id)
citations.filterByType(type)      → citationStore.filterByType(type)
citations.addToCase(citId, caseId) → citationStore.addToCase(citId, caseId)
```

### ReportStore
```typescript
// OLD API → NEW API
reports.create(data)              → reportStore.createReport(data)
reports.update(id, data)          → reportStore.updateReport(id, data)
reports.save(id)                  → reportStore.saveReport(id)
reports.publish(id)               → reportStore.publishReport(id)
reports.export(id, format)        → reportStore.exportReport(id, format)
```

### POIStore
```typescript
// OLD API → NEW API
poi.load()                        → poiStore.loadPOIs()
poi.create(data)                  → poiStore.createPOI(data)
poi.analyzeNetwork()              → poiStore.analyzeNetwork()
poi.predictRisk(id)               → poiStore.predictRisk(id)
poi.getTimeline(id)               → poiStore.getTimeline(id)
```

### SearchStore
```typescript
// OLD API → NEW API
search.query(q)                   → searchStore.search(q)
search.vectorSearch(embedding)    → searchStore.vectorSearch(embedding)
search.saveSearch(name, query)    → searchStore.saveSearch(name, query)
search.export(format)             → searchStore.exportResults(format)
```

### CanvasStore
```typescript
// OLD API → NEW API
canvas.addElement(el)             → canvasStore.addElement(el)
canvas.createConnection(src, dst) → canvasStore.createConnection(src, dst)
canvas.undo()                     → canvasStore.undo()
canvas.redo()                     → canvasStore.redo()
canvas.export(format)             → canvasStore.exportCanvas(format)
```

### AIAssistantStore
```typescript
// OLD API → NEW API
ai.sendMessage(msg)               → aiAssistantStore.sendMessage(msg)
ai.streamMessage(msg)             → aiAssistantStore.streamMessage(msg)
ai.generateAnalysis(doc)          → aiAssistantStore.generateAnalysis(doc)
ai.getHistory()                   → aiAssistantStore.getConversationHistory()
```

---

## ⚠️ Common Migration Issues & Fixes

### Issue 1: Store doesn't have `.subscribe()`
**Problem:** Old stores used writable stores with `.subscribe()`
**Solution:** Use Svelte 5 `$derived` or access store methods directly

```svelte
// ❌ Won't work with new unified stores
notifications.subscribe(n => { ... })

// ✅ Correct approach
let notifs = $derived(notificationStore.notifications || [])
```

### Issue 2: Circular dependencies
**Problem:** Component imports unified store which imports userStore
**Solution:** Use lazy loading or move state to parent component

```svelte
// ✅ Import only what you need
import { notificationStore } from '$lib/stores/unified'
```

### Issue 3: Type errors with methods
**Problem:** TypeScript doesn't know about store methods
**Solution:** Types are built into unified stores, should resolve automatically

```bash
npm run check
```

---

## 🚀 Migration Execution Plan

### Phase 1: Automated Migration (PowerShell)
1. Create migration script that replaces imports
2. Test on 3-5 sample components
3. Apply to all 42+ imports
4. Run `npm run check`

### Phase 2: Manual Verification (30 min)
1. Review changed files
2. Fix any compilation errors
3. Test components in browser

### Phase 3: Validation (20 min)
1. Run full test suite
2. Check for regressions
3. Commit changes

**Total Time: ~1.5-2 hours**

---

## 📊 Success Metrics

- [ ] All 42+ old imports replaced
- [ ] `npm run check` returns 0 errors
- [ ] 3 components tested in browser
- [ ] No console warnings
- [ ] Git diff shows clean migration
- [ ] Performance metrics unchanged

---

## 🎓 Svelte 5 Best Practices (Applied Here)

From the Svelte 5 documentation:

### ✅ Using `$derived` for Reactive Computed Values
```svelte
let notifications = $derived(notificationStore.notifications || [])
```

### ✅ Minimal State with `$state`
```svelte
let selectedNotif = $state(null)
```

### ✅ Effects for Side Effects
```svelte
$effect(() => {
  if (selectedNotif) {
    notificationStore.markAsRead(selectedNotif.id)
  }
})
```

### ✅ Runes Don't Need Imports
All Svelte 5 runes (`$state`, `$derived`, `$effect`) are built-in keywords.

---

## Ready for Bulk Migration ✅

All patterns established. Ready to proceed with automated script.

Next: **Phase 8C Execution** - Run bulk migration on all 42+ imports
