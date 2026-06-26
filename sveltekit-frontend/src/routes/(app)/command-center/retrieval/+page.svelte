<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  interface Cluster {
    id: string;
    label: string;
    packetCount: number;
    authority: number;
    durationMs: number;
  }

  let clusters = $state<Cluster[]>([]);
  let total = $state(0);
  let offset = $state(0);
  let limit = $state(20);
  let hasMore = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let sortBy = $state<'authority' | 'packetCount'>('authority');
  let order = $state<'asc' | 'desc'>('desc');

  async function loadClusters() {
    loading = true;
    error = null;

    try {
      const url = new URL('/api/admin/retrieval/clusters', window.location.origin);
      url.searchParams.set('limit', limit.toString());
      url.searchParams.set('offset', offset.toString());
      url.searchParams.set('sortBy', sortBy);
      url.searchParams.set('order', order);

      const response = await fetch(url.toString());
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const result = (await response.json()) as {
        clusters: Cluster[];
        total: number;
        hasMore: boolean;
      };
      clusters = result.clusters;
      total = result.total;
      hasMore = result.hasMore;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load clusters';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadClusters();
  });

  function formatAuthority(auth: number): string {
    const pct = Math.round(auth * 100);
    return `${pct}%`;
  }
</script>

<div class="space-y-6 p-6">
  <div class="mb-8">
    <h1 class="text-3xl font-bold">Retrieval Index</h1>
    <p class="text-gray-500 mt-2">SOM Clusters from Go search service (Qdrant + BM25)</p>
  </div>

  {#if error}
    <div class="bg-red-50 border border-red-200 rounded p-4 text-red-700">
      {error}
    </div>
  {/if}

  <div class="flex gap-4 items-end">
    <div>
      <label class="text-sm font-medium text-gray-700">Sort</label>
      <select
        bind:value={sortBy}
        onchange={() => {
          offset = 0;
          loadClusters();
        }}
        class="mt-1 px-3 py-2 border border-gray-300 rounded"
      >
        <option value="authority">Authority</option>
        <option value="packetCount">Count</option>
      </select>
    </div>
    <div>
      <label class="text-sm font-medium text-gray-700">Order</label>
      <select
        bind:value={order}
        onchange={() => {
          offset = 0;
          loadClusters();
        }}
        class="mt-1 px-3 py-2 border border-gray-300 rounded"
      >
        <option value="desc">Desc</option>
        <option value="asc">Asc</option>
      </select>
    </div>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {#each clusters as cluster (cluster.id)}
      <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
        <h3 class="font-semibold truncate text-sm">{cluster.label}</h3>
        <p class="text-xs text-gray-500 mt-2">{cluster.packetCount} packets</p>
        <div class="mt-3">
          <span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
            Authority: {formatAuthority(cluster.authority)}
          </span>
        </div>
      </div>
    {/each}
  </div>

  <div class="flex justify-between items-center mt-6">
    <span class="text-sm text-gray-600">
      {offset + 1} to {Math.min(offset + limit, total)} of {total}
    </span>
    <div class="flex gap-2">
      <Button
        disabled={offset === 0 || loading}
        onclick={() => {
          offset = Math.max(0, offset - limit);
          loadClusters();
        }}
      >
        Previous
      </Button>
      <Button
        disabled={!hasMore || loading}
        onclick={() => {
          offset += limit;
          loadClusters();
        }}
      >
        Next
      </Button>
    </div>
  </div>
</div>
