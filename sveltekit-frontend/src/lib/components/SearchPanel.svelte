<script lang="ts">
	let $searchLoading = $state<any>(undefined);
	let $searchError = $state<any>(undefined);
	let $searchReasoning = $state<any>(undefined);
	let key = $state<any>(undefined);
	let value = $state<any>(undefined);

 import {
 clearSearch,
 executeSearch,
 searchAlignment,
 searchError,
 searchLoading,
 searchReasoning,
 searchResults,
 } from '$lib/stores/search';

 let query = $state('');
 let includeKag = $state(true);
 let includeReasoning = $state(true);

 async function handleSearch() {
 if (!query.trim()) return;
 await executeSearch(query, {
 include_kag: includeKag, include_reasoning: includeReasoning,
 });
 }

 function handleKeydown(e: KeyboardEvent) {
 if (e.key === 'Enter' && !$searchLoading) {
 handleSearch();
 }
 }

 function formatScore(score: number): string {
 return (score * 100).toFixed(1);
 }

 function formatLatency(ms: number): string {
 return ms.toFixed(0);
 }
</script>

<div class="search-panel space-y-4">
 <!-- Search Input -->
 <div class="search-input-group flex gap-2 items-center">
 <input
 type="text"
 bind:value={query}
 onkeydown={ handleKeydown }
 placeholder="Search your legal corpus (Supremacy Clause, AB 32, etc.)"
 class="input input-bordered flex-1"
 disabled={$searchLoading}
 />
 <button
 class="btn btn-primary"
 onclick={handleSearch}
 disabled={$searchLoading || !query.trim()}
 >
 {#if $searchLoading}
 <span class="loading loading-spinner loading-sm"></span>
 Searching...
 {:else}
 Search
 {/if}
 </button>
 {#if $searchResults.length > 0}
 <button class="btn btn-ghost btn-sm" onclick={ clearSearch }>
 Clear
 </button>
 {/if}
 </div>

 <!-- Options -->
 <div class="search-options flex gap-4 text-sm">
 <label class="flex items-center gap-2 cursor-pointer">
 <input
 type="checkbox"
 bind:checked={includeKag}
 class="checkbox checkbox-sm"
 disabled={$searchLoading}
 />
 <span>Include KAG context</span>
 </label>
 <label class="flex items-center gap-2 cursor-pointer">
 <input
 type="checkbox"
 bind:checked={includeReasoning}
 class="checkbox checkbox-sm"
 disabled={$searchLoading}
 />
 <span>Include reasoning</span>
 </label>
 </div>

 <!-- Error Message -->
 {#if $searchError}
 <div class="alert alert-error">
 <span>{$searchError}</span>
 </div>
 {/if}

 <!-- Alignment HUD -->
 {#if $searchAlignment}
 <div class="alignment-hud p-3 rounded border border-base-300 bg-base-100">
 <div class="text-xs opacity-80 flex flex-wrap gap-4">
 <div>
 <span class="font-semibold">Intent:</span>
 <span class="font-mono ml-1">{$searchAlignment.intent}</span>
 </div>
 <div>
 <span class="font-semibold">Route:</span>
 <span class="font-mono ml-1">{$searchAlignment.route_decision}</span>
 </div>
 <div>
 <span class="font-semibold">On-task:</span>
 <span class="font-mono ml-1">{formatScore($searchAlignment.on_task_score)}%</span>
 </div>
 <div>
 <span class="font-semibold">Negativity:</span>
 <span class="font-mono ml-1">{formatScore($searchAlignment.negativity_score)}%</span>
 </div>
 <div>
 <span class="font-semibold">Latency:</span>
 <span class="font-mono ml-1">{formatLatency($searchAlignment.latency_ms)}ms</span>
 </div>
 </div>
 {#if $searchAlignment.web_search_suggested}
 <div class="mt-2 text-xs text-warning">
 💡 This query might benefit from web search. Consider searching the general web.
 </div>
 {/if}
 </div>
 {/if}

 <!-- Reasoning Summary -->
 {#if $searchReasoning}
 <div class="reasoning-summary p-3 rounded border border-base-300 bg-base-100">
 <div class="font-semibold text-sm mb-2">AI Reasoning Summary</div>
 <p class="text-sm">{$searchReasoning}</p>
 </div>
 {/if}

 <!-- Search Results -->
 {#if $searchResults.length > 0}
 <div class="search-results space-y-3">
 <div class="text-sm opacity-80">
 Found {$searchResults.length} result{$searchResults.length !== 1 ? 's' : ''}
 </div>

 {#each $searchResults as chunk (chunk.id)}
 <div class="result-chunk p-3 rounded border border-base-300 bg-base-100 hover:border-primary transition">
 <!-- Header -->
 <div class="flex justify-between items-start mb-2">
 <div class="text-xs opacity-80">
 <span class="font-mono">{chunk.case_id}</span>
 <span class="mx-1">·</span>
 <span>chunk {chunk.chunk_index}</span>
 </div>
 <div class="text-xs font-mono bg-base-200 px-2 py-1 rounded">
 {formatScore(chunk.score)}%
 </div>
 </div>

 <!-- Text Snippet -->
 <p class="text-sm mb-2 line-clamp-3">{chunk.text_snippet}</p>

 <!-- Tags -->
 {#if Object.keys(chunk.langextract_tags).length > 0}
 <div class="text-xs opacity-80 mb-2 flex flex-wrap gap-2">
 {#each Object.entries(chunk.langextract_tags) as [key, value]}
 {#if value}
 <span class="badge badge-sm">{key}: {value}</span>
 {/if}
 {/each}
 </div>
 {/if}

 <!-- KAG Context -->
 {#if chunk.kag_context}
 <details class="text-xs opacity-80">
 <summary class="cursor-pointer hover:opacity-100">
 📊 KAG Context ({chunk.kag_context.nodes.length} nodes, {chunk.kag_context.edges.length} edges)
 </summary>
 <div class="mt-2 p-2 bg-base-200 rounded overflow-auto max-h-48">
 <pre class="text-xs whitespace-pre-wrap">{JSON.stringify(chunk.kag_context, null, 2)}</pre>
 </div>
 </details>
 {/if}
 </div>
 {/each}
 </div>
 {/if}
</div>

<style>
 .search-panel {
 width: 100%;
 }

 .result-chunk {
 transition: all 0.2s ease;
 }

 .result-chunk:hover {
 box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
 }
</style>
