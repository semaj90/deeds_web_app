<script lang="ts">
 import type { ErrorEvent } from '$lib/server/db/schema/index.js';

 interface Props {
 errors?: ErrorEvent[];
 isLoading?: boolean;
 }

 let { errors = [], isLoading = false }: Props = $props();

 let sortBy = $state<'date' | 'severity' | 'code'>('date');
 let filterSeverity = $state<string | null>(null);
 let searchQuery = $state('');

 let filtered = $derived(errors
 .filter(e => !filterSeverity || e.severity === filterSeverity)
 .filter(e => !searchQuery || e.message.toLowerCase().includes(searchQuery.toLowerCase()) || e.tsCode?.includes(searchQuery))
 .sort((a, b) => {
 if (sortBy === 'date') {
 return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
 } else if (sortBy === 'severity') {
 const severityOrder = { fatal: 0, error: 1, warn: 2, info: 3 };
 return (severityOrder[a.severity as keyof typeof severityOrder] || 99) -
 (severityOrder[b.severity as keyof typeof severityOrder] || 99);
 } else {
 return (a.tsCode || '').localeCompare(b.tsCode || '');
 }
 }));

 const getSeverityIcon = (severity: string) => {
 const icons: Record<string, string> = {
 fatal: '🔴',
 error: '❌',
 warn: '⚠️',
 info: 'ℹ️',
 };
 return icons[severity] || '•';
 };

 const getSeverityColor = (severity: string) => {
 const colors: Record<string, string> = {
 fatal: 'bg-red-900 text-red-50',
 error: 'bg-red-700 text-red-50',
 warn: 'bg-yellow-600 text-yellow-50',
 info: 'bg-blue-600 text-blue-50',
 };
 return colors[severity] || 'bg-gray-600 text-gray-50';
 };
</script>

<div class="space-y-4">
 <!-- Header -->
 <div class="flex items-center justify-between">
 <h3 class="text-lg font-semibold">Error Events</h3>
 <span class="text-sm text-gray-500">{filtered.length} / {errors.length} errors</span>
 </div>

 {#if isLoading}
 <div class="text-center py-8">
 <p class="text-gray-500">Loading error events...</p>
 </div>
 {:else if errors.length === 0}
 <div class="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
 <p class="text-green-700">✅ No errors found for this route</p>
 </div>
 {:else}
 <!-- Controls -->
 <div class="space-y-3">
 <!-- Search -->
 <input
 type="text"
 placeholder="Search by message or error code..."
 bind:value={searchQuery}
 class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus: outline-none, focus:ring-2 focus:ring-blue-500"
 />

 <!-- Filters -->
 <div class="flex gap-3 flex-wrap">
 <select
 bind:value={sortBy}
 class="px-3 py-2 border border-gray-300 rounded-md text-sm focus: outline-none, focus:ring-2 focus:ring-blue-500"
 >
 <option value="date">Sort by Date</option>
 <option value="severity">Sort by Severity</option>
 <option value="code">Sort by Code</option>
 </select>

 <select
 bind:value={filterSeverity}
 class="px-3 py-2 border border-gray-300 rounded-md text-sm focus: outline-none, focus:ring-2 focus:ring-blue-500"
 >
 <option value={ null }>All Severities</option>
 <option value="fatal">Fatal</option>
 <option value="error">Error</option>
 <option value="warn">Warning</option>
 <option value="info">Info</option>
 </select>
 </div>
 </div>

 <!-- Error List -->
 <div class="space-y-2 max-h-[600px] overflow-y-auto">
 {#each filtered as error (error.id)}
 <div class="border border-gray-200 rounded-lg p-3 hover:bg-gray-50">
 <div class="flex items-start gap-3">
 <!-- Icon -->
 <span class="text-xl mt-0.5">{getSeverityIcon(error.severity)}</span>

 <!-- Content -->
 <div class="flex-1 min-w-0">
 <!-- Error Code & Severity -->
 <div class="flex items-center gap-2 flex-wrap">
 {#if error.tsCode}
 <span class="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{error.tsCode}</span>
 {/if}
 <span class={`text-xs font-semibold px-2 py-1 rounded ${getSeverityColor(error.severity)}`}>
 {error.severity.toUpperCase()}
 </span>
 </div>

 <!-- Message -->
 <p class="text-sm text-gray-700 mt-1 break-words">{error.message}</p>

 <!-- File & Cluster -->
 <div class="flex items-center gap-4 mt-2 text-xs text-gray-600">
 <span class="font-mono truncate">{error.filePath}</span>
 {#if error.clusterId}
 <span class="bg-blue-100 text-blue-700 px-2 py-1 rounded">{error.clusterId}</span>
 {/if}
 </div>

 <!-- Timestamp -->
 <p class="text-xs text-gray-500 mt-2">
 {new Date(error.createdAt).toLocaleString()}
 </p>
 </div>
 </div>
 </div>
 {/each}
 </div>
 {/if}
</div>

<style>
 :global(.error-events) {
 @apply space-y-4;
 }
</style>


