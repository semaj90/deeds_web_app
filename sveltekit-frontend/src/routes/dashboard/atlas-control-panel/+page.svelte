<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import type { PageData } from './$types';

  interface CacheStats {
    timestamp: string;
    status: string;
    uptime?: number;
    kvCacheEnabled: boolean;
    stats: Array<{
      totalRequests: number;
      contextTokens: number;
      cachedTokens: number;
      newTokens: number;
      cacheHitRate: number;
    }>;
    aggregates: {
      totalRequests: number;
      totalContextTokens: number;
      totalCachedTokens: number;
      totalNewTokens: number;
      averageCacheHitRate: number;
      estimatedSpeedup: string;
      costSavings: string;
    };
    recommendation: string;
  }

  interface SearchSource {
    type: string;
    id: string;
    content: string;
    relevance: number;
    metadata: Record<string, unknown>;
  }

  let { data }: { data: PageData } = $props();

  // --- State Management using runes ---
  let query = $state('');
  let loading = $state(false);
  let results = $state<SearchSource[]>([]);
  let searchedSources = $state<string[]>([]);
  let validationError = $state('');
  let cacheStats = $state<CacheStats | null>(null);
  let cacheError = $state<string | null>(null);
  let refreshing = $state(false);

  $effect(() => {
    cacheStats = data?.cacheStats ?? null;
    cacheError = data?.error ?? null;
  });

  // --- Derived State ---
  const hasSources = $derived(results.length > 0);
  const isLoading = $derived(loading);
  const hasCacheStats = $derived(cacheStats !== null && cacheError === null);
  const cacheHitPercentage = $derived(
    cacheStats ? (cacheStats.aggregates.averageCacheHitRate * 100).toFixed(1) : '0'
  );
  const totalRequests = $derived(cacheStats?.aggregates.totalRequests ?? 0);
  const contextTokensSaved = $derived(cacheStats?.aggregates.totalCachedTokens ?? 0);
  const speedupPercentage = $derived(cacheStats?.aggregates.estimatedSpeedup ?? '0%');

  // --- Cache Stats Refresh Handler ---
  async function refreshCacheStats() {
    refreshing = true;
    try {
      const response = await fetch('/api/acp/kv-cache-stats', {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        cacheError = `HTTP ${response.status}: Failed to fetch cache stats`;
        cacheStats = null;
      } else {
        const data = await response.json();
        cacheStats = data;
        cacheError = null;
      }
    } catch (error) {
      cacheError = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      cacheStats = null;
    } finally {
      refreshing = false;
    }
  }

  async function handleAtlasAudit() {
    const searchText = query.trim();
    if (!searchText) {
      results = [];
      searchedSources = [];
      return;
    }

    loading = true;
    validationError = '';
    results = [];
    searchedSources = [];
    try {
      const response = await fetch('/api/error-brain/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ errorMessage: searchText, limit: 10 }),
        signal: AbortSignal.timeout(15000)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `Search failed (${response.status})`);
      results = Array.isArray(payload.sources) ? payload.sources : [];
      searchedSources = Array.isArray(payload.searchedDatabases) ? payload.searchedDatabases : [];
      if (payload.errorLogSearchStatus === 'unavailable') {
        validationError = 'PostgreSQL error-log search is unavailable; other sources may still have results.';
      }
    } catch (error) {
      validationError = error instanceof Error ? error.message : 'Search request failed';
    } finally {
      loading = false;
    }
  }
</script>

<div class="p-8 max-w-7xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-3xl font-bold text-primary">Parent Atlas Operations</h1>
      <p class="text-muted-foreground">Search recorded errors and retrieval sources. Results are candidates, not verified fixes.</p>
    </div>
    <div class="text-right text-sm text-muted-foreground">
      {#if cacheStats}
        <p>Last updated: {new Date(cacheStats.timestamp).toLocaleTimeString()}</p>
        <p>Uptime: {(cacheStats.uptime / 3600).toFixed(1)}h</p>
      {/if}
    </div>
  </div>

  <!-- Cache Statistics Panel -->
  {#if hasCacheStats}
    <div class="mb-10 p-6 border rounded-lg bg-gradient-to-r from-blue-50 to-purple-50">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-semibold flex items-center gap-2">
          <span class="text-accent">⚡</span> KV Cache Monitoring
        </h2>
        <Button onclick={refreshCacheStats} disabled={refreshing} class="text-sm">
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {#if cacheError}
        <div class="p-3 bg-red-100 text-red-800 border border-red-200 rounded-md text-sm">
          <strong>Cache Error:</strong> {cacheError}
        </div>
      {:else}
        <div class="grid grid-cols-4 gap-4 mb-4">
          <div class="bg-white p-4 rounded-md border border-gray-200">
            <p class="text-xs text-muted-foreground mb-1">Total Requests</p>
            <p class="text-2xl font-bold text-primary">{totalRequests}</p>
          </div>
          <div class="bg-white p-4 rounded-md border border-gray-200">
            <p class="text-xs text-muted-foreground mb-1">Cache Hit Rate</p>
            <p class="text-2xl font-bold text-green-600">{cacheHitPercentage}%</p>
          </div>
          <div class="bg-white p-4 rounded-md border border-gray-200">
            <p class="text-xs text-muted-foreground mb-1">Tokens Saved</p>
            <p class="text-2xl font-bold text-blue-600">{contextTokensSaved}</p>
          </div>
          <div class="bg-white p-4 rounded-md border border-gray-200">
            <p class="text-xs text-muted-foreground mb-1">Speedup</p>
            <p class="text-2xl font-bold text-purple-600">{speedupPercentage}</p>
          </div>
        </div>

        <div class="bg-white p-4 rounded-md border border-gray-200 mb-4">
          <h3 class="text-sm font-semibold mb-2">Recommendation</h3>
          <p class="text-sm text-gray-700">{cacheStats?.recommendation || 'N/A'}</p>
        </div>

        {#if cacheStats?.stats && cacheStats.stats.length > 0}
          <div class="bg-white p-4 rounded-md border border-gray-200">
            <h3 class="text-sm font-semibold mb-3">Cache Performance by Request</h3>
            <div class="space-y-2 max-h-32 overflow-y-auto">
              {#each cacheStats.stats.slice(0, 5) as stat, idx}
                <div class="flex items-center justify-between text-sm p-2 bg-gray-50 rounded">
                  <div>
                    <p class="font-semibold text-primary">Request {idx + 1}</p>
                    <p class="text-xs text-muted-foreground">
                      Context: {stat.contextTokens} tokens | Cached: {stat.cachedTokens} | New: {stat.newTokens}
                    </p>
                  </div>
                  <div class="text-right">
                    <p class="text-xs font-semibold text-green-600">
                      {(stat.cacheHitRate * 100).toFixed(0)}% hit
                    </p>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {/if}
    </div>
  {:else if cacheError}
    <div class="mb-10 p-6 border rounded-lg bg-red-50">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-semibold flex items-center gap-2">
          <span class="text-red-600">⚠️</span> Cache Statistics Unavailable
        </h2>
        <Button onclick={refreshCacheStats} disabled={refreshing} class="text-sm">
          {refreshing ? 'Retrying...' : 'Retry'}
        </Button>
      </div>
      <p class="text-sm text-red-700">{cacheError}</p>
    </div>
  {/if}

  {#if data.operations?.catalogStatus === 'ADMIN_ONLY'}
    <p class="mb-5 text-sm text-muted-foreground">Operations catalog and error counts are restricted to administrators.</p>
  {:else if data.operations}
    <section class="mb-8 rounded-lg border bg-card p-5" aria-label="Parent Atlas operations status">
      <h2 class="mb-1 text-xl font-semibold">Parent Atlas operations</h2>
      <p class="mb-4 text-sm text-muted-foreground">Read-only status. Catalog presence and indexes do not prove population, source qualification, retrieval admission, or GPU execution.</p>
      <div class="mb-4 grid gap-3 md:grid-cols-3">
        <article class="rounded border p-3">
          <h3 class="font-semibold">PostgreSQL catalog</h3>
          <p class="text-sm">{data.operations.catalogStatus}</p>
          {#if data.operations.error}<p class="mt-1 text-xs text-amber-700">Some reads failed.</p>{/if}
        </article>
        <article class="rounded border p-3">
          <h3 class="font-semibold">Recorded errors</h3>
          {#if data.operations.errorCounts}
            <p class="text-sm">{data.operations.errorCounts.total} total · {data.operations.errorCounts.unresolved} unresolved</p>
          {:else}<p class="text-sm text-muted-foreground">Unavailable or table absent</p>{/if}
        </article>
        <article class="rounded border p-3">
          <h3 class="font-semibold">Graphify admission</h3>
          {#if data.operations.graphifyAdmission}
            <p class="text-sm">{data.operations.graphifyAdmission.admitted.badge}</p>
            <p class="text-xs text-muted-foreground">Execution rows: {data.operations.graphifyAdmission.admitted.matchingCount}; canonical owners: {data.operations.graphifyAdmission.admitted.canonicalCount}</p>
          {:else}<p class="text-sm text-muted-foreground">Admission receipts unavailable</p>{/if}
        </article>
      </div>
      <h3 class="mb-2 font-semibold">Table and index catalog</h3>
      {#if data.operations.tables.length > 0}
        <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {#each data.operations.tables as table (table.tableName)}
            <div class="rounded border p-3 text-sm">
              <div class="flex justify-between gap-2"><code>{table.tableName}</code><span>{table.exists ? 'present' : 'absent'}</span></div>
              <p class="mt-1 text-xs text-muted-foreground">{table.exists ? `${table.indexNames.length} indexes: ${table.indexNames.join(', ') || 'none'}` : 'No live table found'}</p>
            </div>
          {/each}
        </div>
      {:else}<p class="text-sm text-muted-foreground">Catalog was not read; migration files alone are not live-deployment proof.</p>{/if}
      <p class="mt-4 text-sm text-muted-foreground">GPU execution is not probed here; no benchmark or workload was started. OpenSpec tasks are authoritative; workboards are generated views.</p>
    </section>
  {/if}

  <div class="mb-5 flex flex-wrap gap-3 text-sm">
    <a class="underline" href="/admin/graphify-readiness">Graphify readiness and admission</a>
    <a class="underline" href="/admin/error-brain">Error Brain</a>
    <span class="text-muted-foreground">OpenSpec tasks are the task ledger; generated workboards are projections.</span>
    <span class="text-muted-foreground">GPU execution is not probed by this page.</span>
  </div>

  <!-- Query Input Area -->
  <div class="mb-10 p-6 border rounded-lg bg-background/50">
    <div class="flex gap-3 mb-4">
      <input 
        type="text" 
        bind:value={query} 
        placeholder="Search a recorded error message, route, or file path"
        class="flex-grow p-3 border rounded-md focus:ring-accent focus:border-accent"
      />
      <Button onclick={handleAtlasAudit} disabled={isLoading || !query} class="w-auto">
        {isLoading ? 'Searching...' : 'Search errors'}
      </Button>
    </div>
    {#if validationError}
      <div class="mt-4 p-3 bg-red-100 text-red-800 border border-red-200 rounded-md">
        <strong>Search status:</strong> {validationError}
      </div>
    {/if}
  </div>

  <!-- Retrieved candidates are shown without fabricated synthesis or fix commands. -->
  {#if query.trim() && !loading}
    <section class="bg-card p-6 rounded-xl shadow-lg border" aria-live="polite">
      <h2 class="text-xl font-semibold mb-2">Search candidates ({results.length})</h2>
      <p class="text-xs text-muted-foreground mb-4">Sources queried: {searchedSources.join(', ') || 'none reported'}. Scores are retrieval hints, not probabilities or fix confidence.</p>
      {#if hasSources}
        <div class="space-y-3">
          {#each results as result (result.type + ':' + result.id)}
            <article class="border rounded-lg p-4">
              <div class="flex items-center justify-between gap-3 mb-2">
                <span class="text-sm font-semibold">{result.type}</span>
                <span class="text-xs text-muted-foreground">Heuristic score: {result.relevance}</span>
              </div>
              <p class="text-sm whitespace-pre-wrap break-words">{result.content}</p>
              {#if result.metadata.filePath || result.metadata.routePath || result.metadata.sourceRef}
                <p class="mt-2 text-xs text-muted-foreground">
                  {[result.metadata.sourceRef, result.metadata.filePath, result.metadata.routePath].filter(Boolean).join(' · ')}
                  {#if result.metadata.lineNumber} :{result.metadata.lineNumber}{/if}
                </p>
              {/if}
            </article>
          {/each}
        </div>
      {:else}
        <p class="text-sm text-muted-foreground">No candidates returned for this query.</p>
      {/if}
    </section>
  {/if}
</div>
