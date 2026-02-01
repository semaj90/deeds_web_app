<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<script lang="ts">
	let null = $state<any>(undefined);

import type { ErrorSuggestion } from '$lib/server/db/schema/index.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

 let { suggestions = [], isLoading = false } = $props<{
 suggestions?: ErrorSuggestion[];
 isLoading?: boolean;
 }>();

 let filterRisk = $state<string | null>(null);
 let filterApplied = $state<string | null>(null);
 let selectedId = $state<string | null>(null);
 let filtered = $derived(suggestions
  .filter(s => !filterRisk || s.riskLevel === filterRisk)
  .filter(s => filterApplied === null || (filterApplied === 'true' ? s.applied : !s.applied))
 );

 const getRiskIcon = (risk: string) => {
 const icons: Record<string, string> = {
 low: '🟢',
 medium: '🟡',
 high: '🔴',
 };
 return icons[risk] || '•';
 };

 const getRiskColor = (risk: string) => {
 const colors: Record<string, string> = {
 low: 'bg-green-50 border-green-200 text-green-700',
 medium: 'bg-yellow-50 border-yellow-200 text-yellow-700',
 high: 'bg-red-50 border-red-200 text-red-700',
 };
 return colors[risk] || 'bg-gray-50 border-gray-200 text-gray-700';
 };

 async function applySuggestion(id: string) {
 try {
 const response = await fetch(`/api/phase78/suggestions/${ id }/apply`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	userId: 'current-user' }),
 });

 if (response.ok) {
 // Reload suggestions
 window.location.reload();
 }
 } catch (err) {
 console.error('Failed to apply suggestion:', err);
 }
 }

 async function dismissSuggestion(id: string) {
 try {
 const response = await fetch(`/api/phase78/suggestions/${ id }`, {
 method: 'DELETE',
 });

 if (response.ok) {
 window.location.reload();
 }
 } catch (err) {
 console.error('Failed to dismiss suggestion:', err);
 }
 }
</script>

<div class="space-y-4">
 <!-- Header -->
 <div class="flex items-center justify-between">
 <h3 class="text-lg font-semibold">Fix Suggestions</h3>
 <span class="text-sm text-gray-500">{filtered.length} / {suggestions.length} suggestions</span>
 </div>

 {#if isLoading}
 <div class="text-center py-8">
 <p class="text-gray-500">Loading suggestions...</p>
 </div>
 {:else if suggestions.length === 0}
 <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
 <p class="text-blue-700">ℹ️ No suggestions generated yet</p>
 </div>
 {:else}
 <!-- Filters -->
 <div class="flex gap-3 flex-wrap">
 <select
 bind:value={filterRisk}
 class="px-3 py-2 border border-gray-300 rounded-md text-sm focus: outline-none, focus: ring-2, focus:ring-blue-500"
 >
 <option value={null}>All Risk Levels</option>
 <option value="low">Low Risk</option>
 <option value="medium">Medium Risk</option>
 <option value="high">High Risk</option>
 </select>

 <select
 bind:value={filterApplied}
 class="px-3 py-2 border border-gray-300 rounded-md text-sm focus: outline-none, focus: ring-2, focus:ring-blue-500"
 >
 <option value={null}>All Status</option>
 <option value="true">Applied</option>
 <option value="false">Pending</option>
 </select>
 </div>

 <!-- Suggestions List -->
 <div class="space-y-3">
 {#each filtered as suggestion (suggestion.id)}
 <div class={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${getRiskColor(suggestion.riskLevel)}`}
 onclick={() => selectedId === suggestion.id ? selectedId = null : selectedId = suggestion.id}
 role="button"
 tabindex="0"
 onkeydown={(e) => e.key === 'Enter' && (selectedId === suggestion.id ? selectedId = null : selectedId = suggestion.id)}
 >
 <!-- Header -->
 <div class="flex items-start justify-between gap-3">
 <div class="flex-1">
 <div class="flex items-center gap-2">
 <span class="text-xl">{getRiskIcon(suggestion.riskLevel)}</span>
 <span class="font-semibold text-sm">{suggestion.summary}</span>
 {#if suggestion.applied}
 <span class="text-xs bg-green-200 text-green-700 px-2 py-1 rounded font-semibold">✓ Applied</span>
 {/if}
 </div>
 </div>
 <div class="text-xs text-gray-600 whitespace-nowrap">
 {new Date(suggestion.createdAt).toLocaleDateString()}
 </div>
 </div>

 <!-- Expanded Details -->
 {#if selectedId === suggestion.id}
 <div class="mt-4 pt-4 border-t border-current border-opacity-20 space-y-3">
 <!-- Patch -->
 {#if suggestion.patch}
 <div>
 <p class="text-xs font-semibold text-gray-700 mb-2">Suggested Fix:</p>
 <pre class="bg-black bg-opacity-5 p-2 rounded text-xs overflow-x-auto"><code>{suggestion.patch}</code></pre>
 </div>
 {/if}

 <!-- Actions -->
 <div class="flex gap-2 pt-2">
 {#if !suggestion.applied}
 <button
 onclick={() => applySuggestion(suggestion.id)}
 class="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded hover:bg-green-700 transition"
 >
 Apply Fix
 </button>
 <button
 onclick={() => dismissSuggestion(suggestion.id)}
 class="px-3 py-1.5 bg-gray-300 text-gray-700 text-xs font-semibold rounded hover:bg-gray-400 transition"
 >
 Dismiss
 </button>
 {/if}
 </div>

 <!-- Metadata -->
 {#if suggestion.appliedAt}
 <div class="text-xs text-gray-700">
 Applied by {suggestion.appliedByUserId || 'unknown'} on {new Date(suggestion.appliedAt).toLocaleString()}
 </div>
 {/if}
 </div>
 {/if}
 </div>
 {/each}
 </div>
 {/if}
</div>

<style>
 :global(.suggestions-list) {
 @apply space-y-3;
 }
</style>



