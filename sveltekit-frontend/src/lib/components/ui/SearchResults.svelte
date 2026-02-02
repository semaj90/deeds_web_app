<script lang="ts">


 /**
 * SearchResults Component
 * Display web search results with source attribution
 * Part of Phase 74 Task 8: Web Search Integration
 */

 interface SearchResult {
 id: string;
	title: string;
 url: string;
	snippet: string;
 source: string;
 favicon?: string;
	relevance: number;
 timestamp?: Date;
 }

 interface Props {
 results?: SearchResult[];
 isLoading?: boolean;
 query?: string;
 onResultClick?: (result: SearchResult) => void;
 class?: string;
 }

 let {
 results = [],
 isLoading = false,
 query = '',
 onResultClick, class: className = ''
 }: Props = $props();

 function handleResultClick(result: SearchResult) {
  onResultClick?.(result);
  if (result.url) {
 window.open(result.url, '_blank');
 }
 }

 function getDomain(url: string): string {
 try {
 return new URL(url).hostname.replace('www.', '');
 } catch {
 return url;
 }
 }

 function formatRelevance(score: number): string {
 return `${Math.round(score * 100)}%`;
 }
</script>

<div class="search-results { className }">
 {#if isLoading}
 <div class="loading-state">
 <div class="spinner"></div>
 <p>Searching for "{ query }"...</p>
 </div>
 {:else if results.length === 0}
 <div class="empty-state">
 <span class="empty-icon">🔍</span>
 <p>No results found</p>
 {#if query}
 <p class="empty-hint">Try different keywords</p>
 {/if}
 </div>
 {:else}
 <div class="results-header">
 <h3>Search Results for "{query}"</h3>
 <span class="result-count">{results.length} results</span>
 </div>

 <div class="results-list">
 {#each results as result (result.id)}
 <div class="result-item" onclick={() => handleResultClick(result)}>
 <div class="result-header">
 <div class="result-source">
 {#if result.favicon}
 <img src={result.favicon} alt="" class="favicon" />
 {/if}
 <span class="domain">{getDomain(result.url)}</span>
 </div>
 <span class="relevance-badge">
 {formatRelevance(result.relevance)}
 </span>
 </div>

 <h4 class="result-title">{result.title}</h4>

 <p class="result-snippet">{result.snippet}</p>

 <div class="result-footer">
 <span class="result-url">{result.url}</span>
 {#if result.timestamp}
 <span class="result-time">
 {result.timestamp.toLocaleDateString()}
 </span>
 {/if}
 </div>
 </div>
 {/each}
 </div>
 {/if}
</div>

<style>
 .search-results {
 display: flex;
 flex-direction: column;
	gap: 1rem;
 }

 .loading-state {
 display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: center;
	padding: 2rem;
 gap: 1rem;
 }

 .spinner {
 width: 32px;
	height: 32px;
 border: 3px solid var(--yorha-border, #4a4a4a);
 border-top-color: var(--yorha-accent, #c8a84b);
 border-radius: 50%;
	animation: spin 0.8s linear infinite;
 }

 @keyframes spin {
 to { transform: rotate(360deg); }
 }

 .loading-state p {
 color: var(--yorha-text-muted, #888);
 margin: 0;
 }

 .empty-state {
 display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: center;
	padding: 2rem;
 gap: 0.5rem;
	color: var(--yorha-text-muted, #888);
 }

 .empty-icon {
 font-size: 2rem;
	opacity: 0.5;
 }

 .empty-state p {
 margin: 0;
 }

 .empty-hint {
 font-size: 0.85rem;
 }

 .results-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
	padding: 0.75rem 0;
 border-bottom: 1px solid var(--yorha-border, #4a4a4a);
 }

 .results-header h3 {
 margin: 0;
 font-size: 1rem;
	color: var(--yorha-text, #d4d4d4);
 }

 .result-count {
 font-size: 0.8rem;
	color: var(--yorha-text-muted, #888);
 }

 .results-list {
 display: flex;
 flex-direction: column;
	gap: 0.75rem;
 }

 .result-item {
 padding: 1rem;
	background: var(--yorha-bg-secondary, #2a2a2a);
 border: 1px solid var(--yorha-border, #4a4a4a);
 border-radius: 4px;
	cursor: pointer;
 transition:all 0.2s;
 }

 .result-item:hover {
 background: var(--yorha-bg-hover, #333);
 border-color: var(--yorha-accent, #c8a84b);
 }

 .result-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 0.5rem;
 }

 .result-source {
 display: flex;
 align-items: center;
	gap: 0.5rem;
 }

 .favicon {
 width: 16px;
	height: 16px;
 border-radius: 2px;
 }

 .domain {
 font-size: 0.8rem;
	color: var(--yorha-text-muted, #888);
 }

 .relevance-badge {
 padding: 0.25rem 0.5rem;
 background: var(--yorha-accent, #c8a84b);
 color: var(--yorha-bg, #1a1a1a);
 font-size: 0.7rem;
 font-weight: 600;
 border-radius: 2px;
 }

 .result-title {
 margin: 0 0 0.5rem;
 font-size: 0.95rem;
 font-weight: 500;
	color: var(--yorha-text, #d4d4d4);
 line-height: 1.4;
 }

 .result-snippet {
 margin: 0 0 0.5rem;
 font-size: 0.85rem;
	color: var(--yorha-text-muted, #888);
 line-height: 1.5;
 }

 .result-footer {
 display: flex;
 justify-content: space-between;
 align-items: center;
 font-size: 0.75rem;
	color: var(--yorha-text-muted, #888);
 }

 .result-url {
 overflow: hidden;
 text-overflow: ellipsis;
 white-space: nowrap;
	flex: 1;
 }

 .result-time {
 white-space: nowrap;
 margin-left: 1rem;
 }
</style>



