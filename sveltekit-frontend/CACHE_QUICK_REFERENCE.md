# Cache System Quick Reference

## 🚀 Quick Start

### Basic Usage
```typescript
import { cache } from '$lib/cache/cache-service.svelte';

// Set data in cache
await cache.set('user-profile', userData, {
  memory: true,      // Store in memory (fast)
  persistent: true,  // Store in IndexedDB (survives reload)
  ttl: 300000       // 5 minutes
});

// Get data from cache
const user = await cache.get<User>('user-profile');

// Delete from cache
await cache.delete('user-profile');

// Clear all cache
await cache.clear();
```

### Predefined Strategies
```typescript
import { CacheStrategies } from '$lib/cache/cache-service.svelte';

// Memory only (fastest, lost on reload)
await cache.set('temp-data', data, CacheStrategies.MEMORY_ONLY);

// Persistent only (slower, survives reload)
await cache.set('user-settings', settings, CacheStrategies.PERSISTENT_ONLY);

// Two-layer (recommended - fast + persistent)
await cache.set('case-detail', caseData, CacheStrategies.TWO_LAYER);

// Short-term (5 minutes TTL)
await cache.set('search-results', results, CacheStrategies.SHORT_TERM);

// Long-term (24 hours TTL)
await cache.set('user-profile', profile, CacheStrategies.LONG_TERM);
```

## 🔑 Standardized Cache Keys

```typescript
import { CacheKeys } from '$lib/cache/cache-invalidation';

// Cases
CacheKeys.CASES_LIST                    // 'cases-list'
CacheKeys.CASE_DETAIL('123')            // 'case-123'
CacheKeys.CASE_EVIDENCE('123')          // 'case-123-evidence'
CacheKeys.CASE_TIMELINE('123')          // 'case-123-timeline'

// Users
CacheKeys.USER_PROFILE('user-id')       // 'user-user-id'
CacheKeys.USER_SETTINGS('user-id')      // 'user-user-id-settings'

// Dashboard
CacheKeys.DASHBOARD_STATS               // 'dashboard-stats'
CacheKeys.RECENT_ACTIVITY               // 'recent-activity'

// Search
CacheKeys.SEARCH_RESULTS('query')       // 'search-query'

// Legal
CacheKeys.LEGAL_ANALYSIS('case-id')     // 'legal-analysis-case-id'
CacheKeys.CITATIONS('doc-id')           // 'citations-doc-id'
```

## 🗑️ Cache Invalidation

```typescript
import { CacheInvalidation } from '$lib/cache/cache-invalidation';

// Invalidate all case caches
await CacheInvalidation.invalidateAllCases();

// Invalidate specific case
await CacheInvalidation.invalidateCase('case-123');

// Invalidate evidence for a case
await CacheInvalidation.invalidateEvidence('case-123');

// Invalidate user caches
await CacheInvalidation.invalidateUser('user-id');

// Invalidate dashboard
await CacheInvalidation.invalidateDashboard();

// Invalidate search
await CacheInvalidation.invalidateSearch('query');
```

## 🔥 Cache Warming

```typescript
import { CacheWarming } from '$lib/cache/cache-invalidation';

// Pre-load dashboard data
await CacheWarming.warmDashboard(fetch);

// Pre-load case list
await CacheWarming.warmCaseList(fetch);
```

## 📊 Monitoring

```typescript
import { CacheMonitoring } from '$lib/cache/cache-invalidation';

// Check health
const health = await CacheMonitoring.getHealth();
console.log(health.isHealthy); // true/false

// Get statistics
const stats = CacheMonitoring.getStats();
console.log(`Hit rate: ${stats.hitRate}%`);

// Log metrics to console
CacheMonitoring.logMetrics();
```

## 🌐 Offline-First Helpers

```typescript
import { offlineFetch, offlineMutate } from '$lib/cache/offline-fetch';

// Fetch with offline fallback
const data = await offlineFetch<CaseData>('/api/cases/123', {
  cacheKey: CacheKeys.CASE_DETAIL('123'),
  ttl: 300000,        // 5 minutes
  forceFresh: false   // Use cache if available
});

// Mutation with offline queuing
await offlineMutate('/api/cases/123', {
  method: 'PATCH',
  body: JSON.stringify({ status: 'closed' })
}, [
  CacheKeys.CASE_DETAIL('123'),
  CacheKeys.CASES_LIST
]);
```

## 🎯 Route Integration Patterns

### Server + Client Caching
```typescript
// +page.server.ts
export const load: PageServerLoad = async ({ locals }) => {
  const cases = await db.query.cases.findMany();
  return { cases };
};

// +page.ts
import { cache } from '$lib/cache/cache-service.svelte';
import { CacheKeys } from '$lib/cache/cache-invalidation';

export const load: PageLoad = async ({ data }) => {
  const cacheKey = CacheKeys.CASES_LIST;

  // Try cache first
  const cached = await cache.get<typeof data>(cacheKey);
  if (cached) return cached;

  // Cache server data
  await cache.set(cacheKey, data, {
    memory: true,
    persistent: true,
    ttl: 5 * 60 * 1000 // 5 minutes
  });

  return data;
};
```

### Form Auto-Save
```typescript
// +page.svelte
<script lang="ts">
  import { cache } from '$lib/cache/cache-service.svelte';

  let formData = $state({ title: '', description: '' });
  let draftKey = 'case-draft';

  // Load draft on mount
  onMount(async () => {
    const draft = await cache.get(draftKey);
    if (draft) formData = draft;
  });

  // Auto-save with debounce
  $effect(() => {
    const timer = setTimeout(async () => {
      await cache.set(draftKey, formData, {
        memory: true,
        persistent: true,
        ttl: 24 * 60 * 60 * 1000 // 24 hours
      });
    }, 1500);

    return () => clearTimeout(timer);
  });
</script>
```

### Action with Cache Invalidation
```typescript
// +page.server.ts
import { CacheInvalidation } from '$lib/cache/cache-invalidation';

export const actions = {
  uploadEvidence: async ({ request, params }) => {
    const formData = await request.formData();

    // Upload logic...
    await uploadToStorage(formData);

    // Invalidate related caches
    await CacheInvalidation.invalidateEvidence(params.id);

    return { success: true };
  }
};
```

## 📈 Performance Tips

### 1. Choose the Right Strategy
- **Memory-only**: Temporary UI state, computed values
- **Persistent-only**: User preferences, rarely accessed data
- **Two-layer**: Most API responses, frequently accessed data

### 2. Set Appropriate TTL
```typescript
// Real-time data (e.g., notifications)
ttl: 30000           // 30 seconds

// Semi-real-time (e.g., dashboard stats)
ttl: 5 * 60 * 1000   // 5 minutes

// Mostly static (e.g., user profile)
ttl: 60 * 60 * 1000  // 1 hour

// Very static (e.g., legal citations)
ttl: 24 * 60 * 60 * 1000  // 24 hours
```

### 3. Invalidate Smart
```typescript
// ✅ Good: Invalidate specific caches
await CacheInvalidation.invalidateCase(caseId);

// ❌ Bad: Clear everything
await cache.clear();
```

### 4. Warm Critical Paths
```typescript
// On app load
onMount(async () => {
  await CacheWarming.warmDashboard(fetch);
});
```

## 🧪 Testing with Cache

```typescript
import { vi } from 'vitest';
import { cache } from '$lib/cache/cache-service.svelte';

beforeEach(() => {
  // Clear cache before each test
  cache.clear();
});

test('should use cached data', async () => {
  // Set up cache
  await cache.set('test-key', { id: 1, name: 'Test' });

  // Test component that uses cache
  const result = await cache.get('test-key');
  expect(result).toEqual({ id: 1, name: 'Test' });
});
```

## 🎨 UI Components

### Cache Monitor
```svelte
<script>
  import CacheMonitor from '$lib/components/cache/CacheMonitor.svelte';
</script>

<CacheMonitor />
```

### Offline Indicator
```svelte
<script>
  import OfflineIndicator from '$lib/components/cache/OfflineIndicator.svelte';
</script>

<OfflineIndicator />
```

## 🐛 Debugging

### Enable Cache Logging
```typescript
// Check console for:
// ✅ Cache hit: cases-list
// 📡 Cache miss: using fresh data
// 💾 Cached: user-profile
// 🗑️ Invalidated caches for case 123
```

### Inspect Cache State
```typescript
// Chrome DevTools → Application → IndexedDB → "cache-db"
// Check stored values and TTLs

// Or programmatically:
const stats = cache.getStats();
console.table(stats);
```

### Monitor Health
```typescript
const health = await cache.health();
if (!health.isHealthy) {
  console.error('Cache system unhealthy:', health);
}
```

## 📚 Further Reading

- [CACHE_SYSTEM_IMPLEMENTATION.md](./CACHE_SYSTEM_IMPLEMENTATION.md) - Full architecture
- [CACHE_TESTING_GUIDE.md](./CACHE_TESTING_GUIDE.md) - Testing strategies
- [CACHE_INTEGRATION_EXAMPLES.md](./CACHE_INTEGRATION_EXAMPLES.md) - Real-world examples

## 🎯 Common Patterns

### Pattern: API with Cache
```typescript
async function fetchCaseDetail(id: string) {
  const cacheKey = CacheKeys.CASE_DETAIL(id);

  // Try cache
  const cached = await cache.get<CaseDetail>(cacheKey);
  if (cached) return cached;

  // Fetch from API
  const response = await fetch(`/api/cases/${id}`);
  const data = await response.json();

  // Cache result
  await cache.set(cacheKey, data, CacheStrategies.TWO_LAYER);

  return data;
}
```

### Pattern: Mutation + Invalidation
```typescript
async function updateCase(id: string, updates: Partial<Case>) {
  // Perform mutation
  await fetch(`/api/cases/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates)
  });

  // Invalidate affected caches
  await CacheInvalidation.invalidateCase(id);
}
```

### Pattern: Optimistic Updates
```typescript
async function optimisticUpdate(id: string, updates: Partial<Case>) {
  const cacheKey = CacheKeys.CASE_DETAIL(id);

  // Get current cached data
  const current = await cache.get<Case>(cacheKey);

  // Update cache optimistically
  await cache.set(cacheKey, { ...current, ...updates });

  try {
    // Perform actual update
    await fetch(`/api/cases/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  } catch (error) {
    // Rollback on error
    await cache.set(cacheKey, current);
    throw error;
  }
}
```
