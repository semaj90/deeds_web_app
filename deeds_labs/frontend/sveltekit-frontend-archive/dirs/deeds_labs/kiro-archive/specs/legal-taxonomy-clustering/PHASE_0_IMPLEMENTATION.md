# Phase 0: Clustering System Implementation Guide

## 🎯 What You're Implementing

This phase wires together:
1. **XState Machine** - Orchestrates clustering workflow
2. **Qdrant Payloads** - Stores cluster metadata
3. **Taxonomy Types & Stores** - UI data contracts
4. **CategoryBadge Component** - Visual cluster display

---

## 📁 Files Created

### Backend Services
```
sveltekit-frontend/src/lib/server/services/clustering/
├── xstate-machine.ts          # State machine definition
└── orchestrator.ts            # Workflow runner
```

### Frontend Types & Stores
```
sveltekit-frontend/src/lib/
├── taxonomy/
│   └── types.ts               # Cluster data types
└── stores/
    └── clustering.ts          # Svelte stores
```

### Scripts
```
scripts/
└── migrate-qdrant-clusters.ts # Qdrant payload migration
```

---

## 🚀 Implementation Steps

### Step 1: Run Qdrant Migration

```bash
# Make script executable
chmod +x scripts/migrate-qdrant-clusters.ts

# Run migration
QDRANT_URL=http://localhost:6333 npx ts-node scripts/migrate-qdrant-clusters.ts
```

**What it does**:
- Adds clustering fields to all statute vectors in Qdrant
- Sets defaults: `som_cluster_id=-1`, `kmeans_label="Unclustered"`, etc.
- Preserves existing payload data

**Expected output**:
```
🚀 Starting Qdrant migration for clustering payloads...
   Collection: statutes
   Batch size: 256

📖 Fetching batch (offset: 0)...
   Updating 256 points...
   ✓ Updated 256 points (total: 256)
...
✅ Migration complete!
   Total points updated: 1024
```

### Step 2: Add Clustering API Endpoints

Create these endpoints in your SvelteKit app:

**`src/routes/api/clustering/enqueue/+server.ts`**:
```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { publishClusteringJob } from '$lib/server/services/clustering/rabbitmq';

export const POST: RequestHandler = async ({ request }) => {
  const { jobId, statuteIds } = await request.json();

  await publishClusteringJob({
    id: jobId,
    type: 'NEW_DATA',
    statutes: statuteIds,
    timestamp: new Date(),
    retryCount: 0,
    maxRetries: 3,
  });

  return json({ success: true, jobId });
};
```

**`src/routes/api/clustering/som-train/+server.ts`**:
```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainSOM } from '$lib/server/services/clustering/som-service';

export const POST: RequestHandler = async ({ request }) => {
  const { embeddings, width, height, epochs } = await request.json();

  const somGrid = await trainSOM(embeddings, { width, height, epochs });

  return json({ somGrid });
};
```

**`src/routes/api/clustering/kmeans-cluster/+server.ts`**:
```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runKMeans, assignStatutesToClusters, generateClusterLabels } from '$lib/server/services/clustering/kmeans-service';
import { getSOMCentroids } from '$lib/server/services/clustering/som-service';

export const POST: RequestHandler = async ({ request }) => {
  const { somGrid, statutes, k, confidenceThreshold } = await request.json();

  const centroids = getSOMCentroids(somGrid);
  const kmeansClusters = await runKMeans(centroids, k, 100);
  const assignments = await assignStatutesToClusters(statutes, kmeansClusters, confidenceThreshold);
  const labels = await generateClusterLabels(kmeansClusters, statutes);

  const currentLabels: Record<string, string> = {};
  for (const a of assignments) {
    currentLabels[a.statuteId] = a.label;
  }

  return json({ kmeansClusters, currentLabels });
};
```

**`src/routes/api/clustering/index-update/+server.ts`**:
```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { detectChanges, storeChangeHistory, emitOperatorAlert } from '$lib/server/services/clustering/change-detection';
import { updateQdrantPayloads } from '$lib/server/services/qdrant-indexing-service';

export const POST: RequestHandler = async ({ request }) => {
  const { jobId, previousLabels, currentLabels, version } = await request.json();

  const result = await detectChanges(new Map(Object.entries(previousLabels)), new Map(Object.entries(currentLabels)), 0.2);

  if (result.shouldAlert) {
    await emitOperatorAlert(result);
  }

  await storeChangeHistory(jobId, result);
  await updateQdrantPayloads(new Map(Object.entries(currentLabels)), version);

  return json({ changePercentage: result.changePercentage, version });
};
```

### Step 3: Wire Stores into Search Results

**`src/lib/components/legal/SearchResults.svelte`**:
```svelte
<script lang="ts">
  import { statuteClusterMap, clusterCategories } from '$lib/stores/clustering';
  import CategoryBadge from './CategoryBadge.svelte';

  export let results: any[] = [];

  $: categories = $clusterCategories;
  $: metadata = $statuteClusterMap;
</script>

<div class="results">
  {#each results as result (result.id)}
    <div class="result-item">
      <h3>{result.fullCitation}</h3>
      <p>{result.text.substring(0, 200)}...</p>

      {#if metadata.has(result.id)}
        {@const meta = metadata.get(result.id)}
        {@const category = categories.find(c => c.id === meta.clusterId)}
        {#if category}
          <CategoryBadge {category} />
        {/if}
      {/if}
    </div>
  {/each}
</div>

<style>
  .results {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .result-item {
    padding: 1rem;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
  }
</style>
```

### Step 4: Create CategoryBadge Component

**`src/lib/components/legal/CategoryBadge.svelte`**:
```svelte
<script lang="ts">
  import { Dialog } from 'bits-ui';
  import { fly, fade } from 'svelte/transition';
  import type { ClusterCategory } from '$lib/taxonomy/types';
  import { CLUSTER_COLORS } from '$lib/taxonomy/types';

  export let category: ClusterCategory;
  export let onSimilar: ((category: ClusterCategory) => void) | undefined = undefined;

  let open = false;

  $: badgeClass = CLUSTER_COLORS[category.colorToken];
</script>

<span
  class={`inline-flex items-center px-2 py-0.5 text-[0.7rem] rounded border cursor-pointer ${badgeClass}`}
  role="button"
  tabindex="0"
  on:click={() => (open = true)}
  on:keydown={(e) => e.key === 'Enter' && (open = true)}
>
  {category.icon ?? '📌'} {category.label}
</span>

<Dialog.Root bind:open>
  <Dialog.Overlay class="fixed inset-0 z-50 bg-black/10" />
  <Dialog.Content
    class="fixed z-50 max-w-xs w-[18rem] bg-white rounded-md shadow-lg border border-slate-200 p-3 text-sm top-[12vh] left-1/2 -translate-x-1/2"
    transition:fly={{ y: 16, duration: 180 }}
    transition:fade={{ duration: 150 }}
  >
    <header class="font-semibold mb-1">
      {category.icon ?? '📌'} {category.label}
    </header>
    <p class="text-xs text-slate-700 mb-2">
      {category.description}
    </p>

    <p class="text-[0.7rem] text-slate-500 mb-2">
      Statutes: {category.statuteCount} · Avg confidence: {(category.avgConfidence * 100).toFixed(1)}%
    </p>

    {#if onSimilar}
      <button
        class="mt-1 inline-flex items-center px-2 py-1 rounded border text-[0.7rem] border-slate-300 hover:bg-slate-50"
        on:click={() => {
          onSimilar(category);
          open = false;
        }}
      >
        🔍 Search similar statutes
      </button>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<style>
  span {
    transition: all 0.2s;
  }

  span:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
</style>
```

### Step 5: Load Cluster Data on App Start

**`src/routes/+layout.server.ts`**:
```typescript
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ fetch }) => {
  try {
    // Load cluster categories
    const res = await fetch('/api/clustering/categories');
    const { categories } = await res.json();

    return { categories };
  } catch (error) {
    console.error('Failed to load cluster categories:', error);
    return { categories: [] };
  }
};
```

**`src/routes/+layout.svelte`**:
```svelte
<script lang="ts">
  import { updateClusterCategories } from '$lib/stores/clustering';

  export let data;

  $: if (data.categories) {
    updateClusterCategories(data.categories);
  }
</script>

<slot />
```

---

## 🧪 Testing Phase 0

### Test 1: Verify Qdrant Payloads
```bash
curl -X POST http://localhost:6333/collections/statutes/points/scroll \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 1,
    "with_payload": true,
    "with_vector": false
  }' | jq '.result.points[0].payload'
```

Expected output includes:
```json
{
  "som_cluster_id": -1,
  "kmeans_label": "Unclustered",
  "cluster_confidence": 0.0,
  "flagged_for_review": false,
  "echo_hits": 0,
  "cluster_version": 0
}
```

### Test 2: Verify Stores
```svelte
<script>
  import { clusterCategories, selectedClusters } from '$lib/stores/clustering';
</script>

<p>Categories: {$clusterCategories.length}</p>
<p>Selected: {$selectedClusters.size}</p>
```

### Test 3: Verify XState Machine
```typescript
import { createActor } from 'xstate';
import { clusteringMachineDef } from '$lib/server/services/clustering/xstate-machine';

const actor = createActor(clusteringMachineDef, {
  input: {
    jobId: 'test-123',
    statutes: [],
    version: 0,
    retryCount: 0,
  },
});

actor.subscribe((snapshot) => {
  console.log('State:', snapshot.value);
});

actor.start();
actor.send({ type: 'START' });
```

---

## 📊 What's Next

After Phase 0, you'll have:
✅ XState machine orchestrating clustering workflow
✅ Qdrant payloads ready for cluster metadata
✅ Taxonomy types and stores for UI
✅ CategoryBadge component for visual display

Then move to Phase 1:
- Implement SOM training service
- Implement K-Means clustering service
- Implement change detection service
- Wire into Go microservice

---

## 🔗 File Dependencies

```
xstate-machine.ts
  ↓ (uses)
orchestrator.ts
  ↓ (calls)
/api/clustering/enqueue
/api/clustering/som-train
/api/clustering/kmeans-cluster
/api/clustering/index-update
  ↓ (updates)
Qdrant (via updateQdrantPayloads)
  ↓ (read by)
SearchResults.svelte
  ↓ (displays)
CategoryBadge.svelte
  ↓ (uses)
clustering.ts (stores)
  ↓ (reads)
types.ts (types)
```

---

**Status**: Phase 0 Implementation Guide Complete
**Next**: Execute steps 1-5 above
