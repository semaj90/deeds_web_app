<script lang="ts">
  import { appActions, appStore } from '$lib/stores/app-store';
  import { onMount } from 'svelte';

  let { webgpuCapabilities = null, cpuCapabilities = null } = $props();

  let systemHealth = $state({
    overall: 85,
    webgpu: webgpuCapabilities?.hasWebGPU ? 95 : 60,
    cpu: cpuCapabilities?.hasWebGL ? 90 : 70,
    memory: 75,
    network: 100
  });

  let systemMetrics = $state <any>(null);
  let loading = $state(true);
  let error = $state <string | null>(null);

  // Subscribe to store
  let appState = $state<any>();
  $effect(() => {
    const unsubscribe = appStore.subscribe(state => {
      appState = state;
    });
    return unsubscribe;
  });

  async function loadSystemMetrics() {
    try {
      loading = true;
      error = null;

      // Load system metrics from API
      await appActions.loadSystemMetrics();

      // Get metrics from store
      systemMetrics = appState?.systemMetrics;

      // Update health scores based on real data
      if (systemMetrics) {
        systemHealth = {
          overall: systemMetrics.overallHealth || 85,
          webgpu: systemMetrics.gpu?.health || (webgpuCapabilities?.hasWebGPU ? 95 : 60),
          cpu: systemMetrics.cpu?.usage || (cpuCapabilities?.hasWebGL ? 90 : 70),
          memory: systemMetrics.memory?.usage || 75,
          network: systemMetrics.network?.status === 'online' ? 100 : 80
        };
      }
    } catch (err) {
      console.error('Failed to load system metrics:', err);
      error = 'Failed to load system metrics';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadSystemMetrics();

    // Update health metrics periodically
    const interval = window.setInterval(() => {
      loadSystemMetrics();
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  });

  function getHealthColor(score: number): string {
    if (score >= 90) return 'text-green-400';
    if (score >= 70) return 'text-yellow-400';
    return 'text-red-400';
  }

  function getHealthBg(score: number): string {
    if (score >= 90) return 'bg-green-400';
    if (score >= 70) return 'bg-yellow-400';
    return 'bg-red-400';
  }
</script>

<div class="bg-slate-800/50 backdrop-blur rounded-lg p-6 border border-slate-700/50">
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-xl font-semibold text-cyan-400">System Overview</h2>
    {#if loading}
      <div class="flex items-center space-x-2">
        <div class="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
        <span class="text-sm text-slate-400">Loading...</span>
      </div>
    {:else if error}
      <div class="text-sm text-red-400">{error}</div>
    {/if}
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    <!-- Overall Health -->
    <div class="bg-slate-700/30 rounded-lg p-4">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm text-slate-400">Overall Health</span>
        <span class="text-lg {getHealthColor(systemHealth.overall)}">{systemHealth.overall}%</span>
      </div>
      <div class="w-full bg-slate-600 rounded-full h-2">
        <div class="h-2 rounded-full {getHealthBg(systemHealth.overall)} transition-all duration-300" style="width: {systemHealth.overall}%"></div>
      </div>
    </div>

    <!-- WebGPU Status -->
    <div class="bg-slate-700/30 rounded-lg p-4">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm text-slate-400">WebGPU</span>
        <div class="flex items-center space-x-2">
          <div class="w-2 h-2 {webgpuCapabilities?.hasWebGPU ? 'bg-green-400' : 'bg-red-400'} rounded-full"></div>
          <span class="text-sm {getHealthColor(systemHealth.webgpu)}">{systemHealth.webgpu}%</span>
        </div>
      </div>
      <div class="text-xs text-slate-500">
        {webgpuCapabilities?.hasWebGPU ? 'GPU Accelerated' : 'CPU Fallback'}
        {#if systemMetrics?.gpu?.model}
          <br />{systemMetrics.gpu.model}
        {/if}
      </div>
    </div>

    <!-- CPU/WebGL Status -->
    <div class="bg-slate-700/30 rounded-lg p-4">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm text-slate-400">CPU/WebGL</span>
        <div class="flex items-center space-x-2">
          <div class="w-2 h-2 {cpuCapabilities?.hasWebGL ? 'bg-green-400' : 'bg-yellow-400'} rounded-full"></div>
          <span class="text-sm {getHealthColor(systemHealth.cpu)}">{systemHealth.cpu}%</span>
        </div>
      </div>
      <div class="text-xs text-slate-500">
        {cpuCapabilities?.maxThreads || 4} threads available
        {#if systemMetrics?.cpu?.cores}
          <br />{systemMetrics.cpu.cores} cores
        {/if}
      </div>
    </div>

    <!-- Memory Usage -->
    <div class="bg-slate-700/30 rounded-lg p-4">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm text-slate-400">Memory</span>
        <span class="text-sm {getHealthColor(systemHealth.memory)}">{systemHealth.memory}%</span>
      </div>
      <div class="w-full bg-slate-600 rounded-full h-2">
        <div class="h-2 rounded-full {getHealthBg(systemHealth.memory)} transition-all duration-300" style="width: {systemHealth.memory}%"></div>
      </div>
      {#if systemMetrics?.memory}
        <div class="text-xs text-slate-500 mt-1">
          {Math.round(systemMetrics.memory.used / 1024 / 1024)}MB / {Math.round(systemMetrics.memory.total / 1024 / 1024)}MB
        </div>
      {/if}
    </div>
  </div>

  <!-- System Capabilities -->
  <div class="mt-6 pt-4 border-t border-slate-700/50">
    <h3 class="text-sm font-medium text-slate-300 mb-3">Active Capabilities</h3>
    <div class="flex flex-wrap gap-2">
      {#if webgpuCapabilities?.hasWebGPU}
        <span class="px-2 py-1 bg-cyan-400/20 text-cyan-400 text-xs rounded">WebGPU Compute</span>
      {/if}
      {#if cpuCapabilities?.hasWebGL}
        <span class="px-2 py-1 bg-green-400/20 text-green-400 text-xs rounded">WebGL Fallback</span>
      {/if}
      {#if systemMetrics?.services?.redis}
        <span class="px-2 py-1 bg-red-400/20 text-red-400 text-xs rounded">Redis Cache</span>
      {/if}
      {#if systemMetrics?.services?.qdrant}
        <span class="px-2 py-1 bg-purple-400/20 text-purple-400 text-xs rounded">Vector Search</span>
      {/if}
      {#if systemMetrics?.services?.ollama}
        <span class="px-2 py-1 bg-blue-400/20 text-blue-400 text-xs rounded">AI Models</span>
      {/if}
      {#if systemMetrics?.services?.database}
        <span class="px-2 py-1 bg-green-400/20 text-green-400 text-xs rounded">Database</span>
      {/if}
      <span class="px-2 py-1 bg-orange-400/20 text-orange-400 text-xs rounded">Document Processing</span>
    </div>
  </div>

  <!-- Service Status -->
  {#if systemMetrics?.services}
    <div class="mt-4 pt-4 border-t border-slate-700/50">
      <h3 class="text-sm font-medium text-slate-300 mb-3">Service Status</h3>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
        {#each Object.entries(systemMetrics.services) as [service, status]}
          <div class="flex items-center space-x-2">
            <div class="w-2 h-2 {status === 'online' ? 'bg-green-400' : 'bg-red-400'} rounded-full"></div>
            <span class="text-xs text-slate-400 capitalize">{service}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
