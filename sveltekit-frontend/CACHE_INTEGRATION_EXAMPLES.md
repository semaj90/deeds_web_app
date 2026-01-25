# Cache Integration Examples

## Quick Start - Add Caching to Case Detail Page

### Before (No Cache)
```typescript
// src/routes/(app)/cases/[id]/+layout.ts
import { error } from '@sveltejs/kit';
import type { LayoutLoad } from './$types.js';

export const load: LayoutLoad = async ({ fetch, params }) => {
 const res = await fetch(`/api/v1/cases/${params.id}`);

 if (!res.ok) {
 throw error(res.status, `Failed to load case ${params.id}`);
 }

 const caseData = await response.json();

 return {
 caseData,
 };
};
```

**Issues**:
- ❌ Every navigation fetches from server
- ❌ Slow page loads (~200-500ms)
- ❌ No offline support

---

### After (With Two-Layer Cache)
```typescript
// src/routes/(app)/cases/[id]/+layout.ts
import { error } from '@sveltejs/kit';
import { browser } from '$app/environment';
import type { LayoutLoad } from './$types.js';

// Import cache service (only runs in browser)
let cache: any = null;
if (browser) {
 import('$lib/cache/cache-service.svelte').then(mod => {
 cache = mod.cache;
 });
}

export const load: LayoutLoad = async ({ fetch, params }) => {
 const cacheKey = `case-${params.id}`;

 // Try cache first (if in browser)
 if (browser && cache) {
 const cached = await cache.get(cacheKey);
 if (cached) {
 console.log('✅ Cache hit:', cacheKey);
 return { caseData: cached, fromCache: true };
 }
 }

 // Cache miss - fetch from API
 console.log('📡 Fetching from API:', cacheKey);
 const res = await fetch(`/api/v1/cases/${params.id}`);

 if (!res.ok) {
 throw error(res.status, `Failed to load case ${params.id}`);
 }

 const caseData = await res.json();

 // Save to cache (5 minute TTL)
 if (browser && cache) {
 await cache.set(cacheKey, caseData, {
 memory: true,
 persistent: true,
 ttl: 300000 // 5 minutes
 });
 console.log('💾 Cached:', cacheKey);
 }

 return { caseData };
};
```

**Benefits**:
- ✅ Sub-10ms load times on cache hit
- ✅ Works offline after first visit
- ✅ Reduced server load
- ✅ Better UX (instant navigation)

---

## Example 2: Evidence List with Smart Cache

### Component Integration
```svelte
<script lang="ts">
 import { useCache, CacheStrategies } from '$lib/cache/cache-service.svelte';
 import { onMount } from 'svelte';

 const cache = useCache();

 let evidence = $state<Evidence[]>([]);
 let loading = $state(true);
 let caseId = $props<string>();

 async function loadEvidence() {
 const cacheKey = `evidence-${caseId}`;

 // Try cache first
 const cached = await cache.get<Evidence[]>(cacheKey);
 if (cached) {
 evidence = cached;
 loading = false;
 return;
 }

 // Cache miss - fetch from API
 const res = await fetch(`/api/v1/evidence/by-case/${caseId}`);
 const data = await res.json();

 evidence = data;
 loading = false;

 // Cache with 10 minute TTL
 await cache.set(cacheKey, data, CacheStrategies.TWO_LAYER);
 }

 onMount(loadEvidence);
</script>

{#if loading}
 <p>Loading evidence...</p>
{:else}
 <ul>
 {#each evidence as item}
 <li>{item.title}</li>
 {/each}
 </ul>
{/if}
```

---

## Example 3: Cases List with Auto-Refresh

```svelte
<script lang="ts">
 import { useCache, CacheStrategies } from '$lib/cache/cache-service.svelte';
 import { onMount } from 'svelte';

 const cache = useCache();

 let cases = $state<Case[]>([]);
 let lastFetch = $state<number>(0);

 async function loadCases(forceRefresh = false) {
 const cacheKey = 'cases-list';
 const now = Date.now();

 // Auto-refresh if data is >5 minutes old
 if (!forceRefresh && now - lastFetch < 300000) {
 const cached = await cache.get<Case[]>(cacheKey);
 if (cached) {
 cases = cached;
 return;
 }
 }

 // Fetch fresh data
 const res = await fetch('/api/cases');
 const data = await res.json();

 cases = data.cases;
 lastFetch = now;

 // Cache for 5 minutes
 await cache.set(cacheKey, data.cases, {
 memory: true,
 persistent: true,
 ttl: 300000
 });
 }

 // Load on mount
 onMount(() => loadCases());

 // Auto-refresh every 5 minutes
 $effect(() => {
 const interval = setInterval(() => loadCases(true), 300000);
 return () => clearInterval(interval);
 });
</script>

<button onclick={() => loadCases(true)}>
 Refresh Cases
</button>

<ul>
 {#each cases as caseItem}
 <li>{caseItem.title}</li>
 {/each}
</ul>
```

---

## Example 4: Form Data Persistence (Auto-Save)

```svelte
<script lang="ts">
 import { useCache, CacheStrategies } from '$lib/cache/cache-service.svelte';

 const cache = useCache();

 let formData = $state({
 title: '',
 description: '',
 priority: 'medium'
 });

 // Auto-save form to cache on change
 $effect(() => {
 const key = 'draft-case-form';
 cache.set(key, formData, CacheStrategies.SESSION);
 });

 // Restore form on mount
 onMount(async () => {
 const draft = await cache.get('draft-case-form');
 if (draft) {
 formData = draft;
 console.log('✅ Restored draft from cache');
 }
 });

 async function submitForm() {
 // Submit to API
 await fetch('/api/cases', {
 method: 'POST',
 body: JSON.stringify(formData)
 });

 // Clear draft cache after successful submit
 await cache.delete('draft-case-form');
 }
</script>

<form onsubmit={submitForm}>
 <input bind:value={formData.title} placeholder="Case title" />
 <textarea bind:value={formData.description}></textarea>
 <button type="submit">Create Case</button>
</form>
```

---

## Example 5: Query Collection (LokiJS)

```svelte
<script lang="ts">
 import { useCache } from '$lib/cache/cache-service.svelte';

 const cache = useCache();

 // Insert multiple cases into memory collection
 async function cacheCases(cases: Case[]) {
 for (const caseItem of cases) {
 await cache.set(
 `case-${caseItem.id}`,
 caseItem,
 { memory: true, persistent: false, collection: 'cases' }
 );
 }
 }

 // Query high-priority cases from memory
 function getHighPriorityCases() {
 return cache.query('cases', {
 'data.priority': 'high',
 'data.status': 'active'
 });
 }

 // Query recent cases (last 7 days)
 function getRecentCases() {
 const weekAgo = Date.now() - 604800000;
 return cache.query('cases', {
 'data.createdAt': { $gt: weekAgo }
 });
 }
</script>
```

---

## Example 6: Cache Invalidation Strategy

```typescript
// src/lib/services/case-service.ts
import { cache } from '$lib/cache/cache-service.svelte';

export async function updateCase(caseId: string, updates: Partial<Case>) {
 // Update via API
 const res = await fetch(`/api/cases/${caseId}`, {
 method: 'PATCH',
 body: JSON.stringify(updates)
 });

 const updatedCase = await res.json();

 // Invalidate related caches
 await Promise.all([
 cache.delete(`case-${caseId}`), // Single case
 cache.delete('cases-list'), // Cases list
 cache.delete(`evidence-${caseId}`), // Related evidence
 cache.delete(`persons-${caseId}`) // Related persons
 ]);

 // Re-cache updated case
 await cache.set(`case-${caseId}`, updatedCase);

 console.log('✅ Cache invalidated and updated');

 return updatedCase;
}
```

---

## Example 7: Offline-First Pattern

```svelte
<script lang="ts">
 import { useCache, CacheStrategies } from '$lib/cache/cache-service.svelte';
 import { browser } from '$app/environment';

 const cache = useCache();

 let evidence = $state<Evidence[]>([]);
 let isOnline = $state(browser && navigator.onLine);
 let caseId = $props<string>();

 // Listen for online/offline events
 $effect(() => {
 if (!browser) return;

 const handleOnline = () => isOnline = true;
 const handleOffline = () => isOnline = false;

 window.addEventListener('online', handleOnline);
 window.addEventListener('offline', handleOffline);

 return () => {
 window.removeEventListener('online', handleOnline);
 window.removeEventListener('offline', handleOffline);
 };
 });

 async function loadEvidence() {
 const cacheKey = `evidence-${caseId}`;

 try {
 if (isOnline) {
 // Online: Fetch fresh data
 const res = await fetch(`/api/v1/evidence/by-case/${caseId}`);
 const data = await res.json();

 evidence = data;

 // Cache for offline use
 await cache.set(cacheKey, data, CacheStrategies.LONG_TERM);

 } else {
 // Offline: Use cached data
 const cached = await cache.get<Evidence[]>(cacheKey);

 if (cached) {
 evidence = cached;
 console.log('📴 Using offline cache');
 } else {
 throw new Error('No offline data available');
 }
 }
 } catch (error) {
 console.error('Failed to load evidence:', error);
 }
 }
</script>

{#if !isOnline}
 <div class="offline-banner">
 📴 You are offline. Showing cached data.
 </div>
{/if}
```

---

## Cache Strategies Reference

```typescript
import { CacheStrategies } from '$lib/cache/cache-service.svelte';

// Fast, not persistent (lost on reload)
CacheStrategies.MEMORY_ONLY

// Slower, survives reload
CacheStrategies.PERSISTENT_ONLY

// Best of both (recommended)
CacheStrategies.TWO_LAYER

// 5 minutes TTL
CacheStrategies.SHORT_TERM

// 24 hours TTL
CacheStrategies.LONG_TERM

// Never expires (until reload)
CacheStrategies.SESSION
```

---

## Performance Comparison

| Method | First Load | Cached Load | Offline |
|--------|-----------|------------|---------|
| No Cache | 200-500ms | 200-500ms | ❌ Fails |
| Memory Only | 200-500ms | <10ms | ❌ Lost on reload |
| IndexedDB Only | 200-500ms | ~50ms | ✅ Works |
| **Two-Layer** | 200-500ms | **<10ms** | ✅ Works |

---

## Next Steps

1. **Add to Case Detail Page**: Use Example 1 in `+layout.ts`
2. **Add to Evidence List**: Use Example 2 in evidence components
3. **Add Auto-Save**: Use Example 4 in form components
4. **Monitor Performance**: Visit `/cache-demo` to see statistics

## Cache Health Check

```typescript
import { cache } from '$lib/cache/cache-service.svelte';

const health = cache.healthCheck();
// { memory: true, persistent: true, healthy: true }

const stats = cache.getStats();
// { memoryHits: 42, persistentHits: 15, hitRate: "95.00%" }
```

## Testing

1. Visit `/cache-demo` to test cache operations
2. Open DevTools Console to see cache logs
3. Try offline mode (DevTools > Network > Offline)
4. Reload page and verify data persists
