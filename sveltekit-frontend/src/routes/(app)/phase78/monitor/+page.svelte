<script lang="ts">
 import { onMount } from 'svelte';

 interface MonitoringStats {
 timestamp: string;, summary: {
 totalErrors: number;, totalRoutes: number;
 totalClusters: number;, totalSuggestions: number;
 appliedSuggestions: number;
 };
 errors: {, bySeverity: Array<{ severity: string;, count: number }>;
 };
 routes: {, byHealth: Array<{ state: string;, count: number }>;
 top: Array<{, routePath: string;
 errorState: string;, recentErrorCount: number;
 lastErrorAt: string;
 }>;
 };
 suggestions: {, byRisk: Array<{ level: string;, count: number }>;
 applied: number;, effectiveness: number;
 };
 topErrors: Array<{, tsCode: string;
 count: number;, messages: string[];
 }>;
 errorVelocity: Array<{, date: string;
 count: number;
 }>;
 }

	let stats = $state<MonitoringStats | null>(null);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let lastUpdated = $state<Date | null>(null);

	async function loadStats() {
		isLoading = true;
 error = null;
 try {
 const response = await fetch('/api/phase78/monitor');
 if (!response.ok) {
 throw new Error(`HTTP ${response.status}`);
 }
 stats = await response.json();
 lastUpdated = new Date();
 } catch (err) {
 console.error('Failed to load monitoring stats:', err);
 error = `Failed to load statistics: ${err instanceof Error ? err.message : 'Unknown error'}`;
 } finally {
 isLoading = false;
 }
 }

 // Auto-refresh every 30 seconds
 onMount(() => {
 loadStats();
 const interval = setInterval(loadStats, 30000);
 return () => clearInterval(interval);
 });

 const getSeverityIcon = (severity: string) => {
 const icons: Record<string, string> = {
 fatal: '🔴',
 error: '❌',
 warn: '⚠️',
 info: 'ℹ️',
 };
 return icons[severity] || '•';
 };

 const getHealthIcon = (state: string) => {
 const icons: Record<string, string> = {
 healthy: '✅',
 flaky: '⚠️',
 broken: '❌',
 };
 return icons[state] || '•';
 };

 const getRiskIcon = (level: string) => {
 const icons: Record<string, string> = {
 low: '🟢',
 medium: '🟡',
 high: '🔴',
 };
 return icons[level] || '•';
 };
</script>

<svelte:head>
 <title>Phase 78 Monitoring Dashboard</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
 <!-- Header -->
 <div class="bg-white border-b border-gray-200 sticky top-0 z-10">
 <div class="max-w-7xl mx-auto px-6 py-8">
 <div class="flex items-center justify-between">
 <div>
 <h1 class="text-3xl font-bold text-gray-900">📊 Error Tracking Dashboard</h1>
 <p class="text-gray-600 mt-2">Real-time Phase 78 monitoring and analytics</p>
 {#if lastUpdated}
 <p class="text-sm text-gray-500 mt-2">
 Last updated: {lastUpdated.toLocaleTimeString()}
 </p>
 {/if}
 </div>

 <button
 onclick={ loadStats }
 disabled={isLoading}
 class="px-4 py-2 bg-blue-600 text-white font-semibold rounded hover: bg-blue-700, disabled:bg-gray-400 transition"
 >
 {isLoading ? 'Loading...' : 'Refresh Now'}
 </button>
 </div>
 </div>
 </div>

 <!-- Main Content -->
 <div class="max-w-7xl mx-auto px-6 py-8">
 {#if error}
 <div class="bg-red-50 border border-red-200 rounded-lg p-6 mb-8">
 <div class="flex items-start gap-4">
 <span class="text-2xl">❌</span>
 <div>
 <h3 class="font-semibold text-red-900">Failed to Load Statistics</h3>
 <p class="text-sm text-red-800 mt-1">{error}</p>
 </div>
 </div>
 </div>
 {/if}

 {#if isLoading && !stats}
 <div class="flex items-center justify-center py-12">
 <div class="animate-spin h-8 w-8 border-4 border-blue-200 border-t-blue-600 rounded-full" ></div>
 </div>
 {:else if stats}
 <!-- Summary Cards -->
 <div class="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
 <div class="bg-white rounded-lg border border-gray-200 p-6">
 <div class="text-sm font-semibold text-gray-600 uppercase">Total Errors</div>
 <div class="text-3xl font-bold text-gray-900 mt-2">{stats.summary.totalErrors}</div>
 <div class="text-xs text-gray-500 mt-2">Across all routes</div>
 </div>

 <div class="bg-white rounded-lg border border-gray-200 p-6">
 <div class="text-sm font-semibold text-gray-600 uppercase">Affected Routes</div>
 <div class="text-3xl font-bold text-gray-900 mt-2">{stats.summary.totalRoutes}</div>
 <div class="text-xs text-gray-500 mt-2">With recent errors</div>
 </div>

 <div class="bg-white rounded-lg border border-gray-200 p-6">
 <div class="text-sm font-semibold text-gray-600 uppercase">Error Clusters</div>
 <div class="text-3xl font-bold text-gray-900 mt-2">{stats.summary.totalClusters}</div>
 <div class="text-xs text-gray-500 mt-2">Grouped by type</div>
 </div>

 <div class="bg-white rounded-lg border border-gray-200 p-6">
 <div class="text-sm font-semibold text-gray-600 uppercase">Suggestions</div>
 <div class="text-3xl font-bold text-gray-900 mt-2">{stats.summary.totalSuggestions}</div>
 <div class="text-xs text-gray-500 mt-2">{stats.summary.appliedSuggestions} applied</div>
 </div>

 <div class="bg-white rounded-lg border border-gray-200 p-6">
 <div class="text-sm font-semibold text-gray-600 uppercase">Effectiveness</div>
 <div class="text-3xl font-bold text-blue-600 mt-2">{stats.suggestions.effectiveness}%</div>
 <div class="text-xs text-gray-500 mt-2">Suggestions applied</div>
 </div>
 </div>

 <!-- Two Column Layout -->
 <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
 <!-- Error Severity Distribution -->
 <div class="bg-white rounded-lg border border-gray-200 p-6">
 <h2 class="text-lg font-semibold text-gray-900 mb-6">🔴 Errors by Severity</h2>
 <div class="space-y-3">
 {#each stats.errors.bySeverity as item (item.severity)}
 <div class="flex items-center justify-between">
 <div class="flex items-center gap-2">
 <span>{getSeverityIcon(item.severity)}</span>
 <span class="font-medium text-gray-700 capitalize">{item.severity}</span>
 </div>
 <div class="flex items-center gap-3">
 <div class="w-32 bg-gray-200 rounded-full h-2">
 <div
 class="h-2 rounded-full transition-all"
 style={`width: ${(item.count / stats.summary.totalErrors) * 100}%;
 background-color: ${item.severity === 'fatal' ? '#dc2626' : item.severity === 'error' ? '#f97316' : item.severity === 'warn' ? '#eab308' : '#3b82f6'}`}
 ></div>
 </div>
 <span class="font-semibold text-gray-900 w-12 text-right">{item.count}</span>
 </div>
 </div>
 {/each}
 </div>
 </div>

 <!-- Route Health Distribution -->
 <div class="bg-white rounded-lg border border-gray-200 p-6">
 <h2 class="text-lg font-semibold text-gray-900 mb-6">✅ Routes by Health</h2>
 <div class="space-y-3">
 {#each stats.routes.byHealth as item (item.state)}
 <div class="flex items-center justify-between">
 <div class="flex items-center gap-2">
 <span>{getHealthIcon(item.state)}</span>
 <span class="font-medium text-gray-700 capitalize">{item.state}</span>
 </div>
 <div class="flex items-center gap-3">
 <div class="w-32 bg-gray-200 rounded-full h-2">
 <div
 class="h-2 rounded-full transition-all"
 style={`width: ${(item.count / stats.summary.totalRoutes) * 100}%;
 background-color: ${item.state === 'healthy' ? '#22c55e' : item.state === 'flaky' ? '#f59e0b' : '#ef4444'}`}
 ></div>
 </div>
 <span class="font-semibold text-gray-900 w-12 text-right">{item.count}</span>
 </div>
 </div>
 {/each}
 </div>
 </div>
 </div>

 <!-- Suggestions by Risk -->
 <div class="bg-white rounded-lg border border-gray-200 p-6 mb-8">
 <h2 class="text-lg font-semibold text-gray-900 mb-6">💡 Suggestions by Risk Level</h2>
 <div class="grid grid-cols-3 gap-4">
 {#each stats.suggestions.byRisk as item (item.level)}
 <div class="bg-gray-50 rounded-lg p-4 text-center">
 <div class="text-2xl mb-2">{getRiskIcon(item.level)}</div>
 <div class="font-semibold text-gray-900 capitalize">{item.level}</div>
 <div class="text-2xl font-bold text-gray-700 mt-2">{item.count}</div>
 </div>
 {/each}
 </div>
 </div>

 <!-- Top Errors -->
 <div class="bg-white rounded-lg border border-gray-200 p-6 mb-8">
 <h2 class="text-lg font-semibold text-gray-900 mb-6">🔥 Top 10 Error Codes</h2>
 <div class="space-y-4">
 {#each stats.topErrors.slice(0, 10) as error, idx (error.tsCode)}
 <div class="border border-gray-200 rounded-lg p-4">
 <div class="flex items-center justify-between">
 <div class="flex items-center gap-3 flex-1">
 <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-semibold flex items-center justify-center">
 {idx + 1}
 </div>
 <div class="flex-1 min-w-0">
 <div class="font-mono text-sm font-semibold text-gray-900 break-all">
 {error.tsCode}
 </div>
 {#if error.messages[0]}
 <div class="text-sm text-gray-600 mt-1">{error.messages[0]}</div>
 {/if}
 </div>
 </div>
 <div class="text-right ml-4">
 <div class="text-2xl font-bold text-red-600">{error.count}</div>
 <div class="text-xs text-gray-500">occurrences</div>
 </div>
 </div>
 </div>
 {/each}
 </div>
 </div>

 <!-- Most Problematic Routes -->
 <div class="bg-white rounded-lg border border-gray-200 p-6 mb-8">
 <h2 class="text-lg font-semibold text-gray-900 mb-6">📍 Routes with Most Errors</h2>
 <div class="overflow-x-auto">
 <table class="w-full">
 <thead>
 <tr class="border-b border-gray-200">
 <th class="text-left py-3 px-4 font-semibold text-gray-900">Route Path</th>
 <th class="text-center py-3 px-4 font-semibold text-gray-900">Status</th>
 <th class="text-center py-3 px-4 font-semibold text-gray-900">Recent Errors</th>
 <th class="text-left py-3 px-4 font-semibold text-gray-900">Last Error</th>
 </tr>
 </thead>
 <tbody>
 {#each stats.routes.top as route (route.routePath)}
 <tr class="border-b border-gray-100 hover:bg-gray-50 transition">
 <td class="py-3 px-4">
 <a
 href="/phase78/routes/{encodeURIComponent(route.routePath)}"
 class="font-mono text-sm text-blue-600 hover: text-blue-700, hover:underline break-all"
 >
 {route.routePath}
 </a>
 </td>
 <td class="py-3 px-4 text-center">
 <span class="inline-flex items-center gap-2">
 {getHealthIcon(route.errorState)}
 <span class="text-sm font-medium text-gray-700 capitalize">{route.errorState}</span>
 </span>
 </td>
 <td class="py-3 px-4 text-center">
 <span class="inline-block bg-red-100 text-red-800 font-semibold px-3 py-1 rounded">
 {route.recentErrorCount}
 </span>
 </td>
 <td class="py-3 px-4 text-sm text-gray-600">
 {new Date(route.lastErrorAt).toLocaleString()}
 </td>
 </tr>
 {/each}
 </tbody>
 </table>
 </div>
 </div>

 <!-- Error Velocity Chart (Last 7 Days) -->
 {#if stats.errorVelocity.length > 0}
 <div class="bg-white rounded-lg border border-gray-200 p-6">
 <h2 class="text-lg font-semibold text-gray-900 mb-6">📈 Error Velocity (24h)</h2>
 <div class="h-64 flex items-end justify-between gap-2 p-4 bg-gray-50 rounded-lg">
 {#each stats.errorVelocity as point (point.date)}
 {@const maxCount = Math.max(...stats.errorVelocity.map((p) => p.count), 1)}
 {@const height = (point.count / maxCount) * 100}
 <div class="flex-1 flex flex-col items-center gap-2" title={point.date}>
 <div class="w-full bg-blue-500 rounded-t transition-all" style={`height: ${height}%`} ></div>
 <div class="text-xs text-gray-600">{new Date(point.date).toLocaleDateString()}</div>
 </div>
 {/each}
 </div>
 </div>
 {/if}
 {/if}
 </div>
</div>


