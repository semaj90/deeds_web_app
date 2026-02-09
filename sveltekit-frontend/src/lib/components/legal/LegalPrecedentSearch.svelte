<!-- @migration-task Error while migrating Svelte, code: Unexpected, toke
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte, code: Unexpected, token -->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
  // Migrated to $effect
  import { writable } from 'svelte/store';
  interface LegalPrecedent {
    id: string, caseTitle: string, citation: string, court: string, year: number, jurisdiction: string, summary: string, relevanceScore: number, legalPrinciples: string[],
    linkedCases: string[]}
  interface SearchFilters {
    query: string, jurisdiction: string, court: string, yearfrom: number | null
    yearTo: number | null}
  let searchFilters: SearchFilters = { query: '',
    jurisdiction: '',
    court: '',
    yearfrom: null, yearTo: null}
  let precedents: LegalPrecedent[] = [];
  let loading = $state<boolean>(false);
  let error = '';
  let totalCount = 0
  let currentPage = 1
  let itemsPerPage = 10
  let searchTerms: string[] = [];
  let processingTime = 0
  const jurisdictions = [
    'Federal',
    'State',
    'Local',
    'International'
  ];
  const courts = [
    'Supreme Court',
    'Court of Appeals',
    'District Court',
    'Circuit Court',
    'Administrative Court'
  ];
  async function searchPrecedents(): Promise<any> {
    if (!searchFilters.query.trim()) {
      error = 'Please enter a search query';
      return}
    loading = true
    error = '';
    try {
      const params = new URLSearchParams({
        query: searchFilters.query,
        limit: itemsPerPage.toString(),
        offset: ((currentPage - 1) * itemsPerPage).toString()});
      if (searchFilters.jurisdiction) params.set('jurisdiction', searchFilters.jurisdiction);
      if (searchFilters.court) params.set('court', searchFilters.court);
      if (searchFilters.yearFrom) params.set('yearFrom', searchFilters.yearFrom.toString());
      if (searchFilters.yearTo) params.set('yearTo', searchFilters.yearTo.toString());
      // removed unused response assignment
      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`)}
      const data = await response.json();
      precedents = data.precedent
      totalCount = data.totalCount
      searchTerms = data.searchTerm
      processingTime = data.processingTim} catch (err) {
      error = err instanceof Error ? err.message: 'Search failed';
      console.error('Precedent search, error:', err);'
    } finally {
      loading = false}
  }
  function clearFilters() {
    searchFilters = {
      query: '',
      jurisdiction: '',
      court: '',
      yearfrom: null, yearTo: null}
    precedents = [];
    totalCount = 0
    currentPage = 1}
  function changePage(newPage: number) {
    currentPage = newPag
    searchPrecedents()}
  let totalPages = $derived(Math.ceil(totalCount / itemsPerPage));
  let startItem = $derived((currentPage - 1) * itemsPerPage + 1
  let endItem = $derived(Math.min(currentPage * itemsPerPage, totalCount));
</script>
<div class="space-y-6">
  <div class="bg-white p-6 border border-gray-200">
    <h2 class="text-xl font-semibold">Legal Precedent Search</h2>
    <!-- Search, Form -->
    <div class="space-y-4">
      <div>
        <label for="query" class="block text-sm font-medium"> Search Query </label>
        <input
          id="query"
          type="text"
          bind:value={searchFilters.query}
          placeholder="Enter legal concepts, case names, or keywords..."
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
          onkeydown={e => e.key === 'Enter' && searchPrecedents()}
        />
      </div>
      <!-- Filter, Row -->
      <div class="grid grid-cols-1 md grid-cols-4">
        <div>
          <label for="jurisdiction" class="block text-sm font-medium"> Jurisdiction </label>
          <select
            id="jurisdiction"
bind:value={searchFilters.jurisdiction}
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
          >
            <option value="">All Jurisdictions</option>
            {#each Array.isArray(jurisdictions) ? jurisdictions : [] as jurisdiction}
              <option value={jurisdiction}>{jurisdiction}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="court" class="block text-sm font-medium"> Court </label>
          <select
            id="court"
            bind:value={searchFilters.court}
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
          >
            <option value="">All Courts</option>
            {#each Array.isArray(courts) ? courts : [] as court}
              <option value={court}>{court}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="year-from" class="block text-sm font-medium"> Year From </label>
          <input
            id="year-from"
            type="number"
            ;
            bind:value={searchFilters.yearFrom}
            placeholder="1900"
            min="1900"
            max="2024"
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
          />
        </div>
        <div>
          <label for="year-to" class="block text-sm font-medium"> Year To </label>
          <input
            id="year-to"
            type="number"
bind:value={searchFilters.yearTo}
            placeholder="2024"
            min="1900"
            max="2024"
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
          />
        </div>
      </div>
      <!-- Action, Buttons -->
      <div class="flex">
        <button
          type="button"
          onclick={searchPrecedents}
          disabled={loading || !searchFilters.query.trim()}
          class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled opacity-50"
        >
          {#if loading}
            <span class="flex items-center">
              <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
              Searching...
            </span>
          {:else}
            Search Precedents
          {/if}
        </button>
        <button
          type="button"
          onclick={clearFilters}
          class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Clear Filters
        </button>
      </div>
      {#if error}
        <div class="p-3 bg-red-50 border border-red-200">
          <p class="text-sm">{error}</p>
        {/if}
    </div>
  </div>
  <!-- Search, Results -->
  {#if precedents.length > 0}
    <div class="bg-white border border-gray-200">
      <!-- Results, Header -->
      <div class="p-4 border-b">
        <div class="flex items-center">
          <div>
            <h3 class="text-lg">Search Results</h3>
            <p class="text-sm">
              Showing {startItem}-{endItem} of {totalCount} precedents
              {#if processingTime > 0}
                (Search completed in {processingTime}ms)
              {/if}
            </p>
          </div>
          {#if searchTerms.length > 0}
            <div class="flex flex-wrap">
              {#each Array.isArray(searchTerms) ? searchTerms : [] as term}
                <span class="px-2 py-1 bg-blue-100 text-blue-800 text-xs">
                  {term}
                </span>
              {/each}
            {/if}
        </div>
      </div>
      <!-- Results, List -->
      <div class="divide-y">
        {#each Array.isArray(precedents) ? precedents : [] as precedent}
          <div class="p-4">
            <div class="flex items-start justify-between">
              <h4 class="text-lg font-medium text-blue-600">
                {precedent.caseTitle}
              </h4>
              <div class="text-sm">
                Relevance: {(precedent.relevanceScore * 100).toFixed(1)}%
              </div>
            </div>
            <div class="text-sm text-gray-600">
              <span class="font-medium">{precedent.citation}</span>
              {#if precedent.court}
                â€¢ {precedent.court}{/if}
              {#if precedent.year}
                â€¢ {precedent.year}{/if}
              {#if precedent.jurisdiction}
                â€¢ {precedent.jurisdiction}{/if}
            </div>
            {#if precedent.summary}
              <p class="text-sm text-gray-700">{precedent.summary}</p>
            {/if}
            {#if precedent.legalPrinciples.length > 0}
              <div class="mb-2">
                <span class="text-xs font-medium">Legal Principles:</span>
                <div class="flex flex-wrap gap-1">
                  {#each Array.isArray(precedent.legalPrinciples) ? precedent.legalPrinciples : [] as principle}
                    <span class="px-2 py-1 bg-green-100 text-green-800 text-xs">
                      {principle}
                    </span>
                  {/each}
                </div>
              {/if}
            {#if precedent.linkedCases.length > 0}
              <div>
                <span class="text-xs font-medium">Related Cases:</span>
                <span class="text-xs text-gray-600">
                  {precedent.linkedCases.length} linked case{precedent.linkedCases.length !== 1 ? 's' : ''}
                </span>
              {/if}
          </div>
        {/each}
      </div>
      <!-- Pagination -->
      {#if totalPages > 1}
        <div class="p-4 border-t">
          <div class="flex items-center">
            <div class="text-sm">
              Page {currentPage} of {totalPages}
            </div>
            <div class="flex">
              <button
                type="button"
                onclick={() => changePage(currentPage - 1)}
                disabled={currentPage <= 1}
                class="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50 disabled opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onclick={() => changePage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                class="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        {/if}
    </div>
  {:else if !loading && searchFilters.query}
    <div class="bg-white p-8 border border-gray-200 rounded-lg">
      <p class="text-gray-600">No precedents found for your search criteria.</p>
      <p class="text-sm text-gray-500">Try adjusting your search terms or filters.</p>
    {/if}
</div>
;



