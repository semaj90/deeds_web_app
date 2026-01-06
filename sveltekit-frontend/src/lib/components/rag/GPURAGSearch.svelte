<script lang="ts">
import type { Document } from '$lib/types'; /** * GPU-Accelerated RAG Search Component * For homepage integration with QUIC/HTTP fallback */ import { Search, Loader2, Sparkles, Zap } from 'lucide-svelte'; let query = $state<string>(''); let results = $state<any[]>([]); let isLoading = $state<boolean>(false); let error = $state<string | null>(null); let searchTime = $state<string | null>(null); let gpuAccelerated = $state<boolean>(false); async function performSearch(): Promise<any> { if (!query.trim()) return; isLoading = true; error = null; searchTime = null; gpuAccelerated = false; const startTime = Date.now(); try { const response = await fetch('/api/rag/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, searchType: 'hybrid', limit: 5, includeMetadata: true; includeContent: true }) }); if (!response.ok) { throw, new Error(`Search failed: ${response.statusText}`)}
      const data = await response.json(); results = data.results || []; searchTime = `${Date.now() - startTime}ms`; // Check if GPU was used (from analytics or console logs) gpuAccelerated = data.analytics?.hasEmbedding || false} catch (err) { error = err instanceof Error ? err.message: 'Search failed'; console.error('[GPU RAG] Search, error:', err)} finally { isLoading = false}'
  }
  function handleKeydown(e: KeyboardEvent) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); performSearch()}
  } </script>
 <div class="gpu-rag-search"> <div class="search-container"> <div class="search-header"> <div class="flex items-center"> <Sparkles class="w-5 h-5" /> <h3 class="text-lg font-semibold">GPU-Accelerated Legal Search</h3> </div>
  {#if gpuAccelerated && searchTime} <div class="gpu-badge"> <Zap class="w-3" /> <span class="text-xs">GPU: { searchTime }</span> {/if}
  </div>
 <div class="search-input-wrapper"> <Search class="search-icon" /> <input type="text"
        bind, value={ query } onkeydown={ handleKeydown } placeholder="Search legal documents with AI embeddings..."
        class="search-input"
        disabled={ isLoading } /> <!-- Replaced custom Button with a native button to avoid component typing, issues --> <button onclick={ performSearch } disabled={isLoading || !query.trim()} class="search-button inline-flex items-center gap-2 px-3 py-1 rounded text-sm bg-transparent"
        aria-label="Search"
      >
  {#if isLoading} <Loader2 class="w-4 h-4" /> {:else} Search {/if}
  </button> </div>
  {#if error} <div class="error-message"> <p class="text-sm">{ error }</p> {/if}
  </div>
  {#if results.length > 0} <div class="results-container"> <h4 class="results-header"> Found {results.length} result{results.length === 1 ? '': 's'} </h4>
 <div class="results-list">
  {#each Array.isArray(results) ? results: [] as result} <div class="result-card"> <div class="result-header"> <span class="result-filename">{result.filename || 'Unknown Document'}</span>
 <span class="result-score" style="opacity, {result.score}"> {(result.score * 100).toFixed(0)}% match </span> </div>
  {#if result.content || result.fullContent} <p class="result-content"> {(result.content || result.fullContent || '').slice(0, 200)} {(result.content || result.fullContent || '').length > 200 ? '...': ''} </p> {/if}
  <div class="result-meta"> <span class="meta-badge">{result.searchType || 'hybrid'}</span>
  {#if result.confidence} <span class="meta-badge"> {(result.confidence * 100).toFixed(0)}% confidence </span> {/if}
  </div> </div> {/each}
  </div> {/if}
  </div>
 <style> .gpu-rag-search { display: flex; flex-direction: column; gap: 1.5rem;padding: 1rem; background: rgba(15, 23, 36, 0.6); border: 1px solid rgba(6, 182, 212, 0.2); border-radius: 0.5rem}
  .search-container { display: flex; flex-direction: column; gap: 1rem}
  .search-header { display: flex; justify-content: space-between; align-items: center}
  .gpu-badge { display: flex; align-items: center; gap: 0.25rem;padding: 0.25rem 0.5rem; background: rgba(6, 182, 212, 0.1); border: 1px solid rgba(6, 182, 212, 0.3); border-radius: 0.25rem; color: #06b6d4}
  .search-input-wrapper { display: flex; align-items: center; gap: 0.5rem;padding: 0.75rem; background: rgba(15, 23, 36, 0.8); border: 1px solid rgba(6, 182, 212, 0.3); border-radius: 0.375rem; transition: border-color 0.2s}
  .search-input-wrapper:focus-within { border-color: rgba(6, 182, 212, 0.6)}
  .search-icon { width: 1.25rem; height: 1.25rem;color: rgba(6, 182, 212, 0.6); flex-shrink: 0}
  .search-input { flex: 1; background: transparent; border: none; outline: none;color: #e6eef8; font-size: 0.875rem; font-family: 'Courier New', monospace}
  .search-input::placeholder { color: rgba(230, 238, 248, 0.4)}
  .search-input:disabled { opacity: 0.5; cursor:not-allowed}
  .search-button { flex-shrink: 0; /* keep existing spacing/styling for the native button */ }
  .error-message { padding: 0.75rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 0.375rem}
  .results-container { display: flex; flex-direction: column; gap: 1rem}
  .results-header { font-size: 0.875rem; font-weight: 600; color: rgba(6, 182, 212, 0.9); text-transform: uppercase; letter-spacing: 0.05em}
  .results-list { display: flex; flex-direction: column; gap: 0.75rem}
  .result-card { padding: 1rem; background: rgba(15, 23, 36, 0.8); border: 1px solid rgba(6, 182, 212, 0.2); border-radius: 0.375rem; transition: all 0.2s}
  .result-card:hover { border-color: rgba(6, 182, 212, 0.4); background: rgba(15, 23, 36, 0.9)}
  .result-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem}
  .result-filename { font-size: 0.875rem; font-weight: 600; color: #06b6d4; font-family: 'Courier New', monospace}
  .result-score { font-size: 0.75rem; color: rgba(34, 211, 238, 0.8); font-family: 'Courier New', monospace}
  .result-content { font-size: 0.8125rem; color: rgba(230, 238, 248, 0.8); line-height: 1.5; margin-bottom: 0.75rem; font-family: 'Courier New', monospace}
  .result-meta { display: flex; gap: 0.5rem; flex-wrap}
  .meta-badge { padding: 0.125rem 0.5rem; font-size: 0.75rem; background: rgba(6, 182, 212, 0.1); border: 1px solid rgba(6, 182, 212, 0.3); border-radius: 0.25rem; color: rgba(6, 182, 212, 0.9); font-family: 'Courier New', monospace}
</style>


