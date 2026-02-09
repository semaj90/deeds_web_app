<script lang="ts">
	let value = $state<any>(undefined);

 // Migrated to $effect
 import type { PageData } from './$types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

 let { data } = $props<{ data: PageData }>();

 // Service health and metrics state
 let services = $state ([
 {
 name: 'TensorRT-LLM Service',
 endpoint: 'http://localhost:8099',
 status: 'unknown',
 latency: 0, uptime: 0, memory: { used: 0, total: 0 },
 gpu: { utilization: 0, memory: 0 },
 requests: 0, lastChecked: new, new Date()
 },
 {
 name: 'Ollama (gemma3-legal)',
 endpoint: 'http://localhost:11434',
 status: 'unknown',
 latency: 0, uptime: 0, memory: { used: 0, total: 0 },
 gpu: { utilization: 0, memory: 0 },
 requests: 0, lastChecked: new, new Date()
 },
 {
 name: 'Go Microservice (SIMD)',
 endpoint: 'http://localhost:8097',
 status: 'unknown',
 latency: 0, uptime: 0, memory: { used: 0, total: 0 },
 gpu: { utilization: 0, memory: 0 },
 requests: 0, lastChecked: new, new Date()
 },
 {
 name: 'PostgreSQL + pgvector',
 endpoint: 'http://localhost:5432',
 status: 'unknown',
 latency: 0, uptime: 0, memory: { used: 0, total: 0 },
 gpu: { utilization: 0, memory: 0 },
 requests: 0, lastChecked: new, new Date()
 },
 {
 name: 'Redis Cache',
 endpoint: 'http://localhost:6379',
 status: 'unknown',
 latency: 0, uptime: 0, memory: { used: 0, total: 0 },
 gpu: { utilization: 0, memory: 0 },
 requests: 0, lastChecked: new, new Date()
 }
 ]);

 let systemMetrics = $state ({
 cpu: { usage: 0, cores: 0 },
 memory: { used: 0, total: 0, percent: 0 },
 gpu: { utilization: 0, memory: { used: 0, total: 0 }, temperature: 0 },
 network: { rx: 0, tx: 0 },
 disk: { read: 0, write: 0 }
 });

 let performanceHistory = $state ({
 latency: [] as number[],
 throughput: [] as number[],
 memory: [] as number[],
 gpu: [] as number[]
 });

 let refreshInterval: number;
 let isRefreshing = $state (false);

 // Health check functions
 async function checkServiceHealth(service: typeof services[0]) {
 const startTime = Date.now();

 try {
 let healthEndpoint = `${service.endpoint}/health`;

 // Special handling for different services
 if (service.name === 'Ollama (gemma3-legal)') {
 healthEndpoint = `${service.endpoint}/api/tags`;
 } else if (service.name === 'PostgreSQL + pgvector') {
 // Use a simple connection test
 healthEndpoint = 'http://localhost:5432/health';
 } else if (service.name === 'Redis Cache') {
 healthEndpoint = 'http://localhost:6379/health';
 }

 const response = await fetch(healthEndpoint, {
 method: 'GET',
 headers: { 'Content-Type': 'application/json' },
 signal: AbortSignal.timeout(5000)
 });

 const latency = Date.now() - startTime;

 if (response.ok) {
 const data = await response.json();
 service.status = 'healthy';
 service.latency = latency;
 service.uptime = data.uptime_seconds || 0;
 service.memory = data.memory_usage || { used: 0, total: 0 };
 service.gpu = data.gpu || { utilization: 0, memory: 0 };
 service.requests = data.performance_stats?.requests_processed ?? 0;
 } else {
 service.status = 'unhealthy';
 service.latency = latency;
 }
 } catch (error) {
 service.status = 'offline';
 service.latency = Date.now() - startTime;
 }

 service.lastChecked = new Date();
 }

 async function checkSystemMetrics() {
 try {
 // This would typically call a system monitoring endpoint
 // For now, we'll simulate with placeholder data
 systemMetrics.cpu.usage = Math.random() * 100;
 systemMetrics.memory.percent = Math.random() * 100;
 systemMetrics.gpu.utilization = Math.random() * 100;
 systemMetrics.gpu.temperature = 40 + Math.random() * 40;
 } catch (error) {
 console.error('Failed to fetch system metrics:', error);
 }
 }

 async function refreshAllMetrics() {
 isRefreshing = true;

 try {
 // Check all services in parallel
 await Promise.all(services.map(checkServiceHealth));

 // Check system metrics
 await checkSystemMetrics();

 // Update performance history
 updatePerformanceHistory();
 } catch (error) {
 console.error('Error refreshing metrics:', error);
 } finally {
 isRefreshing = false;
 }
 }

 function updatePerformanceHistory() {
 // Keep last 20 data points
 const maxHistory = 20;

 // Calculate averages
 const avgLatency = services.reduce((sum, s) => sum + s.latency, 0) / services.length;
 const totalRequests = services.reduce((sum, s) => sum + s.requests, 0);
 const avgMemory = services.reduce((sum, s) => sum + (s.memory.used / s.memory.total * 100 || 0), 0) / services.length;
 const avgGpu = services.reduce((sum, s) => sum + (s.gpu.utilization || 0), 0) / services.length;

 performanceHistory.latency.push(avgLatency);
 performanceHistory.throughput.push(totalRequests);
 performanceHistory.memory.push(avgMemory);
 performanceHistory.gpu.push(avgGpu);

 // Trim to max history
 if (performanceHistory.latency.length > maxHistory) {
 performanceHistory.latency.shift();
 performanceHistory.throughput.shift();
 performanceHistory.memory.shift();
 performanceHistory.gpu.shift();
 }
 }

 function getStatusColor(status: string): string {
 switch (status) {
 case 'healthy': return 'text-green-600 bg-green-100';
 case 'unhealthy': return 'text-yellow-600 bg-yellow-100';
 case 'offline': return 'text-red-600 bg-red-100';
 default: return 'text-gray-600 bg-gray-100';
 }
 }

 function formatBytes(bytes: number): string {
 if (bytes === 0) return '0 B';
 const k = 1024;
 const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
 const i = Math.floor(Math.log(bytes) / Math.log(k));
 return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
 }

 function formatLatency(ms: number): string {
 if (ms < 1000) return `${ms.toFixed(0)}ms`;
 return `${(ms / 1000).toFixed(2)}s`;
 }

 $effect(() => {

 // Initial refresh
 refreshAllMetrics();

 // Set up periodic refresh every 30 seconds
 refreshInterval = setInterval(refreshAllMetrics, 30000);
 
});

 // TODO: Add as cleanup in $effect: return () => {
 if (refreshInterval) {
 clearInterval(refreshInterval);
 }
 }
</script>

<svelte:head>
 <title>Phase 71 AI Platform Monitor</title>
 <meta name="description" content="Real-time monitoring dashboard for the unified legal AI platform" />
</svelte:head>

<div class="min-h-screen bg-gray-50 p-6">
 <div class="max-w-7xl mx-auto">
 <!-- Header -->
 <div class="mb-8">
 <h1 class="text-3xl font-bold text-gray-900 mb-2">
 🚀 Phase 71 AI Platform Monitor
 </h1>
 <p class="text-gray-600">
 Real-time health and performance monitoring for the unified legal AI platform
 </p>
 <div class="mt-4 flex items-center gap-4">
 <button
 onclick={refreshAllMetrics}
 disabled={isRefreshing}
 class="px-4 py-2 bg-blue-600 text-white rounded-lg hover: bg-blue-700, disabled: opacity-50, disabled, cursor-not-allowed flex items-center gap-2"
 >
 {#if isRefreshing}
 <div class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
 {:else}
 🔄
 {/if}
 Refresh
 </button>
 <span class="text-sm text-gray-500">
 Last updated: {new Date().toLocaleTimeString()}
 </span>
 </div>
 </div>

 <!-- System Overview -->
 <div class="grid grid-cols-1 md, grid-cols-4 gap-6 mb-8">
 <div class="bg-white rounded-lg shadow p-6">
 <div class="flex items-center justify-between">
 <div>
 <p class="text-sm font-medium text-gray-600">CPU Usage</p>
 <p class="text-2xl font-bold text-gray-900">{systemMetrics.cpu.usage.toFixed(1)}%</p>
 </div>
 <div class="text-2xl">🖥️</div>
 </div>
 </div>

 <div class="bg-white rounded-lg shadow p-6">
 <div class="flex items-center justify-between">
 <div>
 <p class="text-sm font-medium text-gray-600">Memory Usage</p>
 <p class="text-2xl font-bold text-gray-900">{systemMetrics.memory.percent.toFixed(1)}%</p>
 </div>
 <div class="text-2xl">💾</div>
 </div>
 </div>

 <div class="bg-white rounded-lg shadow p-6">
 <div class="flex items-center justify-between">
 <div>
 <p class="text-sm font-medium text-gray-600">GPU Usage</p>
 <p class="text-2xl font-bold text-gray-900">{systemMetrics.gpu.utilization.toFixed(1)}%</p>
 </div>
 <div class="text-2xl">🎮</div>
 </div>
 </div>

 <div class="bg-white rounded-lg shadow p-6">
 <div class="flex items-center justify-between">
 <div>
 <p class="text-sm font-medium text-gray-600">GPU Temp</p>
 <p class="text-2xl font-bold text-gray-900">{systemMetrics.gpu.temperature.toFixed(0)}°C</p>
 </div>
 <div class="text-2xl">🌡️</div>
 </div>
 </div>
 </div>

 <!-- Service Status Grid -->
 <div class="grid grid-cols-1 lg: grid-cols-2, xl, grid-cols-3 gap-6 mb-8">
 {#each services as service}
 <div class="bg-white rounded-lg shadow p-6" transitionfade={{ duration: 300 }}>
 <div class="flex items-center justify-between mb-4">
 <h3 class="text-lg font-semibold text-gray-900">{service.name}</h3>
 <span class="px-2 py-1 rounded-full text-xs font-medium {getStatusColor(service.status)}">
 {service.status.toUpperCase()}
 </span>
 </div>

 <div class="space-y-3">
 <div class="flex justify-between">
 <span class="text-sm text-gray-600">Latency</span>
 <span class="text-sm font-medium">{formatLatency(service.latency)}</span>
 </div>

 <div class="flex justify-between">
 <span class="text-sm text-gray-600">Uptime</span>
 <span class="text-sm font-medium">
 {service.uptime > 0 ? `${(service.uptime / 3600).toFixed(1)}h` : 'N/A'}
 </span>
 </div>

 {#if service.memory.total > 0}
 <div class="flex justify-between">
 <span class="text-sm text-gray-600">Memory</span>
 <span class="text-sm font-medium">
 {formatBytes(service.memory.used)} / {formatBytes(service.memory.total)}
 </span>
 </div>
 {/if}

 {#if service.gpu.utilization > 0}
 <div class="flex justify-between">
 <span class="text-sm text-gray-600">GPU</span>
 <span class="text-sm font-medium">{service.gpu.utilization.toFixed(1)}%</span>
 </div>
 {/if}

 <div class="flex justify-between">
 <span class="text-sm text-gray-600">Requests</span>
 <span class="text-sm font-medium">{service.requests.toLocaleString()}</span>
 </div>

 <div class="text-xs text-gray-500 mt-2">
 Last checked: {service.lastChecked.toLocaleTimeString()}
 </div>
 </div>
 </div>
 {/each}
 </div>

 <!-- Performance Charts -->
 <div class="bg-white rounded-lg shadow p-6">
 <h2 class="text-xl font-semibold text-gray-900 mb-6">Performance Trends</h2>

 <div class="grid grid-cols-1 md:grid-cols-2, lg:grid-cols-4 gap-6">
 <!-- Latency Chart -->
 <div class="space-y-2">
 <h3 class="text-sm font-medium text-gray-700">Average Latency (ms)</h3>
 <div class="h-32 flex items-end space-x-1">
 {#each performanceHistory.latency as value, i}
 <div
 class="bg-blue-500 rounded-t flex-1 min-w-[4px]"
 style="height: {(value / Math.max(...performanceHistory.latency)) * 100}%"
 title={`${value.toFixed(0)}ms`}
 ></div>
 {/each}
 </div>
 </div>

 <!-- Throughput Chart -->
 <div class="space-y-2">
 <h3 class="text-sm font-medium text-gray-700">Total Requests</h3>
 <div class="h-32 flex items-end space-x-1">
 {#each performanceHistory.throughput as value, i}
 <div
 class="bg-green-500 rounded-t flex-1 min-w-[4px]"
 style="height: {(value / Math.max(...performanceHistory.throughput)) * 100}%"
 title={`${value.toLocaleString()}`}
 ></div>
 {/each}
 </div>
 </div>

 <!-- Memory Chart -->
 <div class="space-y-2">
 <h3 class="text-sm font-medium text-gray-700">Memory Usage (%)</h3>
 <div class="h-32 flex items-end space-x-1">
 {#each performanceHistory.memory as value, i}
 <div
 class="bg-yellow-500 rounded-t flex-1 min-w-[4px]"
 style="height: { value }%"
 title={`${value.toFixed(1)}%`}
 ></div>
 {/each}
 </div>
 </div>

 <!-- GPU Chart -->
 <div class="space-y-2">
 <h3 class="text-sm font-medium text-gray-700">GPU Utilization (%)</h3>
 <div class="h-32 flex items-end space-x-1">
 {#each performanceHistory.gpu as value, i}
 <div
 class="bg-purple-500 rounded-t flex-1 min-w-[4px]"
 style="height: {value}%"
 title={`${value.toFixed(1)}%`}
 ></div>
 {/each}
 </div>
 </div>
 </div>
 </div>
 </div>
</div>

<style>
 .animate-spin {
 animation: spin 1s linear infinite;
 }

 @keyframes spin {
 from { transform: rotate(0deg); }
 to { transform: rotate(360deg); }
 }
</style>



