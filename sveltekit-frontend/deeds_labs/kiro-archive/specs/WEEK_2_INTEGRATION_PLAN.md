# Week 2 Integration Plan - Ready to Execute

## 🎯 Objective

Integrate the 7 core services from Week 1 into the SvelteKit application and deploy to staging.

---

## 📋 Tasks Overview

### Task 1: Create 3 Clustering Endpoints
**Time**: Monday-Tuesday (4-6 hours)

### Task 2: Wire into XState Machine
**Time**: Tuesday-Wednesday (3-4 hours)

### Task 3: Update UI Components
**Time**: Wednesday-Thursday (4-5 hours)

### Task 4: Test All Services
**Time**: Thursday (4-6 hours)

### Task 5: Deploy to Staging
**Time**: Friday (2-3 hours)

---

## 📌 Task 1: Create 3 Clustering Endpoints

### Endpoint 1: `/api/clustering/train-som`

**File**: `src/routes/api/clustering/train-som/+server.ts`

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainSOM } from '$lib/server/services/clustering/som-service';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { embeddings, width = 10, height = 10, epochs = 100 } = await request.json();

    if (!embeddings || embeddings.length === 0) {
      return json({ error: 'No embeddings provided' }, { status: 400 });
    }

    console.log(`Training SOM: ${embeddings.length} embeddings, ${width}x${height} grid, ${epochs} epochs`);

    const somGrid = await trainSOM(embeddings, { width, height, epochs });

    return json({
      success: true,
      somGrid,
      stats: {
        neuronCount: width * height,
        embeddingCount: embeddings.length,
        embeddingDim: embeddings[0].length,
      },
    });
  } catch (error) {
    console.error('SOM training error:', error);
    return json(
      { error: error instanceof Error ? error.message : 'SOM training failed' },
      { status: 500 }
    );
  }
};
```

### Endpoint 2: `/api/clustering/run-kmeans`

**File**: `src/routes/api/clustering/run-kmeans/+server.ts`

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runKMeans, assignStatutesToClusters, generateClusterLabels } from '$lib/server/services/clustering/kmeans-service';
import { getSOMCentroids } from '$lib/server/services/clustering/som-service';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { somGrid, statutes, k = 8, confidenceThreshold = 0.7 } = await request.json();

    if (!somGrid || !statutes) {
      return json({ error: 'Missing somGrid or statutes' }, { status: 400 });
    }

    console.log(`Running K-Means: ${statutes.length} statutes, k=${k}`);

    // Get centroids from SOM
    const centroids = getSOMCentroids(somGrid);

    // Run K-Means
    const clusters = await runKMeans(centroids, k, 100);

    // Assign statutes to clusters
    const assignments = await assignStatutesToClusters(statutes, clusters, confidenceThreshold);

    // Generate labels
    const labels = await generateClusterLabels(clusters, statutes);

    // Map labels to assignments
    const assignmentsWithLabels = assignments.map((a) => ({
      ...a,
      label: labels.get(a.clusterId) || `Cluster ${a.clusterId}`,
    }));

    return json({
      success: true,
      clusters,
      assignments: assignmentsWithLabels,
      stats: {
        clusterCount: clusters.length,
        statuteCount: statutes.length,
        avgConfidence: assignments.reduce((sum, a) => sum + a.confidence, 0) / assignments.length,
        flaggedCount: assignments.filter((a) => a.flaggedForReview).length,
      },
    });
  } catch (error) {
    console.error('K-Means error:', error);
    return json(
      { error: error instanceof Error ? error.message : 'K-Means clustering failed' },
      { status: 500 }
    );
  }
};
```

### Endpoint 3: `/api/clustering/detect-changes`

**File**: `src/routes/api/clustering/detect-changes/+server.ts`

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { detectChanges, emitOperatorAlert, storeChangeHistory, generateChangeReport } from '$lib/server/services/clustering/change-detection-service';
import { getRedisJSONStore } from '$lib/server/services/persistence/redis-json-schema';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { jobId, previousLabels = {}, currentLabels = {}, changeThreshold = 0.2 } = await request.json();

    if (!jobId || !currentLabels) {
      return json({ error: 'Missing jobId or currentLabels' }, { status: 400 });
    }

    console.log(`Detecting changes for job ${jobId}`);

    // Convert to Maps
    const prevMap = new Map(Object.entries(previousLabels));
    const currMap = new Map(Object.entries(currentLabels));

    // Detect changes
    const result = await detectChanges(prevMap, currMap, changeThreshold);

    // Emit alert if needed
    if (result.shouldAlert) {
      await emitOperatorAlert(result);
    }

    // Store history
    await storeChangeHistory(jobId, result);

    // Store in Redis
    const redisStore = await getRedisJSONStore();
    await redisStore.storeClusteringJob(jobId, {
      status: 'completed',
      startedAt: Date.now(),
      completedAt: Date.now(),
      retryCount: 0,
      result: {
        changePercentage: result.changePercentage,
        changedCount: result.changedCount,
        totalCount: result.totalCount,
        shouldAlert: result.shouldAlert,
      },
    });

    return json({
      success: true,
      ...result,
      report: generateChangeReport(result),
    });
  } catch (error) {
    console.error('Change detection error:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Change detection failed' },
      { status: 500 }
    );
  }
};
```

---

## 📌 Task 2: Wire into XState Machine

### Update XState Machine

**File**: `src/lib/server/services/clustering/xstate-machine.ts`

Update the actors to use the new services:

```typescript
import { trainSOM, getSOMCentroids } from './som-service';
import { runKMeans, assignStatutesToClusters, generateClusterLabels } from './kmeans-service';
import { detectChanges, emitOperatorAlert, storeChangeHistory } from './change-detection-service';

// Update somActor
somActor: async ({ context }: { context: ClusteringContext }) => {
  const embeddings = context.statutes
    .filter((s) => s.embedding)
    .map((s) => s.embedding as number[]);

  if (embeddings.length === 0) {
    throw new Error('No embeddings available for SOM training');
  }

  console.log(`SOM: Training on ${embeddings.length} embeddings`);

  const somGrid = await trainSOM(embeddings, {
    width: 10,
    height: 10,
    epochs: 100,
  });

  console.log(`SOM: Training complete`);

  return { ...context, somGrid };
},

// Update kmeansActor
kmeansActor: async ({ context }: { context: ClusteringContext }) => {
  if (!context.somGrid) throw new Error('SOM grid missing');

  console.log(`K-Means: Clustering ${context.statutes.length} statutes`);

  const centroids = getSOMCentroids(context.somGrid);
  const clusters = await runKMeans(centroids, 8, 100);
  const assignments = await assignStatutesToClusters(context.statutes, clusters, 0.7);
  const labels = await generateClusterLabels(clusters, context.statutes);

  const currentLabels = new Map<string, string>();
  for (const a of assignments) {
    currentLabels.set(a.statuteId, labels.get(a.clusterId) || `Cluster ${a.clusterId}`);
  }

  console.log(`K-Means: Complete, ${clusters.length} clusters`);

  return {
    ...context,
    kmeansClusters: clusters,
    currentLabels,
  };
},

// Update indexingActor
indexingActor: async ({ context }: { context: ClusteringContext }) => {
  const previousLabels = context.previousLabels ?? new Map();
  const currentLabels = context.currentLabels ?? new Map();

  console.log(`Change Detection: Comparing ${currentLabels.size} statutes`);

  const result = await detectChanges(previousLabels, currentLabels, 0.2);

  if (result.shouldAlert) {
    console.warn(`⚠️ Alert: ${result.alertMessage}`);
    await emitOperatorAlert(result);
  }

  await storeChangeHistory(context.jobId, result);

  console.log(`Change Detection: Complete, ${result.changePercentage * 100}% changed`);

  return {
    ...context,
    changePercentage: result.changePercentage,
    version: context.version + 1,
  };
},
```

---

## 📌 Task 3: Update UI Components

### Update Statute Detail Page

**File**: `src/routes/laws/[state]/[sectionId]/+page.svelte`

```svelte
<script lang="ts">
  import { statuteClusterMap, clusterCategories } from '$lib/stores/clustering';
  import StatuteActionPanel from '$lib/components/legal/StatuteActionPanel.svelte';
  import WorkspacePanel from '$lib/components/legal/WorkspacePanel.svelte';
  import CategoryBadge from '$lib/components/legal/CategoryBadge.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  $: metadata = $statuteClusterMap.get(data.section.id);
  $: category = metadata ? $clusterCategories.find(c => c.id === metadata.clusterId) : null;
</script>

<div class="statute-detail-page">
  {#if data.error}
    <div class="error-message">
      <p>{data.error}</p>
      <a href="/laws" class="back-link">← Back to Laws</a>
    </div>
  {:else if data.section}
    <header class="page-header">
      <a href="/laws" class="back-link">← Back to Laws</a>
      <h1>{data.section.fullCitation}</h1>
      {#if data.section.heading}
        <h2 class="statute-heading">{data.section.heading}</h2>
      {/if}

      {#if category}
        <div class="cluster-badge-container">
          <CategoryBadge {category} />
        </div>
      {/if}
    </header>

    <div class="statute-content">
      <section class="statute-text">
        <h3>Statute Text</h3>
        <div class="text-content">
          {data.section.text}
        </div>
      </section>

      <StatuteActionPanel
        statute={{
          titleNumber: data.section.titleNumber,
          section: data.section.section,
          id: data.section.id,
          fullCitation: data.section.fullCitation,
          text: data.section.text,
          heading: data.section.heading,
        }}
        relatedCases={data.relatedCases}
      />

      <WorkspacePanel workspaceId={data.section.id} />

      {#if data.relatedCases && data.relatedCases.length > 0}
        <section class="related-cases">
          <h3>Related Cases ({data.relatedCases.length})</h3>
          <div class="cases-list">
            {#each data.relatedCases as caseChunk (caseChunk.chunk_id)}
              <div class="case-item">
                <h4>{caseChunk.case_name}</h4>
                <p class="case-meta">
                  <span class="badge">{caseChunk.crime_code}</span>
                  <span class="badge">{caseChunk.crime_category}</span>
                </p>
                <p class="case-text">
                  {caseChunk.text.substring(0, 300)}...
                </p>
                <p class="case-score">
                  Relevance: {(caseChunk.score * 100).toFixed(0)}%
                </p>
              </div>
            {/each}
          </div>
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .statute-detail-page {
    padding: 2rem;
    max-width: 900px;
    margin: 0 auto;
  }

  .page-header {
    margin-bottom: 2rem;
  }

  .back-link {
    display: inline-block;
    margin-bottom: 1rem;
    color: #0066cc;
    text-decoration: none;
    font-weight: 500;
    transition: color 0.2s;
  }

  .back-link:hover {
    color: #0052a3;
  }

  .page-header h1 {
    font-size: 2rem;
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
    font-family: monospace;
  }

  .statute-heading {
    font-size: 1.25rem;
    margin: 0 0 1rem 0;
    color: #666;
    font-weight: 500;
  }

  .cluster-badge-container {
    margin-top: 1rem;
  }

  .statute-content {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  section {
    background: white;
    padding: 1.5rem;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
  }

  section h3 {
    margin: 0 0 1rem 0;
    color: #1a1a1a;
    font-size: 1.1rem;
  }

  .text-content {
    line-height: 1.6;
    color: #333;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .cases-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .case-item {
    padding: 1rem;
    background: #f9f9f9;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
  }

  .case-item h4 {
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
  }

  .case-meta {
    margin: 0.5rem 0;
    display: flex;
    gap: 0.5rem;
  }

  .badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    background: #e8f0ff;
    border-radius: 4px;
    font-size: 0.875rem;
    color: #0066cc;
  }

  .case-text {
    margin: 0.5rem 0;
    color: #666;
    font-size: 0.9rem;
  }

  .case-score {
    margin: 0.5rem 0 0 0;
    color: #999;
    font-size: 0.875rem;
  }

  .error-message {
    padding: 1.5rem;
    background: #fff3cd;
    border: 1px solid #ffc107;
    border-radius: 8px;
    color: #856404;
  }
</style>
```

---

## 📌 Task 4: Test All Services

### Test Checklist

```typescript
// Test 1: SOM Training
const somResponse = await fetch('/api/clustering/train-som', {
  method: 'POST',
  body: JSON.stringify({
    embeddings: Array.from({ length: 100 }, () =>
      Array.from({ length: 768 }, () => Math.random())
    ),
    width: 10,
    height: 10,
    epochs: 50,
  }),
});
console.log('✓ SOM Training:', await somResponse.json());

// Test 2: K-Means Clustering
const kmeansResponse = await fetch('/api/clustering/run-kmeans', {
  method: 'POST',
  body: JSON.stringify({
    somGrid: somGrid,
    statutes: Array.from({ length: 100 }, (_, i) => ({
      id: `statute-${i}`,
      embedding: Array.from({ length: 768 }, () => Math.random()),
    })),
    k: 8,
  }),
});
console.log('✓ K-Means:', await kmeansResponse.json());

// Test 3: Change Detection
const changeResponse = await fetch('/api/clustering/detect-changes', {
  method: 'POST',
  body: JSON.stringify({
    jobId: 'test-job-1',
    previousLabels: { 'statute-1': 'Violent Crimes' },
    currentLabels: { 'statute-1': 'Fraud' },
  }),
});
console.log('✓ Change Detection:', await changeResponse.json());
```

---

## 📌 Task 5: Deploy to Staging

### Deployment Steps

1. **Build SvelteKit**
   ```bash
   npm run build
   ```

2. **Run Tests**
   ```bash
   npm run test
   ```

3. **Deploy to Staging**
   ```bash
   npm run deploy:staging
   ```

4. **Verify Endpoints**
   ```bash
   curl http://staging.example.com/api/clustering/train-som
   curl http://staging.example.com/api/clustering/run-kmeans
   curl http://staging.example.com/api/clustering/detect-changes
   ```

5. **Monitor Logs**
   ```bash
   tail -f logs/staging.log
   ```

---

## ✅ Success Criteria

- [ ] All 3 endpoints created and responding
- [ ] XState machine orchestrating correctly
- [ ] UI showing cluster badges
- [ ] All services tested
- [ ] Deployed to staging
- [ ] No errors in logs
- [ ] Performance targets met

---

## 📞 Support

See `THIS_WEEK_IMPLEMENTATION.md` for detailed integration guide.

---

**Status**: ✅ READY FOR WEEK 2
**Timeline**: 5 days
**Deliverable**: Production-ready clustering system in staging

Let's go! 🚀
