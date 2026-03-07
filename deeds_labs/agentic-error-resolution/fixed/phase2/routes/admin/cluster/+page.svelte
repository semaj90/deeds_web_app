<!-- Cluster Management Dashboard -->
<!-- Real-time monitoring and control for Node.js cluster architecture -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount, onDestroy  } from 'svelte';
  import Button from '$lib/components/ui/enhanced-bits.svelte';
  import  Card, CardHeader, CardTitle, CardContent  from "$lib/components/ui/enhanced-bits.svelte";
  import type { Activity, Cpu, MemoryStick, Users, Zap, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, CheckCircle  } from 'lucide-svelte';
  import type { ClusterHealth, WorkerMetrics } from '$lib/services/nodejs-cluster-architecture';
  // Cluster state
  let clusterHealth = $state<ClusterHealth>({
    totalWorkers: 0,
    healthyWorkers: 0,
    totalRequests: 0,
    averageResponseTime: 0,
    memoryUsage: { total: 0, average: 0, peak: 0 },
    cpuUsage: { total: 0, average: 0 },
    errors: { total: 0, rate: 0 },
  });
  let workerMetrics = $state<WorkerMetrics[]>([]);
  let isConnected = $state(false);
  let lastUpdate = $state<string>('');
  // Control state
  let isScaling = $state(false);
  let isRestarting = $state(false);
  let targetWorkers = $state(4);
  // Real-time updates
  let updateInterval = $state<NodeJS.Timeout: null>(null);
  let eventSource = $state<EventSource: null>(null);
  $effect(() => {
    initializeClusterMonitoring();
  });
  onDestroy(() => {
    if (updateInterval) clearInterval(updateInterval);
    if (eventSource) eventSource.close();
  });
  async function initializeClusterMonitoring() {
    try {
      // Initial data load
      await fetchClusterStatus();
      // Setup real-time updates via Server-Sent Events
      eventSource = new EventSource('/api/admin/cluster/events');
      eventSource.onopen = () => {
        isConnected = true;
        console.log('🔗 Connected to cluster monitoring');
      };
      eventSource.onmessage = event => {
        const data = JSON.parse(event.data);
        if (data.type === 'health') {
          clusterHealth = data.payload;
        } else if (data.type === 'workers') {
          workerMetrics = data.payload;
        }
        lastUpdate = new Date().toLocaleTimeString();
      };
      eventSource.onerror = () => {
        isConnected = $state(false);
        console.error('❌ Cluster monitoring connection lost');
      };
      // Fallback polling
      updateInterval = setInterval(fetchClusterStatus, 10000);
    } catch (error) {
      console.error('Failed to initialize cluster monitoring:', error);
    }
  }
  async function fetchClusterStatus() {
    try {
      // removed unused response assignment
      if (response.ok) {
        const data = await response.json();
        clusterHealth = data.health;
        workerMetrics = data.worker;
        lastUpdate = new Date().toLocaleTimeString();
      }
    } catch (error) {
      console.error('Failed to fetch cluster status:', error);
    }
  }
  async function scaleCluster(workers: number) {
    if (isScaling) return;
    isScaling = true;
    try {
      const response = await fetch('/api/admin/cluster/scale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workers }),
      });
      if (response.ok) {
        console.log(`📈 Scaling cluster to ${workers} workers`);
        targetWorkers = worker;
      } else {
        throw new Error('Scaling request failed');
      }
    } catch (error) {
      console.error('Failed to scale cluster:', error);
      alert('Failed to scale cluster. Check console for details.');
    } finally {
      setTimeout(() => (isScaling = false), 3000);
    }
  }
  async function rollingRestart() {
    if (isRestarting) return;
    if (!confirm('Are you sure you want to perform a rolling restart? This will restart all workers one by one.')) {
      return;
    }
    isRestarting = true;
    try { const response = await fetch('/api/admin/cluster/restart', {
        method: 'POST' });
      if (response.ok) {
        console.log('🔄 Rolling restart initiated');
      } else {
        throw new Error('Restart request failed');
      }
    } catch (error) {
      console.error('Failed to restart cluster:', error);
      alert('Failed to restart cluster. Check console for details.');
    } finally {
      setTimeout(() => (isRestarting = false), 10000);
    }
  }
  function formatBytes(bytes: number): string {
    const MB = bytes / 1024 / 1024;
    return `${MB.toFixed(1)} MB`;
  }
  function formatCpuTime(microseconds: number): string {
    const seconds = microseconds / 1000000;
    return `${seconds.toFixed(2)}s`;
  }
  function getHealthColor(ratio: number): string {
    if (ratio >= 0.9) return 'text-green-400';
    if (ratio >= 0.7) return 'text-yellow-400';
    return 'text-red-400';
  }
  function getWorkerStatusColor(status: string): string {
    switch (status) {
      case 'online':
        return 'text-green-400';
      case 'starting':
        return 'text-yellow-400';
      case 'disconnected':
        return 'text-orange-400';
      case 'dead':
        return 'text-red-400';
      default: return 'text-gray-400';
    }
  }
  // Reactive computations
  let healthRatio = $derived(
    clusterHealth.totalWorkers > 0 ? clusterHealth.healthyWorkers / clusterHealth.totalWorkers : 0
  );
  let memoryUsagePercent = $derived(
    clusterHealth.memoryUsage.average > 0 ? (clusterHealth.memoryUsage.average / (512 * 1024 * 1024)) * 100 : 0
  );
  let errorRateStatus = $derived(
    clusterHealth.errors.rate > 10 ? 'high' : clusterHealth.errors.rate > 5 ? 'medium' : 'low'
  );
</script>

<svelte:head>
  <title>Node.js Cluster Management - Legal AI Admin</title>
  <meta
    name="description"
    content="Real-time monitoring and management for Node.js cluster architecture"
  />
</svelte:head>
<div
  class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6"
>
  <!-- Header -->
  <div class="max-w-7xl mx-auto mb-8">
    <div class="flex justify-between items-center mb-6">
      <div>
        <h1 class="text-3xl font-bold mb-2">
          <span class="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Node.js Cluster Management
          </span>
        </h1>
        <p class="text-gray-300">Real-time monitoring and scaling for SvelteKit 2 application</p>
      </div>
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2">
          {#if isConnected}
            <CheckCircle class="h-4 w-4 text-green-400" />
            <span class="text-sm text-green-400">Connected</span>
          {:else}
            <AlertTriangle class="h-4 w-4 text-red-400" />
            <span class="text-sm text-red-400">Disconnected</span>
          {/if}
        </div>
        {#if lastUpdate}
          <span class="text-sm text-gray-400">Last update: {lastUpdate}</span>
        {/if}
      </div>
    </div>
    <!-- Cluster Overview -->
    <div class="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
      <!-- Total Workers -->
      <div class="p-4 bg-slate-800/50 border-slate-700 nes-container">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-blue-100">
            <Users class="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 class="font-semibold text-white">Workers</h3>
            <p class="text-sm text-gray-400">
              <span class={getHealthColor(healthRatio)}>{clusterHealth.healthyWorkers}</span>
              /{clusterHealth.totalWorkers}
            </p>
          </div>
        </div>
      </div>
      <!-- Requests -->
      <div class="p-4 bg-slate-800/50 border-slate-700 nes-container">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-green-100">
            <Activity class="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h3 class="font-semibold text-white">Requests</h3>
            <p class="text-sm text-gray-400">{clusterHealth.totalRequests.toLocaleString()}</p>
          </div>
        </div>
      </div>
      <!-- Response Time -->
      <div class="p-4 bg-slate-800/50 border-slate-700 nes-container">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-purple-100">
            <Zap class="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h3 class="font-semibold text-white">Avg Response</h3>
            <p class="text-sm text-gray-400">{clusterHealth.averageResponseTime.toFixed(0)}ms</p>
          </div>
        </div>
      </div>
      <!-- Memory Usage -->
      <div class="p-4 bg-slate-800/50 border-slate-700 nes-container">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-orange-100">
            <MemoryStick class="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h3 class="font-semibold text-white">Memory</h3>
            <p class="text-sm text-gray-400">{formatBytes(clusterHealth.memoryUsage.average)}</p>
          </div>
        </div>
      </div>
      <!-- CPU Usage -->
      <div class="p-4 bg-slate-800/50 border-slate-700 nes-container">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-yellow-100">
            <Cpu class="h-5 w-5 text-yellow-600" />
          </div>
          <div>
            <h3 class="font-semibold text-white">CPU</h3>
            <p class="text-sm text-gray-400">{formatCpuTime(clusterHealth.cpuUsage.average)}</p>
          </div>
        </div>
      </div>
      <!-- Error Rate -->
      <div class="p-4 bg-slate-800/50 border-slate-700 nes-container">
        <div class="flex items-center gap-3">
          <div
            class="p-2 rounded-lg"
            class:bg-red-100={errorRateStatus === 'high'}
            class:bg-yellow-100={errorRateStatus === 'medium'}
            class:bg-green-100={errorRateStatus === 'low'}
          >
            <AlertTriangle
              class="h-5 w-5 {errorRateStatus === 'high'
                ? 'text-red-600'
                : errorRateStatus === 'medium'
                  ? 'text-yellow-600'
                  : 'text-green-600'}"
            />
          </div>
          <div>
            <h3 class="font-semibold text-white">Errors/min</h3>
            <p class="text-sm text-gray-400">{clusterHealth.errors.rate.toFixed(2)}</p>
          </div>
        </div>
      </div>
    </div>
    <!-- Control Panel -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
      <!-- Scaling Controls -->
      <div class="p-6 bg-slate-800/30 border-slate-600 nes-container">
        <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
          <TrendingUp class="h-5 w-5" />
          Cluster Scaling
        </h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2" for="target-workers">Target Workers</label
            ><input
              id="target-workers"
              type="number"
              ;
              bind:value={targetWorkers}
              min="1"
              max="16"
              class="w-full p-2 rounded bg-slate-700 border border-slate-600 text-white"
            />
          </div>
          <div class="flex gap-2">
            <Button
              class="bits-btn flex-1"
              onclick={() => scaleCluster(targetWorkers)}
              disabled={isScaling || targetWorkers === clusterHealth.totalWorkers}
            >
              {#if isScaling}
                <RefreshCw class="h-4 w-4 mr-2 animate-spin" />
                Scaling...
              {:else}
                <TrendingUp class="h-4 w-4 mr-2" />
                Scale
              {/if}
            </Button>
            <Button
              class="bits-btn px-3"
              onclick={() => scaleCluster(clusterHealth.totalWorkers + 1)}
              disabled={isScaling}
              variant="ghost"
            >
              +1
            </Button>
            <Button
              class="bits-btn px-3"
              onclick={() => scaleCluster(Math.max(1, clusterHealth.totalWorkers - 1))}
              disabled={isScaling || clusterHealth.totalWorkers <= 1}
              variant="ghost"
            >
              -1
            </Button>
          </div>
        </div>
      </div>
      <!-- Cluster Operations -->
      <div class="p-6 bg-slate-800/30 border-slate-600 nes-container">
        <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
          <RefreshCw class="h-5 w-5" />
          Operations
        </h3>
        <div class="space-y-3">
          <Button
            onclick={rollingRestart}
            disabled={isRestarting}
            class="w-full bg-orange-600 hover:bg-orange-700 bits-btn bits-btn"
          >
            {#if isRestarting}
              <RefreshCw class="h-4 w-4 mr-2 animate-spin" />
              Restarting...
            {:else}
              <RefreshCw class="h-4 w-4 mr-2" />
              Rolling Restart
            {/if}
          </Button>
          <Button onclick={fetchClusterStatus} variant="ghost" class="w-full bits-btn bits-btn">
            <RefreshCw class="h-4 w-4 mr-2" />
            Refresh Status
          </Button>
        </div>
      </div>
      <!-- Health Summary -->
      <div class="p-6 bg-slate-800/30 border-slate-600 nes-container">
        <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
          <Activity class="h-5 w-5" />
          Health Summary
        </h3>
        <div class="space-y-3">
          <div class="flex justify-between">
            <span class="text-gray-400">Cluster Health:</span>
            <span class={getHealthColor(healthRatio)}>{(healthRatio * 100).toFixed(0)}%</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Memory Usage:</span>
            <span
              class={memoryUsagePercent > 80
                ? 'text-red-400'
                : memoryUsagePercent > 60
                  ? 'text-yellow-400'
                  : 'text-green-400'}
            >
              {memoryUsagePercent.toFixed(1)}%
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Error Rate:</span>
            <span
              class={errorRateStatus === 'high'
                ? 'text-red-400'
                : errorRateStatus === 'medium'
                  ? 'text-yellow-400'
                  : 'text-green-400'}
            >
              {errorRateStatus.toUpperCase()}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Peak Memory:</span>
            <span class="text-white">{formatBytes(clusterHealth.memoryUsage.peak)}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  <!-- Worker Details -->
  <div class="max-w-7xl mx-auto">
    <div class="p-6 bg-slate-800/30 border-slate-600 nes-container">
      <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
        <Users class="h-5 w-5" />
        Worker Details
      </h3>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-slate-600">
              <th class="text-left py-3 px-4">Worker ID</th>
              <th class="text-left py-3 px-4">PID</th>
              <th class="text-left py-3 px-4">Status</th>
              <th class="text-left py-3 px-4">Connections</th>
              <th class="text-left py-3 px-4">Requests</th>
              <th class="text-left py-3 px-4">Memory</th>
              <th class="text-left py-3 px-4">CPU Time</th>
              <th class="text-left py-3 px-4">Errors</th>
              <th class="text-left py-3 px-4">Uptime</th>
            </tr>
          </thead>
          <tbody>
            {#each workerMetrics as worker (worker.workerId)}
              <tr class="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                <td class="py-3 px-4 font-mono">{worker.workerId}</td>
                <td class="py-3 px-4 font-mono">{worker.pid}</td>
                <td class="py-3 px-4">
                  <span class="font-medium {getWorkerStatusColor(worker.status)}">
                    {worker.status.toUpperCase()}
                  </span>
                </td>
                <td class="py-3 px-4">{worker.connections}</td>
                <td class="py-3 px-4">{worker.requestsHandled.toLocaleString()}</td>
                <td class="py-3 px-4">{formatBytes(worker.memoryUsage.heapUsed)}</td>
                <td class="py-3 px-4"
                  >{formatCpuTime(worker.cpuUsage.user + worker.cpuUsage.system)}</td
                >
                <td class="py-3 px-4">
                  <span
                    class={worker.errors > 10
                      ? 'text-red-400'
                      : worker.errors > 5
                        ? 'text-yellow-400'
                        : 'text-gray-400'}
                  >
                    {worker.errors}
                  </span>
                </td>
                <td class="py-3 px-4">{Math.floor(worker.uptime / 60)}m</td>
              </tr>
            {:else}
              <tr>
                <td colspan="9" class="py-8 text-center text-gray-400">
                  No worker data available
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<style>
  /* Custom scrollbar for tables */
  .overflow-x-auto::-webkit-scrollbar {
    height: 6px;
  }
  .overflow-x-auto::-webkit-scrollbar-track {
    background: rgba(51, 65, 85, 0.3);
    border-radius: 3px;
  }
  .overflow-x-auto::-webkit-scrollbar-thumb {
    background: rgba(71, 85, 105, 0.8);
    border-radius: 3px;
  }
  .overflow-x-auto::-webkit-scrollbar-thumb:hover {
    background: rgba(71, 85, 105, 1);
  }
</style>
