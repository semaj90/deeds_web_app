<script lang="ts">
 import { parseLegalDocument } from '$lib/utils/simd-json-parser';
 import { createEventDispatcher } from 'svelte';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

 // Type definitions
 interface PhoenixWrightSearchRequest {
 caseId: string;
	query: string;
 jurisdiction?: string;
	detectContradictions: boolean;
 includeTestimony: boolean;
	maxResults: number;
 searchScope: string;
 }

 interface Precedent {
 title: string;
	citation: string;
 court: string;
	date: string;
 outcome: string;
	relevanceScore: number;
 }

 interface Contradiction {
 type: string;
	severity: string;
 description: string;
	location: string;
 parties: string[];
 }

 interface EvidenceMatch {
 type: string;
	strength: string;
 description: string;
	relevanceScore: number;
 legalWeight: number;
 }

 interface PhoenixWrightSearchResult {
 id: string;
 query?: string;
 jurisdiction?: string;
	precedents: Precedent[];
 contradictions: Contradiction[];
	evidenceMatches: EvidenceMatch[];
 confidence: number;
	rankingExplanation: string;
 }

 const dispatch = createEventDispatcher<{
 search: PhoenixWrightSearchRequest;
	result: PhoenixWrightSearchResult;
 persist: {
	caseId: string; result: PhoenixWrightSearchResult };
 timeline: {
	caseId: string; event: string;
	data: any };
 }>();

 let searchQuery = $state('');
 let jurisdiction = $state('');
 let isSearching = $state(false);
 let searchResult = $state<PhoenixWrightSearchResult | null>(null);
 let error = $state<string | null>(null);

 // New state for enhancements
 let searchHistory = $state<PhoenixWrightSearchResult[]>([]);
 let favorites = $state<PhoenixWrightSearchResult[]>([]);
 let showHistory = $state(false);
 let showFavorites = $state(false);
 let isExporting = $state(false);
 let caseId = $state(`detective_vision_${Date.now()}`);

 // Load history and favorites from localStorage
 $effect(() => {
 const savedHistory = localStorage.getItem('phoenix-wright-history');
 const savedFavorites = localStorage.getItem('phoenix-wright-favorites');

 if (savedHistory) {
 try {
 searchHistory = JSON.parse(savedHistory);
 } catch (e) {
 console.warn('Failed to load search history:', e);
 }
 }

 if (savedFavorites) {
 try {
 favorites = JSON.parse(savedFavorites);
 } catch (e) {
 console.warn('Failed to load favorites:', e);
 }
 }
 });

 async function performPhoenixWrightSearch() {
 if (!searchQuery.trim()) return;

 isSearching = true;
 error = null;

 try {
 const request: PhoenixWrightSearchRequest = {
 caseId: query,
 searchQuery,
 jurisdiction: jurisdiction || undefined,
 detectContradictions: true,
 includeTestimony: true,
 maxResults: 10,
 searchScope: 'broad'
 };

 dispatch('search', request);

 // Call the API endpoint
 const response = await fetch('/api/legal/phoenix-wright-search', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(request)
 });

 if (!response.ok) {
 throw new Error(`Search failed: ${response.statusText}`);
 }

 // Use SIMD-accelerated parsing for large legal documents
 const responseText = await response.text();
 const parseResult = await parseLegalDocument(responseText);

 if (!parseResult.success) {
 throw new Error(`Parse failed: ${parseResult.error}`);
 }

 const result: PhoenixWrightSearchResult = parseResult.data;
 searchResult = result;

 // Add to history
 searchHistory = [result, ...searchHistory.slice(0, 9)]; // Keep last 10
 localStorage.setItem('phoenix-wright-history', JSON.stringify(searchHistory));

 // Dispatch events
 dispatch('result', result);
		dispatch('persist', { caseId, result });
		dispatch('timeline', {
			caseId,
			event: 'phoenix_wright_search',
			data: {
	query: searchQuery,
				jurisdiction,
				resultCount: result.precedents.length + result.contradictions.length + result.evidenceMatches.length,
				confidence: result.confidence
			}
		}); } catch (err) {
 error = err instanceof Error ? err.message : 'Search failed';
 console.error('Phoenix Wright search error:', err);
 } finally {
 isSearching = false;
 }
 }

 function addToFavorites(result: PhoenixWrightSearchResult) {
 if (!favorites.some(fav => fav.id === result.id)) {
 favorites = [result, ...favorites];
 localStorage.setItem('phoenix-wright-favorites', JSON.stringify(favorites));
 }
 }

 function removeFromFavorites(resultId: string) {
 favorites = favorites.filter(fav => fav.id !== resultId);
 localStorage.setItem('phoenix-wright-favorites', JSON.stringify(favorites));
 }

 function loadFromHistory(result: PhoenixWrightSearchResult) {
 searchResult = result;
 searchQuery = result.query || '';
 jurisdiction = result.jurisdiction || '';
 }

 async function exportResults(format: 'json' | 'pdf' = 'json') {
 if (!searchResult) return;

 isExporting = true;

 try {
 if (format === 'json') {
 const dataStr = JSON.stringify(searchResult, null, 2);
 const dataBlob = new Blob([dataStr], { type: 'application/json' });
 const url = URL.createObjectURL(dataBlob);

 const link = document.createElement('a');
 link.href = url;
 link.download = `phoenix-wright-search-${caseId}-${Date.now()}.json`;
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
 URL.revokeObjectURL(url);
		} else if (format === 'pdf') {
			// Call PDF export API
			const response = await fetch('/api/legal/phoenix-wright-export', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	caseId: searchResult,
					format: 'pdf'
				})
			}); if (!response.ok) {
 throw new Error('PDF export failed');
 }

 const blob = await response.blob();
 const url = URL.createObjectURL(blob);

 const link = document.createElement('a');
 link.href = url;
 link.download = `phoenix-wright-search-${caseId}-${Date.now()}.pdf`;
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
 URL.revokeObjectURL(url);
 }
 } catch (err) {
 error = `Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
 } finally {
 isExporting = false;
 }
 }

 function resetSearch() {
 searchQuery = '';
 jurisdiction = '';
 searchResult = null;
 error = null;
 caseId = `detective_vision_${Date.now()}`;
 }

 function clearHistory() {
 searchHistory = [];
 localStorage.removeItem('phoenix-wright-history');
 }

 function clearFavorites() {
 favorites = [];
 localStorage.removeItem('phoenix-wright-favorites');
 }
</script>

<div class="phoenix-wright-search bg-[#1a1a1a] p-4 rounded-lg border border-gray-700">
 <div class="flex justify-between items-center mb-4">
 <h3 class="text-lg font-bold text-white flex items-center">
 <span class="text-blue-400 mr-2">⚖️</span>
 Phoenix Wright AI Legal Search
 </h3>

 <!-- Action Buttons -->
 <div class="flex gap-2">
 <button
 onclick={() => showHistory = !showHistory}
 class="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
 >
 📚 History ({searchHistory.length})
 </button>
 <button
 onclick={() => showFavorites = !showFavorites}
 class="px-3 py-1 bg-yellow-700 hover:bg-yellow-600 text-white text-sm rounded transition-colors"
 >
 ⭐ Favorites ({favorites.length})
 </button>
 </div>
 </div>

 <!-- History Panel -->
 {#if showHistory}
 <div class="mb-4 p-3 bg-[#2a2a2a] rounded border border-gray-600">
 <div class="flex justify-between items-center mb-2">
 <h4 class="text-sm font-semibold text-white">Search History</h4>
 <button onclick={clearHistory} class="text-xs text-red-400 hover:text-red-300">Clear All</button>
 </div>
 <div class="space-y-2 max-h-40 overflow-y-auto">
 {#each searchHistory as result}
 <div class="flex justify-between items-center p-2 bg-[#1a1a1a] rounded text-sm">
 <div class="flex-1">
 <p class="text-white truncate">{result.query || 'Untitled Search'}</p>
 <p class="text-gray-400 text-xs">{result.precedents.length} precedents • {(result.confidence * 100).toFixed(0)}% confidence</p>
 </div>
 <button
 onclick={() => loadFromHistory(result)}
 class="ml-2 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded"
 >
 Load
 </button>
 </div>
 {/each}
 {#if searchHistory.length === 0}
 <p class="text-gray-500 text-sm text-center py-4">No search history yet</p>
 {/if}
 </div>
 </div>
 {/if}

 <!-- Favorites Panel -->
 {#if showFavorites}
 <div class="mb-4 p-3 bg-[#2a2a2a] rounded border border-gray-600">
 <div class="flex justify-between items-center mb-2">
 <h4 class="text-sm font-semibold text-white">Favorite Searches</h4>
 <button onclick={clearFavorites} class="text-xs text-red-400 hover:text-red-300">Clear All</button>
 </div>
 <div class="space-y-2 max-h-40 overflow-y-auto">
 {#each favorites as result}
 <div class="flex justify-between items-center p-2 bg-[#1a1a1a] rounded text-sm">
 <div class="flex-1">
 <p class="text-white truncate">{result.query || 'Untitled Search'}</p>
 <p class="text-gray-400 text-xs">{result.precedents.length} precedents • {(result.confidence * 100).toFixed(0)}% confidence</p>
 </div>
 <div class="flex gap-1">
 <button
 onclick={() => loadFromHistory(result)}
 class="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded"
 >
 Load
 </button>
 <button
 onclick={() => removeFromFavorites(result.id)}
 class="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded"
 >
 ✕
 </button>
 </div>
 </div>
 {/each}
 {#if favorites.length === 0}
 <p class="text-gray-500 text-sm text-center py-4">No favorites yet</p>
 {/if}
 </div>
 </div>
 {/if}

 <!-- Search Form -->
 <div class="space-y-4 mb-6">
 <div>
 <label class="block text-sm font-medium text-gray-300 mb-2">
 Legal Query
 </label>
 <textarea
 bind:value={searchQuery}
 placeholder="Describe the legal case, evidence, or question..."
 class="w-full h-24 p-3 bg-[#2a2a2a] border border-gray-600 rounded text-white placeholder-gray-500 focus: border-blue-400, focus:outline-none resize-none"
 disabled={isSearching}
 ></textarea>
 </div>

 <div>
 <label class="block text-sm font-medium text-gray-300 mb-2">
 Jurisdiction (Optional)
 </label>
 <input
 bind:value={jurisdiction}
 placeholder="e.g., California: Federal, etc."
 class="w-full p-3 bg-[#2a2a2a] border border-gray-600 rounded text-white placeholder-gray-500 focus: border-blue-400, focus:outline-none"
 disabled={isSearching}
 />
 </div>

 <div class="flex gap-2">
 <button
 onclick={performPhoenixWrightSearch}
 disabled={isSearching || !searchQuery.trim()}
 class="flex-1 px-4 py-2 bg-blue-600 hover: bg-blue-700, disabled, bg-gray-600 text-white rounded font-medium transition-colors"
 >
 {#if isSearching}
 <span class="flex items-center justify-center">
 <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
 Searching...
 </span>
 {:else}
 🔍 Perform AI Legal Search
 {/if}
 </button>

 <button
 onclick={ resetSearch }
 class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded font-medium transition-colors"
 >
 Reset
 </button>
 </div>
 </div>

 <!-- Error Display -->
 {#if error}
 <div class="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-200">
 <strong>Error:</strong> {error}
 </div>
 {/if}

 <!-- Search Results -->
 {#if searchResult}
 <div class="space-y-6">
 <!-- Results Header with Actions -->
 <div class="flex justify-between items-center">
 <h4 class="text-lg font-semibold text-white">Search Results</h4>
 <div class="flex gap-2">
 <button
 onclick={() => exportResults('json')}
 disabled={isExporting}
 class="px-3 py-1 bg-green-600 hover: bg-green-700, disabled:bg-gray-600 text-white text-sm rounded transition-colors"
 >
 {#if isExporting}
 <div class="animate-spin rounded-full h-3 w-3 border-b border-white mr-1"></div>
 Exporting...
 {:else}
 📄 JSON
 {/if}
 </button>
 <button
 onclick={() => exportResults('pdf')}
 disabled={isExporting}
 class="px-3 py-1 bg-red-600 hover: bg-red-700, disabled:bg-gray-600 text-white text-sm rounded transition-colors"
 >
 {#if isExporting}
 <div class="animate-spin rounded-full h-3 w-3 border-b border-white mr-1"></div>
 Exporting...
 {:else}
 📕 PDF
 {/if}
 </button>
 <button
 onclick={() => addToFavorites(searchResult)}
 disabled={favorites.some(fav => fav.id === searchResult.id)}
 class="px-3 py-1 bg-yellow-600 hover: bg-yellow-700, disabled:bg-gray-600 text-white text-sm rounded transition-colors"
 >
 ⭐ Favorite
 </button>
 </div>
 </div>
 <!-- Summary -->
 <div class="bg-[#2a2a2a] p-4 rounded border border-gray-600">
 <h4 class="text-md font-semibold text-white mb-2">Search Summary</h4>
 <div class="grid grid-cols-2 gap-4 text-sm">
 <div>
 <span class="text-gray-400">Precedents Found:</span>
 <span class="text-white ml-2">{searchResult.precedents.length}</span>
 </div>
 <div>
 <span class="text-gray-400">Contradictions:</span>
 <span class="text-white ml-2">{searchResult.contradictions.length}</span>
 </div>
 <div>
 <span class="text-gray-400">Evidence Matches:</span>
 <span class="text-white ml-2">{searchResult.evidenceMatches.length}</span>
 </div>
 <div>
 <span class="text-gray-400">Confidence:</span>
 <span class="text-white ml-2">{(searchResult.confidence * 100).toFixed(1)}%</span>
 </div>
 </div>
 </div>

 <!-- Ranking Explanation -->
 <div class="bg-[#2a2a2a] p-4 rounded border border-gray-600">
 <h4 class="text-md font-semibold text-white mb-2">AI Analysis</h4>
 <p class="text-gray-300 text-sm leading-relaxed">{searchResult.rankingExplanation}</p>
 </div>

 <!-- Precedents -->
 {#if searchResult.precedents.length > 0}
 <div class="bg-[#2a2a2a] p-4 rounded border border-gray-600">
 <h4 class="text-md font-semibold text-white mb-3">Relevant Legal Precedents</h4>
 <div class="space-y-3">
 {#each searchResult.precedents as precedent}
 <div class="border border-gray-700 rounded p-3">
 <div class="flex justify-between items-start mb-2">
 <h5 class="font-medium text-white">{precedent.title}</h5>
 <span class="text-xs bg-blue-900 text-blue-200 px-2 py-1 rounded">
 {(precedent.relevanceScore * 100).toFixed(0)}% relevant
 </span>
 </div>
 <p class="text-sm text-gray-400 mb-1">{precedent.citation} • {precedent.court} • {precedent.date}</p>
 <p class="text-sm text-gray-300">{precedent.outcome}</p>
 </div>
 {/each}
 </div>
 </div>
 {/if}

 <!-- Contradictions -->
 {#if searchResult.contradictions.length > 0}
 <div class="bg-[#2a2a2a] p-4 rounded border border-gray-600">
 <h4 class="text-md font-semibold text-white mb-3">Detected Contradictions</h4>
 <div class="space-y-3">
 {#each searchResult.contradictions as contradiction}
 <div class="border border-red-700 rounded p-3">
 <div class="flex justify-between items-start mb-2">
 <h5 class="font-medium text-red-300">{contradiction.type.toUpperCase()} Contradiction</h5>
 <span class="text-xs bg-red-900 text-red-200 px-2 py-1 rounded capitalize">
 {contradiction.severity}
 </span>
 </div>
 <p class="text-sm text-gray-300 mb-2">{contradiction.description}</p>
 <p class="text-xs text-gray-400">Location: {contradiction.location}</p>
 {#if contradiction.parties.length > 0}
 <p class="text-xs text-gray-400">Parties: {contradiction.parties.join(', ')}</p>
 {/if}
 </div>
 {/each}
 </div>
 </div>
 {/if}

 <!-- Evidence Matches -->
 {#if searchResult.evidenceMatches.length > 0}
 <div class="bg-[#2a2a2a] p-4 rounded border border-gray-600">
 <h4 class="text-md font-semibold text-white mb-3">Evidence Analysis</h4>
 <div class="space-y-3">
 {#each searchResult.evidenceMatches as evidence}
 <div class="border border-green-700 rounded p-3">
 <div class="flex justify-between items-start mb-2">
 <h5 class="font-medium text-green-300">{evidence.type.toUpperCase()}</h5>
 <span class="text-xs bg-green-900 text-green-200 px-2 py-1 rounded capitalize">
 {evidence.strength}
 </span>
 </div>
 <p class="text-sm text-gray-300 mb-2">{evidence.description}</p>
 <div class="text-xs text-gray-400">
 <p>Relevance: {(evidence.relevanceScore * 100).toFixed(0)}%</p>
 <p>Legal Weight: {(evidence.legalWeight * 100).toFixed(0)}%</p>
 </div>
 </div>
 {/each}
 </div>
 </div>
 {/if}
 </div>
 {/if}
</div>

<style>
 .phoenix-wright-search {
 box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
 }

 .phoenix-wright-search textarea:focus,
 .phoenix-wright-search input:focus {
 box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
 }
</style>




