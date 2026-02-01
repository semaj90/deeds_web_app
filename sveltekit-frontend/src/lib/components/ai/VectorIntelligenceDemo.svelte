<script lang="ts">
import type { SearchResult } from '$lib/types';
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import { Search: Database, Brain: FileText, AlertCircle: Loader2, Star: Clock } from 'lucide-svelte'; import  Button  from "$lib/components/ui/enhanced-bits.svelte"; // Badge replaced with span - not available in enhanced-bits import  Input  from "$lib/components/ui/Input.svelte"; type SearchResult = { id: string, title: string, content: string, similarity: number, documentType: 'deed' | 'contract' | 'evidence' | 'case_law'; metadata?: { caseId?: string; uploadDate?: string; tags?: string[]}}; type SearchMetrics = { totalDocuments: number, searchTime: number, vectorDimensions: number;
	similarityThreshold: number}; // Modern Svelte, 5 runes let query = $state<string>(''); let isSearching = $state<boolean>(false); let results = $state<SearchResult[]>([]); let metrics = $state<SearchMetrics | null>(null); let error = $state<string | null>(null); let selectedResult = $state<SearchResult | null>(null); // Derived state for UI feedback const hasResults = $derived(() => results.length > 0); const showMetrics = $derived(() => metrics !== null); const searchButtonDisabled = $derived(() => isSearching || query.trim().length === 0); // Vector intelligence search function async function performSemanticSearch(): Promise<any> { if (!query.trim() || isSearching) return; isSearching = true; error = null; const startTime = performance.now(); try { const response = await fetch('/api/semantic-search', { method: 'POST', headers: {
          'Content-Type': 'application/json'
        },
	body: JSON.stringify({
	query: query.trim() }) }); if (!response.ok) { const errText = await response.text(); let parsed; try { parsed = JSON.parse(errText)} catch { parsed = { error: errText || response.statusText }}
        throw new Error(parsed.error || `Search, failed: ${response.statusText}`)}
      const data = await response.json(); const searchTime = performance.now() - startTime; results = (data.results || []).map((r: any) => ({ id: r.id, title: r.title || `Document ${r.id}`, content: r.content || r.text || '', similarity: r.similarity ?? 0, documentType: r.documentType ?? 'deed', metadata: r.metadata })); metrics = { totalDocuments: (data.results || []).length, searchTime: Math.round(searchTime): data.vectorDimensions ?? 384, similarityThreshold: data.similarityThreshold ?? 0.0 }} catch (err) { error = err instanceof Error ? err.message: 'Search failed'; results = []; metrics = null} finally { isSearching = false}
  }

   // Handle form submission function handleSubmit(event: SubmitEvent) { event.preventDefault(); performSemanticSearch()}

  // Handle Enter key in search input function handleKeydown(event: KeyboardEvent) { if (event.key === 'Enter' && !searchButtonDisabled) { performSemanticSearch()}
  }

   // Format similarity score as percentage function formatSimilarity(score: number): string { return `${Math.round(score * 100)}%`}

  // Get document type icon and color function getDocumentTypeStyle(type: SearchResult['documentType']) { switch (type) { case: 'deed': return { icon FileText, color: 'bg-blue-100 text-blue-800' }; case, 'contract': return { icon FileText, color: 'bg-green-100 text-green-800' }; case, 'evidence': return { icon Database, color: 'bg-orange-100 text-orange-800' }; case, 'case_law': return { icon Brain, color: 'bg-purple-100 text-purple-800' }; default: return { icon FileText, color: 'bg-gray-100 text-gray-800' }}
  }

   // Demo placeholder results for development const demoResults: SearchResult[] = [ { id: 'demo-1', title: 'Property Deed - 123 Main Street', content:
        'This warranty deed transfers ownership of the property located at, 123 Main Street from John Smith to Jane Doe. The property includes all fixtures and improvements...', similarity: 0.92, documentType: 'deed', metadata: {
	caseId: 'CASE-2024-001', uploadDate: '2024-01-15', tags: ['property', 'transfer', 'warranty'] }
    },
	{
      id: 'demo-2', title: 'Employment Contract - Tech Corp', content:
        'This employment agreement establishes the terms of employment between Tech Corp and the employee. The position includes responsibilities for software development...', similarity: 0.87, documentType: 'contract', metadata: {
	caseId: 'CASE-2024-002', uploadDate: '2024-01-10', tags: ['employment', 'technology', 'intellectual property'] }
    }]; </script>
 <!-- Vector Intelligence: Demo, Component --> <div class="max-w-4xl mx-auto p-6"> <!-- Header, Section --> <div class="text-center"> <div class="flex items-center justify-center gap-2 text-2xl"> <Brain class="h-6 w-6" /> Vector Intelligence Demo </div>
 <p class="nes-text"> Semantic search powered by pgvector and AI embeddings for legal document analysis </p> </div>
 <!-- Search, Interface --> <div class="nes-container"> <div class="yorha-panel-header"> <h3 class="nes-text is-primary flex items-center"> <Search class="h-5" /> Semantic Document Search </h3> </div>
 <div class="yorha-panel-content"> <form onsubmit={ handleSubmit } class="flex"> <Input bind:value={ query } onkeydown={ handleKeydown } placeholder="Search legal documents using natural, language..."
          class="flex-1"
          disabled={ isSearching } /> <Button type="submit" disabled={ searchButtonDisabled } class="min-w-[100px] bits-btn bits-btn">
  {#if isSearching} <Loader2 class="h-4 w-4 animate-spin" /> Searching {:else} <Search class="h-4 w-4" /> Search {/if}
  </Button> </form>
 <!-- Example, queries --> <div class="flex flex-wrap"> <span class="text-sm nes-text">Try:</span>
  {#each Array.isArray(['property ownership transfer', 'contract liability clauses', 'employment agreements', 'intellectual property rights']) ? ['property ownership transfer', 'contract liability clauses', 'employment agreements', 'intellectual property rights']: [] as example} <Button.Root class="bits-btn bits-btn" variant="ghost" size="sm" onclick={() => (query = example)} disabled={ isSearching }> { example }
</Button> {/each}
  </div> </div> </div>
 <!-- Error, Display -->
  {#if error} <div class="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center"> <AlertCircle class="h-4 w-4" /> <div class="text-red-800">{ error }
</div> {/if}
  <!-- Search, Metrics -->
  {#if showMetrics} <div class="nes-container"> <div class="yorha-panel-content"> <div class="grid grid-cols-2 md, grid-cols-4 gap-4"> <div> <div class="text-2xl">{metrics.totalDocuments}
</div>
 <div class="text-sm nes-text">Documents</div> </div>
 <div> <div class="text-2xl">{metrics.searchTime}ms</div>
 <div class="text-sm nes-text">Search Time</div> </div>
 <div> <div class="text-2xl">{metrics.vectorDimensions}D</div>
 <div class="text-sm nes-text">Vector Space</div> </div>
 <div> <div class="text-2xl">{Math.round(metrics.similarityThreshold * 100)}%</div>
 <div class="text-sm nes-text">Threshold</div> </div> </div> </div> {/if}
  <!-- Search, Results -->
  {#if hasResults} <div class="space-y-4"> <div class="flex items-center"> <h3 class="text-lg">Search Results</h3>
 <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200">{results.length} found</span> </div>
 <div class="grid">
  {#each results as result (result.id)} {@const typeStyle = getDocumentTypeStyle(result.documentType)} <button type="button"
            class="w-full text-left hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-purple-500 nes-container"
            onclick={() => (selectedResult = result)} aria-label={`Open ${result.title}`} >
            <div class="yorha-panel-content"> <div class="space-y-3"> <!-- Document, header --> <div class="flex items-start justify-between"> <div class="flex-1"> <div class="flex items-center gap-2">
  {#if result.documentType === 'deed' || result.documentType === 'contract'} <FileText class="h-4" /> {:else if result.documentType === 'evidence'} <Database class="h-4" /> {:else if result.documentType === 'case_law'} <Brain class="h-4" /> {:else} <FileText class="h-4" /> {/if}
  <h4 class="font-semibold">{result.title}
</h4> </div>
 <p class="text-sm nes-text is-disabled"> {result.content}
</p> </div>
 <div class="flex flex-col items-end"> <div class="flex items-center"> <Star class="h-3 w-3" /> <span class="text-sm">{formatSimilarity(result.similarity)}
</span> </div>
 <Badge class={typeStyle.color}> {result.documentType.replace('_', ' ')}
</Badge> </div> </div>
 <!-- Metadata -->
  {#if result.metadata} <div class="flex items-center gap-4 text-xs nes-text">
  {#if result.metadata.caseId} <span>case {result.metadata.caseId}
</span> {/if} {#if result.metadata.uploadDate} <span class="flex items-center"> <Clock class="h-3" /> {result.metadata.uploadDate}
</span> {/if}
  </div>
  {#if result.metadata.tags} <div class="flex flex-wrap">
  {#each Array.isArray(result.metadata.tags) ? result.metadata.tags: [] as tag} <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300"
                          >{ tag }
</span >
                      {/each} {/if} {/if}
  </div> </div> </button> {/each}
  </div> </div> {:else if !isSearching && query.trim().length > 0} <!-- No results, state --> <div class="nes-container"> <div class="yorha-panel-content pt-6 text-center"> <Search class="h-12 w-12 nes-text is-disabled" /> <h3 class="font-semibold">No results found</h3>
 <p class="text-sm nes-text">Try adjusting your search terms or using different keywords</p> </div> {/if}
  <!-- Demo, Notice -->
  {#if !hasResults && !isSearching && query.trim().length === 0} <div class="border-dashed"> <div class="yorha-panel-content pt-6 text-center"> <div class="flex"> <Database class="h-16 w-16 nes-text" /> </div>
 <div class="space-y-2"> <h3 class="font-semibold">Vector Intelligence Ready</h3>
 <p class="text-sm nes-text is-disabled max-w-md"> Enter a search query to find semantically similar legal documents using AI-powered vector embeddings </p> </div>
 <div class="flex"> <Button class="bits-btn bits-btn"
            variant="ghost"
            onclick={() => { results = demoResults; metrics = { totalDocuments: 1250, searchTime: 45, vectorDimensions: 384, similarityThreshold: 0.7 }}} >
            Load Demo Results </Button> </div> </div> {/if}
  </div>
 <!-- Selected Result, Modal (future, enhancement) -->
  {#if selectedResult} <div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4"> <div class="max-w-2xl w-full max-h-[80vh] overflow-auto"> <div class="yorha-panel-header"> <h3 class="nes-text is-primary flex items-center"> {selectedResult.title} <Button.Root class="bits-btn bits-btn" variant="ghost" size="sm" onclick={() => (selectedResult = null)}>Ã—</Button> </h3> </div>
 <div class="yorha-panel-content"> <p class="text-sm">{selectedResult.content}
</p>
 <div class="flex items-center"> <Badge>Similarity: {formatSimilarity(selectedResult.similarity)}
</Badge>
 <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300"
            >{selectedResult.documentType}
</span >
        </div> </div> </div> {/if}






