<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- Multi-Layer Cache System Demo Component -->
<!-- Demonstrates Loki.js + Redis + PostgreSQL caching with real-time statistics -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  import type { writable  } from 'svelte/store';
  import Button from 'bits-ui/components/ui/button';
  import type { Input  } from 'bits-ui/components/ui/input';
  import type { Badge  } from 'bits-ui/components/ui/badge';
  import type { Progress  } from 'bits-ui/components/ui/progress';
  import type { Tabs, TabsContent, TabsList, TabsTrigger  } from 'bits-ui/components/ui/tabs';
  import type { Database,
    Zap,
    BarChart3,
    Trash2,
    RefreshCw,
    CheckCircle,
    XCircle,
    Clock,
    HardDrive,
    Activity
   } from 'lucide-svelte';
  // State management
  const cacheStats = writable<any>(null);
  const healthStatus = writable<any>(null);
  const isLoading = writable(false);
  const testResults = writable<unknown[]>([]);
  // Form state
  let cacheKey = $state('');
  let cacheValue = $state('');
  let selectedTTL = $state('300'); // 5 minutes default
  let selectedPriority = $state('medium');
  let selectedTags = $state('');
  // Demo data
  const ttlOptions = [
    { value: '60', label: '1 minute' },
    { value: '300', label: '5 minutes' },
    { value: '900', label: '15 minutes' },
    { value: '3600', label: '1 hour' },
    { value: '86400', label: '24 hours' }
  ];
  const priorityOptions = [
    { value: 'low', label: 'Low Priority' },
    { value: 'medium', label: 'Medium Priority' },
    { value: 'high', label: 'High Priority' }
  ];
  // ============================================================================
  // CACHE OPERATIONS
  // ============================================================================
  async function loadCacheStats() {
    try {
      // removed unused response assignment
      const data = await (response as { json?: any }).json();
      if ((data as { success?: any; stats?: any; health?: any; error?: any; cached?: any; value?: any }).success) {
        cacheStats.set(stats));
      }
    } catch (error) {
      console.error('Failed to load cache stats:', error);
    }
  }
  async function loadHealthStatus() {
    try {
      // removed unused response assignment
      const data = await (response as { json?: any }).json();
      if ((data as { success?: any; stats?: any; health?: any; error?: any; cached?: any; value?: any }).success) {
        healthStatus.set(health));
      }
    } catch (error) {
      console.error('Failed to load health status:', error);
    }
  }
  async function setCacheValue() {
    if (!cacheKey.trim() || !cacheValue.trim()) {
      addTestResult('error', 'Key and value are required');
      return;
    }
    isLoading.set(true);
    try {
      const tags = selectedTags.split.map(t => t.trim()).filter(t => t);
      const response = await fetch('/api/cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({,
          key: cacheKey;
          value: cacheValue;
          options: {
            ttl: parseInt(selectedTTL) * 1000, // Convert to millisecond;
            priority: selectedPriority;
            tags: tags.length > 0 ? tags : undefined;
          }
        })
      });
      const data = await (response as { json?: any }).json();
      if ((data as { success?: any; stats?: any; health?: any; error?: any; cached?: any; value?: any }).success) {
        addTestResult('success', `Cached "${cacheKey}" successfully`);
        cacheKey = '';
        cacheValue = '';
      } else {
        addTestResult('error', `Failed to cache: ${(data as { success?: any; stats?: any; health?: any; error?: any; cached?: any; value?: any }).error}`);
      }
    } catch (error) {
      addTestResult('error', `Cache error: ${error}`);
    } finally {
      isLoading.set(false);
      await refreshStats();
    }
  }
  async function getCacheValue() {
    if (!cacheKey.trim()) {
      addTestResult('error', 'Key is required');
      return;
    }
    isLoading.set(true);
    try {
      // removed unused response assignment
      const data = await (response as { json?: any }).json();
      if ((data as { success?: any; stats?: any; health?: any; error?: any; cached?: any; value?: any }).success) {
        if ((data as { success?: any; stats?: any; health?: any; error?: any; cached?: any; value?: any }).cached) {
          addTestResult('success', `Retrieved "${cacheKey}": ${JSON.stringify(value)}`);
        } else {
          addTestResult('warning', `Key "${cacheKey}" not found in cache`);
        }
      } else {
        addTestResult('error', `Failed to retrieve: ${(data as { success?: any; stats?: any; health?: any; error?: any; cached?: any; value?: any }).error}`);
      }
    } catch (error) {
      addTestResult('error', `Retrieval error: ${error}`);
    } finally {
      isLoading.set(false);
      await refreshStats();
    }
  }
  async function deleteCacheValue() {
    if (!cacheKey.trim()) {
      addTestResult('error', 'Key is required');
      return;
    }
    isLoading.set(true);
    try {
      const response = await fetch(`/api/cache?key=${encodeURIComponent(cacheKey)}`, { method: 'DELETE' });
      const data = await (response as { json?: any }).json();
      if ((data as { success?: any; stats?: any; health?: any; error?: any; cached?: any; value?: any }).success) {
        addTestResult('success', `Deleted "${cacheKey}" successfully`);
        cacheKey = '';
      } else {
        addTestResult('error', `Failed to delete: ${(data as { success?: any; stats?: any; health?: any; error?: any; cached?: any; value?: any }).error}`);
      }
    } catch (error) {
      addTestResult('error', `Delete error: ${error}`);
    } finally {
      isLoading.set(false);
      await refreshStats();
    }
  }
  async function clearCache() { if (!confirm('Are you sure you want to clear all cache?')) return;
    isLoading.set(true);
    try {
      const response = await fetch('/api/cache?action=clear', {
        method: 'DELETE' });
      const data = await (response as { json?: any }).json();
      if ((data as { success?: any; stats?: any; health?: any; error?: any; cached?: any; value?: any }).success) {
        addTestResult('success', 'Cache cleared successfully');
      } else {
        addTestResult('error', `Failed to clear cache: ${(data as { success?: any; stats?: any; health?: any; error?: any; cached?: any; value?: any }).error}`);
      }
    } catch (error) {
      addTestResult('error', `Clear error: ${error}`);
    } finally {
      isLoading.set(false);
      await refreshStats();
    }
  }
  // ============================================================================
  // DEMO OPERATIONS
  // ============================================================================
  async function runPerformanceTest() {
    isLoading.set(true);
    addTestResult('info', 'Starting performance test...');
    try {
      const testData = [];
      const testSize = 100;
      // Generate test data
      for (let i = 0; i < testSize; i++) {
        testData.push.toString(36)}`,
          options: {
            ttl: 300000, // 5 minute;
            priority: i % 3 === 0 ? 'high' : 'medium',
            tags: [`test`, `batch-${Math.floor(i / 10)}`]
          }
        });
      }
      const startTime = Date.now();
      // Execute batch operation
      const response = await fetch('/api/cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operations: testData })
      });
      const result = await (response as { json?: any }).json();
      const endTime = Date.now();
      const duration = endTime - startTime;
      if ((result as { success?: any; summary?: any; type?: any; timestamp?: any; message?: any }).success) {
        addTestResult('success',
          `Performance test completed: ${(result as { success?: any; summary?: any; type?: any; timestamp?: any; message?: any }).summary.successful}/${testSize} operations in ${duration}ms`
        );
        addTestResult('info',
          `Average: ${(duration / testSize).toFixed(2)}ms per operation`
        );
      } else {
        addTestResult('error', 'Performance test failed');
      }
    } catch (error) {
      addTestResult('error', `Performance test error: ${error}`);
    } finally {
      isLoading.set(false);
      await refreshStats();
    }
  }
  async function testCacheHitMiss() {
    isLoading.set(true);
    addTestResult('info', 'Testing cache hit/miss patterns...');
    try {
      const testKey = `hit_miss_test_${Date.now()}`;
      // Test cache miss
      let response = await fetch(`/api/cache?action=get&key=${testKey}`);
      let data = await (response as { json?: any }).json();
      if (!(data as { success?: any; stats?: any; health?: any; error?: any; cached?: any; value?: any }).cached) {
        addTestResult('success', '✓ Cache miss test passed');
      } else {
        addTestResult('warning', '⚠ Unexpected cache hit');
      }
      // Set value
      response = await fetch('/api/cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({,
          key: testKey;
          value: 'test_data_for_hit_test',
          options: { ttl: 60000 }
        })
      });
      // Test cache hit
      response = await fetch(`/api/cache?action=get&key=${testKey}`);
      data = await (response as { json?: any }).json();
      if ((data as { success?: any; stats?: any; health?: any; error?: any; cached?: any; value?: any }).cached && (data as { success?: any; stats?: any; health?: any; error?: any; cached?: any; value?: any }).value === 'test_data_for_hit_test') {
        addTestResult('success', '✓ Cache hit test passed');
      } else {
        addTestResult('error', '✗ Cache hit test failed');
      }
      // Clean up
      await fetch(`/api/cache?key=${testKey}`, { method: 'DELETE' });
    } catch (error) {
      addTestResult('error', `Hit/miss test error: ${error}`);
    } finally {
      isLoading.set(false);
      await refreshStats();
    }
  }
  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================
  function addTestResult(type: 'success' | 'error' | 'warning' | 'info', message: string) {
    testResults.update.toLocaleTimeString()
      },
      ...results.slice(0, 49) // Keep last 50 results
    ]);
  }
  async function refreshStats() {
    await Promise.all([
      loadCacheStats(),
      loadHealthStatus()
    ]);
  }
  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  function formatPercentage(_value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }
  // ============================================================================
  // LIFECYCLE
  // ============================================================================
  $effect(() => {
    refreshStats();
    // Auto-refresh stats every 10 seconds
    const interval = setInterval(refreshStats, 10000);
    return () => clearInterval(interval);
  });
</script>
<!-- Main Demo Interface -->
<div class="cache-demo space-y-6">
  <!-- Header -->
  <div class="nes-container">
    <div class="yorha-panel-header">
      <h3 class="nes-text is-primary flex items-center gap-2">
        <Database size={24} />
        Multi-Layer Cache System Demo
        <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">Loki.js + Redis + PostgreSQL</span>
      </h3>
    </div>
    <div class="yorha-panel-content">
      <p class="nes-text is-disabled">
        Interactive demonstration of the comprehensive caching architecture with real-time statistics and performance testing.
      </p>
    </div>
  </div>
  <!-- Main Content Tabs -->
  <Tabs value="operations" class="w-full">
    <TabsList class="grid w-full grid-cols-4">
      <TabsTrigger value="operations">Cache Operations</TabsTrigger>
      <TabsTrigger value="statistics">Statistics</TabsTrigger>
      <TabsTrigger value="health">Health Monitor</TabsTrigger>
      <TabsTrigger value="testing">Performance Tests</TabsTrigger>
    </TabsList>
    <!-- Cache Operations Tab -->
    <TabsContent value="operations" class="space-y-4">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Cache Operations Form -->
        <div class="nes-container">
          <div class="yorha-panel-header">
            <h3 class="nes-text is-primary">Cache Operations</h3>
          </div>
          <div class="yorha-panel-content space-y-4">
            <div>
              <label class="block text-sm font-medium mb-2">Cache Key</label>
              <Input;
                bind:value={cacheKey}
                placeholder="Enter cache key"
                class="w-full"
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Cache Value</label>
              <Input;
                bind:value={cacheValue}
                placeholder="Enter cache value"
                class="w-full"
              />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-2" for="ttl">TTL</label>
                <select id="ttl" bind:value={selectedTTL} class="w-full p-2 border rounded">
                  {#each Array.isArray(ttlOptions) ? ttlOptions : [] as option}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium mb-2" for="priority">Priority</label>
                <select id="priority" bind:value={selectedPriority} class="w-full p-2 border rounded">
                  {#each Array.isArray(priorityOptions) ? priorityOptions : [] as option}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Tags (comma-separated)</label>
              <Input;
                bind:value={selectedTags}
                placeholder="tag1, tag2, tag3"
                class="w-full"
              />
            </div>
            <div class="flex flex-wrap gap-2">
              <Button
                class="enhanced-bits-btn nes-cache-operation n64-enhanced lod-optimized retro-cache-btn"
                onclick={setCacheValue}
                disabled={$isLoading}
                aria-label={$isLoading ? 'Setting cache value, please wait' : 'Store value in multi-layer cache system'}
                aria-describedby="set-cache-help"
                role="button"
                tabindex={$isLoading ? -1 : 0}
                data-loading={$isLoading}
                data-nes-theme="cache-priority"
                data-enhanced-bits="true"
                data-operation="set"
              >
<Database class="mr-2" size={16} aria-hidden="true" role="img" aria-label="Database icon" />
                Set Value
</Button>
              <div id="set-cache-help" class="sr-only">
                Store the entered key-value pair in the multi-layer cache system with specified TTL and priority
              </div>
              <Button
                class="enhanced-bits-btn nes-cache-operation n64-enhanced lod-optimized retro-cache-btn"
                variant="ghost"
                onclick={getCacheValue}
                disabled={$isLoading}
                aria-label={$isLoading ? 'Retrieving cache value, please wait' : 'Retrieve value from multi-layer cache'}
                aria-describedby="get-cache-help"
                role="button"
                tabindex={$isLoading ? -1 : 0}
                data-loading={$isLoading}
                data-nes-theme="cache-secondary"
                data-enhanced-bits="true"
                data-operation="get"
              >
<RefreshCw class="mr-2" size={16} aria-hidden="true" role="img" aria-label="Refresh icon" />
                Get Value
</Button>
              <div id="get-cache-help" class="sr-only">
                Retrieve the value associated with the entered key from the cache layers
              </div>
              <Button
                class="enhanced-bits-btn nes-cache-operation n64-enhanced lod-optimized retro-cache-btn danger-variant"
                variant="error"
                onclick={deleteCacheValue}
                disabled={$isLoading}
                aria-label={$isLoading ? 'Deleting cache entry, please wait' : 'Delete cache entry from all layers'}
                aria-describedby="delete-cache-help"
                role="button"
                tabindex={$isLoading ? -1 : 0}
                data-loading={$isLoading}
                data-nes-theme="cache-destructive"
                data-enhanced-bits="true"
                data-operation="delete"
              >
<Trash2 class="mr-2" size={16} aria-hidden="true" role="img" aria-label="Delete icon" />
                Delete
</Button>
              <div id="delete-cache-help" class="sr-only">
                Remove the specified cache entry from all cache layers permanently
              </div>
              <Button
                class="enhanced-bits-btn nes-cache-operation n64-enhanced lod-optimized retro-cache-btn danger-variant critical-action"
                variant="error"
                onclick={clearCache}
                disabled={$isLoading}
                aria-label={$isLoading ? 'Clearing all cache data, please wait' : 'Clear entire cache - WARNING: This will remove all cached data'}
                aria-describedby="clear-cache-help"
                role="button"
                tabindex={$isLoading ? -1 : 0}
                data-loading={$isLoading}
                data-nes-theme="cache-critical"
                data-enhanced-bits="true"
                data-operation="clear-all"
                data-critical="true"
              >
<XCircle class="mr-2" size={16} aria-hidden="true" role="img" aria-label="Clear all icon" />
                Clear All
</Button>
              <div id="clear-cache-help" class="sr-only">
                WARNING: This will permanently remove ALL cached data from all cache layers. This action cannot be undone.
              </div>
            </div>
          </div>
        </div>
        <!-- Test Results -->
        <div class="nes-container">
          <div class="yorha-panel-header">
            <h3 class="nes-text is-primary flex items-center justify-between">
              Test Results
              <Button
                class="enhanced-bits-btn nes-cache-control n64-enhanced lod-optimized retro-control-btn"
                variant="ghost"
                size="sm"
                onclick={() =>
testResults.set([])}
                aria-label="Clear test results display"
                aria-describedby="clear-results-help"
                role="button"
                data-nes-theme="control-ghost"
                data-enhanced-bits="true"
                data-operation="clear-results"
              >
                Clear
</Button>
              <div id="clear-results-help" class="sr-only">
                Clear the test results display panel
              </div>
            </h3>
          </div>
          <div class="yorha-panel-content">
            <div class="space-y-2 max-h-80 overflow-y-auto">
              {#each Array.isArray($testResults) ? $testResults : [] as result}
                <div class="flex items-start gap-2 p-2 rounded border-l-4
                           {(result as { success?: any; summary?: any; type?: any; timestamp?: any; message?: any }).type === 'success' ? 'border-green-500 bg-green-50' :
                            (result as { success?: any; summary?: any; type?: any; timestamp?: any; message?: any }).type === 'error' ? 'border-red-500 bg-red-50' :
                            (result as { success?: any; summary?: any; type?: any; timestamp?: any; message?: any }).type === 'warning' ? 'border-yellow-500 bg-yellow-50' :
                            'border-blue-500 bg-blue-50'}">
                  <div class="text-xs nes-text is-disabled min-w-fit">
                    {(result as { success?: any; summary?: any; type?: any; timestamp?: any; message?: any }).timestamp}
                  </div>
                  <div class="text-sm flex-1">
                    {(result as { success?: any; summary?: any; type?: any; timestamp?: any; message?: any }).message}
                  </div>
                </div>
              {/each}
              {#if $testResults.length === 0}
                <div class="text-center nes-text is-disabled py-8">
                  No test results yet. Try some cache operations!
                {/if}
            </div>
          </div>
        </div>
      </div>
    </TabsContent>
    <!-- Statistics Tab -->
    <TabsContent value="statistics" class="space-y-4">
      {#if $cacheStats}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- Service Stats -->
          <div class="nes-container">
            <div class="yorha-panel-header pb-2">
              <h3 class="nes-text is-primary text-sm">Service Stats</h3>
            </div>
            <div class="yorha-panel-content">
              <div class="space-y-2">
                <div class="flex justify-between">
                  <span class="text-sm">Requests:</span>
                  <span class="font-mono">{$cacheStats.service.requests}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sm">Hits:</span>
                  <span class="font-mono text-green-600">{$cacheStats.service.hits}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sm">Misses:</span>
                  <span class="font-mono text-red-600">{$cacheStats.service.misses}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sm">Hit Rate:</span>
                  <span class="font-mono">{formatPercentage($cacheStats.service.hitRate)}</span>
                </div>
              </div>
            </div>
          </div>
          <!-- Overall Performance -->
          {#if $cacheStats.layers}
            <div class="nes-container">
              <div class="yorha-panel-header pb-2">
                <h3 class="nes-text is-primary text-sm">Overall Performance</h3>
              </div>
              <div class="yorha-panel-content">
                <div class="space-y-2">
                  <div class="flex justify-between">
                    <span class="text-sm">Total Requests:</span>
                    <span class="font-mono">{$cacheStats.layers.overall.totalRequests}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-sm">Hit Rate:</span>
                    <span class="font-mono">{formatPercentage($cacheStats.layers.overall.totalHitRate)}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-sm">Avg Response:</span>
                    <span class="font-mono">{$cacheStats.layers.overall.avgResponseTime.toFixed(2)}ms</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-sm">Healthy Layers:</span>
                    <span class="font-mono">{$cacheStats.layers.overall.healthyLayers}/{$cacheStats.layers.overall.totalLayers}</span>
                  </div>
                </div>
              </div>
            </div>
            <!-- Layer Statistics -->
            {#each Array.isArray($cacheStats.layers.layers) ? $cacheStats.layers.layers : [] as layer}
              <div class="nes-container">
                <div class="yorha-panel-header pb-2">
                  <h3 class="nes-text is-primary text-sm capitalize">{layer.layer} Layer</h3>
                </div>
                <div class="yorha-panel-content">
                  <div class="space-y-2">
                    <div class="flex justify-between">
                      <span class="text-sm">Items:</span>
                      <span class="font-mono">{layer.itemCount.toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-sm">Hit Rate:</span>
                      <span class="font-mono">{formatPercentage(layer.hitRate)}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-sm">Memory:</span>
                      <span class="font-mono text-xs">{formatBytes(layer.memoryUsage)}</span>
                    </div>
                    <Progress value={layer.hitRate * 100} class="h-2" />
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      {:else}
        <div class="nes-container">
          <div class="yorha-panel-content py-8">
            <div class="text-center nes-text is-disabled">
              <Activity class="mx-auto mb-2" size={48} />
              Loading cache statistics...
            </div>
          </div>
        {/if}
    </TabsContent>
    <!-- Health Monitor Tab -->
    <TabsContent value="health" class="space-y-4">
      {#if $healthStatus}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Overall Health -->
          <div class="nes-container">
            <div class="yorha-panel-header">
              <h3 class="nes-text is-primary flex items-center gap-2">
                {#if $healthStatus.healthy}
                  <CheckCircle class="text-green-500" size={20} />
                  System Healthy
                {:else}
                  <XCircle class="text-red-500" size={20} />
                  System Issues Detected
                {/if}
              </h3>
            </div>
            <div class="yorha-panel-content">
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <span>Service Health:</span>
                  <Badge variant={$healthStatus.service ? 'default' : 'destructive'}>
                    {$healthStatus.service ? 'Healthy' : 'Unhealthy'}
                  </Badge>
                </div>
                {#if $healthStatus.layers}
                  <h4 class="font-medium">Cache Layers:</h4>
                  {#each Object.entries($healthStatus.layers.layers) as [layerName, isHealthy]}
                    <div class="flex items-center justify-between">
                      <span class="capitalize">{layerName}:</span>
                      <Badge variant={isHealthy ? 'default' : 'destructive'}>
                        {isHealthy ? 'Healthy' : 'Unhealthy'}
                      </Badge>
                    </div>
                  {/each}
                {/if}
              </div>
            </div>
          </div>
          <!-- Issues & Recommendations -->
          <div class="nes-container">
            <div class="yorha-panel-header">
              <h3 class="nes-text is-primary">Issues & Recommendations</h3>
            </div>
            <div class="yorha-panel-content">
              {#if $healthStatus.layers?.issues && $healthStatus.layers.issues.length > 0}
                <div class="space-y-2">
                  {#each Array.isArray($healthStatus.layers.issues) ? $healthStatus.layers.issues : [] as issue}
                    <div class="p-2 bg-red-50 border border-red-200 rounded text-sm">
                      ⚠ {issue}
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="text-center text-green-600 py-4">
                  <CheckCircle class="mx-auto mb-2" size={32} />
                  All systems operating normally
                {/if}
            </div>
          </div>
        </div>
      {:else}
        <div class="nes-container">
          <div class="yorha-panel-content py-8">
            <div class="text-center nes-text is-disabled">
              <HardDrive class="mx-auto mb-2" size={48} />
              Loading health status...
            </div>
          </div>
        {/if}
    </TabsContent>
    <!-- Performance Tests Tab -->
    <TabsContent value="testing" class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Test Controls -->
        <div class="nes-container">
          <div class="yorha-panel-header">
            <h3 class="nes-text is-primary">Performance Tests</h3>
          </div>
          <div class="yorha-panel-content space-y-4">
            <div class="space-y-2">
              <Button
                onclick={runPerformanceTest}
                disabled={$isLoading}
                class="w-full enhanced-bits-btn nes-performance-test n64-enhanced lod-optimized retro-test-btn"
                aria-label={$isLoading ? 'Running batch performance test, please wait' : 'Execute batch performance test with 100 cache entries'}
                aria-describedby="perf-test-help"
                role="button"
                tabindex={$isLoading ? -1 : 0}
                data-loading={$isLoading}
                data-nes-theme="performance-primary"
                data-enhanced-bits="true"
                data-test-type="performance"
              >
<Zap class="mr-2" size={16} aria-hidden="true" role="img" aria-label="Performance test icon" />
                Run Batch Performance Test
</Button>
              <div id="perf-test-help" class="sr-only">
                Execute a comprehensive performance test using 100 cache entries across all cache layers
              </div>
              <p class="text-sm nes-text is-disabled">
                Tests batch operations with 100 cache entries
              </p>
            </div>
            <div class="space-y-2">
              <Button
                variant="ghost"
                onclick={testCacheHitMiss}
                disabled={$isLoading}
                class="w-full enhanced-bits-btn nes-performance-test n64-enhanced lod-optimized retro-test-btn"
                aria-label={$isLoading ? 'Running cache hit/miss test, please wait' : 'Test cache hit and miss behavior patterns'}
                aria-describedby="hitmiss-test-help"
                role="button"
                tabindex={$isLoading ? -1 : 0}
                data-loading={$isLoading}
                data-nes-theme="performance-secondary"
                data-enhanced-bits="true"
                data-test-type="hit-miss"
              >
<BarChart3 class="mr-2" size={16} aria-hidden="true" role="img" aria-label="Analytics icon" />
                Test Cache Hit/Miss
</Button>
              <div id="hitmiss-test-help" class="sr-only">
                Validate proper cache hit and miss behavior across the cache layer hierarchy
              </div>
              <p class="text-sm nes-text is-disabled">
                Validates cache hit and miss behavior
              </p>
            </div>
            <div class="space-y-2">
              <Button
                variant="ghost"
                onclick={refreshStats}
                disabled={$isLoading}
                class="w-full enhanced-bits-btn nes-performance-test n64-enhanced lod-optimized retro-test-btn"
                aria-label={$isLoading ? 'Refreshing cache statistics, please wait' : 'Update all cache statistics and health monitoring data'}
                aria-describedby="refresh-stats-help"
                role="button"
                tabindex={$isLoading ? -1 : 0}
                data-loading={$isLoading}
                data-nes-theme="performance-refresh"
                data-enhanced-bits="true"
                data-operation="refresh-stats"
              >
<RefreshCw class="mr-2" size={16} aria-hidden="true" role="img" aria-label="Refresh statistics icon" />
                Refresh Statistics
</Button>
              <div id="refresh-stats-help" class="sr-only">
                Update all cache layer statistics, health status, and performance monitoring data
              </div>
              <p class="text-sm nes-text is-disabled">
                Updates all cache statistics and health status
              </p>
            </div>
          </div>
        </div>
        <!-- Test Results Display -->
        <div class="nes-container">
          <div class="yorha-panel-header">
            <h3 class="nes-text is-primary">Test Information</h3>
          </div>
          <div class="yorha-panel-content space-y-4">
            <div class="p-4 bg-blue-50 rounded">
              <h4 class="font-medium text-blue-900 mb-2">Cache Layer Architecture</h4>
              <ul class="text-sm text-blue-800 space-y-1">
                <li><strong>L1:</strong> Memory Cache (fastest, volatile)</li>
                <li><strong>L2:</strong> Loki.js (persistent, document-based)</li>
                <li><strong>L3:</strong> Redis (distributed, high-speed)</li>
                <li><strong>L4:</strong> PostgreSQL (persistent, SQL-based)</li>
              </ul>
            </div>
            <div class="p-4 bg-green-50 rounded">
              <h4 class="font-medium text-green-900 mb-2">Features Demonstrated</h4>
              <ul class="text-sm text-green-800 space-y-1">
                <li>✓ Multi-layer cache retrieval</li>
                <li>✓ Write-through caching</li>
                <li>✓ Automatic failover</li>
                <li>✓ Performance monitoring</li>
                <li>✓ Health checking</li>
                <li>✓ Batch operations</li>
              </ul>
            </div>
            {#if $isLoading}
              <div class="text-center py-4">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p class="text-sm nes-text is-disabled mt-2">Running tests...</p>
              {/if}
          </div>
        </div>
      </div>
    </TabsContent>
  </Tabs>
</div>
<style>
  .cache-demo {
/* @apply max-w-7xl mx-auto p-4; */
  }
</style>