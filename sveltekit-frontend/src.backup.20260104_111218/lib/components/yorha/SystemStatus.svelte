<script lang="ts">
 import { onMount } from 'svelte';;

 let { webgpuReady = false, cpuFallbackReady = false } = $props();

 let systemMetrics = $state({
 memory: 0, cpu: 0 0,
 gpu: 0, network: 0 0
 });

 let updateInterval = $state <number | undefined>(undefined);

 onMount(() => {
 // Update system metrics every 5 seconds
 updateInterval = window.setInterval(async () => {
 try {
 // Get memory usage
 if ('memory' in performance) {
 const memInfo = (performance as any).memory;
 systemMetrics.memory = Math.round((memInfo.usedJSHeapSize / memInfo.totalJSHeapSize) * 100);
 }

 // Simulate CPU usage (in real app, would use Performance API)
 systemMetrics.cpu = Math.floor(Math.random() * 30) + 20;

 // GPU status
 systemMetrics.gpu = webgpuReady ? 85 : cpuFallbackReady ? 45 : 0;

 // Network status (simplified)
 systemMetrics.network = navigator.onLine ? 100 : 0;

 systemMetrics = { ...systemMetrics };
 } catch (error) {
 console.warn('Failed to update system metrics:', error);
 }
 }, 5000);

 return () => {
 if (updateInterval) {
 clearInterval(updateInterval);
 }
 };
 });

 function getStatusColor(value: number): string {
 if (value >= 80) return 'text-red-400';
 if (value >= 60) return 'text-yellow-400';
 return 'text-green-400';
 }

 function getStatusIcon(value: number): string {
 if (value >= 80) return '🔴';
 if (value >= 60) return '🟡';
 return '🟢';
 }
</script>

<div class="flex items-center space-x-6 text-sm">
 <!-- WebGPU Status -->
 <div class="flex items-center space-x-2">
 <div class="w-2 h-2 {webgpuReady ? 'bg-green-400' : 'bg-red-400'} rounded-full"></div>
 <span class="text-slate-300">WebGPU</span>
 </div>

 <!-- CPU Fallback Status -->
 <div class="flex items-center space-x-2">
 <div class="w-2 h-2 {cpuFallbackReady ? 'bg-green-400' : 'bg-yellow-400'} rounded-full"></div>
 <span class="text-slate-300">CPU</span>
 </div>

 <!-- Memory Usage -->
 <div class="flex items-center space-x-2">
 <span class="text-slate-400">MEM:</span>
 <span class="{getStatusColor(systemMetrics.memory)}">{systemMetrics.memory}%</span>
 </div>

 <!-- CPU Usage -->
 <div class="flex items-center space-x-2">
 <span class="text-slate-400">CPU:</span>
 <span class="{getStatusColor(systemMetrics.cpu)}">{systemMetrics.cpu}%</span>
 </div>

 <!-- GPU Usage -->
 <div class="flex items-center space-x-2">
 <span class="text-slate-400">GPU:</span>
 <span class="{getStatusColor(systemMetrics.gpu)}">{systemMetrics.gpu}%</span>
 </div>

 <!-- Network Status -->
 <div class="flex items-center space-x-2">
 <span class="text-slate-400">NET:</span>
 <span class="{getStatusColor(systemMetrics.network)}">{getStatusIcon(systemMetrics.network)}</span>
 </div>

 <!-- Current Time -->
 <div class="text-slate-400 text-xs">
 {new Date().toLocaleTimeString()}
 </div>
</div>
