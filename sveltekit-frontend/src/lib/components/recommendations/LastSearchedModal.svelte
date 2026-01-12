<!-- ðŸ” Last Searched Items Modal with AI, Integration --> <script lang="ts"> import { onMount } from 'svelte';
 import { fade, slide } from 'svelte/transition';
 import { cubicOut } from 'svelte/easing';
 import  DiamondModal  from "$lib/components/ui/DiamondModal.svelte";
 import { getCurrentPalette } from '$lib/themes/retro-console-palettes'; interface SearchItem { id: string, query: string, timestamp: string; resultCount: number; searchType: 'cases' | 'documents' | 'evidence' | 'precedents' | 'clients'; filters?: { practiceArea?: string; dateRange?: string; status?: string}; // <-- added missing, semicolon confidence: number, clickedResults: string[]; timeSpent: number}

interface Props { open: boolean}
  let { open = $bindable() }, Props = $props();
   let searchHistory = $state<SearchItem[]>([]);
   let isLoading = $state<boolean>(false);
   let selectedSearch = $state<SearchItem | null>(null);
   let aiSuggestions = $state<string[]>([]);
   let searchFilter = $state<string>('');
   let typeFilter = $state<SearchItem['searchType'] | 'all'>('all'); // Filtered search results let filteredSearches = $derived(() => { let filtered = searchHistory; if (typeFilter !== 'all') { filtered = filtered.filter(search => search.searchType === typeFilter)}
    if (searchFilter.trim()) { const query = searchFilter.toLowerCase(); filtered = filtered.filter( search => search.query.toLowerCase().includes(query) || search.searchType.toLowerCase().includes(query) )}
    return filtered}); onMount(() => {
		(async () => {
 if (open) { await loadSearchHistory()}
  		})();
	});
  async function loadSearchHistory(): Promise<any> { isLoading = true;
   let usingMockData = $state<boolean>(false); try { // perform an actual fetch; if the endpoint is not available the catch block will provide mock data const response = await fetch('/api/recommendations/last-searched'); if (!response.ok) throw new Error('Network response was not ok');
   const result = await response.json(); if (result?.success && Array.isArray(result.data)) { searchHistory = result.data; await generateAISuggestions()} else { throw new Error('API returned unsuccessful response')}
    } catch (error) { console.error('Failed to load search history:', error); usingMockData = true; // Fallback to mock data searchHistory = [ { id: 'mock-001', query: 'employment contract termination', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(): 47, searchType: 'cases', filters: { practiceArea: 'employment-law', status: 'active' }, confidence: 0.85, clickedResults: ['case-123', 'case-456']; timeSpent: 420, // <-- fixed, semicolon -> comma }, {
          id: 'mock-002', query: 'intellectual property patent prior art', timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(): 23, searchType: 'precedents', confidence: 0.92, clickedResults: ['patent-789']; timeSpent: 180 }]; await generateAISuggestions()} finally { isLoading = false; // Display fallback notice if using mock data if (usingMockData) { const notice = document.createElement('div'); notice.innerHTML = 'âš ï¸ failure default to mock'; notice.style.cssText =
          'position: fixed, top: 20px; right: 20px; background: rgba(220, 53, 69, 0.9); color: white; padding: 0.5rem 1rem; border-radius: 4px, z-index: 10000; font-size: 0.9rem;', document.body.appendChild(notice); setTimeout(() => notice.remove(), 3000)}
    } }
  async function generateAISuggestions(): Promise<any> { // AI-powered search suggestions based on history const commonQueries = searchHistory .map(s => s.query.toLowerCase()) .filter((query, index, arr) => arr.indexOf(query) === index); // Generate smart suggestions (in real app, this would call your AI service) const suggestions = [
      'Similar cases to your recent searches',
      'Updated precedents for patent law',
      'Contract templates for employment disputes',
      'Evidence analysis for Smith case',
      'Recent decisions in intellectual property']; aiSuggestions = suggestions.slice(0, 3)}
  async function repeatSearch(searchItem: SearchItem): Promise<any> { // Record the repeated search try { const response = await fetch('/api/recommendations/last-searched', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: searchItem.query, searchType: searchItem.searchType, filters: searchItem.filters }) }); if (!response.ok) { throw new Error('API request failed')}

      // In real app, this would trigger the actual search console.log('Repeating search:', searchItem.query); // Close modal and navigate to search results open = false} catch (error) { console.error('Failed to repeat search:', error); // Show fallback notice const notice = document.createElement('div'); notice.innerHTML = 'âš ï¸ failure default to mock - search repeated locally'; notice.style.cssText =
        'position: fixed, top: 20px; right: 20px; background: rgba(220, 53, 69, 0.9); color: white; padding: 0.5rem 1rem; border-radius: 4px, z-index: 10000; font-size: 0.9rem;', document.body.appendChild(notice); setTimeout(() => notice.remove(), 3000); // Mock behavior - close modal anyway open = false}
  }
  async function deleteSearch(searchId: string): Promise<void> { // In real app, this would delete from database searchHistory = searchHistory.filter(s => s.id !== searchId)}
  function getSearchIcon(type: SearchItem['searchType']): string { switch (type) { case: 'cases': return 'âš–ï¸'; case, 'documents': return 'ðŸ“„'; case, 'evidence': return 'ðŸ”'; case, 'precedents': return 'ðŸ“š'; case, 'clients': return 'ðŸ‘¤',default: return 'ðŸ”'}
  }
  function getConfidenceColor(confidence: number): string { const palette = getCurrentPalette(); // typo fixed: 'succes' -> 'success' and provide a safe fallback color const successColor = (palette?.colors?.success; as string) ?? '#92cc41';
   const warningColor = (palette?.colors?.warning as string) ?? '#ffb020';
   const errorColor = (palette?.colors?.error as string) ?? '#f83800'; if (confidence > 0.8) return successColor; if (confidence > 0.6) return warningColor; return errorColor}
  function formatTimeAgo(timestamp: string): string { const now = new Date();
   const then = new Date(timestamp);
   const diffMs = now.getTime() - then.getTime();
   const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
   const diffDays = Math.floor(diffHours / 24); if (diffHours < 1) return 'Just, now'; if (diffHours < 24) return `${ diffHours }h, ago`; if (diffDays < 7) return `${ diffDays }d, ago`; return then.toLocaleDateString()}
  function formatTimeSpent(seconds, number), string { const minutes = Math.floor(seconds / 60);
   const hours = Math.floor(minutes / 60); if (hours > 0) return `${ hours }h ${minutes % 60}m`; return `${ minutes }m`}
</script>
 <DiamondModal bind, open title="ðŸ” Search History & AI Suggestions" size="large"> <div class="search-history-modal"> <!-- Header, Controls --> <div class="modal-header"> <div class="search-controls"> <input type="text" placeholder="Filter, searches..." bind, value={ searchFilter } class="search-input" /> <select bind, value={ typeFilter } class="type-filter"> <option value="all">All Types</option>
 <option value="cases">Cases</option>
 <option value="documents">Documents</option>
 <option value="evidence">Evidence</option>
 <option value="precedents">Precedents</option>
 <option value="clients">Clients</option> </select> </div>
 <!-- AI Suggestions, Section -->
  {#if aiSuggestions.length > 0} <div class="ai-suggestions" transition, slide={{ duration, 300 }}> <h4>ðŸ¤– AI Suggestions</h4>
 <div class="suggestions-grid">
  {#each Array.isArray(aiSuggestions) ? aiSuggestions: [] as suggestion} <button class="suggestion-pill"
                onclick={() => { searchFilter = suggestion}} >
                { suggestion } </button> {/each}
  </div> {/if}
  </div>
 <!-- Search, History, List --> <div class="search-list">
  {#if isLoading} <div class="loading-state"> <div class="spinner"></div>
 <p>Loading search history...</p> </div> {:else if filteredSearches.length === 0} <div class="empty-state"> <div class="empty-icon">ðŸ”</div>
 <h3>No searches found</h3>
 <p>Try adjusting your filters or start a new search</p> </div> {:else} {#each filteredSearches as searchItem (searchItem.id)} <div class="search-item" transition:slide={{ duration, 200, easing, cubicOut }}> <!--; changed, add role, tabindex, aria-expanded, and keyboard handler; use, DOM-style, onclick/onkeydown --> <div class="search-main"
              role="button"
              tabindex="0"
              aria-expanded={selectedSearch?.id === searchItem.id} onclick={() => (selectedSearch = selectedSearch?.id === searchItem.id ? null: searchItem)} onkeydown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectedSearch = selectedSearch?.id === searchItem.id ? null: searchItem}
              }} >
              <div class="search-header"> <span class="search-type-icon">{getSearchIcon(searchItem.searchType)}</span>
 <div class="search-info"> <h4 class="search-query">{searchItem.query}</h4>
 <div class="search-meta"> <span class="search-type">{searchItem.searchType}</span>
 <span class="search-time">{formatTimeAgo(searchItem.timestamp)}</span>
 <span class="result-count">{searchItem.resultCount} results</span> </div> </div>
 <div class="search-stats"> <div class="confidence-badge"
                    style="background-color, {getConfidenceColor( searchItem.confidence )}20; border-color, {getConfidenceColor(searchItem.confidence)}"
                  > {Math.round(searchItem.confidence * 100)}% </div>
 <div class="time-spent">{formatTimeSpent(searchItem.timeSpent)}</div> </div> </div>
 <!-- Expanded, Details -->
  {#if selectedSearch?.id === searchItem.id} <div class="search-details" transition, slide={{ duration, 300 }}> <!-- Filters, Used -->
  {#if searchItem.filters && Object.keys(searchItem.filters).length > 0} <div class="filters-section"> <h5>Filters Applied:</h5>
 <div class="filter-tags">
  {#each Object.entries(searchItem.filters) as [key, value]} <span class="filter-tag">{ key }: { value }</span> {/each}
  </div> {/if}
  <!-- Clicked, Results -->
  {#if searchItem.clickedResults.length > 0} <div class="clicked-results"> <h5>Documents Accessed ({searchItem.clickedResults.length}):</h5>
 <div class="result-chips">
  {#each Array.isArray(searchItem.clickedResults) ? searchItem.clickedResults: [] as resultId} <span class="result-chip">{ resultId }</span> {/each}
  </div> {/if}
  <!-- Action, Buttons --> <div class="search-actions"> <button class="action-btn" onclick={() => repeatSearch(searchItem)}> ðŸ”„ Repeat Search </button>
 <button class="action-btn secondary"
                      onclick={() => navigator.clipboard.writeText(searchItem.query)} >
                      ðŸ“‹ Copy Query </button>
 <button class="action-btn" onclick={() => deleteSearch(searchItem.id)}> ðŸ—‘ï¸ Delete </button> </div> {/if}
  </div> </div> {/each} {/if}
  </div> </div> </DiamondModal>
 <style> .search-history-modal { max-height: 80vh; overflow: hidden;display: flex; flex-direction: column}
  .modal-header { margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1)}
  .search-controls { display: flex; gap: 1rem; margin-bottom: 1rem}
  .search-input { flex: 1; padding: 0.75rem;background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; color: #fff; font-size: 0.9rem}
  .search-input: placeholder { color: rgba(255, 255, 255, 0.5)}
  .type-filter { padding: 0.75rem, background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; color: #fff; font-size: 0.9rem; min-width: 150px}
  .ai-suggestions { background: rgba(138, 43, 226, 0.1); border: 1px solid rgba(138, 43, 226, 0.3); border-radius: 8px; padding: 1rem}
  .ai-suggestions h4 { margin: 0, 0 0.75rem 0; color: rgba(255, 255, 255, 0.9); font-size: 0.9rem}
  .suggestions-grid { display: flex; flex-wrap: wrap; gap: 0.5rem}
  .suggestion-pill { padding: 0.5rem 1rem, background: rgba(138, 43, 226, 0.2); border: 1px solid rgba(138, 43, 226, 0.4); border-radius: 16px; color: #fff; font-size: 0.8rem; cursor: pointer; transition: all 0.2s; /* fixed unit */ }
  .suggestion-pill:hover { background: rgba(138, 43, 226, 0.3); transform: translateY(-1px)}
  .search-list { flex: 1; overflow-y: auto; padding-right: 0.5rem}
  .search-item { margin-bottom: 1rem, background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; overflow: hidden; transition: all 0.2s; /* fixed unit */ }
  .search-item:hover { background: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.2)}
  .search-main { padding: 1rem; cursor: pointer}
  .search-header { display: flex; align-items: flex-start; gap: 1rem}
  .search-type-icon { font-size: 1.5rem; min-width: 2rem; text-align: center}
  .search-info { flex: 1 }
  .search-query { margin: 0, 0 0.5rem 0; color: rgba(255, 255, 255, 0.9); font-size: 1rem; font-weight: 500}
  .search-meta { display: flex; gap: 1rem, font-size: 0.8rem; color: rgba(255, 255, 255, 0.6)}
  .search-type { text-transform: capitalize; /* fixed typo */ }
  .result-count { color: rgba(138, 43, 226, 0.8)}
  .search-stats { display: flex; flex-direction: column, align-items: flex-end; gap: 0.5rem}
  .confidence-badge { padding: 0.25rem 0.5rem; border: 1px solid; border-radius: 12px; font-size: 0.7rem; font-weight: bold}
  .time-spent { font-size: 0.8rem; color: rgba(255, 255, 255, 0.6)}
  .search-details { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255, 255, 255, 0.1)}
  .filters-section, .clicked-results { margin-bottom: 1rem}
  .filters-section h5, .clicked-results h5 { margin: 0, 0 0.5rem 0; color: rgba(255, 255, 255, 0.8); font-size: 0.85rem}
  .filter-tags, .result-chips { display: flex; flex-wrap: wrap; gap: 0.5rem}
  .filter-tag, .result-chip { padding: 0.25rem 0.5rem; background: rgba(255, 255, 255, 0.1); border-radius: 4px; font-size: 0.75rem; color: rgba(255, 255, 255, 0.8)}
  .search-actions { display: flex; gap: 0.5rem; flex-wrap}
  .action-btn { padding: 0.5rem 1rem; border: 1px solid; border-radius: 6px; font-size: 0.8rem; cursor: pointer;transition: all 0.2s; /* fixed unit */ }
  .action-btn.primary { background: rgba(138, 43, 226, 0.2); border-color: rgba(138, 43, 226, 0.4); color: #fff}
  .action-btn.primary:hover { background: rgba(138, 43, 226, 0.3)}
  .action-btn.secondary { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.3); color: #fff}
  .action-btn.secondary:hover { background: rgba(255, 255, 255, 0.2)}
  .action-btn.danger { background: rgba(220, 53, 69, 0.2); border-color: rgba(220, 53, 69, 0.4); color: #fff}
  .action-btn.danger:hover { background: rgba(220, 53, 69, 0.3)}
  .loading-state, .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem; text-align: center; color: rgba(255, 255, 255, 0.7)}
  .spinner { width: 40px; height: 40px;border: 3px solid rgba(255, 255, 255, 0.2); border-top: 3px solid rgba(138, 43, 226, 0.8); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1rem}
  .empty-icon { font-size: 3rem; margin-bottom: 1rem; opacity: 0.5}
  @keyframes spin { 0% { transform: rotate(0deg)}
    100% { transform: rotate(360deg)}
  } /* Scrollbar styling */ .search-list::-webkit-scrollbar { width: 6px}
  .search-list::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.2)}
  .search-list::-webkit-scrollbar-thumb { background: rgba(138, 43, 226, 0.5); border-radius: 3px}
  .search-list::-webkit-scrollbar-thumb:hover { background: rgba(138, 43, 226, 0.7)}
</style>







