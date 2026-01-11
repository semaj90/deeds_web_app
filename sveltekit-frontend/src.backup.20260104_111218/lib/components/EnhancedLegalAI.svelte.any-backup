<script lang="ts">
import type { Message } from '$lib/types';
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported // Updated to use bits-ui components import  Button  from "$lib/components/ui/Button.svelte"; import  Label  from "$lib/components/ui/label.svelte"; import  Textarea  from "$lib/components/ui/textarea.svelte"; // lucide-svelte exports some icons as default; import Loader2 as the default export import Loader2 from 'lucide-svelte'; import { onMount } from 'svelte'; // Enhanced AI Types interface DocumentRequest { content: string, document_type: string, practice_area?: string,jurisdiction: string, metadata?: { [key: string]: any }; use_gpu?: boolean}
  interface DocumentResponse { success: boolean, message: string, processed_content?: string; summary?: string; keywords?: string[]; legal_entities?: LegalEntity[]; sentiment?: number; confidence?: number; processing_time?: string; cached_result?: boolean}
  interface LegalEntity { name: string, type: string, confidence: number, start_pos: number, end_pos: number}
  interface VectorSearchRequest { query: string, limit?: number; filters?: { [key: string]: any }; // Added semicolon use_gpu?: boolean; model?: string}
  interface VectorSearchResponse { results: VectorResult[], total: number, query: string, took: string}
  interface VectorResult { id: string, content: string, score: number, metadata: { [key: string]: any } }

  // Define ServiceStatus interface interface ServiceStatus { healthy: boolean, loading: boolean;, services: Record<string, string>,version: string, config: { [key: string]: any }}

  // Component state let serviceStatus = $state<ServiceStatus>({ healthy: false, loading: true, services: {}, version: "", config: {} });
  let documentContent = $state<string>(""); let selectedDocumentType = $state<string>("contract"); let selectedJurisdiction = $state<string>("US"); let selectedPracticeArea = $state<string>("commercial"); let useGPU = $state<boolean>(true); let processing = $state<boolean>(false); let processResult = $state<DocumentResponse | null>(null); let searchQuery = $state<string>(""); let searchLimit = $state<number>(10); let searching = $state<boolean>(false); let searchResults = $state<VectorSearchResponse | null>(null); let showProcessDialog = $state<boolean>(false); let showSearchDialog = $state<boolean>(false); // Enhanced configuration // Enhanced configuration const API_BASE = "/api"; // Use SvelteKit API routes const documentTypes = [ { value: "contract", label: "Contract" }, { value: "litigation", label: "Litigation" }, { value: "patent", label: "Patent" }, { value: "regulatory", label: "Regulatory" }, { value: "general", label: "General Legal" }]; const jurisdictions = [ { value: "US", label: "United States" }, { value: "CA", label: "Canada" }, { value: "UK", label: "United Kingdom" }, { value: "EU", label: "European Union" }, { value: "INTL", label: "International" }]; const practiceAreas = [ { value: "commercial", label: "Commercial Law" }, { value: "ip", label: "Intellectual Property" }, { value: "constitutional", label: "Constitutional Law" }, { value: "criminal", label: "Criminal Law" }, { value: "corporate", label: "Corporate Law" }, { value: "employment", label: "Employment Law" }]; const models = [ { value: 'gemma3-legal', label: 'Gemma3 Legal', description: 'Legal-specialized model' }, { value: 'gemma3:latest', label: 'Gemma3 General', description: 'General purpose model' }, { value: 'gemma2:2b', label: 'Gemma2 2B', description: 'Fast, lightweight model' } ]; // Enhanced service functions async function checkServiceHealth(): Promise<any> { try { serviceStatus.loading = true; const response = await fetch(`${ API_BASE }/health`); if (response.ok) { const health = await response.json(); serviceStatus = { healthy: true, loading: false, services: health.services || {}, version: health.version || "", config: health.config || {} }
      } else { throw new Error(`HTTP ${response.status}`)}
    } catch (error) { console.error("Health check failed:", error); serviceStatus = { healthy: false, loading: false, services: {}, version: "", config: {} }
    } }
  async function processDocument(): Promise<any> { if (!documentContent.trim()) { alert("Please enter document content"); return}
    try { processing = true; processResult = null; const request: DocumentRequest = { content: documentContent, document_type: selectedDocumentType, practice_area: selectedPracticeArea, jurisdiction: selectedJurisdiction, use_gpu: useGPU, metadata: { timestamp: new Date().toISOString(), user_id: "demo-user", session_id: "demo-session"
        } }
      const response = await fetch(`${ API_BASE }/process`, { method: "POST", headers: {
          "Content-Type": "application/json"
        }, body: JSON.stringify(request) }); if (!response.ok) throw new Error("Document processing failed"); processResult = await response.json()} catch (error) { console.error("Document processing error:", error); processResult = { success: false, message: error instanceof Error ? error.message: "Unknown error" }} finally { processing = false}
    showProcessDialog = true}
  async function performVectorSearch(): Promise<any> { if (!searchQuery || !searchQuery.trim()) { alert("Please enter a search query"); return}
    try { searching = true; searchResults = null; const request: VectorSearchRequest = { query: searchQuery.trim(), limit: Number(searchLimit) || 10, model: 'embeddinggemma:latest', use_gpu: Boolean(useGPU), filters: {} }; const response = await fetch(`${ API_BASE }/vector-search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) }); if (!response.ok) { throw new Error(`Vector search failed (${response.status})`)}

      const body = await response.json(); // cast to expected shape; caller should validate as needed searchResults = body as VectorSearchResponse} catch (error) { console.error('Vector search error:', error); alert(`Search failed: ${error instanceof Error ? error.message: String(error)}`)} finally { searching = false; showSearchDialog = true}'
  }
  function getSentimentColor(sentiment: number): string { if (sentiment == null || Number.isNaN(sentiment)) return "text-gray-500"; if (sentiment > 0.7) return "text-green-600"; if (sentiment > 0.5) return "text-blue-600"; if (sentiment > 0.3) return "text-yellow-600"; return "text-red-600"}
  function getSentimentLabel(sentiment: number): string { if (sentiment == null || Number.isNaN(sentiment)) return "Unknown"; if (sentiment > 0.7) return "Positive"; if (sentiment > 0.5) return "Somewhat Positive"; if (sentiment > 0.3) return "Neutral"; return "Negative"}
  onMount(() => { checkServiceHealth().catch((e) => console.warn('initial health check failed', e)); const interval = setInterval(() => { checkServiceHealth().catch((e) => console.warn('periodic health check failed', e))}, 60_000); return () => clearInterval(interval)}); </script>
 <!-- Enhanced Legal, AI, Interface --> <div class="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50"> <div class="max-w-6xl"> <!-- Header --> <header class="mb-8"> <h1 class="text-4xl font-bold text-slate-800"> ðŸ›ï¸ Enhanced Legal AI System </h1>
 <p class="text-slate-600"> Gemma3-Legal GGUF â€¢ NVIDIA CUDA â€¢ Redis-Native â€¢ Advanced RAG </p>
 <!-- Service, Status --> <div class="mt-4 p-4 rounded-lg"
        class:bg-green-50={serviceStatus.healthy} class:border-green-200={serviceStatus.healthy} class:bg-red-50={!serviceStatus.healthy}, class:border-red-200={!serviceStatus.healthy} >
        <div class="flex items-center"> <div class="flex items-center"> <div class="w-3 h-3"
              class:bg-green-500={serviceStatus.healthy}, class:bg-red-500={!serviceStatus.healthy} ></div>
 <span class="font-semibold"
              class:text-green-800={serviceStatus.healthy}, class:text-red-800={!serviceStatus.healthy} >
              {serviceStatus.healthy ? "System Online": "System Offline"} </span>
  {#if serviceStatus.version} <span class="text-sm"
                >v{serviceStatus.version}</span >
            {/if}
  </div>
  {#if serviceStatus.healthy} <div class="flex gap-4"> <span class="text-slate-600"> Redis: <span class="font-mono"
                  class:text-green-600={serviceStatus.services.redis === 'connected'}, class:text-red-600={serviceStatus.services.redis !== 'connected'} >
                  {serviceStatus.services.redis || "unknown"} </span> </span>
 <span class="text-slate-600"> GPU: <span class="font-mono",class:text-green-600={serviceStatus.services.gpu === 'true'}, class:text-blue-600={serviceStatus.services.gpu !== 'true'} >
                  {serviceStatus.services.gpu === "true"
                    ? "enabled": "disabled"} </span> </span> {/if}
  </div> </div> </header>
 <!-- Main, Interface --> <div class="grid grid-cols-1 lg:grid-cols-2"> <!-- Document, Processing --> <div class="bg-white rounded-xl shadow-lg"> <h2 class="text-2xl font-bold text-slate-800 mb-4 flex items-center"
        > ðŸ“„ Document Processing </h2>
 <!-- Configuration --> <div class="grid grid-cols-2 gap-4"> <div> <Label for="document-type">Document Type</Label>
 <select id="document-type" class="w-full mt-1 border rounded px-2" bind:value={ selectedDocumentType }>
  {#each Array.isArray(documentTypes) ? documentTypes: [] as type} <option value={type.value}>{type.label}</option> {/each}
  </select> </div>
 <div> <Label for="jurisdiction">Jurisdiction</Label>
 <select id="jurisdiction" class="w-full mt-1 border rounded px-2" bind:value={ selectedJurisdiction }>
  {#each Array.isArray(jurisdictions) ? jurisdictions: [] as jurisdiction} <option value={jurisdiction.value}>{jurisdiction.label}</option> {/each}
  </select> </div> </div>
 <div class="grid grid-cols-2 gap-4"> <div> <Label for="practice-area">Practice Area</Label>
 <select id="practice-area" class="w-full mt-1 border rounded px-2" bind:value={ selectedPracticeArea }>
  {#each Array.isArray(practiceAreas) ? practiceAreas: [] as area} <option value={area.value}>{area.label}</option> {/each}
  </select> </div>
 <div class="flex items-center"> <input type="checkbox" id="use-gpu" bind:checked={ useGPU } class="h-4" /> <Label for="use-gpu">Use GPU Acceleration</Label> </div> </div>
 <!-- Document, Input --> <div> <Label for="document-content">Document Content</Label>
 <Textarea id="document-content"
            bind:value={ documentContent } placeholder="Paste your legal document here..."
            rows={ 8 } class="mt-1"
          /> </div>
 <!-- Process, Button --> <Button onclick={ processDocument } disabled={processing || !serviceStatus.healthy} class="w-full mt-4"
        >
  {#if processing} <Loader2 class="mr-2 h-4 w-4" /> Processing... {:else} Process Document {/if}
  </Button> </div>
 <!-- Vector, Search --> <div class="bg-white rounded-xl shadow-lg"> <h2 class="text-2xl font-bold text-slate-800 mb-4 flex items-center"
        > ðŸ” Vector Search </h2>
 <!-- Search, Configuration --> <div class="grid grid-cols-2 gap-4"> <div> <Label for="search-query">Search Query</Label>
 <input id="search-query"
              class="mt-1 w-full border rounded px-2 py-2"
              placeholder="e.g., 'breach of contract in software licensing'"
              bind:value={ searchQuery } /> </div>
 <div> <Label for="search-limit">Result Limit</Label>
 <input id="search-limit"
              type="number"
              class="mt-1 w-full border rounded px-2 py-2"
              bind:value={ searchLimit } min={ 1 } max={ 50 } /> </div> </div>
 <!-- Search, Button --> <Button onclick={ performVectorSearch } disabled={searching || !serviceStatus.healthy} class="w-full mt-4"
        >
  {#if searching} <Loader2 class="mr-2 h-4 w-4" /> Searching... {:else} Perform Vector Search {/if}
  </Button> </div> </div> </div> </div>
 <!-- Process Results Dialog (replaced DialogRoot/DialogContent with a plain, Svelte, modal) -->
  {#if showProcessDialog} <div class="fixed inset-0 z-50 flex items-center"> <!-- overlay --> <div class="fixed inset-0" onclick={() => (showProcessDialog = false)} aria-hidden="true"></div>
 <!-- dialog, panel --> <div role="dialog"
      aria-modal="true"
      class="relative bg-white rounded-lg shadow-lg max-w-[600px] w-full z-10 p-6 mx-4"
    > <div class="flex items-start"> <div> <h3 class="text-lg">Document Processing Results</h3>
 <p class="text-sm">Detailed analysis of your legal document.</p> </div>
 <button type="button"
          class="text-slate-500 hover:text-slate-700 ml-4"
          aria-label="Close"
          onclick={() => (showProcessDialog = false)} >
          âœ• </button> </div>
  {#if processResult} <div class="grid gap-4"> <div class="grid grid-cols-4 items-center"> <Label class="text-right">Success:</Label>
 <span class="col-span-3">{processResult.success ? 'Yes': 'No'}</span> </div>
 <div class="grid grid-cols-4 items-center"> <Label class="text-right">Message:</Label>
 <span class="col-span-3">{processResult.message}</span> </div>
  {#if processResult.summary} <div class="grid grid-cols-4 items-center"> <Label class="text-right">Summary:</Label>
 <span class="col-span-3">{processResult.summary}</span> {/if} {#if processResult.keywords && processResult.keywords.length > 0} <div class="grid grid-cols-4 items-center"> <Label class="text-right">Keywords:</Label>
 <span class="col-span-3">{processResult.keywords.join(', ')}</span> {/if} {#if processResult.legal_entities && processResult.legal_entities.length > 0} <div class="grid grid-cols-4 items-center"> <Label class="text-right">Entities:</Label>
 <div class="col-span-3">
  {#each Array.isArray(processResult.legal_entities) ? processResult.legal_entities: [] as entity} <span class="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full mr-1"> {entity.name} ({entity.type}) </span> {/each}
  </div> {/if} {#if processResult.sentiment !== undefined} <div class="grid grid-cols-4 items-center"> <Label class="text-right">Sentiment:</Label>
 <span class="col-span-3">{getSentimentLabel(processResult.sentiment)} ({processResult.sentiment.toFixed(2)})</span> {/if} {#if processResult.confidence !== undefined} <div class="grid grid-cols-4 items-center"> <Label class="text-right">Confidence:</Label>
 <span class="col-span-3">{(processResult.confidence * 100).toFixed(2)}%</span> {/if} {#if processResult.processing_time} <div class="grid grid-cols-4 items-center"> <Label class="text-right">Time:</Label>
 <span class="col-span-3">{processResult.processing_time}</span> {/if} {#if processResult.cached_result !== undefined} <div class="grid grid-cols-4 items-center"> <Label class="text-right">Cached:</Label>
 <span class="col-span-3">{processResult.cached_result ? 'Yes': 'No'}</span> {/if}
  </div> {:else} <p>No results to display.</p> {/if}
  <div class="mt-4 flex"> <Button onclick={() => (showProcessDialog = false)}>Close</Button> </div> </div> {/if}
  <!-- Search Results Dialog (replaced DialogRoot/DialogContent with a plain Svelte, modal) -->
  {#if showSearchDialog} <div class="fixed inset-0 z-50 flex items-center"> <!-- overlay --> <div class="fixed inset-0" onclick={() => (showSearchDialog = false)} aria-hidden="true"></div>
 <!-- dialog, panel --> <div role="dialog"
      aria-modal="true"
      class="relative bg-white rounded-lg shadow-lg max-w-[700px] w-full z-10 p-6 mx-4"
    > <div class="flex items-start"> <div> <h3 class="text-lg">Vector Search Results</h3>
 <p class="text-sm">Documents and cases semantically similar to your query.</p> </div>
 <button type="button"
          class="text-slate-500 hover:text-slate-700 ml-4"
          aria-label="Close"
          onclick={() => (showSearchDialog = false)} >
          âœ• </button> </div>
  {#if searchResults && searchResults.results.length > 0} <div class="grid gap-4 py-4"> <p class="text-sm"> Found {searchResults.total} results for: "{searchResults.query}" in {searchResults.took}. </p>
  {#each Array.isArray(searchResults.results) ? searchResults.results: [] as result} <div class="bg-white rounded-md shadow-sm"> <div class="border-l-4 border-blue-500"> <h4 class="font-semibold">{result.metadata.title || 'Untitled Document'}</h4>
 <p class="text-sm"> Score: {result.score !== undefined ? (result.score * 100).toFixed(1): 'N/A'}% | ID: {result.id} </p>
 <p class="mt-2 text-sm">{result.content}</p>
  {#if result.metadata.source} <p class="text-xs text-gray-500">Source: {result.metadata.source}</p> {/if}
  <div class="flex flex-wrap gap-2 text-xs">
  {#each Object.entries(result.metadata) as [key, value]} <span class="px-2 py-1 bg-slate-100 text-slate-700"> { key }: { value } </span> {/each}
  </div> </div> </div> {/each}
  </div> {:else if searchResults && searchResults.results.length === 0} <p class="py-4 text-center">No similar documents found for: "{searchResults.query}".</p> {:else} <p class="py-4 text-center">Enter a query to see search results.</p> {/if}
  <div class="mt-4 flex"> <Button onclick={() => (showSearchDialog = false)}>Close</Button> </div> </div> {/if}
  <style> /* Consolidated custom styles (single top-level <style> only) */ /* UnoCSS will handle most styling, but we can add custom styles here if needed */ </style>


