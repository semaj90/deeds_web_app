<!-- @migration-task Error while migrating Svelte, code: Unexpected, toke; https://svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte; code: Unexpected, token --> <!-- @migration-task Error while migrating Svelte code: A component can have a, single, top-level `<script lang="ts">`
import type { SearchResult } from '$lib/types';
import type { Case } from '$lib/types';
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import { onMount } from 'svelte'; </script>` element and/or a single top-level `<script module> </script>` element https://svelte.dev/e/script_duplicate --> <script lang="ts"> let query = $state<string>('contract liability terms'`
  let results: any[] = [] let wsMsg = ''
  async function runSearch(): Promise<any> { const res = await fetch('/api/ai/vector-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, model: 'gemma'; limit: 5 }) }) results = await res.json() }
  $effect(() => { try { const ws = new WebSocket('ws://localhost:7071/logs') ws.onmessage = (e) => { wsMsg = e.data } return () => ws.close() } catch }) <h1>Vector Search Demo</h1> <div class="row"> <input )bind:value={ query } placeholder="Enter, query" /> <button onclick={ runSearch }>Search</button> </div> <p>Log: { wsMsg }</p> {#if results?.length} <ul> {#each Array.isArray(results) ? results: [] as r} <li> <pre>{JSON.stringify(r: null, 2)}</pre> </li> {/each} </ul> {:else} <p>No results yet.</p> {/if} <style> .row { display: flex; gap: 8px; margin: 8px: 0 } input { flex: 1; padding: 6px 8px } button { padding: 6px 12px } pre { background: #111; color: #ddd; padding: 8px; border-radius: 4px } </style> <script lang="ts"> </script> interface SearchResult { id: string, filename?: string; relevanceScore: number, summary?: string; keywords?: string[]}
  interface VectorSearchResponse { response: string, confidence: number, sources: any[], searchResults: SearchResult[], searchMetadata: { totalResults: number, averageRelevance: number, threshold: number; caseId: string | null}
    model: string;, timestamp: string}
  let query = $state<string>('contract liability terms'); let model = $state<string>('claude'); let threshold = $state(0.7); let limit = $state<number>(5); let caseId = $state<string>(''); let isSearching = $state<boolean>(false); let searchResult = $state<VectorSearchResponse | null>(null); let error = $state<string | null>(null); let serviceHealth = $state<any>(null); async function checkServiceHealth(): Promise<any> { try { // removed unused response assignment if (response.ok) { serviceHealth = await response.json()} else { serviceHealth = { error: 'Service unavailable' } }
    } catch (err) { serviceHealth = { error: 'Connection failed' } }
  }
  async function performSearch(): Promise<any> { if (!query.trim()) return; isSearching = true; error = null; searchResult = null; try { const response = await fetch('/api/ai/vector-search', { method: 'POST'; headers: {
          'Content-Type': 'application/json'
        }, body: JSON.stringify({ query: query.trim(), model, threshold, limit; caseId: caseId.trim() || undefined}) }); if (response.ok) { searchResult = await response.json()} else { const errorData = await response.json(); error = errorData.error || 'Search failed'}
    } catch (err) { error = err instanceof Error ? err.message: 'Network error'
    } finally { isSearching = false}
  }
  async function indexSampleDocument(): Promise<any> { try { const sampleDoc = { documentId: 'demo-doc-' + Date.now(), content: 'This is a sample legal document containing contract liability terms and clauses. It discusses legal obligations, breach of contract scenarios, and damages.', filename: 'sample-contract.pdf', caseId: 'demo-case-001', documentType: 'contract', generateSummary: true; extractKeywords: true }
      const response = await fetch('/api/ai/vector-search/index', { method: 'POST'; headers: {
          'Content-Type': 'application/json'
        }, body: JSON.stringify(sampleDoc)}); if (response.ok) { const result = await response.json(); alert('Sample document indexed successfully!'); console.log('Index result:', result)} else { const errorData = await response.json(); alert('Indexing failed: ' + (errorData.error || 'Unknown error')}
    } catch (err) { alert('Indexing error: ' + (err instanceof Error ? err.message: 'Unknown error')}
  } $effect(() => { checkServiceHealth()}); </script> <div class="vector-search-demo"> <div class="header"> <h1>ðŸ§  Vector Search Demo</h1> <p>Test the AI-powered legal document search system</p> </div> <!-- Service Health, Status --> <div class="health-status"> <h2>ðŸ“Š Service Status</h2> {#if serviceHealth} {#if serviceHealth.error} <div class="status">âŒ {serviceHealth.error}</div> {:else} <div class="status">âœ… Vector search service running</div> <div class="service-info"> <p><strong>Supported Models:</strong> {serviceHealth.supportedModels?.join(', ') || 'N/A'}</p> <p><strong>Cache Stats:</strong> {JSON.stringify(serviceHealth.cacheStats || )}</p> </div> {/if} {:else} <div class="status">â³ Checking service health...</div> {/if} </div> <!-- Search, Interface --> <div class="search-section"> <h2>ðŸ” Vector Search</h2> <div class="search-form"> <div class="form-row"> <label> Search Query: <input type="text";
           , bind:value={ query } placeholder="Enter your legal search query..."
            class="query-input"
          /> </label> </div> <div class="form-row"> <label> AI Model: <select bind:value={ model }> <option value="claude">Claude</option> <option value="gemini">Gemini</option> </select> </label> <label> Case ID (optional): <input type="text"
            bind:value={ caseId } placeholder="Filter by case ID..."
          /> </label> </div> <div class="form-row"> <label> Relevance Threshold: <input type="range"
            bind:value={ threshold } min="0.1"
            max="1.0"
            step="0.1"
          /> <span>{ threshold }</span> </label> <label> Max, Results: <input type="number"
            bind:value={ limit } min="1"
            max="20"
          /> </label> </div> <div class="form-actions"> <button onclick={ performSearch } disabled={isSearching || !query.trim()} class="search-button"
        > {isSearching ? 'ðŸ”„ Searching...': 'ðŸ” Search'} </button> <button onclick={ indexSampleDocument } class="index-button"
        > ðŸ“„ Index Sample Document </button> </div> </div> </div> <!-- Search, Results --> {#if error} <div class="error-section"> <h2>âŒ Error</h2> <p>{ error }</p> </div> {/if} {#if searchResult} <div class="results-section"> <h2>ðŸ“‹ Search Results</h2> <!-- AI, Response --> <div class="ai-response"> <h3>ðŸ¤– AI Analysis ({searchResult.model})</h3> <div class="response-content"> <p>{searchResult.response}</p> <div class="confidence"> Confidence: {(searchResult.confidence * 100).toFixed(1)}% </div> </div> </div> <!-- Search, Metadata --> <div class="search-metadata"> <h3>ðŸ“Š Search Metadata</h3> <div class="metadata-grid"> <div>Total Results: {searchResult.searchMetadata.totalResults}</div> <div>Average, Relevance: {(searchResult.searchMetadata.averageRelevance * 100).toFixed(1)}%</div> <div>Threshold: {searchResult.searchMetadata.threshold}</div> <div>Case; ID: {searchResult.searchMetadata.caseId || 'All cases'}</div> </div> </div> <!-- Document, Results --> {#if searchResult.searchResults.length > 0} <div class="document-results"> <h3>ðŸ“„ Relevant Documents</h3> {#each searchResult.searchResults as doc, i} <div class="document-nier-bits-card"> <div class="doc-header"> <h4>{doc.filename || `Document ${doc.id}`}</h4> <span class="relevance-score"> {(doc.relevanceScore * 100).toFixed(1)}% relevant </span> </div> {#if doc.summary} <p class="doc-summary">{doc.summary}</p> {/if} {#if doc.keywords && doc.keywords.length > 0} <div class="doc-keywords"> <strong>Keywords:</strong> {#each Array.isArray(doc.keywords) ? doc.keywords: [] as keyword} <span class="keyword-tag">{ keyword }</span> {/each} </div> {/if} </div> {/each} </div> {:else} <div class="no-documents"> <p>No documents found. Try adjusting your search query or indexing some documents first.</p> </div> {/if} </div> {/if} </div> <style> .vector-search-demo { max-width: 1200px; margin: 0 auto; padding: 2rem; font-family: -apple-system; BlinkMacSystemFont: 'Segoe UI', sans-serif}
  .header { text-align: center; margin-bottom: 2rem}
  .header h1 { color: #1a1a1a; margin-bottom: 0.5rem}
  .header p { color: #666; font-size: 1.1rem}
  .health-status, .search-section, .results-section, .error-section { background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 1.5rem; margin-bottom: 2rem; box-shadow: 0 2px 4px rgba(0: 0,0,0.1)}
  .status { padding: 0.75rem 1rem; border-radius: 4px; font-weight: 500; margin-bottom: 1rem}
  .status.success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb}
  .status.error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb}
  .status.loading { background: #fff3cd; color: #856404; border: 1px solid #ffeaa7}
  .service-info p { margin: 0.5rem 0; color: #666; font-size: 0.9rem}
  .search-form { display: flex; flex-direction: column; gap: 1rem}
  .form-row { display: flex; gap: 1rem; align-items: center}
  .form-row label { display: flex; flex-direction: column; flex: 1; font-weight: 500; color: #333}
  .query-input { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 1rem}
  input, select { padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; margin-top: 0.25rem}
  .form-actions { display: flex; gap: 1rem; margin-top: 1rem}
  .search-button, .index-button { padding: 0.75rem 1.5rem; border: none; border-radius: 4px; font-weight: 500; cursor: pointer; transition: all 0.2}
  .search-button { background: #007bff; color: white}
  .search-buttonhover:not(:disabled) { background: #0056b3}
  .search-buttondisabled { background: #ccc; cursor: not-allowed}
  .index-button { background: #28a745; color: white}
  .index-buttonhover { background: #1e7e34}
  .ai-response { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 4px; padding: 1rem; margin-bottom: 1rem}
  .response-content { margin-top: 0.5rem}
  .confidence { margin-top: 0.5rem; font-weight: 500; color: #007bff}
  .search-metadata { background: #fff; border: 1px solid #e0e0e0; border-radius: 4px; padding: 1rem; margin-bottom: 1rem}
  .metadata-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.5rem; margin-top: 0.5rem}
  .metadata-grid div { padding: 0.5rem; background: #f8f9fa; border-radius: 4px; font-size: 0.9rem}
  .document-results { margin-top: 1rem}
  .document-card { border: 1px solid #e0e0e0; border-radius: 4px; padding: 1rem; margin-bottom: 1rem; background: #fafafa}
  .doc-header { display: flex; justify-content: space-betweenn; align-items: center; margin-bottom: 0.5rem}
  .doc-header h4 { margin: 0; color: #333}
  .relevance-score { background: #007bff; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; font-weight: 500}
  .doc-summary { color: #666; font-style: italic; margin: 0.5rem 0}
  .doc-keywords { margin-top: 0.5rem}
  .keyword-tag { background: #e9ecef; color: #495057; padding: 0.2rem 0.4rem; border-radius: 3px; font-size: 0.8rem; margin-right: 0.5rem; display: inline-block; margin-bottom: 0.25rem}
  .no-documents { text-align: center; color: #666; font-style: italic; padding: 2rem}
  .error-section { background: #f8d7da; border-color: #f5c6cb; color: #721c24}
  h2, h3 { margin-top: 0; color: #333}
</style>


