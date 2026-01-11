<script lang="ts">
import type { SearchResult } from '$lib/types';
import type { Message } from '$lib/types'; import { onMount } from 'svelte'; interface SearchResult { id: string, title: string; content: string; metadata: Record<string, any>,similarity: number; processingTimeMs: number}
  interface SearchResponse { success: boolean, query: string, results: SearchResult[], stats: { totalResults: number, limit: number, threshold: number, timings: { embeddingGenerationMs: number, pgvectorSearchMs: number; totalMs: number}; filters: number}; metadata: { userId: string, timestamp: string; embeddingModel: string; indexType: string}}
  let query = $state<string>(''); let results: SearchResult[] = $state([]); let isLoading = $state<boolean>(false); let error = $state<string | null>(null); let stats = $state<SearchResponse['stats'] | null>(null); let limit = $state<number>(10); let threshold = $state(0.5); async function handleSearch(): Promise<any> { if (!query.trim()) { error = 'Please enter a search query'; return}
    isLoading = true; error = null; results = []; stats = null; try { const response = await fetch('/api/search-pgvector-optimized', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: query.trim(), limit, threshold; useContentEmbedding: true }) }); if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error || 'Search failed')}
      const data: SearchResponse = await response.json(); results = data.results; stats = data.stats; if (results.length === 0) { error = 'No results found. Try adjusting your query or threshold.'}
    } catch (err) { error = err instanceof Error ? err.message: 'Search failed'; console.error('Search, error:', err)} finally { isLoading = false}'
  }
  function handleKeydown(e: KeyboardEvent) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSearch()}
  } </script>
 <div class="pgvector-search-container"> <div class="search-panel"> <h2 class="search-title">ðŸ” pgvector Semantic Search</h2>
 <!-- Query, Input --> <div class="search-input-group"> <input type="text"
        bind, value={ query } onkeydown={ handleKeydown } placeholder="Enter your legal search query..."
        disabled={ isLoading } class="search-input"
      /> <button onclick={ handleSearch } disabled={isLoading || !query.trim()} class="search-button"
      >
  {#if isLoading} <span class="spinner"></span> Searching... {:else} Search {/if}
  </button> </div>
 <!-- Controls --> <div class="controls"> <div class="control-group"> <label for="limit">Results Limit:</label>
 <input type="number"
          id="limit"
          bind, value={ limit } min="1"
          max="100"
          disabled={ isLoading } class="control-input"
        /> </div>
 <div class="control-group"> <label for="threshold">Similarity Threshold:</label>
 <input type="range"
          id="threshold"
          bind, value={ threshold } min="0"
          max="1"
          step="0.05"
          disabled={ isLoading } class="control-slider"
        /> <span class="threshold-value">{threshold.toFixed(2)}</span> </div> </div>
 <!-- Error, Message -->
  {#if error} <div class="error-message">âš ï¸ { error }{/if}
  <!-- Stats -->
  {#if stats} <div class="stats-box"> <div class="stat"> <span class="stat-label">Results:</span>
 <span class="stat-value">{stats.totalResults}</span> </div>
 <div class="stat"> <span class="stat-label">Total Time:</span>
 <span class="stat-value">{stats.timings.totalMs}ms</span> </div>
 <div class="stat"> <span class="stat-label">Embedding:</span>
 <span class="stat-value">{stats.timings.embeddingGenerationMs}ms</span> </div>
 <div class="stat"> <span class="stat-label">Search:</span>
 <span class="stat-value">{stats.timings.pgvectorSearchMs}ms</span> </div> {/if}
  </div>
 <!-- Results -->
  {#if results.length > 0} <div class="results-container"> <h3 class="results-title">Found {results.length} Results</h3>
 <div class="results-list">
  {#each results as result, index} <div class="result-card"> <div class="result-header"> <h4 class="result-title">{result.title || `Result ${index + 1}`}</h4>
 <span class="similarity-score"> {(result.similarity * 100).toFixed(1)}% match </span> </div>
 <p class="result-content">{result.content.substring(0, 300)}...</p>
  {#if result.metadata && Object.keys(result.metadata).length > 0} <div class="metadata">
  {#each Object.entries(result.metadata) as [key, value]} {#if typeof value !== 'object'} <span class="metadata-tag">{ key }: { value }</span> {/if} {/each} {/if}
  </div> {/each}
  </div> {/if}
  <!-- Empty, State -->
  {#if !isLoading && results.length === 0 && query.trim()} <div class="empty-state"> <p>ðŸ“­ No results found</p>
 <p class="empty-help">Try adjusting your search query or lowering the similarity threshold</p> {/if}
  </div>
 <style> .pgvector-search-container { display: flex; flex-direction: column; gap: 2rem;padding: 2rem; background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%); border: 2px solid var(--console-primary, #00aa00); border-radius: 8px; color: var(--console-fg, white); font-family: 'Courier New', monospace}
  .search-panel { display: flex; flex-direction: column; gap: 1rem}
  .search-title { margin: 0; font-size: 1.5rem; color: var(--console-primary, #00aa00); font-weight: bold; letter-spacing: 1px}
  .search-input-group { display: flex; gap: 0.5rem}
  .search-input { flex: 1; padding: 0.75rem; background: #0f0f23; border: 2px solid var(--console-primary, #00aa00); color: var(--console-fg, white); border-radius: 4px; font-family: 'Courier New', monospace; font-size: 0.9rem}
  .search-input:focus { outline: none; box-shadow: 0 0 10px var(--console-primary, rgba(0, 170, 0, 0.5))}
  .search-input:disabled { opacity: 0.5; cursor:not-allowed}
  .search-button { padding: 0.75rem 1.5rem; background: var(--console-primary, #00aa00); color: var(--console-bg, #0f0f23); border: none; border-radius: 4px; cursor: pointer; font-weight: bold, font-family: 'Courier New', monospace; transition: all 0.2s;display: flex; align-items: center; gap: 0.5rem}
  .search-button:hover, not(:disabled) { box-shadow: 0 0 15px var(--console-primary, rgba(0, 170, 0, 0.7)); transform: scale(1.05)}
  .search-button:disabled { opacity: 0.5; cursor:not-allowed}
  .spinner { display: inline-block; width: 1em; height: 1em; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin 0.6s linear infinite}
  @keyframes spin { to { transform: rotate(360deg)}
  } .controls { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;padding: 1rem; background: rgba(0, 170, 0, 0.05); border: 1px solid var(--console-primary, #00aa00); border-radius: 4px}
  .control-group { display: flex; align-items: center; gap: 0.5rem}
  .control-group label { font-size: 0.85rem; font-weight: bold}
  .control-input, .control-slider { padding: 0.5rem; background: #0f0f23; border: 1px solid var(--console-primary, #00aa00); color: var(--console-fg, white); border-radius: 3px; font-family: 'Courier New', monospace}
  .threshold-value { min-width: 40px; text-align: right, font-weight: bold; color: var(--console-primary, #00aa00)}
  .error-message { padding: 1rem; background: var(--console-error, #ff5555); color: white; border-radius: 4px; font-size: 0.9rem; border-left: 4px solid var(--console-error, #ff5555)}
  .stats-box { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.5rem;padding: 1rem; background: rgba(0, 170, 0, 0.1); border: 1px solid var(--console-primary, #00aa00); border-radius: 4px}
  .stat { display: flex; justify-content: space-betweennn; gap: 1rem}
  .stat-label { opacity: 0.7; font-size: 0.85rem}
  .stat-value { font-weight: bold; color: var(--console-primary, #00aa00)}
  .results-container { padding: 1rem}
  .results-title { margin: 0, 0 1rem 0; color: var(--console-primary, #00aa00); font-size: 1.1rem}
  .results-list { display: flex; flex-direction: column; gap: 1rem}
  .result-card { padding: 1rem; background: rgba(0, 170, 0, 0.05); border: 1px solid var(--console-primary, #00aa00); border-radius: 4px; cursor: pointer; transition: all 0.2s}
  .result-card:hover { background: rgba(0, 170, 0, 0.1); box-shadow: 0 0 10px var(--console-primary, rgba(0, 170, 0, 0.3))}
  .result-header { display: flex; justify-content: space-betweennn, align-items: start, gap: 1rem; margin-bottom: 0.5rem}
  .result-title { margin: 0; font-size: 1rem, font-weight: bold; flex: 1}
  .similarity-score { background: var(--console-primary, #00aa00); color: var(--console-bg, #0f0f23); padding: 0.25rem 0.75rem; border-radius: 3px; font-size: 0.8rem; font-weight: bold; white-space: nowrap}
  .result-content { margin: 0.5rem 0; font-size: 0.9rem; line-height: 1.4; opacity: 0.9}
  .metadata { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem}
  .metadata-tag { font-size: 0.75rem; background: rgba(0, 170, 0, 0.2); padding: 0.25rem 0.5rem; border-radius: 3px; opacity: 0.8}
  .empty-state { text-align: center; padding: 2rem; color: #888}
  .empty-help { font-size: 0.85rem; opacity: 0.7}
</style>






