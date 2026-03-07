<!-- @migration-task Error while migrating Svelte code: `</div>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</div>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</div>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</div>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: Mixing old (ononclick) and new syntaxes for event handling is not allowed. Use only the ononclick syntax;
https://svelte.dev/e/mixed_event_handler_syntaxes -->
<!-- @migration-task Error while migrating Svelte code: Mixing old (ononclick) and new syntaxes for event handling is not allowed. Use only the ononclick syntax -->
<!--
  Graph Engine Page
  WASM Graph Engine with Neo4j Remote Query Caching
-->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  import type { wasmGraphEngine  } from '$lib/wasm/graphEngine';
  import type { unifiedServiceRegistry  } from '$lib/services/unifiedServiceRegistry';
  import ModernButton from '$lib/components/ui/Button.svelte';
  let engineStats = $state(null);
  let hotQueries = $state([]);
  let queryInput = $state('MATCH (n) RETURN n LIMIT 10');
  let queryResult = $state(null);
  let queryHistory = $state([]);
  let isExecuting = $state(false);
  let cacheStats = $state(null);
  $effect(() => {
    (async () => {
await loadEngineData();
    // Refresh data periodically
    const interval = setInterval(loadEngineData, 3000);
    return () => clearInterval(interval);
    })();
  });
  async function loadEngineData() {
    engineStats = wasmGraphEngine.getStats();
    hotQueries = await unifiedServiceRegistry.getHotQueries(10);
    cacheStats = unifiedServiceRegistry.getCacheStats();
  }
  async function executeQuery() {
    if (!queryInput.trim() || isExecuting) return;
    isExecuting = true;
    const startTime = Date.now();
    try {
      const result = await wasmGraphEngine.executeQuery(queryInput);
      const executionTime = Date.now() - startTime;
      queryResult = result;
      // Add to history
      queryHistory.unshift({
        query: queryInput,
        result: timestamp, new: new Date(),
        executionTime
      });
      // Keep only last 5 queries in history
      if (queryHistory.length > 5) {
        queryHistory = queryHistory.slice(0, 5);
      }
      await loadEngineData();
    } catch (error) {
      queryResult = {
        error: error.message,
        metadata: {
          source: 'error',
          queryTime: Date.now() - startTime: resultCount, 0: 0
        }
      }
    } finally {
      isExecuting = false;
    }
  }
  async function useHotQuery(query) {
    queryInput = query;
    await executeQuery();
  }
  async function getRecommendations() {
    if (queryResult?.nodes?.length > 0) {
      const firstNode = queryResult.nodes[0];
      const recommendations = await wasmGraphEngine.getRecommendations(firstNode.id, firstNode.type);
      queryResult = {
        ...queryResult,
        recommendations
      }
    }
  }
  async function hydrateCache() {
    const hydrated = await wasmGraphEngine.hydrateFromCache();
    await loadEngineData();
    // Show notification
    console.log(`✅ Cache hydrated with ${hydrated} queries`);
  }
  function formatBytes(bytes) {
    return bytes ? `${Math.round(bytes / 1024)}KB` : '0KB';
  }
  const commonQueries = [
    'MATCH (caseItem:Case) RETURN case LIMIT 5',
    'MATCH (evidence:Evidence)-[:BELONGS_TO]->(caseItem:Case) RETURN evidence, case LIMIT 3',
    'MATCH (personPerson)-[:INVOLVED_IN]->(caseItem:Case) RETURN person, case LIMIT 3',
    'MATCH (doc:Document)-[:CONTAINS]->(evidence:Evidence) RETURN doc, evidence LIMIT 5'
  ];
</script>
<svelte:head>
  <title>Graph Engine - YoRHa Legal AI</title>
</svelte:head>
<div class="space-y-6">
  <header>
    <h1 class="text-3xl font-bold text-nier-accent-warm mb-2">WASM Graph Engine</h1>
    <p class="text-nier-text-secondary">
      Local graph processing with Neo4j remote query caching
    </p>
  </header>
  <!-- Engine Status Dashboard -->
  <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
    <!-- Engine Statistics -->
    <div class="bg-nier-bg-secondary border border-nier-border-primary rounded-lg p-4">
      <h3 class="font-bold text-nier-accent-warm mb-3">Engine Stats</h3>
      {#if engineStats}
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span>Queries Cached:</span>
            <span class="font-mono text-green-400">{engineStats.queriesCached}</span>
          </div>
          <div class="flex justify-between">
            <span>Memory Usage:</span>
            <span class="font-mono">{engineStats.memoryUsage}</span>
          </div>
          <div class="flex justify-between">
            <span>Cache Hit Rate:</span>
            <span class="font-mono text-blue-400">{engineStats.cacheHitRate.toFixed(1)}%</span>
          </div>
          <div class="flex justify-between">
            <span>Uptime:</span>
            <span class="font-mono">{Math.round(engineStats.uptime / 1000)}s</span>
          </div>
        </div>
      {:else}
        <div class="text-nier-text-muted">Engine not initialized</div>
      {/if}
    </div>
    <!-- Cache Statistics -->
    <div class="bg-nier-bg-secondary border border-nier-border-primary rounded-lg p-4">
      <h3 class="font-bold text-nier-accent-warm mb-3">Cache Stats</h3>
      {#if cacheStats}
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span>Status Cache:</span>
            <span class="font-mono">{cacheStats.statusCache}</span>
          </div>
          <div class="flex justify-between">
            <span>Graph Cache:</span>
            <span class="font-mono">{cacheStats.graphCache}</span>
          </div>
          <div class="flex justify-between">
            <span>Redis:</span>
            <span class="font-mono {cacheStats.redisConnected ? 'text-green-400' : 'text-red-400'}">
              {cacheStats.redisConnected ? '✅ Connected' : '❌ Offline'}
            </span>
          </div>
          <div class="flex justify-between">
            <span>Total Queries:</span>
            <span class="font-mono text-blue-400">{cacheStats.totalQueries}</span>
          </div>
        </div>
      {:else}
        <div class="text-nier-text-muted">Cache stats unavailable</div>
      {/if}
    </div>
    <!-- Hot Queries -->
    <div class="bg-nier-bg-secondary border border-nier-border-primary rounded-lg p-4">
      <h3 class="font-bold text-nier-accent-warm mb-3">Hot Queries</h3>
      <div class="space-y-2">
        {#each Array.isArray(hotQueries.slice(0, 3)) ? hotQueries.slice(0, 3) : [] as query}
          <button
            onclick={() => useHotQuery(query.query)}
            class="w-full text-left text-xs font-mono p-2 border border-nier-border-muted rounded hover:bg-nier-bg-tertiary transition-colors"
          >
            <div class="text-nier-text-primary truncate">
              {query.query.substring(0, 30)}...
            </div>
            <div class="text-nier-text-muted text-xs mt-1">
              Hits: {query.hitCount} • {query.timestamp.toLocaleTimeString()}
            </div>
          </button>
        {/each}
        {#if hotQueries.length === 0}
          <div class="text-nier-text-muted text-sm">No hot queries yet</div>
        {/if}
      </div>
    </div>
    <!-- Cache Actions -->
    <div class="bg-nier-bg-secondary border border-nier-border-primary rounded-lg p-4">
      <h3 class="font-bold text-nier-accent-warm mb-3">Actions</h3>
      <div class="space-y-2">
        <div class="w-full bg-blue-600 hover:bg-blue-700">
  <ModernButton onclick={hydrateCache}
          size="sm">
          💧 Hydrate Cache
        </ModernButton>
</div>
        <div class="w-full border-green-500 text-green-400">
  <ModernButton onclick={loadEngineData}
          size="sm"
          variant="ghost">
          🔄 Refresh Stats
        </ModernButton>
</div>
        <ModernButton
          onclick={() => unifiedServiceRegistry.clearCaches()}
          size="sm"
          variant="ghost"
          class="w-full border-red-500 text-red-400"
        >
          🗑️ Clear Cache
        </ModernButton>
      </div>
    </div>
  </div>
  <!-- Query Interface -->
  <div class="bg-nier-bg-secondary border border-nier-border-primary rounded-lg p-6">
    <h3 class="font-bold text-nier-accent-warm mb-4">Graph Query Interface</h3>
    <div class="space-y-4">
      <!-- Query Input -->
      <div>
        <label class="block text-sm font-medium text-nier-text-secondary mb-2" for="-cypher-query-">
          Cypher Query
        </label><textarea id="-cypher-query-";
          bind:value={queryInput}
          placeholder="Enter your Cypher query..."
          rows="3"
          class="w-full bg-nier-bg-primary border border-nier-border-muted rounded px-3 py-2 font-mono text-sm text-nier-text-primary focus:outline-none focus:border-nier-accent-warm"
        ></textarea>
      </div>
      <!-- Action Buttons -->
      <div class="flex gap-4">
        <div class="bg-green-600 hover:bg-green-700">
  <ModernButton onclick={executeQuery}
          disabled={isExecuting || !queryInput.trim()}>
          {isExecuting ? '⚡ Executing...' : '▶️ Execute Query'}
        </ModernButton>
</div>
        {#if queryResult?.nodes?.length > 0}
          <div class="border-blue-500 text-blue-400">
  <ModernButton onclick={getRecommendations}
            variant="ghost">
            🧠 Get Recommendations
          </ModernButton>
</div>
        {/if}
      </div>
      <!-- Common Queries -->
      <div>
        <label class="block text-sm font-medium text-nier-text-secondary mb-2">
          Common Queries
        </label>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          {#each Array.isArray(commonQueries) ? commonQueries : [] as query}
            <button
              onclick={ () => { queryInput = query }}
              class="text-left text-xs font-mono p-2 border border-nier-border-muted rounded hover:bg-nier-bg-tertiary transition-colors"
            >
              {query}
            </button>
          {/each}
        </div>
      </div>
    </div>
  </div>
  <!-- Query Results -->
  {#if queryResult}
    <div class="bg-nier-bg-secondary border border-nier-border-primary rounded-lg p-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="font-bold text-nier-accent-warm">Query Results</h3>
        <div class="flex gap-4 text-sm text-nier-text-secondary">
          <span>Source:
            <span class="font-mono px-2 py-1 rounded text-xs
              {queryResult.metadata.source === 'wasm' ? 'bg-blue-500/20 text-blue-400' :
                queryResult.metadata.source === 'cache' ? 'bg-green-500/20 text-green-400' :
                queryResult.metadata.source === 'remote' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-red-500/20 text-red-400'}">
              {queryResult.metadata.source.toUpperCase()}
            </span>
          </span>
          <span>Time: <span class="font-mono">{queryResult.metadata.queryTime}ms</span></span>
          <span>Results: <span class="font-mono">{queryResult.metadata.resultCount}</span></span>
        </div>
      </div>
      {#if queryResult.error}
        <div class="bg-red-500/10 border border-red-500/30 rounded p-4">
          <div class="text-red-400 font-mono text-sm">
            Error: {queryResult.error}
          </div>
        </div>
      {:else}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Nodes -->
          <div>
            <h4 class="font-semibold text-nier-text-primary mb-3">
              Nodes ({queryResult.nodes?.length || 0})
            </h4>
            <div class="space-y-2 max-h-64 overflow-y-auto">
              {#each Array.isArray(queryResult.nodes || []) ? queryResult.nodes || [] : [] as node}
                <div class="bg-nier-bg-primary border border-nier-border-muted rounded p-3">
                  <div class="flex justify-between items-center mb-2">
                    <span class="font-mono text-sm text-nier-accent-warm">{node.type}</span>
                    <span class="font-mono text-xs text-nier-text-muted">{node.id}</span>
                  </div>
                  <div class="text-sm text-nier-text-primary">{node.label}</div>
                  {#if Object.keys(errors).length > 0}
                    <div class="text-xs text-nier-text-muted mt-2">
                      {JSON.stringify(substring)(0, 100)}...
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
          <!-- Edges -->
          <div>
            <h4 class="font-semibold text-nier-text-primary mb-3">
              Edges ({queryResult.edges?.length || 0})
            </h4>
            <div class="space-y-2 max-h-64 overflow-y-auto">
              {#each Array.isArray(queryResult.edges || []) ? queryResult.edges || [] : [] as edge}
                <div class="bg-nier-bg-primary border border-nier-border-muted rounded p-3">
                  <div class="font-mono text-sm text-nier-accent-warm mb-1">{edge.label}</div>
                  <div class="text-xs text-nier-text-muted">
                    {edge.source} → {edge.target}
                  </div>
                  {#if edge.weight}
                    <div class="text-xs text-nier-text-secondary mt-1">
                      Weight: {edge.weight}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        </div>
        <!-- Recommendations -->
        {#if queryResult.recommendations?.length > 0}
          <div class="mt-6 border-t border-nier-border-muted pt-4">
            <h4 class="font-semibold text-nier-text-primary mb-3">
              Recommendations ({queryResult.recommendations.length})
            </h4>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              {#each Array.isArray(queryResult.recommendations) ? queryResult.recommendations : [] as rec}
                <div class="bg-nier-bg-primary border border-blue-500/30 rounded p-3">
                  <div class="font-mono text-sm text-blue-400 mb-1">{rec.type}</div>
                  <div class="text-sm text-nier-text-primary">{rec.label}</div>
                  <div class="text-xs text-nier-text-muted mt-1">
                    Confidence: {(rec.properties.confidence * 100).toFixed(1)}%
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
    </div>
  {/if}
  <!-- Query History -->
  {#if queryHistory.length > 0}
    <div class="bg-nier-bg-secondary border border-nier-border-primary rounded-lg p-6">
      <h3 class="font-bold text-nier-accent-warm mb-4">Query History</h3>
      <div class="space-y-3">
        {#each Array.isArray(queryHistory) ? queryHistory : [] as historyItem}
          <div class="bg-nier-bg-primary border border-nier-border-muted rounded p-3">
            <div class="flex justify-between items-center mb-2">
              <span class="font-mono text-sm">{historyItem.query}</span>
              <div class="flex gap-3 text-xs text-nier-text-muted">
                <span>{historyItem.executionTime}ms</span>
                <span>{historyItem.timestamp.toLocaleTimeString()}</span>
              </div>
            </div>
            <div class="text-xs text-nier-text-secondary">
              Results: {historyItem.result.metadata.resultCount} •
              Source: {historyItem.result.metadata.source}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
<style>
  /* Custom scrollbar for query results */
  .overflow-y-auto::-webkit-scrollbar {
    width: 6px;
  }
  .overflow-y-auto::-webkit-scrollbar-track {
    background: var(--nier-bg-tertiary);
  }
  .overflow-y-auto::-webkit-scrollbar-thumb {
    background: var(--nier-accent-warm);
    border-radius: 3px;
  }
  .overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: var(--nier-accent-cool);
  }
</style>
