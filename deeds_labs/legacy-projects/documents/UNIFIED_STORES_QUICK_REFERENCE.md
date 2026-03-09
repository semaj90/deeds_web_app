# Unified Store Quick Reference

## 🎯 The 10 Unified Stores

### 1. **UserStore** - Authentication & Profile
```typescript
import { userStore, user } from '$lib/stores/unified'

// Operations
$: { id, email, role, preferences } = $userStore
userStore.updateProfile({ avatar: '...' })
userStore.updatePreferences({ theme: 'dark' })
```

### 2. **NotificationStore** - Alerts & Toasts
```typescript
import { notificationStore, notifications, alerts } from '$lib/stores/unified'

// Operations
notificationStore.success('Saved!')
notificationStore.error('Failed!')
notificationStore.info('FYI...')
```

### 3. **CitationStore** - Legal References
```typescript
import { citationStore, citations } from '$lib/stores/unified'

// Operations
citationStore.add({ text: '...' })
citationStore.search({ query: 'statute' })
```

### 4. **CaseStore** - Cases & Navigation
```typescript
import { caseStore, cases, legalCase } from '$lib/stores/unified'

// Operations
$: currentCase = $caseStore.current
caseStore.selectCase(caseId)
caseStore.updateFilter({ status: 'active' })
```

### 5. **EvidenceStore** - Evidence Management
```typescript
import { evidenceStore, evidence, evidenceWorkflow } from '$lib/stores/unified'

// Operations
$: allEvidence = $evidenceStore.items
evidenceStore.upload(file)
evidenceStore.analyzeChainOfCustody(evidenceId)
```

### 6. **ReportStore** - Reports & Documents
```typescript
import { reportStore, report } from '$lib/stores/unified'

// Operations
$: currentReport = $reportStore.current
reportStore.addSection({ title: '...' })
reportStore.collaborateWithUser(userId)
```

### 7. **POIStore** - Persons of Interest
```typescript
import { poiStore, poi } from '$lib/stores/unified'

// Operations
$: network = $poiStore.network
poiStore.addPerson({ name: '...' })
poiStore.linkPersons(person1, person2, 'knows')
```

### 8. **SearchStore** - Unified Search
```typescript
import { searchStore, search } from '$lib/stores/unified'

// Operations
searchStore.query('case number')
searchStore.filter({ type: 'evidence', status: 'active' })
```

### 9. **CanvasStore** - Evidence Canvas
```typescript
import { canvasStore, canvas } from '$lib/stores/unified'

// Operations
$: canvasState = $canvasStore
canvasStore.addElement(element)
canvasStore.syncCollaborators()
```

### 10. **AIAssistantStore** - AI Features
```typescript
import { aiAssistantStore, aiAssistant, aiHistory, recommendations } from '$lib/stores/unified'

// Operations
$: messages = $aiAssistantStore.messages
aiAssistantStore.sendMessage('Analyze this...')
aiAssistantStore.getRecommendations()
```

## 📍 Import Patterns

### Basic Import
```typescript
import { notificationStore } from '$lib/stores/unified'
```

### Multiple Stores
```typescript
import { notificationStore, evidenceStore, caseStore } from '$lib/stores/unified'
```

### With Aliases (Old Names)
```typescript
// These all work - backwards compatible!
import { notifications } from '$lib/stores/unified'  // OLD name
import { evidence } from '$lib/stores/unified'       // OLD name
import { aiAssistant } from '$lib/stores/unified'    // OLD name
```

### Type Imports
```typescript
import type { Notification, Evidence, Message } from '$lib/stores/unified'
```

## 🔄 Common Patterns

### Reactive Subscriptions
```svelte
<script>
  import { notificationStore } from '$lib/stores/unified'

  $: alerts = $notificationStore.alerts
</script>

<div>
  {#each alerts as alert (alert.id)}
    <Alert {alert} />
  {/each}
</div>
```

### Updating State
```typescript
import { evidenceStore } from '$lib/stores/unified'

async function uploadEvidence(file) {
  await evidenceStore.upload(file)
  // State automatically updates
}
```

### Derived State
```typescript
import { caseStore } from '$lib/stores/unified'

$: activeCase = $caseStore.cases.find(c => c.status === 'active')
$: caseCount = $caseStore.cases.length
```

### Actions & Side Effects
```typescript
import { notificationStore } from '$lib/stores/unified'

function handleSave() {
  try {
    // ... save logic
    notificationStore.success('Saved!')
  } catch (error) {
    notificationStore.error(error.message)
  }
}
```

## 🎨 Store Capabilities

### UserStore
- ✅ Authentication
- ✅ Profile management
- ✅ Preferences & settings
- ✅ Role-based access
- ✅ Session management

### NotificationStore
- ✅ Toast notifications
- ✅ Alert dialogs
- ✅ Error messages
- ✅ Success confirmations
- ✅ Info messages

### EvidenceStore
- ✅ Upload & storage
- ✅ Chain of custody tracking
- ✅ Evidence analysis
- ✅ Metadata management
- ✅ Collaboration locks

### AIAssistantStore
- ✅ Chat messages
- ✅ Message history
- ✅ AI recommendations
- ✅ Context management
- ✅ Model selection

## 🚀 Performance Tips

### 1. Use Selective Subscriptions
```typescript
// Good - only subscribe to needed data
$: myMessages = $aiAssistantStore.messages.filter(m => m.userId === userId)

// Avoid - subscribes to entire store
$: everything = $aiAssistantStore
```

### 2. Memoize Derived Values
```typescript
import { derived } from 'svelte/store'

const filtered = derived(
  [evidenceStore, selectedFilter],
  ([$store, $filter]) => $store.items.filter(i => i.type === $filter)
)
```

### 3. Batch Updates
```typescript
// Instead of multiple individual updates:
caseStore.update({ status: 'active', priority: 'high', owner: userId })
// Better than:
// caseStore.setStatus('active')
// caseStore.setPriority('high')
// caseStore.setOwner(userId)
```

## 🔍 Debugging

### Check Store Contents
```typescript
import { notificationStore } from '$lib/stores/unified'

// In browser console:
let $store
notificationStore.subscribe(v => $store = v)
console.log($store)
```

### Monitor Updates
```typescript
notificationStore.subscribe(value => {
  console.log('Store updated:', value)
})
```

### Type Checking
```bash
npx tsc --noEmit --skipLibCheck
```

## 📚 More Examples

### Complete Component Example
```svelte
<script>
  import { notificationStore, caseStore } from '$lib/stores/unified'

  export let caseId

  let isLoading = false

  $: currentCase = $caseStore.cases.find(c => c.id === caseId)

  async function handleUpdate(data) {
    isLoading = true
    try {
      await caseStore.updateCase(caseId, data)
      notificationStore.success('Case updated!')
    } catch (error) {
      notificationStore.error(error.message)
    } finally {
      isLoading = false
    }
  }
</script>

{#if currentCase}
  <CaseForm {currentCase} onSubmit={handleUpdate} {isLoading} />
{:else}
  <p>Case not found</p>
{/if}
```

---

## 🎓 Learning Resources

- See: `PHASE_8_COMPLETION_REPORT.md` for full consolidation details
- See: `src/lib/stores/unified/` for store implementations
- See: `src/lib/stores/_archive/` for old implementations (reference only)

## ⚠️ Important Notes

1. **Backwards Compatible**: Old import names still work via aliases
2. **No Breaking Changes**: All existing code continues to work
3. **Gradual Migration**: Update imports at your own pace
4. **Type Safe**: Full TypeScript support
5. **Fully Reactive**: All Svelte 5 rune patterns supported
