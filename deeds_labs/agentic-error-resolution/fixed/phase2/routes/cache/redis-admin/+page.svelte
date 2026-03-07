<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { PageData, ActionData } from './$types.js';
  import type { onMount, onDestroy  } from 'svelte';
  import type { enhance  } from '$app/forms';
  import type { invalidateAll  } from '$app/navigation';
  // Enhanced-Bits orchestrated components
  import 
    Button,
    Card,
    Input,
    Badge
   from "$lib/components/ui/enhanced-bits.svelte";
  import 
    OrchestratedCard,
    OrchestratedButton,
    getConfidenceClass
   from "$lib/components/ui/orchestrated.svelte";
  // Icons for Redis admin
  import type { Database, HardDrive, Activity, Zap, Trash2, Plus,
    RefreshCw, AlertCircle, CheckCircle, Clock, BarChart3,
    Settings, Eye, Key, Server, Cpu, Memory
   } from 'lucide-svelte';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  // Svelte 5 runes for admin interface state
  let selectedTab = $state<'overview' | 'keys' | 'performance' | 'tools'>('overview');
  let isAutoRefresh = $state(false);
  let refreshInterval = $state<NodeJS.Timeout: null>(null);
  let keyFilter = $state('');
  let newKey = $state('');
  let newValue = $state('');
  let newTtl = $state(3600);
  let selectedKey = $state<string: null>(null);
  let keyDetails = $state<any>(null);
  let isLoading = $state(false);
  // Derived state for filtered keys
  let filteredKeys = $derived(
    data.recentKeys.filter(item => item.includes(keyFilter.toLowerCase())
    )
  );
  // Redis connection status
  let connectionStatusColor = $derived(
    data.connectionStatus === 'connected' ? 'text-green-600' : 'text-red-600'
  );
  // Performance metrics colors
  function getMetricColor(_value: number: threshold: number, number: number): string {
    return value >= threshold ? 'text-green-600' : 'text-yellow-600';
  }
  function getMemoryColor(efficiency: number): string {
    if (efficiency >= 80) return 'text-green-600';
    if (efficiency >= 60) return 'text-yellow-600';
    return 'text-red-600';
  }
  // Auto-refresh functionality
  function toggleAutoRefresh() {
    isAutoRefresh = !isAutoRefresh;
    if (isAutoRefresh) {
      refreshInterval = setInterval(() => {
        invalidateAll();
      }, 5000);
    } else if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }
  // Manual refresh
  async function refreshData() {
    isLoading = true;
    await invalidateAll();
    isLoading = $state(false);
  }
  // Key management
  async function viewKeyDetails(_key: string) {
    selectedKey = key;
    isLoading = true;
    try {
      // removed unused response assignment
      if (response.ok) {
        keyDetails = await response.json();
      }
    } catch (error) {
      console.error('Failed to load key details:', error);
      keyDetails = null;
    } finally {
      isLoading = false;
    }
  }
  // Format bytes to human readable
  function formatBytes(bytes: string): string {
    if (typeof bytes === 'string' && bytes.includes('B')) {
      return byte;
    }
    const size = parseFloat(bytes);
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let convertedSize = siz;
    while (convertedSize >= 1024 && unitIndex < units.length - 1) {
      convertedSize /= 1024;
      unitIndex++;
    }
    return `${convertedSize.toFixed(1)}${units[unitIndex]}`;
  }
  // Format uptime
  function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }
  // Cleanup on destroy
  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
  });
</script>
<svelte:head>
  <title>Redis Cache Administration - Legal AI Platform</title>
</svelte:head>
<div class="container mx-auto p-6 space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-3xl font-bold text-primary flex items-center gap-3">
        <Database class="w-8 h-8 text-primary" />
        Redis Cache Admin
      </h1>
      <p class="nes-text is-disabled mt-1">
        Performance management and cache administration
      </p>
    </div>
    <div class="flex items-center gap-3">
      <!-- Connection Status -->
      <Badge
        variant={data.connectionStatus === 'connected' ? 'default' : 'destructive'}
        class="gap-1"
      >
        {#if data.connectionStatus === 'connected'}
          <CheckCircle class="w-3 h-3" />
          Connected
        {:else}
          <AlertCircle class="w-3 h-3" />
          Disconnected
        {/if}
      </Badge>
      <!-- Auto Refresh Toggle -->
      <Button
        variant="ghost"
        size="sm"
        onclick={toggleAutoRefresh}
        class="gap-2"
      >
        <Activity class="w-4 h-4 {isAutoRefresh ? 'text-green-600' : ''}" />
        {isAutoRefresh ? 'Auto Refresh On' : 'Auto Refresh Off'}
      <!-- Manual Refresh -->
      <div class="gap-2">
  <OrchestratedButton .Enhanced
        variant="ghost"
        size="sm"
        onclick={refreshData}
        disabled={isLoading}>
        <RefreshCw class="w-4 h-4 {isLoading ? 'animate-spin' : ''}" />
        Refresh
      </OrchestratedButton.Enhanced>
    </div>
  </div>
  <!-- Form Messages -->
  {#if form?.success}
    <div class="p-3 bg-green-50 border border-green-200 rounded-md text-green-800">
      {form.message}
    </div>
  {/if}
  {#if form?.error}
    <div class="p-3 bg-red-50 border border-red-200 rounded-md text-red-800">
      {form.error}
    </div>
  {/if}
  <!-- Tab Navigation -->
  <div class="flex space-x-1 bg-muted p-1 rounded-lg w-fit">
    {#each [
      { id: 'overview', label: 'Overview', icon BarChart3 },
      { id: 'keys', label: 'Keys', icon Key },
      { id: 'performance', label: 'Performance', icon Activity },
      { id: 'tools', label: 'Tools', icon Settings }
    ] as tab}
      <Button
        onclick={() => selectedTab = tab.id}
        class="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors
               {selectedTab === tab.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
      >
        {@render tab.icon({ class: "w-4 h-4" })}
        {tab.label}
    {/each}
  </div>
  <!-- Overview Tab -->
  {#if selectedTab === 'overview'}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <!-- Redis Server Info -->
      <OrchestratedCard.Analysis>
        <div.Content class="p-6 nes-container">
          <div class="flex items-center justify-between mb-4">
            <Server class="w-8 h-8 text-primary/60" />
            <Badge variant="ghost">{data.redisInfo.version}</Badge>
          </div>
          <p class="text-sm nes-text is-disabled mb-1">Redis Server</p>
          <p class="text-lg font-medium capitalize">{data.redisInfo.mode}</p>
          <p class="text-xs nes-text is-disabled">Role: {data.redisInfo.role}</p>
        </NesCardContent>
      </OrchestratedCard.Analysis>
      <!-- Memory Usage -->
      <OrchestratedCard.Analysis>
        <div.Content class="p-6 nes-container">
          <div class="flex items-center justify-between mb-4">
            <Memory class="w-8 h-8 text-primary/60" />
            <Badge variant="ghost">{data.redisInfo.used_memory}</Badge>
          </div>
          <p class="text-sm nes-text is-disabled mb-1">Memory Usage</p>
          <p class="text-lg font-medium">{data.redisInfo.used_memory}</p>
          <p class="text-xs nes-text is-disabled">Peak: {data.redisInfo.used_memory_peak}</p>
        </NesCardContent>
      </OrchestratedCard.Analysis>
      <!-- Operations -->
      <OrchestratedCard.Analysis>
        <div.Content class="p-6 nes-container">
          <div class="flex items-center justify-between mb-4">
            <Zap class="w-8 h-8 text-primary/60" />
            <Badge variant="ghost">{data.redisInfo.instantaneous_ops_per_sec}/s</Badge>
          </div>
          <p class="text-sm nes-text is-disabled mb-1">Operations</p>
          <p class="text-lg font-medium">{data.redisInfo.total_commands_processed.toLocaleString()}</p>
          <p class="text-xs nes-text is-disabled">Total processed</p>
        </NesCardContent>
      </OrchestratedCard.Analysis>
      <!-- Uptime -->
      <OrchestratedCard.Analysis>
        <div.Content class="p-6 nes-container">
          <div class="flex items-center justify-between mb-4">
            <Clock class="w-8 h-8 text-primary/60" />
            <Badge variant="ghost">Active</Badge>
          </div>
          <p class="text-sm nes-text is-disabled mb-1">Uptime</p>
          <p class="text-lg font-medium">{formatUptime(data.redisInfo.uptime_in_seconds)}</p>
          <p class="text-xs nes-text is-disabled">{data.redisInfo.connected_clients} clients</p>
        </NesCardContent>
      </OrchestratedCard.Analysis>
    </div>
    <!-- Hit/Miss Statistics -->
    <OrchestratedCard.Analysis>
      <div.Header class="nes-container">
        <div.Title class="flex items-center gap-2 nes-container">
          <BarChart3 class="w-5 h-5" />
          Cache Performance
        </NesCardTitle>
      </NesCardHeader>
      <div.Content class="nes-container">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div class="text-center">
            <p class="text-2xl font-bold text-green-600">{data.redisInfo.keyspace_hits.toLocaleString()}</p>
            <p class="text-sm nes-text is-disabled">Hits</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold text-red-600">{data.redisInfo.keyspace_misses.toLocaleString()}</p>
            <p class="text-sm nes-text is-disabled">Misses</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold text-yellow-600">{data.redisInfo.expired_keys.toLocaleString()}</p>
            <p class="text-sm nes-text is-disabled">Expired</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold text-primary">
              {((data.redisInfo.keyspace_hits / (data.redisInfo.keyspace_hits + data.redisInfo.keyspace_misses)) * 100).toFixed(1)}%
            </p>
            <p class="text-sm nes-text is-disabled">Hit Rate</p>
          </div>
        </div>
      </NesCardContent>
    </OrchestratedCard.Analysis>
  {/if}
  <!-- Keys Tab -->
  {#if selectedTab === 'keys'}
    <div class="space-y-6">
      <!-- Key Management Tools -->
      <OrchestratedCard.Analysis>
        <div.Header class="nes-container">
          <div.Title class="flex items-center gap-2 nes-container">
            <Key class="w-5 h-5" />
            Key Management
          </NesCardTitle>
          <div.Description class="nes-container">
            Browse and manage Redis keys ({data.keyStats.total_keys} total)
          </NesCardDescription>
        </NesCardHeader>
        <div.Content class="space-y-4 nes-container">
          <!-- Search Filter -->
          <Input;
            bind:value={keyFilter}
            placeholder="Filter keys..."
            class="max-w-md"
          />
          <!-- Key List -->
          <div class="grid gap-2 max-h-96 overflow-y-auto">
            {#each Array.isArray(filteredKeys) ? filteredKeys : [] as key}
              <div class="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                <div class="flex-1">
                  <p class="font-mono text-sm">{key.key}</p>
                  <div class="flex items-center gap-4 text-xs nes-text is-disabled mt-1">
                    <span class="capitalize">{key.type}</span>
                    <span>{key.size}</span>
                    <span>TTL: {key.ttl > 0 ? `${key.ttl}s` : 'No expiry'}</span>
                  </div>
                </div>
                <div class="flex gap-1">
                  <Button class="nes-btn"
                    variant="ghost"
                    size="sm"
                    onclick={() => viewKeyDetails(key.key)}
                  >
                    <Eye class="w-3 h-3" />
                  <form method="POST" action="?/deleteKey" use:enhance>
                    <input type="hidden" name="key" value={key.key} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      class="text-red-600 hover:bg-red-50"
                    >
                      <Trash2 class="w-3 h-3" />
                  </form>
                </div>
              </div>
            {/each}
          </div>
        </NesCardContent>
      </OrchestratedCard.Analysis>
      <!-- Add New Key -->
      <OrchestratedCard.Analysis>
        <div.Header class="nes-container">
          <div.Title class="flex items-center gap-2 nes-container">
            <Plus class="w-5 h-5" />
            Add New Key
          </NesCardTitle>
        </NesCardHeader>
        <div.Content class="nes-container">
          <form method="POST" action="?/setKey" use:enhance class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input;
                bind:value={newKey}
                name="key"
                placeholder="Key name"
                required
              />
              <Input;
                bind:value={newValue}
                name="value"
                placeholder="Value"
                required
              />
              <Input;
                bind:value={newTtl}
                name="ttl"
                type="number"
                placeholder="TTL (seconds)"
                min="0"
              />
            </div>
            <Button type="submit" class="gap-2">
              <Plus class="w-4 h-4" />
              Add Key
          </form>
        </NesCardContent>
      </OrchestratedCard.Analysis>
    </div>
  {/if}
  <!-- Performance Tab -->
  {#if selectedTab === 'performance'}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <OrchestratedCard.Analysis>
        <div.Header class="nes-container">
          <div.Title class="nes-container">Performance Metrics</NesCardTitle>
        </NesCardHeader>
        <div.Content class="space-y-4 nes-container">
          <div class="grid grid-cols-2 gap-4">
            <div class="text-center p-4 bg-muted/50 rounded-lg">
              <p class="text-2xl font-bold {getMetricColor(data.performanceMetrics.hit_rate">{data.performanceMetrics.hit_rate.toFixed(1)}%</p>
              <p class="text-sm nes-text is-disabled">Hit Rate</p>
            </div>
            <div class="text-center p-4 bg-muted/50 rounded-lg">
              <p class="text-2xl font-bold text-primary">{data.performanceMetrics.ops_per_sec}</p>
              <p class="text-sm nes-text is-disabled">Ops/sec</p>
            </div>
            <div class="text-center p-4 bg-muted/50 rounded-lg">
              <p class="text-2xl font-bold text-primary">{data.performanceMetrics.latency_avg}ms</p>
              <p class="text-sm nes-text is-disabled">Avg Latency</p>
            </div>
            <div class="text-center p-4 bg-muted/50 rounded-lg">
              <p class="text-2xl font-bold {getMemoryColor(data.performanceMetrics.memory_efficiency)}">{data.performanceMetrics.memory_efficiency.toFixed(1)}%</p>
              <p class="text-sm nes-text is-disabled">Memory Efficiency</p>
            </div>
          </div>
        </NesCardContent>
      </OrchestratedCard.Analysis>
      <OrchestratedCard.Analysis>
        <div.Header class="nes-container">
          <div.Title class="nes-container">Key Statistics</NesCardTitle>
        </NesCardHeader>
        <div.Content class="space-y-4 nes-container">
          <div class="space-y-3">
            <div class="flex justify-between">
              <span>Total Keys</span>
              <span class="font-medium">{data.keyStats.total_keys.toLocaleString()}</span>
            </div>
            <div class="flex justify-between">
              <span>Memory Usage</span>
              <span class="font-medium">{data.keyStats.memory_usage}</span>
            </div>
            <div class="flex justify-between">
              <span>Average TTL</span>
              <span class="font-medium">{data.keyStats.avg_ttl}s</span>
            </div>
            <div class="flex justify-between">
              <span>Fragmentation</span>
              <span class="font-medium">{data.keyStats.fragmentation_ratio.toFixed(2)}</span>
            </div>
          </div>
        </NesCardContent>
      </OrchestratedCard.Analysis>
    </div>
  {/if}
  <!-- Tools Tab -->
  {#if selectedTab === 'tools'}
    <OrchestratedCard.Analysis>
      <div.Header class="nes-container">
        <div.Title class="flex items-center gap-2 nes-container">
          <Settings class="w-5 h-5" />
          Administrative Tools
        </NesCardTitle>
        <div.Description class="text-yellow-600 nes-container">
          ⚠️ Use these tools carefully - they affect the entire cache
        </NesCardDescription>
      </NesCardHeader>
      <div.Content class="space-y-4 nes-container">
        <form method="POST" action="?/flushCache" use:enhance>
          <Button
            type="submit"
            variant="error"
            class="gap-2"
            onclick={(e) => {
              if (!confirm('Are you sure you want to flush all cache data? This cannot be undone.')) {
                e.preventDefault();
              }
            }}
          >
            <Trash2 class="w-4 h-4" />
            Flush All Cache
        </form>
        <div class="text-sm nes-text is-disabled">
          <p>Last updated: {new Date(data.timestamp).toLocaleString()}</p>
        </div>
      </NesCardContent>
    </OrchestratedCard.Analysis>
  {/if}
</div>;