<script lang="ts">
 import { appStore } from '$lib/stores/app-store.svelte';

 interface SystemProps {
 	webgpuCapabilities?: { hasWebGPU: boolean } | null;
 	cpuCapabilities?: { hasWebGL: boolean; maxThreads?: number } | null;
 }

 let { webgpuCapabilities = null, cpuCapabilities = null }: SystemProps = $props();

 let systemHealth = $state({
 overall: 85,
 webgpu: 60,
 cpu: 70,
 memory: 75,
 network: 100
 });

 $effect(() => {
   systemHealth.webgpu = webgpuCapabilities?.hasWebGPU ? 95 : 60;
   systemHealth.cpu = cpuCapabilities?.hasWebGL ? 90 : 70;
 });

 let systemMetrics = $state<any>(null);
 let loading = $state(true);
 let error = $state<string | null>(null);

 async function loadSystemMetrics() {
 try {
 loading = true;
 error = null;

 // Load system metrics from API
 await appStore.loadSystemMetrics();

 // Get metrics from store
 systemMetrics = appStore.systemMetrics;

 // Update health scores based on real data
 if (systemMetrics) {
 systemHealth = {
 overall: systemMetrics.overallHealth ?? 85,
 webgpu: systemMetrics.gpu?.health ?? (webgpuCapabilities?.hasWebGPU ? 95 : 60),
 cpu: systemMetrics.cpu?.usage ?? (cpuCapabilities?.hasWebGL ? 90 : 70),
 memory: systemMetrics.memory?.usage ?? 75,
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

 $effect(() => {

 loadSystemMetrics();

 // Update health metrics periodically
 const interval = window.setInterval(() => {
 loadSystemMetrics();
 },
	30000); // Update every 30 seconds

 return () => clearInterval(interval);

});

 function getHealthColor(score: number): string {
 if (score >= 90) return 'text-accent';
 if (score >= 70) return 'text-warning';
 return 'text-danger/80';
 }

 function getHealthBg(score: number): string {
 if (score >= 90) return 'bg-accent/80';
 if (score >= 70) return 'bg-warning';
 return 'bg-danger/80';
 }
</script>

<div class="bg-panelSoft/50 backdrop-blur rounded-lg p-6 border border-sand/50">
 <div class="flex items-center justify-between mb-4">
 <h2 class="text-xl font-semibold text-info">System Overview</h2>
 {#if loading}
 <div class="flex items-center space-x-2">
 <div class="w-4 h-4 border-2 border-info/80 border-t-transparent rounded-full animate-spin"></div>
 <span class="text-sm text-sand/40">Loading...</span>
 </div>
 {:else if error}
 <div class="text-sm text-danger/80">{error}</div>
 {/if}
 </div>

 <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
 <!-- Overall Health -->
 <div class="bg-panelSoft/30 rounded-lg p-4">
 <div class="flex items-center justify-between mb-2">
 <span class="text-sm text-sand/40">Overall Health</span>
 <span class="text-lg {getHealthColor(systemHealth.overall)}">{systemHealth.overall}%</span>
 </div>
 <div class="w-full bg-panelSoft rounded-full h-2">
 <div class="h-2 rounded-full {getHealthBg(systemHealth.overall)} transition-all duration-300" style="width: {systemHealth.overall}%"></div>
 </div>
 </div>

 <!-- WebGPU Status -->
 <div class="bg-panelSoft/30 rounded-lg p-4">
 <div class="flex items-center justify-between mb-2">
 <span class="text-sm text-sand/40">WebGPU</span>
 <div class="flex items-center space-x-2">
 <div class="w-2 h-2 {webgpuCapabilities?.hasWebGPU ? 'bg-accent/80' : 'bg-danger/80'} rounded-full"></div>
 <span class="text-sm {getHealthColor(systemHealth.webgpu)}">{systemHealth.webgpu}%</span>
 </div>
 </div>
 <div class="text-xs text-sand/60">
 {webgpuCapabilities?.hasWebGPU ? 'GPU Accelerated' : 'CPU Fallback'}
 {#if systemMetrics?.gpu?.model}
 <br />{systemMetrics.gpu.model}
 {/if}
 </div>
 </div>

 <!-- CPU/WebGL Status -->
 <div class="bg-panelSoft/30 rounded-lg p-4">
 <div class="flex items-center justify-between mb-2">
 <span class="text-sm text-sand/40">CPU/WebGL</span>
 <div class="flex items-center space-x-2">
 <div class="w-2 h-2 {cpuCapabilities?.hasWebGL ? 'bg-accent/80' : 'bg-warning'} rounded-full"></div>
 <span class="text-sm {getHealthColor(systemHealth.cpu)}">{systemHealth.cpu}%</span>
 </div>
 </div>
 <div class="text-xs text-sand/60">
 {cpuCapabilities?.maxThreads ?? 4} threads available
 {#if systemMetrics?.cpu?.cores}
 <br />{systemMetrics.cpu.cores} cores
 {/if}
 </div>
 </div>

 <!-- Memory Usage -->
 <div class="bg-panelSoft/30 rounded-lg p-4">
 <div class="flex items-center justify-between mb-2">
 <span class="text-sm text-sand/40">Memory</span>
 <span class="text-sm {getHealthColor(systemHealth.memory)}">{systemHealth.memory}%</span>
 </div>
 <div class="w-full bg-panelSoft rounded-full h-2">
 <div class="h-2 rounded-full {getHealthBg(systemHealth.memory)} transition-all duration-300" style="width: {systemHealth.memory}%"></div>
 </div>
 {#if systemMetrics?.memory}
 <div class="text-xs text-sand/60 mt-1">
 {Math.round(systemMetrics.memory.used / 1024 / 1024)}MB / {Math.round(systemMetrics.memory.total / 1024 / 1024)}MB
 </div>
 {/if}
 </div>
 </div>

 <!-- System Capabilities -->
 <div class="mt-6 pt-4 border-t border-sand/50">
 <h3 class="text-sm font-medium text-sand/40 mb-3">Active Capabilities</h3>
 <div class="flex flex-wrap gap-2">
 {#if webgpuCapabilities?.hasWebGPU}
 <span class="px-2 py-1 bg-info/20 text-info text-xs rounded">WebGPU Compute</span>
 {/if}
 {#if cpuCapabilities?.hasWebGL}
 <span class="px-2 py-1 bg-accent/20 text-accent text-xs rounded">WebGL Fallback</span>
 {/if}
 {#if systemMetrics?.services?.redis}
 <span class="px-2 py-1 bg-danger/20 text-danger/80 text-xs rounded">Redis Cache</span>
 {/if}
 {#if systemMetrics?.services?.qdrant}
 <span class="px-2 py-1 bg-info/20 text-info/80 text-xs rounded">Vector Search</span>
 {/if}
 {#if systemMetrics?.services?.ollama}
 <span class="px-2 py-1 bg-info/20 text-info/80 text-xs rounded">AI Models</span>
 {/if}
 {#if systemMetrics?.services?.database}
 <span class="px-2 py-1 bg-accent/20 text-accent text-xs rounded">Database</span>
 {/if}
 <span class="px-2 py-1 bg-warning/20 text-warning text-xs rounded">Document Processing</span>
 </div>
 </div>

 <!-- Service Status -->
 {#if systemMetrics?.services}
 <div class="mt-4 pt-4 border-t border-sand/50">
 <h3 class="text-sm font-medium text-sand/40 mb-3">Service Status</h3>
 <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
 {#each Object.entries(systemMetrics.services) as [service, status]}
 <div class="flex items-center space-x-2">
 <div class="w-2 h-2 {status === 'online' ? 'bg-accent/80' : 'bg-danger/80'} rounded-full"></div>
 <span class="text-xs text-sand/40 capitalize">{ service }</span>
 </div>
 {/each}
 </div>
 </div>
 {/if}
</div>


