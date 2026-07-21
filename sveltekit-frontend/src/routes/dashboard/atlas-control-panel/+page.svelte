<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import type { PageData } from './$types';

  interface CacheStats {
    timestamp: string;
    status: string;
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

  let { data }: { data: PageData } = $props();

  // --- State Management using runes ---
  let query = $state('');
  let loading = $state(false);
  let results = $state([]);
  let sourceRefs = $state([]);
  let commands = $state([]);
  let bestAnswer = $state('');
  let validationError = $state('');
  let retryCount = $state(0);
  let lastToolCall = $state('');
  let cacheStats = $state<CacheStats | null>(data?.cacheStats ?? null);
  let cacheError = $state<string | null>(data?.error ?? null);
  let refreshing = $state(false);

  // --- Derived State ---
  const hasSources = $derived(sourceRefs.length > 0);
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

  // --- Simulated API Handler / LangGraph Validation ---
  async function handleAtlasAudit() {
    if (!query) {
        results = [];
        return;
    }
    
    loading = true;
    validationError = '';
    
    // Simulate API latency
    await new Promise(resolve => setTimeout(resolve, 800));

    // Mock API Response that comes from MCP LangGraph
    // We validate it according to the "killer feature" rules
    let mockAuditResult = {
        toolCall: 'atlas.search',
        sourceRefs: [{ path: 'src/lib/schema/user.ts', line: 10, snippet: 'userId: uuid' }],
        commands: ['npm run audit:drizzle-meta'],
        answer: "Found schema references."
    };

    // Test specific fail paths based on keywords to demonstrate the UI
    if (query.includes('generic')) {
       mockAuditResult.sourceRefs = [];
       mockAuditResult.commands = [];
       mockAuditResult.answer = "I think it's somewhere in the codebase.";
    } else if (query.includes('no command')) {
       mockAuditResult.commands = [];
    } else if (query.includes('duplicate')) {
       mockAuditResult.toolCall = lastToolCall;
    }

    // Validation Rules
    if (mockAuditResult.toolCall === lastToolCall && lastToolCall !== '') {
        validationError = "Duplicate tool call = stop/re-route.";
        loading = false;
        return;
    }
    
    lastToolCall = mockAuditResult.toolCall;

    if (mockAuditResult.sourceRefs.length === 0 && mockAuditResult.commands.length === 0) {
        validationError = "Generic answer = failureLookup.";
        bestAnswer = "Re-routing to atlas.failureLookup...";
        loading = false;
        return;
    }

    if (mockAuditResult.sourceRefs.length === 0) {
        if (retryCount < 1) {
            retryCount++;
            validationError = "No sourceRefs = not done. Retrying...";
            loading = false;
            // In a real app we would retry automatically
            return;
        } else {
            validationError = "Max retries reached. No sourceRefs provided.";
            loading = false;
            return;
        }
    }

    if (mockAuditResult.commands.length === 0) {
        validationError = "No command = not actionable.";
        loading = false;
        return;
    }

    // Success path
    retryCount = 0;
    sourceRefs = mockAuditResult.sourceRefs;
    commands = mockAuditResult.commands;
    bestAnswer = mockAuditResult.answer;
    results = mockAuditResult.sourceRefs;
    loading = false;
  }
</script>

<div class="p-8 max-w-7xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-3xl font-bold text-primary">OpenCode Atlas Dashboard</h1>
      <p class="text-muted-foreground">Monitor runs, failures, chunks, and lessons with strict LangGraph validation.</p>
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

  <!-- Query Input Area -->
  <div class="mb-10 p-6 border rounded-lg bg-background/50">
    <div class="flex gap-3 mb-4">
      <input 
        type="text" 
        bind:value={query} 
        placeholder="e.g., 'Where is the user ID managed in the DB schema?'"
        class="flex-grow p-3 border rounded-md focus:ring-accent focus:border-accent"
      />
      <Button onclick={handleAtlasAudit} disabled={isLoading || !query} class="w-auto">
        {isLoading ? 'Loading...' : 'Run Atlas Audit'}
      </Button>
    </div>
    {#if validationError}
      <div class="mt-4 p-3 bg-red-100 text-red-800 border border-red-200 rounded-md">
        <strong>Validation Error:</strong> {validationError}
      </div>
    {/if}
  </div>

  <!-- Results Display -->
  {#if hasSources || bestAnswer}
    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
      
      <!-- 1. SourceRefs Panel -->
      <div class="col-span-1 bg-card p-6 rounded-xl shadow-lg border">
        <h2 class="text-xl font-semibold mb-4 flex items-center gap-2"><span class="text-accent">📚</span> SourceRefs</h2>
        {#if hasSources}
          <div class="space-y-3">
            {#each sourceRefs as ref}
              <div class="border-b pb-3 last:border-b-0">
                <p class="text-sm font-medium text-primary truncate">{ref.path}:<span class="text-gray-600 ml-2">({ref.line})</span></p>
                <pre class="text-xs bg-gray-100 p-2 rounded mt-1 overflow-x-auto"><code>{ref.snippet ? ref.snippet.trim() : 'Context snippet not available'}</code></pre>
              </div>
            {/each}
          </div>
        {:else}
            <p class="text-sm text-muted-foreground">No direct source references found.</p>
        {/if}
      </div>

      <!-- 2. Commands Panel -->
      <div class="col-span-1 bg-card p-6 rounded-xl shadow-lg border">
        <h2 class="text-xl font-semibold mb-4 flex items-center gap-2"><span class="text-accent">🛠️</span> Commands</h2>
        <div class="space-y-3">
          {#if commands.length > 0}
            {#each commands as cmd}
              <div class="bg-gray-50 p-3 rounded-lg border border-dashed border-gray-200">
                <code class="text-sm font-mono text-green-700">{cmd}</code>
              </div>
            {/each}
          {:else}
            <p class="text-sm text-muted-foreground">No commands suggested.</p>
          {/if}
        </div>
      </div>

      <!-- 3. Lessons & Run State Panel -->
      <div class="col-span-1 bg-card p-6 rounded-xl shadow-lg border">
        <h2 class="text-xl font-semibold mb-4 flex items-center gap-2"><span class="text-accent">💡</span> Synthesis</h2>
        <div class="whitespace-pre-wrap break-words">
          <p class="text-sm text-muted-foreground mb-3">Best Answer:</p>
          <div class="p-4 bg-white border border-gray-200 rounded-md">
            <p class="whitespace-pre-wrap">{bestAnswer}</p>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>