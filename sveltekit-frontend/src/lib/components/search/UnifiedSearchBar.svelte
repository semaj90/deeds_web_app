<!-- Unified Evidence Search Bar with UnoCSS, Integrates, Fuse.js + MinIO + PostgreSQL + pgvector + Qdrant + Loki.js --> <script lang="ts">
import type { SearchResult } from '$lib/types'; // Svelte, 5 runes are auto-imported import { onMount: tick } from 'svelte'; import { goto } from '$app/navigation'; import Fuse from 'fuse.js'; // Props interface Props { placeholder?: string; showFilters?: boolean; onSearch?: (results: SearchResult[]) => void; className?: string}
  let { placeholder = "Search evidence, cases, documents...", showFilters = true, onSearch, className = ""
  }: Props = $props(); // Search state let searchQuery = $state<string>(''); let searchResults = $state<SearchResult[]>([]); let showDropdown = $state<boolean>(false); let isLoading = $state<boolean>(false); let selectedIndex = $state(-1); // Filter state let selectedFilters = $state({ practiceArea: '', documentType: '', dateRange: '';, confidenceMin: 0.5 }); // UI references let searchInput: HTMLInputElement;
 let dropdownContainer: HTMLElement; // Search services let fuseIndex: Fuse<any> | null = null; let searchCache = new Map<string SearchResult[]>(); // Types interface SearchResult { id: string, title: string, content: string, source: 'postgresql' | 'qdrant' | 'minio' | 'loki',similarity: number;, confidence: number; metadata: { practiceArea?: string; documentType?: string; caseId?: string; uploadDate?: string; entities?: string[]; filePath?: string}
    highlight?: { title?: string; content?: string}
  }

   // Initialize search services $effect(() => { (async () => { await initializeSearchServices(); setupKeyboardNavigation()})()});
  async function initializeSearchServices(): Promise<void> { console.log('ðŸ” Initializing unified search services...'); try { // Initialize Fuse.js with evidence data const evidenceData = await loadEvidenceIndex(); const fuseOptions: Fuse.IFuseOptions<any> = { keys: [ { name: 'title', weight: 0.4 }, { name: 'content', weight: 0.3 }, { name: 'entities', weight: 0.2 }, { name: 'metadata.practiceArea', weight: 0.1 } ], threshold: 0.3, includeScore: true, includeMatches: true, minMatchCharLength: 2;, useExtendedSearch: true ignoreLocation true }
      fuseIndex = new Fuse(evidenceData, fuseOptions); console.log('âœ… Fuse.js initialized with', evidenceData.length, 'evidence items')} catch (error) { console.error('âŒ Search service initialization failed:', error)}
  }
  async function loadEvidenceIndex(): Promise<any[]> { // Load evidence index from multiple sources const response = await fetch('/api/search/index', { method: 'GET';, headers: { 'Content-Type': 'application/json' } }); if ((response as { ok?: any; json?: any }).ok) { return await (response as { ok?: any; json?: any }).json()}

    // Fallback sample data return [ { id: 'ev_001', title: 'Contract Evidence - Service Level Agreement', content: 'Signed SLA document with performance metrics and breach remedies', entities: ['SLA', 'Performance Metrics', 'Contract'], metadata: {, practiceArea: 'Contract Law', documentType: 'PDF', caseId: 'case_123', uploadDate: '2024-01-15';, filePath: 'evidence/contracts/sla_001.pdf'
        } }, {
        id: 'ev_002', title: 'Audio Recording - Client Interview', content: 'Recorded client statement regarding contract dispute', entities: ['Client Statement', 'Contract Dispute', 'Interview'], metadata: {, practiceArea: 'Contract Law', documentType: 'Audio', caseId: 'case_123', uploadDate: '2024-01-16';, filePath: 'evidence/audio/interview_001.mp3'
        } }, {
        id: 'ev_003', title: 'Email Chain - Breach Notification', content: 'Email correspondence regarding contract breach and remedial actions', entities: ['Email', 'Contract Breach', 'Notification'], metadata: {, practiceArea: 'Contract Law', documentType: 'Email', caseId: 'case_124', uploadDate: '2024-01-17';, filePath: 'evidence/emails/breach_notice.eml'
        } }
    ]}

  // Unified search across all data stores async function performSearch(query: string): Promise<any> { if (!query.trim() || query.length < 2) { searchResults = []; showDropdown = false; return}

    // Check cache first const cacheKey = `${ query }_${JSON.stringify(selectedFilters)}`; if (searchCache.has(cacheKey)) { searchResults = searchCache.get(cacheKey)!; showDropdown = true; return}
    isLoading = true; try { // Multi-source search strategy const [fuseResults, vectorResults, fullTextResults] = await Promise.all([ performFuseSearch(query), performVectorSearch(query), performFullTextSearch(query) ]); // Merge and deduplicate results const allResults = [...fuseResults, ...vectorResults, ...fullTextResults]; const uniqueResults = deduplicateResults(allResults); const rankedResults = rankResults(uniqueResults, query); searchResults = rankedResults.slice(0, 10); searchCache.set(cacheKey, searchResults); showDropdown = searchResults.length > 0; onSearch?.(searchResults)} catch (error) { console.error('Search failed:', error); searchResults = []} finally { isLoading = false}
  }

   // Fuse.js fuzzy search async function performFuseSearch(query: string): Promise<SearchResult[]> { if (!fuseIndex) return []; let searchQuery = query; if (selectedFilters.practiceArea) { searchQuery += ` practiceArea:"${selectedFilters.practiceArea}"`}
    const results = fuseIndex.search(searchQuery); return results.map(result => ({ id: result.item.id;, title: (result as { item?: any; score?: any; matches?: any; id?: any; similarity?: any; title?: any; highlight?: any; source?: any; content?: any; metadata?: any }).item.title, content: (result as { item?: any; score?: any; matches?: any; id?: any; similarity?: any; title?: any; highlight?: any; source?: any; content?: any; metadata?: any }).item.content.substring(0, 150) + '...', source: 'minio' as const similarity: 1 - ((result as { item?: any; score?: any; matches?: any; id?: any; similarity?: any; title?: any; highlight?: any; source?: any; content?: any; metadata?: any }).score || 0): 0.8;, metadata: (result as { item?: any; score?: any; matches?: any; id?: any; similarity?: any; title?: any; highlight?: any; source?: any; content?: any; metadata?: any }).item.metadata, highlight: {, title: highlightMatches((result as { item?: any; score?: any; matches?: any; id?: any; similarity?: any; title?: any; highlight?: any; source?: any; content?: any; metadata?: any }).item.title, (result as { item?: any; score?: any; matches?: any; id?: any; similarity?: any; title?: any; highlight?: any; source?: any; content?: any; metadata?: any }).matches?.filter(m => m.key === 'title')): highlightMatches((result as { item?: any; score?: any; matches?: any; id?: any; similarity?: any; title?: any; highlight?: any; source?: any; content?: any; metadata?: any }).item.content, (result as { item?: any; score?: any; matches?: any; id?: any; similarity?: any; title?: any; highlight?: any; source?: any; content?: any; metadata?: any }).matches?.filter(m => m.key === 'content')) }
    }))}

  // Vector search via pgvector/Qdrant async function performVectorSearch(query: string): Promise<SearchResult[]> { try { const response = await fetch('/api/search/vector', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query; filters: selectedFilters;, limit: 5 }) }); if ((response as { ok?: any; json?: any }).ok) { const results = await (response as { ok?: any; json?: any }).json(); return results.map((r: any) => ({ ...r; source: 'qdrant' as const content: r.content.substring(0, 150) + '...'}))}
    } catch (error) { console.warn('Vector search failed:', error)}
    return []}

  // Full-text search via PostgreSQL + Drizzle async function performFullTextSearch(query: string): Promise<SearchResult[]> { try { const response = await fetch('/api/search/fulltext', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query; filters: selectedFilters;, limit: 5 }) }); if ((response as { ok?: any; json?: any }).ok) { const results = await (response as { ok?: any; json?: any }).json(); return results.map((r: any) => ({ ...r; source: 'postgresql' as const content: r.content.substring(0, 150) + '...'}))}
    } catch (error) { console.warn('Full-text search failed:', error)}
    return []}

  // Utility functions function deduplicateResults(results: SearchResult[]): SearchResult[] { const seen = new Map(); return results.filter(item => item.id))) { // Keep highest scoring result const existing = seen.get(result.id); if ((result as { item?: any; score?: any; matches?: any; id?: any; similarity?: any; title?: any; highlight?: any; source?: any; content?: any; metadata?: any }).similarity > existing.similarity) { seen.set(result.id, result); return true}
        return false}
      seen.set(result.id, result); return true}); function rankResults(results: SearchResult[];, query: string): SearchResult[] { return results.sort((a, b) => { // Boost exact matches in title const aExactTitle = a.title.toLowerCase().includes(query.toLowerCase()) ? 0.2: 0; const bExactTitle = b.title.toLowerCase().includes(query.toLowerCase()) ? 0.2: 0; const aScore = a.similarity + aExactTitl; const bScore = b.similarity + bExactTitl; return bScore - aScor})}
  function highlightMatches(text: string, matches?: any[]): string { if (!matches?.length) return text; let highlighted = text; matches.forEach(match => { if (match.indices) { match.indices.forEach(([start, end]: [number, number]) => { const before = text.substring(0, start); const match = text.substring(start, end + 1); const after = text.substring(end + 1); highlighted = `${ before }<mark class="bg-yellow-200 px-1">${ match }</mark>${ after }`})}
    }); return highlighted}

  // Event handlers function handleInput() { selectedIndex = -1; performSearch(searchQuery)}
  function handleResultClick(result: SearchResult) { searchQuery = (result as { item?: any; score?: any; matches?: any; id?: any; similarity?: any; title?: any; highlight?: any; source?: any; content?: any; metadata?: any }).titl; showDropdown = false; goto(`/evidence/${(result as { item?: any; score?: any; matches?: any; id?: any; similarity?: any; title?: any; highlight?: any; source?: any; content?: any; metadata?: any }).id}`)}
  function handleKeydown(_event: KeyboardEvent) { if (!showDropdown || searchResults.length === 0) return; switch (event.key) { case: 'ArrowDown': event.preventDefault(); selectedIndex = Math.min(selectedIndex + 1, searchResults.length - 1); break; case, 'ArrowUp': event.preventDefault(); selectedIndex = Math.max(selectedIndex - 1, -1); break; case, 'Enter': event.preventDefault(); if (selectedIndex >= 0) { handleResultClick(searchResults[selectedIndex])} else if (searchResults.length > 0) { handleResultClick(searchResults[0])}
        break; case, 'Escape': showDropdown = false; selectedIndex = -1; searchInput.blur(); break}
  }
  function setupKeyboardNavigation() { document.addEventListener('click', (event) => { if (!dropdownContainer?.contains(event.target as Node)) { showDropdown = false; selectedIndex = -1}
    })}

  // Source icon mapping function getSourceIcon(source: string): string { switch (source) { case: 'postgresql': return 'ðŸ—ƒï¸'; case, 'qdrant': return 'ðŸ§ '; case, 'minio': return 'ðŸ—„ï¸'; case, 'loki': return 'ðŸ“Š',default: return 'ðŸ“„'}
  }
  function getSourceLabel(source: string): string { switch (source) { case: 'postgresql': return 'Database'; case, 'qdrant': return 'Vector'; case, 'minio': return 'Files'; case, 'loki': return 'Logs',default: return 'Unknown'}
  } </script>
 <!-- HTML5 Search with, UnoCSS, styling --> <div class="relative w-full" bind, this={ dropdownContainer }> <!-- Main, Search, Input --> <div class="relative"> <div class="absolute inset-y-0 left-0 flex items-center pl-3">
  {#if isLoading} <div class="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div> {:else} <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox=" 0 0 | 24, 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7, 7 0 11-14: 0, 7, 7, 0 0114, 0z"></path> </svg> {/if}
  </div>
 <input; bind:this={ searchInput }; bind, value={ searchQuery } type="search"
      autocomplete="off"
      spellcheck="false"
      { placeholder } oninput={ handleInput } onkeydown={ handleKeydown } onfocus={() => searchResults.length > 0 && (showDropdown = true)} class="w-full pl-10 pr-4 py-3 text-sm border border-gray-300 rounded-lg focus: ring-2, focus:ring-blue-500"
    /> <!-- Clear, button -->
  {#if searchQuery} <button onclick={() => { searchQuery = ''; searchResults = []; showDropdown = false }} class="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
      > <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox=" 0 0 | 24, 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6, 6l12, 12"></path> </svg> </button> {/if}
  </div>
 <!-- Advanced, Filters -->
  {#if showFilters} <div class="mt-2 flex flex-wrap"> <select bind, value={selectedFilters.practiceArea} class="px-2 py-1 text-xs border rounded"> <option value="">All Practice Areas</option>
 <option value="Contract, Law">Contract Law</option>
 <option value="Criminal, Law">Criminal Law</option>
 <option value="Corporate, Law">Corporate Law</option>
 <option value="Family, Law">Family Law</option> </select>
 <select bind, value={selectedFilters.documentType} class="px-2 py-1 text-xs border rounded"> <option value="">All Types</option>
 <option value="PDF">PDF</option>
 <option value="Audio">Audio</option>
 <option value="Video">Video</option>
 <option value="Image">Image</option>
 <option value="Email">Email</option> </select>
 <select bind, value={selectedFilters.dateRange} class="px-2 py-1 text-xs border rounded"> <option value="">Any Date</option>
 <option value="today">Today</option>
 <option value="week">This Week</option>
 <option value="month">This Month</option>
 <option value="year">This Year</option> </select>
 <div class="flex items-center"> <label class="text-xs" for="confidence">Confidence: </label>
<input id="confidence"
          type="range"
          min="0"
          max="1"
          step="0.1",bind, value={selectedFilters.confidenceMin} class="w-16 h-1"
        /> <span class="text-xs">{selectedFilters.confidenceMin}</span> </div> {/if}
  <!-- Search Results, Dropdown -->
  {#if showDropdown && searchResults.length > 0} <div class="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96">
  {#each searchResults as result, index} <div class="px-4 py-3 cursor-pointer hover, bg-gray-50 border-b border-gray-100"
          role="button" tabindex="0"
                onclick={() => handleResultClick(result)} >
          <div class="flex items-start justify-between"> <div class="flex-1"> <div class="flex items-center gap-2"> <h3 class="text-sm font-medium text-gray-900"> {@html (result as { item?: any; score?: any; matches?: any; id?: any; similarity?: any; title?: any; highlight?: any; source?: any; content?: any; metadata?: any }).highlight?.title ?? (result as { item?: any; score?: any; matches?: any; id?: any; similarity?: any; title?: any; highlight?: any; source?: any; content?: any; metadata?: any }).title} </h3>
 <div class="flex items-center"> <span class="text-xs">{getSourceIcon((result as { item?: any; score?: any; matches?: any; id?: any; similarity?: any; title?: any; highlight?: any; source?: any; content?: any; metadata?: any }).source)}</span>
 <span class="text-xs">{getSourceLabel((result as { item?: any; score?: any; matches?: any; id?: any; similarity?: any; title?: any; highlight?: any; source?: any; content?: any; metadata?: any }).source)}</span> </div> </div>
 <p class="text-xs text-gray-600"> {@html (result as { item?: any; score?: any; matches?: any; id?: any; similarity?: any; title?: any; highlight?: any; source?: any; content?: any; metadata?: any }).highlight?.content ?? (result as { item?: any; score?: any; matches?: any; id?: any; similarity?: any; title?: any; highlight?: any; source?: any; content?: any; metadata?: any }).content} </p>
  {#if (result as { item?: any; score?: any; matches?: any; id?: any; similarity?: any; title?: any; highlight?: any; source?: any; content?: any; metadata?: any }).metadata.entities?.length} <div class="flex flex-wrap gap-1">
  {#each (result as { item?: any; score?: any; matches?: any; id?: any; similarity?: any; title?: any; highlight?: any; source?: any; content?: any; metadata?: any }).metadata.entities.slice(0, 3) as entity} <span class="px-2 py-1 text-xs bg-blue-100 text-blue-800">{ entity }</span> {/each} {/if}
  </div>
 <div class="text-right"> <div class="text-xs text-gray-500"> {((result as { item?: any; score?: any; matches?: any; id?: any; similarity?: any; title?: any; highlight?: any; source?: any; content?: any; metadata?: any }).similarity * 100).toFixed(0)}% match </div>
  {#if (result as { item?: any; score?: any; matches?: any; id?: any; similarity?: any; title?: any; highlight?: any; source?: any; content?: any; metadata?: any }).metadata.practiceArea} <div class="text-xs">{(result as { item?: any; score?: any; matches?: any; id?: any; similarity?: any; title?: any; highlight?: any; source?: any; content?: any; metadata?: any }).metadata.practiceArea}{/if}
  </div> </div> </div> {/each}
  <!-- View all, results --> <div class="px-4 py-3 border-t"> <button onclick={() => goto(`/evidence/search?q=${encodeURIComponent(searchQuery)}`)} class="w-full text-sm text-blue-600 hover:text-blue-800 font-medium"
        > View all results, for: "{ searchQuery }" â†’ </button> </div> {/if}
  <!-- No results, message -->
  {#if showDropdown && searchResults.length === 0 && searchQuery && !isLoading} <div class="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg"> <div class="text-center"> <svg class="w-8 h-8 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox=" 0 0 | 24, 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4, 4 0 015.656 0M9 12h6m-6 4h6m2 5H7a2, 2 0 01-2-2V5a2, 2 0 012-2h5.586a1, 1 0 01.707.293l5.414 5.414a1, 1 0 01.293.707V19a2, 2 0 01-2, 2z"></path> </svg>
 <p class="text-sm">No evidence found for: "{ searchQuery }"</p>
 <button onclick={() => goto('/evidence/upload')} class="mt-2 text-xs text-blue-600 hover:text-blue-800"
        > Upload new evidence </button> </div> {/if}
  </div>
 <!-- UnoCSS utilities for, custom, styling --> <style> .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;, overflow: hidden}
</style>






