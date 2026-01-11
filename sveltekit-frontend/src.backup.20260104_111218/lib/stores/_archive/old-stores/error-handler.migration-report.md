# Store Migration Report

**Original**: `src/lib/stores/_archive/old-stores/error-handler.ts`
**Migrated**: `src/lib/stores/_archive/old-stores/error-handler.svelte.ts`
**Date**: 2025-12-23T20:05:04.413Z

---

## Changes

### Patterns Converted

| Pattern | Before | After |
|---------|--------|-------|
| **Store Import** | `import { writable, derived } from 'svelte/store'` | ❌ Removed |
| **State** | `writable<T>()` | `$state<T>()` |
| **Computed** | `derived()` | `$derived()` |
| **Subscribe** | `store.subscribe()` | Direct property access |

### Stores Migrated



### Derived Values



### Functions Converted to Methods

- **handleError(error, any: context?: Record<string, unknown>, retryFn?: ()**
- **handleApiError(response: Response: context?: Record<string, unknown>, retryFn?: ()**
- **handleNetworkError(error, any: context?: Record<string, unknown>, retryFn?: ()**
- **handleValidationError(errors, Record<string, string[]> | string[], context?: Record<string, unknown>)**
- **handleAuthError(context?: Record<string, unknown>)**
- **handleLegalDocumentError(error, any, documentId: string, documentType: string | confidentialityLevel: string: context?: Record<string, unknown>, retryFn?: ()**
- **handleChainOfCustodyError(error, any, evidenceId: string, caseId: string | custodyAction: string: context?: Record<string, unknown>)**
- **handlePrivilegeViolation(error, any, documentId: string, caseId: string | exposedContent: string: context?: Record<string, unknown>)**
- **handleCourtFilingError(error, any, filingType: string, docketNumber: string | deadline: Date: context?: Record<string, unknown>, retryFn?: ()**

---

## Breaking Changes

### Import Path
```typescript
// Before
import {  } from 'src/lib/stores/_archive/old-stores/error-handler.ts';

// After
import {  } from 'src/lib/stores/_archive/old-stores/error-handler.svelte.ts';
```

### Usage in Components
```svelte
<!-- Before (Svelte 4) -->
<script>
  import { store } from 'src/lib/stores/_archive/old-stores/error-handler.ts';

  let value;
  const unsubscribe = store.subscribe(v => value = v);
  onDestroy(unsubscribe);
</script>

<!-- After (Svelte 5) -->
<script>
  import { store } from 'src/lib/stores/_archive/old-stores/error-handler.svelte.ts';

  // Direct reactive access
  let value = $derived(store.undefined);
</script>
```

---

## Testing Checklist

- [ ] No TypeScript errors: `npm run check`
- [ ] Import paths updated in all components
- [ ] Functionality preserved (run tests)
- [ ] No console errors in browser
- [ ] Reactivity works correctly

---

## Rollback

If migration causes issues:

```bash
# Restore original file
cp src/lib/stores/_archive/old-stores/error-handler.ts.svelte4.backup src/lib/stores/_archive/old-stores/error-handler.ts

# Delete migrated version
rm src/lib/stores/_archive/old-stores/error-handler.svelte.ts
rm src/lib/stores/_archive/old-stores/error-handler.migration-report.md
```
