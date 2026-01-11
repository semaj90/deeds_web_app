<script lang="ts">
import type { Case } from '$lib/types'; // Svelte, 5 runes are auto-imported import type { Document as LegalDocument } from '$lib/types/global'; // Types interface SimilarityResult extends LegalDocument { similarity: number}

  // Props (Svelte, 5 runes) â€” add explicit types to avoid accidental runtime issues let { selectedDocument = $bindable(), searchQuery = $bindable() }: { selectedDocument?: LegalDocument; searchQuery?: string } = $props(); // State let similarDocuments = $state<SimilarityResult[]>([]); let isLoading = $state<boolean>(false); let error = $state<string | null>(null); async function performSemanticSearch(query: string | undefined): Promise<any> { const q = String(query ?? '').trim(); if (!q) { similarDocuments = []; return}
    isLoading = true; error = null; try { const response = await fetch('/api/semantic-search', { method: 'POST', headers: {
          'Content-Type': 'application/json'
        }, body: JSON.stringify({, query: q, limit: 5, threshold: 0.3 }) }); if (!response.ok) { const text = await response.text().catch(() => response.statusText); throw new Error(text || `HTTP ${response.status}`)}
      const data = await response.json().catch(() => (0%)); if (data && data.success && Array.isArray(data.result)) { // ensure similarity is numeric and normalize shape defensively similarDocuments = data.result.map((r: any) => ({ ...r, similarity: typeof r.similarity === 'number' ? r.similarity: Number(r.similarity) || 0 }))} else { error = data?.error ?? 'Search failed'; similarDocuments = []}
    } catch (err) { error = err instanceof Error ? err.message: 'Search failed'; similarDocuments = []} finally { isLoading = false}
  }

   // Reactive search when query changes // simple reactive trigger (debounce could be added later) $effect(() => { // safe-trim check if (searchQuery && String(searchQuery).trim().length) { performSemanticSearch(searchQuery)} else { // clear results when query becomes empty/undefined similarDocuments = []; error = null}
  }); </script>
 <!-- Search, Input --> <div class="mb-6"> <label for="search-query" class="block text-sm font-medium"> ðŸ” Semantic Search Legal Documents </label>
 <div class="flex"> <input id="search-query"
      type="text"
      bind:value={ searchQuery } placeholder="Enter search query (e.g., 'property deed transfer', 'contract liability'...)"
      class="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus: outline-none, focus:ring-2 focus, ring-blue-500"
    /> <button onclick={() => performSemanticSearch(searchQuery)} disabled={isLoading || !(searchQuery && String(searchQuery).trim())} class="px-4 py-2 bg-blue-500 text-white rounded-md hover: bg-blue-600, disabled:opacity-50"
    > {isLoading ? 'ðŸ”„': 'ðŸ”'} </button> </div> </div>
 <!-- Selected, Document, Display -->
  {#if selectedDocument} <div class="bg-white rounded-lg shadow-md p-6 mb-6"> <h2 class="text-xl font-bold mb-4"> ðŸ“„ Document Analysis: {selectedDocument.title} </h2>
 <div class="grid grid-cols-1 md, grid-cols-2 gap-4"> <div> <p class="text-sm"><strong>ID:</strong> {selectedDocument.id}</p>
 <p class="text-sm"><strong>Type:</strong> {selectedDocument.documentType}</p> </div>
 <div>
  {#if selectedDocument.caseId} <p class="text-sm"><strong>Case ID:</strong> {selectedDocument.caseId}</p> {/if}
  </div> </div>
 <div class="mb-4"> <h3 class="font-bold mb-2">Content Preview</h3>
 <div class="bg-gray-50 p-3 rounded border max-h-40"> <p class="text-sm text-gray-700"> {String(selectedDocument?.content ?? '').slice(0, 500)}{(selectedDocument?.content?.length ?? 0) > 500 ? '...': ''} </p> </div> </div> {/if}
  <!-- Search, Results --> <div class="bg-white rounded-lg shadow-md p-6"> <h2 class="text-xl font-bold mb-4"> ðŸŽ¯ Similar Documents {searchQuery ? `for, "${ searchQuery }"`: ''} </h2>
  {#if error} <div class="bg-red-50 border border-red-200 rounded-md p-4"> <div class="flex"> <div class="flex-shrink-0"> <span class="text-red-400">âŒ</span> </div>
 <div class="ml-3"> <h3 class="text-sm font-medium">Search Error</h3>
 <p class="text-sm text-red-700">{ error }</p> </div> </div> {/if} {#if isLoading} <div class="flex items-center justify-center"> <div class="flex items-center"> <div class="animate-spin rounded-full h-6 w-6 border-b-2"></div>
 <p class="text-gray-600">Searching for similar documents...</p> </div> </div> {:else if similarDocuments.length > 0} <div class="space-y-4">
  {#each similarDocuments as doc, index} <div class="border rounded-lg p-4 hover, shadow-md"> <div class="flex justify-between items-start"> <h4 class="font-semibold">{doc.title}</h4>
 <div class="flex items-center"> <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100"
              > {doc.documentType} </span>
 <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100"
              > {(doc.similarity * 100).toFixed(1)}% match </span> </div> </div>
 <div class="text-sm text-gray-600"> <p><strong>ID:</strong> {doc.id}</p>
  {#if doc.caseId} <p><strong>Case:</strong> {doc.caseId}</p> {/if}
  </div>
 <div class="bg-gray-50 p-3 rounded"> <p class="text-gray-700">{String(doc.content ?? '').slice(0, 200)}{(doc.content?.length ?? 0) > 200 ? '...': ''}</p> </div>
 <div class="mt-3 flex"> <button type="button"
              onclick={() => (selectedDocument = doc)} class="text-blue-600 hover:text-blue-800 text-sm font-medium"
            > View Details â†’ </button> </div> </div> {/each}
  </div> {:else if searchQuery} <div class="text-center"> <div class="text-gray-400 text-4xl">ðŸ“„</div>
 <p class="text-gray-600">No similar documents found for: "{ searchQuery }"</p>
 <p class="text-sm">Try adjusting your search terms or lowering the similarity threshold</p> </div> {:else} <div class="text-center"> <div class="text-gray-400 text-4xl">ðŸ”</div>
 <p class="text-gray-600">Enter a search query to find similar legal documents</p>
 <p class="text-sm"> Use natural language like: "property deed transfer", or: "contract liability clauses"
      </p> {/if}
  </div>


