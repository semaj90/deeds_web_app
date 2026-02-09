<script lang="ts">
	import ErrorEventsList from '$lib/components/phase78/ErrorEventsList.svelte';
	import SuggestionsList from '$lib/components/phase78/SuggestionsList.svelte';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
	// Migrated to $effect

	let { data } = $props();

	let routePath = $derived(data.routePath);

	let health: any = null;
	let errors: any[] = [];
	let suggestions: any[] = [];
	let isLoading = false;
	let tab = 'errors';

	async function loadData() {
		isLoading = true;
		try {
			// Placeholder for data loading
			console.log('Loading data for', routePath);
		} finally {
			isLoading = false;
		}
	}

	function refreshData() {
		loadData();
	}

	function getHealthColor(state: string | undefined) {
		switch (state) {
			case 'healthy': return 'text-green-600';
			case 'flaky': return 'text-yellow-600';
			case 'broken': return 'text-red-600';
			default:return 'text-gray-400';
		}
	}

	function getHealthIcon(state: string | undefined) {
		switch (state) {
			case 'healthy': return '✅';
			case 'flaky': return '⚠️';
			case 'broken': return '❌';
			default:return '❓';
		}
	}

	$effect(() => {

		loadData();
	
});
</script>

<svelte:head>
 <title>Route Errors: { routePath }</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
 <!-- Header -->
 <div class="bg-white border-b border-gray-200 sticky top-0 z-10">
 <div class="max-w-7xl mx-auto px-6 py-8">
 <div class="flex items-center justify-between">
 <div class="flex-1">
 <div class="flex items-center gap-3">
 <h1 class="text-3xl font-bold text-gray-900">Route Error Details</h1>
 </div>
 <p class="text-lg font-mono text-gray-600 mt-2 break-all">{ routePath }</p>

 {#if health}
 <div class="flex items-center gap-3 mt-4">
 <span class={`text-3xl ${getHealthColor(health.errorState)}`}>
 {getHealthIcon(health.errorState)}
 </span>
 <div>
 <div class="text-sm font-semibold text-gray-700">
 Status: {health.errorState.toUpperCase()}
 </div>
 <div class="text-sm text-gray-600">
 {health.recentErrorCount} recent error{health.recentErrorCount !== 1 ? 's' : ''}
 {#if health.lastErrorAt}
 · Last error: {new Date(health.lastErrorAt).toLocaleString()}
 {/if}
 </div>
 </div>
 </div>
 {/if}
 </div>

 <button
 onclick={refreshData}
 disabled={isLoading}
 class="px-4 py-2 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 disabled bg-gray-400 transition"
 >
 {isLoading ? 'Loading...' : 'Refresh'}
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
 <h3 class="font-semibold text-red-900">Error Loading Data</h3>
 <p class="text-sm text-red-800 mt-1">{error}</p>
 </div>
 </div>
 </div>
 {/if}

 {#if isLoading}
 <div class="flex items-center justify-center py-12">
 <div class="animate-spin h-8 w-8 border-4 border-blue-200 border-t-blue-600 rounded-full" ></div>
 </div>
 {:else}
 <!-- Tabs -->
 <div class="border-b border-gray-200 bg-white rounded-t-lg">
 <div class="flex">
 <button
 onclick={() => (tab = 'errors')}
 class={`flex-1 py-4 px-6 font-semibold border-b-2 transition text-center ${tab === 'errors'
 ? 'border-blue-600 text-blue-600 bg-blue-50'
 : 'border-transparent text-gray-600 hover:text-gray-900'}`}
 >
 🔴 Errors ({errors.length})
 </button>
 <button
 onclick={() => (tab = 'suggestions')}
 class={`flex-1 py-4 px-6 font-semibold border-b-2 transition text-center ${tab === 'suggestions'
 ? 'border-blue-600 text-blue-600 bg-blue-50'
 : 'border-transparent text-gray-600 hover:text-gray-900'}`}
 >
 💡 Suggestions ({suggestions.length})
 </button>
 </div>
 </div>

 <!-- Content -->
 <div class="bg-white rounded-b-lg border-x border-b border-gray-200 p-6">
 {#if tab === 'errors'}
 {#if errors.length === 0}
 <div class="text-center py-12">
 <p class="text-3xl mb-4">✨</p>
 <p class="text-lg font-semibold text-gray-900">No Errors Found</p>
 <p class="text-gray-600 mt-1">This route is running smoothly!</p>
 </div>
 {:else}
 <ErrorEventsList {routePath} { errors } isLoading={ false } />
 {/if}
 {:else if tab === 'suggestions'}
 {#if suggestions.length === 0}
 <div class="text-center py-12">
 <p class="text-3xl mb-4">🎯</p>
 <p class="text-lg font-semibold text-gray-900">No Suggestions Available</p>
 <p class="text-gray-600 mt-1">All identified issues have been addressed.</p>
 </div>
 {:else}
 <SuggestionsList {suggestions} isLoading={false} />
 {/if}
 {/if}
 </div>
 {/if}
 </div>
</div>

<style>
 :global(body) {
 @apply bg-gray-50;
 }
</style>
