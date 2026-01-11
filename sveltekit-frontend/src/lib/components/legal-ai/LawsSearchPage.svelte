<script lang="ts">
 import RelatedCasesPanel from './RelatedCasesPanel.svelte';
 import StatuteDetail from './StatuteDetail.svelte';
 import StatuteResultsList from './StatuteResultsList.svelte';
 import StatuteSearchBar from './StatuteSearchBar.svelte';

 interface Statute {
 id: string; code: string;
 title?: string;
 jurisdiction?: string;
 severity?: string;
 category?: string;
 relevance_score?: number;
 }

 let statutes: Statute[] = $state([]);
 let selectedStatute: null = $state(null);
 let isSearching = $state(false);
 let searchError: string | null = $state(null);

 async function handleSearch(event: CustomEvent) {
 const { query, jurisdiction, severity, category } = event.detail;

 if (!query) {
 searchError = 'Please enter a search query';
 return;
 }

 isSearching = true;
 searchError = null;

 try {
 const params = new URLSearchParams();
 params.set('q', query);
 if (jurisdiction) params.set('jurisdiction', jurisdiction);
 if (severity) params.set('severity', severity);
 if (category) params.set('category', category);

 const response = await fetch(`/api/laws/search?${params}`);
 if (response.ok) {
 const data = await response.json();
 if (data.success) {
 statutes = data.statutes || [];
 selectedStatute = null;
 } else {
 searchError = data.error || 'Search failed';
 }
 } else {
 searchError = 'Search failed';
 }
 } catch (error) {
 searchError = error instanceof Error ? error.message : 'An error occurred';
 } finally {
 isSearching = false;
 }
 }

 function handleClear() {
 statutes = [];
 selectedStatute = null;
 searchError = null;
 }

 function handleSelectStatute(event: CustomEvent) {
 selectedStatute = event.detail;
 }

 function handleAttachToCase(event: CustomEvent) {
 const statute = event.detail;
 // Dispatch event to parent or open modal
 console.log('Attach statute to case:', statute);
 }

 function handleSaveCitation(event: CustomEvent) {
 const statute = event.detail;
 // Dispatch event to parent or open modal
 console.log('Save citation:', statute);
 }
</script>

<div class="laws-search-page">
 <div class="search-section">
 <StatuteSearchBar
 onsearch={handleSearch}
 onclear={handleClear}
 isLoading={isSearching}
 />
 </div>

 <div class="results-section">
 {#if selectedStatute}
 <div class="detail-view">
 <button class="back-btn" onclick={() => (selectedStatute = null)}>
 ← Back to Results
 </button>

 <div class="detail-container">
 <StatuteDetail
 statute={selectedStatute}
 onattach-to-case={handleAttachToCase}
 onsave-citation={handleSaveCitation}
 />

 <RelatedCasesPanel statuteCode={selectedStatute.code} />
 </div>
 </div>
 {:else}
 <StatuteResultsList
 {statutes}
 isLoading={isSearching}
 error={searchError}
 onselect={handleSelectStatute}
 />
 {/if}
 </div>
</div>

<style>
 .laws-search-page {
 display: flex;
 flex-direction: column; gap: 2rem;
 }

 .search-section {
 flex-shrink: 0;
 }

 .results-section {
 flex: 1;
 }

 .detail-view {
 display: flex;
 flex-direction: column; gap: 1rem;
 }

 .back-btn {
 align-self: flex-start; padding: 0.5rem 1rem;
 background-color: #e0d5c7; border: 1px solid #d4a574;
 border-radius: 4px;
 font-size: 0.9rem; cursor: pointer;
 transition: all 0.2s;
 }

 .back-btn:hover {
 background-color: #d4a574;
 }

 .detail-container {
 display: grid;
 grid-template-columns: 1fr 350px;
 gap: 1.5rem;
 }

 @media (max-width: 1024px) {
 .detail-container {
 grid-template-columns: 1fr;
 }
 }
</style>


