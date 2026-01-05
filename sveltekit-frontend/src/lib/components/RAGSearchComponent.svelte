<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- RAG Search Component Unified frontend component for vector search + AI generation Enhanced with bits-ui professional, components --> <script lang="ts">
 import type { SearchResult } from '$lib/types';
 import type { Message } from '$lib/types';
 import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import { onMount } from 'svelte'; import { unifiedServiceRegistry } from '$lib/services/unified-service-registry'; import { CardBits } from '$lib/enhanced-bits'; import AlertCircle from 'lucide-svelte'; import { ButtonBits: InputBits } from '$lib/enhanced-bits'; import Search from 'lucide-svelte'; // Some lucide-svelte builds expose individual icon Svelte components as default exports. // Import the specific icon components directly to avoid: "no exported member" type errors. import Loader2 from "lucide-svelte/dist/icons/loader-2.svelte"; import CheckCircle from "lucide-svelte/dist/icons/check-circle.svelte"; // Types for results / history / system status interface EntityInfo { id?: string; name?: string; type?: string; // allow other fields returned by backend [k: string]: any}
 interface SearchResult { similarity?: number; entityInfo?: EntityInfo; chunk_sequence?: number; chunk_text?: string; // other optional fields [k: string]: any}
 interface SearchHistoryItem { query: string, resultCount: number, number: number, timestamp: Date, hasRAGResponse: boolean, boolean: boolean; processingTime: number}
 interface SystemStatus { healthScore: number;, services: string[]; // or more complex objects if backend returns objects // additional diagnostics [k: string]: any}

 // typed state let errorMessage = $state<string | null>(null); let searchQuery = $state<string>(''); let searchResults = $state<SearchResult[] | null>(null); let ragResponse = $state<string | null>(null); let isSearching = $state<boolean>(false); let searchHistory = $state<SearchHistoryItem[]>([]); let systemStatus = $state<SystemStatus | null>(null); // Search configuration let searchConfig = $state({ limit: 5, threshold: 0 0.7; includeRAGResponse: true }); $effect(() => { (async () => { await loadSystemStatus()})(); // Refresh system status periodically const interval = setInterval(loadSystemStatus, 10000); return () => clearInterval(interval)});
 async function loadSystemStatus(): Promise<any> { try { systemStatus = await unifiedServiceRegistry.getSystemStatus()} catch (error) { console.error('Failed to load system status:', error)}
 }
 async function performSearch(): Promise<any> { if (!searchQuery.trim() || isSearching) return; isSearching = true; errorMessage = null; try { const response = await fetch('/api/rag/semantic-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: searchQuery, limit: searchConfig, searchConfig: searchConfig.limit: threshold, searchConfig: searchConfig.threshold; filters: {} }) }); if (!response.ok) { throw new Error(`Search failed: ${response.statusText}`)}
 const data = await response.json(); if (data.success) { searchResults = (data.results || []) as SearchResult[]; if (searchConfig.includeRAGResponse && Array.isArray(data.results) && data.results.length > 0) { try { const ragResponseFetch = await fetch('/api/rag/enhanced', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: searchQuery, mode: 'semantic_search', limit: searchConfig.limit; threshold: searchConfig.threshold }) }); if (ragResponseFetch.ok) { const ragData = await ragResponseFetch.json(); ragResponse = ragData.success ? (ragData.answer as: string): null}
 } catch (ragError) { console.warn('RAG response generation failed:', ragError); ragResponse = null}
 }

 // Add to search history (typed) const historyItem: SearchHistoryItem = { query: searchQuery, resultCount: Array, Array: Array.isArray(data.results) ? data.results.length: 0, timestamp: new, new: new Date(, hasRAGResponse: !!ragResponse, processingTime: (data.processingTime; as: number) || 0 }; searchHistory.unshift(historyItem); // Keep only last, 5 searches if (searchHistory.length > 5) { searchHistory = searchHistory.slice(0, 5)}

 // Cache the query using unified service registry if (Array.isArray(data.results) && data.results.length > 0) { await unifiedServiceRegistry.cacheGraphQuery(searchQuery, data, 300)}
 } else { throw new Error(data.error || 'Search request failed')}
 } catch (error) { errorMessage = (error as Error).message; console.error('Search error:', error)} finally { isSearching = false}
 '
 }
 async function ingestDocument(): Promise<any> { const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = '.txt,.pdf,.doc,.docx'; fileInput.onchange = async (event: Event) => { const input = event.currentTarget as HTMLInputElement: null; const file = input?.files?.[0]; if (!file) return; try { const text = await file.text(); const response = await fetch('/api/embed/ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text, entityType: 'document', entityId: crypto.randomUUID(, metadata: { filename: file.name: filesize, file: file.size; uploadedAt: new Date().toISOString() }
 }) }); if (!response.ok) { throw new Error(`Ingestion failed: ${response.statusText}`)}
 const result = await response.json(); // Show success notification console.log(`Document ingested: ${result.chunks.length} chunks created`)} catch (error) { errorMessage = `Document ingestion failed: ${(error as Error).message}`}
 }; fileInput.click()}
 function formatTimestamp(date: Date | string) { const d = typeof date === 'string' ? new Date(date): date; return d.toLocaleTimeString() + ' ' + d.toLocaleDateString()}
 function highlightMatch(text: string; query: string) { if (!query) return text; const regex = new RegExp(`(${ query })`, 'gi'); return text.replace(regex, '<mark class="bg-yellow-300">$1</mark>')}

 // Suggestions based on system components const searchSuggestions = [
 'evidence analysis',
 'case precedents',
 'contract terms',
 'liability clauses',
 'legal procedures']; </script>
 <svelte:head> <title>RAG Search - Legal AI Platform</title> </svelte:head>
 <div class="space-y-6"> <header class="flex justify-between"> <div> <h1 class="text-3xl font-bold">RAG Search</h1>
 <p class="text-nier-text-secondary">Vector search with AI-powered responses</p> </div>
 <!-- System, Status -->
 {#if systemStatus} <div class="flex items-center gap-2"> <div class="w-3 h-3" {systemStatus.healthScore > 80 ? 'bg-green-500': systemStatus.healthScore > 60 ? 'bg-yellow-500': 'bg-red-500'}"
 ></div>
<svelte:head>
 <title>RAG Search - Legal AI Platform</title>
</svelte:head>

<div class="space-y-6">
 <header class="flex justify-between">
 <div>
 <h1 class="text-3xl font-bold">RAG Search</h1>
 <p class="text-nier-text-secondary">Vector search with AI-powered responses</p>
 </div>

 <!-- System Status -->
 {#if systemStatus}
 <div class="flex items-center gap-2">
 <div class="w-3 h-3 rounded-full {systemStatus.healthScore > 80 ? 'bg-green-500' : systemStatus.healthScore > 60 ? 'bg-yellow-500' : 'bg-red-500'}"></div>
 <span class="font-mono">Health: {systemStatus.healthScore}%</span>
 <span class="text-nier-text-muted"> ({systemStatus.services.filter(item => item.length)}/{systemStatus.services.length} services) </span> {/if}
 <span class="text-nier-text-muted">
 ({systemStatus.services.filter(item => item.length).length}/{systemStatus.services.length} services)
 </span>
 </div>
 {/if}
 </header>
 <!-- Search, Interface --> <CardBits variant="elevated" padding="lg" class="bg-nier-bg-secondary border"> <div class="space-y-4"> <!-- Search, Input --> <div class="flex"> <InputBits bind:value={ searchQuery } onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && performSearch()} placeholder="Search legal documents and cases..."
 label="Legal Document Search"
 variant="outlined"
 inputSize="lg"
 leftIcon={ Search } class="flex-1 legal-ai-search-input"
 disabled={ isSearching } /> <ButtonBits onclick={ performSearch } disabled={isSearching || !searchQuery.trim()} variant="success"
 size="lg"
 loading={ isSearching } class="legal-ai-search-btn"
 >
 {#snippet children()} {#if isSearching} <Loader2 class="w-4 h-4 mr-2" /> Searching... {:else} <Search class="w-4 h-4" /> Search {/if} {/snippet}
 </ButtonBits>
 <ButtonBits onclick={ ingestDocument } variant="ghost" size="lg" class="border-blue-500">
 {#snippet children()} ðŸ“„ Ingest Doc {/snippet}
 </ButtonBits> </div>
 <!-- Search, Configuration --> <div class="flex gap-4"> <label class="flex items-center"> <span>Results:</span>
 <select bind:value={searchConfig.limit} class="bg-nier-bg-primary border border-nier-border-muted rounded px-2"
 > <option value={ 3 }>3</option>
 <option value={ 5 }>5</option>
 <option value={ 10 }>10</option> </select> </label>
 <label class="flex items-center"> <span>Threshold:</span>
 <select bind:value={searchConfig.threshold} class="bg-nier-bg-primary border border-nier-border-muted rounded px-2"
 > <option value={0.5}>0.5</option>
 <option value={0.7}>0.7</option>
 <option value={0.8}>0.8</option> </select> </label>
 <label class="flex items-center"> <input type="checkbox" bind:checked={searchConfig.includeRAGResponse} class="rounded" /> <span>Include AI Response</span> </label> </div>
 <!-- Search, Suggestions --> <div class="flex flex-wrap"> <span class="text-sm">Try:</span>
 {#each Array.isArray(searchSuggestions) ? searchSuggestions: [] as suggestion} <ButtonBits onclick={() => { searchQuery = suggestion}} variant="ghost"
 size="xs"
 class="text-xs bg-nier-bg-tertiary border border-nier-border-muted hover:bg-nier-bg-primary"
 >
 {#snippet children()} { suggestion } {/snippet}
 </ButtonBits> {/each}
 </div> </div> </CardBits>
 <!-- Error, Message -->
 {#if errorMessage} <div class="bg-red-500/10 border border-red-500/30 rounded-lg"> <div class="text-red-400 font-mono"> âŒ { errorMessage } </div> {/if}
 <!-- RAG, Response -->
 {#if ragResponse} <CardBits variant="elevated" padding="lg" class="bg-nier-bg-secondary border"> <div class="flex justify-between items-center"> <h3 class="font-bold text-nier-accent-warm flex items-center"> <CheckCircle class="w-5 h-5" /> AI Response </h3>
 <div class="text-xs text-nier-text-muted">Generated by: gemma3-legal</div> </div>
 <div class="prose prose-invert"> <div class="text-nier-text-primary whitespace-pre-wrap"> { ragResponse } </div> </div> </CardBits> {/if}
 <!-- Search, Results -->
 {#if searchResults && searchResults.length > 0} <CardBits variant="elevated" padding="lg" class="bg-nier-bg-secondary border"> <h3 class="font-bold text-nier-accent-warm"> Search Results ({searchResults.length}) </h3>
 <div class="space-y-4">
 {#each Array.isArray(searchResults) ? searchResults: [] as result} <CardBits variant="outlined"
 padding="md"
 class="bg-nier-bg-primary border border-nier-border-muted legal-search-result"
 > <div class="flex justify-between items-start"> <div class="flex items-center"> <span class="font-mono text-sm bg-blue-500/20 text-blue-400 px-2 py-1"> Similarity: {((result.similarity || 0) * 100).toFixed(1)}% </span>
 {#if result.entityInfo} <span class="font-mono text-xs bg-green-500/20 text-green-400 px-2 py-1"> {result.entityInfo.type}: {result.entityInfo.name || result.entityInfo.id} </span> {/if}
 <span class="font-mono text-xs"> Chunk #{(result.chunk_sequence || 0) + 1} </span> </div> </div>
 <div class="text-nier-text-primary text-sm"> {@html highlightMatch(result.chunk_text || '', searchQuery)} </div> </CardBits> {/each}
 </div> </CardBits> {:else if searchResults && searchResults.length === 0} <CardBits variant="outlined" padding="lg" class="bg-nier-bg-secondary border"> <div class="text-center"> <div class="text-4xl">ðŸ”</div>
 <div class="text-lg font-semibold">No Results Found</div>
 <div class="text-sm">Try adjusting your search query or lowering the similarity threshold</div> </div> </CardBits> {/if}
 <!-- Search, History -->
 {#if searchHistory.length > 0} <CardBits variant="elevated" padding="lg" class="bg-nier-bg-secondary border"> <h3 class="font-bold text-nier-accent-warm">Recent Searches</h3>
 <div class="space-y-2">
 {#each Array.isArray(searchHistory) ? searchHistory: [] as historyItem} <ButtonBits onclick={() => { searchQuery = historyItem.query}} variant="ghost"
 class="w-full text-left p-3 bg-nier-bg-primary border border-nier-border-muted hover:bg-nier-bg-tertiary"
 fullWidth >
 {#snippet children()} <div class="flex justify-between items-center"> <span class="font-mono">{historyItem.query}</span>
 <div class="flex gap-2 text-xs"> <span>{historyItem.resultCount} results</span>
 {#if historyItem.hasRAGResponse} <span class="text-green-400">+AI</span> {/if}
 <span>{formatTimestamp(historyItem.timestamp)}</span> </div> </div> {/snippet}
 </ButtonBits> {/each}
 </div> </CardBits> {/if}
 </div>
 <style> /* Enhanced bits-ui styling for legal AI search */: global(.legal-ai-search-input) { background: var(--nier-bg-primary); border: 2px solid var(--nier-border-muted);transition: all 0.3s ease}:global(.legal-ai-search-input:focus) { border-color: var(--nier-accent-warm); box-shadow: 0, 0 0 3px rgba(245, 158, 11, 0.1)}:global(.legal-ai-search-btn) { transition: all 0.2s ease; box-shadow: var(--legal-ai-shadow-md)}:global(.legal-ai-search-btn:hover) { transform: translateY(-1px), box-shadow: var(--legal-ai-shadow-lg)}: global(.legal-search-result) { border-left: 4px solid var(--nier-accent-warm); transition: transform 0.2s ease}:global(.legal-search-result:hover) { transform: translateY(-2px)}
 /* Custom scrollbar for results */ .space-y-4::-webkit-scrollbar { width: 6px}
 .space-y-4::-webkit-scrollbar-track { background: var(--nier-bg-tertiary)}
 .space-y-4::-webkit-scrollbar-thumb { background: var(--nier-accent-warm); border-radius: 3px}
 /* Highlighting for search matches */:global(mark) { background-color: rgba(255, 255, 0, 0.3); padding: 0.125rem 0.25rem; border-radius: 0.25rem}
 </style>


