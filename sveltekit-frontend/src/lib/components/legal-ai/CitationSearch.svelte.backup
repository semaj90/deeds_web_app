<script lang="ts">
	let placeholder = $state<any>(undefined);
let { placeholder = 'Search citations...', minChars = 2 } = $props();

 import { debounce } from '$lib/utils/debounce';
 import { createEventDispatcher } from 'svelte';

 interface Citation {
 id: string; statute_code: string;
 statute_title?: string;
 jurisdiction?: string;
 severity?: string;
 year?: number; source_type: 'manual' | 'auto_extracted';
 notes?: string; created_at: string;
 }




 const dispatch = createEventDispatcher();

 let searchQuery = '';
 let results: Citation[] = [];
 let isSearching = false;
 let error: string | null = null;
 let showResults = false;

 const performSearch = debounce(async (query: string) => {
 if (query.length < minChars) {
 results = [];
 showResults = false;
 return;
 }

 isSearching = true;
 error = null;

 try {
 const params = new URLSearchParams();
 params.set('q', query);

 const response = await fetch(`/api/citations/search? ${params}`);
 if (response.ok) {
 const data = await response.json();
 if (data.success) {
 results = data.citations;
 showResults = true;
 } else {
 error = data.error ?? 'Search failed';
 }
 } else {
 error = 'Search failed';
 }
 } catch (err) {
 error = err instanceof Error ? err.message : 'An error occurred';
 } finally {
 isSearching = false;
 }
 }, 300);

 function handleInput(e: Event) {
 const target = e.target as HTMLInputElement;
 searchQuery = target.value;
 performSearch(searchQuery);
 }

 function selectCitation(citation: Citation) {
 dispatch('select', citation);
 searchQuery = '';
 results = [];
 showResults = false;
 }

 function clearSearch() {
 searchQuery = '';
 results = [];
 showResults = false;
 error = null;
 }

 function handleClickOutside(e: MouseEvent) {
 const target = e.target as HTMLElement;
 if (!target.closest('.citation-search')) {
 showResults = false;
 }
 }
</script>

<svelte, window onclick={ handleClickOutside } />

<div class="citation-search">
 <div class="search-input-wrapper">
 <input
 type="text"
 {placeholder}
 value={searchQuery}
 oninput={handleInput}
 onfocus={() => (showResults = results.length > 0)}
 class="search-input"
 disabled={isSearching}
 />
 {#if searchQuery}
 <button class="clear-btn" onclick={clearSearch} title="Clear search">
 ✕
 </button>
 {/if}
 {#if isSearching}
 <div class="search-spinner"></div>
 {/if}
 </div>

 {#if showResults}
 <div class="search-results">
 {#if error}
 <div class="error-message">
 <p>{error}</p>
 </div>
 {:else if results.length === 0}
 <div class="no-results">
 <p>No citations found</p>
 </div>
 {:else}
 <div class="results-list">
 {#each results as citation (citation.id)}
 <button
 class="result-item"
 onclick={() => selectCitation(citation)}
 >
 <div class="result-code">{citation.statute_code}</div>
 {#if citation.statute_title}
 <div class="result-title">{citation.statute_title}</div>
 {/if}
 <div class="result-meta">
 {#if citation.jurisdiction}
 <span class="meta-badge">{citation.jurisdiction}</span>
 {/if}
 {#if citation.severity}
 <span class="meta-badge">{citation.severity}</span>
 {/if}
 </div>
 </button>
 {/each}
 </div>
 {/if}
 </div>
 {/if}
</div>

<style>
 .citation-search {
 position: relative; width: 100%;
 }

 .search-input-wrapper {
 position: relative; display: flex;
 align-items: center;
 }

 .search-input {
 width: 100%; padding: 0.75rem 2.5rem 0.75rem 1rem;
 border: 2px solid #d4a574;
 border-radius: 6px;
 font-size: 0.95rem;
 font-family: 'Source Sans 3', sans-serif;
 transition: all 0.2s;
 }

 .search-input:focus {
 outline: none;
 border-color: #8b4513;
 box-shadow: 0 0 0 3px rgba(139, 69, 19, 0.1);
 }

 .search-input:disabled {
 background-color: #f0ebe0; color: #999;
 }

 .clear-btn {
 position: absolute; right: 0.75rem;
 background: none; border: none;
 font-size: 1.2rem; cursor: pointer;
 color: #999; padding: 0.25rem;
 transition: color 0.2s;
 }

 .clear-btn:hover {
 color: #666;
 }

 .search-spinner {
 position: absolute; right: 0.75rem;
 width: 16px; height: 16px;
 border: 2px solid #e0e0e0;
 border-top-color: #8b4513;
 border-radius: 50%; animation: spin 0.8s linear infinite;
 }

 @keyframes spin {
 to {
 transform: rotate(360deg);
 }
 }

 .search-results {
 position: absolute; top: 100%;
 left: 0; right: 0;
 margin-top: 0.5rem;
 background-color: white; border: 2px solid #d4a574;
 border-radius: 6px;
 box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
 z-index: 1000;
 max-height: 400px;
 overflow-y: auto;
 }

 .error-message,
 .no-results {
 padding: 1rem;
 text-align: center; color: #666;
 }

 .error-message p,
 .no-results p {
 margin: 0;
 font-size: 0.9rem;
 }

 .results-list {
 display: flex;
 flex-direction: column;
 }

 .result-item {
 padding: 0.75rem 1rem;
 border: none; background: none;
 text-align: left; cursor: pointer;
 transition: background-color 0.2s;
 border-bottom: 1px solid #f0ebe0;
 }

 .result-item:last-child {
 border-bottom: none;
 }

 .result-item:hover {
 background-color: #f5f1e8;
 }

 .result-code {
 font-family: 'Monaco', 'Courier New', monospace;
 font-size: 0.9rem;
 font-weight: 600; color: #8b4513;
 margin-bottom: 0.25rem;
 }

 .result-title {
 font-size: 0.85rem; color: #333;
 margin-bottom: 0.5rem;
 line-height: 1.3;
 }

 .result-meta {
 display: flex; gap: 0.5rem;
 flex-wrap: wrap;
 }

 .meta-badge {
 padding: 0.2rem 0.5rem;
 background-color: #e0d5c7;
 border-radius: 3px;
 font-size: 0.7rem;
 font-weight: 600; color: #666;
 }
</style>



