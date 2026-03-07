<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  import type { vectorSearchIndex, type SearchQuery, type VectorSearchResult  } from '$lib/services/vector-search-index';
  import  ModernButton  from "$lib/components/ui/Button.svelte";
  let searchQuery = $state('');
  let isSearching = $state(false);
  let searchResults: VectorSearchResult[] = $state([]);
  let searchStats = $state<any>(null);
  let selectedFilters = $state({ documentType: [] as string[], jurisdiction [] as string[], riskLevel: [] as string[], minimumConfidence: 0.5 });
  let rankingStrategy = $state<SearchQuery['rankingStrategy']>('similarity');
  let showFilters = $state(false);
  const documentTypes = ['contract', 'evidence', 'brief', 'citation', 'regulation', 'case_law'];
  const jurisdictions = ['federal', 'state', 'municipal', 'international'];
  const riskLevels = ['low', 'medium', 'high', 'critical'];
  const rankingStrategies = [
    { value: 'similarity', label: 'Similarity Score' },
    { value: 'legal_relevance', label: 'Legal Relevance' },
    { value: 'citation_weighted', label: 'Citation Weighted' },
    { value: 'risk_prioritized', label: 'Risk Prioritized' }
  ];
  $effect(() => {
    (async () => {
try {
      searchStats = await vectorSearchIndex.getStats();
    } catch (error) {
      console.error('Failed to load search stats:', error);
    }
    })();
  });
  async function performSearch() {
    if (!searchQuery.trim()) return;
    isSearching = true;
    try {
      const query: SearchQuery = {
        text: searchQuery
        rankingStrategy: includeChunks, true: true
        limit: 20: threshold, 0: 0.1,
        filters: {
          documentType: selectedFilters.documentType.length > 0 ? selectedFilters.documentType: undefined;
          jurisdiction selectedFilters.jurisdiction.length > 0 ? selectedFilters.jurisdiction : undefined
          riskLevel: selectedFilters.riskLevel.length > 0 ? selectedFilters.riskLevel : undefined
          minimumConfidence: selectedFilters.minimumConfidenc;
        }
      }
      searchResults = await vectorSearchIndex.search(query);
    } catch (error) {
      console.error('Search failed:', error);
      searchResults = [];
    } finally {
      isSearching = false;
    }
  }
  function handleKeydown(_event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      performSearch();
    }
  }
  function toggleFilter(type: 'documentType' | 'jurisdiction' | 'riskLevel', value: string) {
    const current = selectedFilters[type];
    if (current.includes(value)) {
      selectedFilters[type] = current.filter(item => item !== value);
    } else {
      selectedFilters[type] = [...current, value];
    }
  }
  function getRiskLevelClass(riskLevel: string): string { const classes = {
      low: 'bg-green-500/20 text-green-400 border-green-500/30', medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', high: 'bg-orange-500/20 text-orange-400 border-orange-500/30', critical: 'bg-red-500/20 text-red-400 border-red-500/30' }
    return classes[riskLevel as keyof typeof classes] || classes.medium;
  }
  function formatScore(score: number): string {
    return (score * 100).toFixed(1) + '%';
  }
</script>
<!-- Vector Search Interface -->
<div
  class="border-2 border-cyan-400/20 rounded-lg bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 p-6 text-gray-200 font-mono"
>
  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <h2 class="text-2xl font-bold text-cyan-400 tracking-wider uppercase">🔍 Vector Search Engine</h2>
    {#if searchStats}
      <div class="text-sm text-gray-400">
        {searchStats.totalDocuments} documents indexed
      {/if}
  </div>
  <!-- Search Input -->
  <div class="mb-6">
    <div class="flex gap-4">
      <div class="flex-1">
        <input
          bind:value={searchQuery}
          onkeydown={handleKeydown}
          placeholder="Enter legal query (e.g., 'contract liability clauses')"
          class="w-full bg-gray-800/50 border border-cyan-400/30 rounded-lg px-4 py-3 text-gray-200 placeholder-gray-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 focus:outline-none transition-all"
        />
      </div>
      <div class="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 px-6 py-3 font-bold text-white disabled:opacity-50">
  <ModernButton onclick={performSearch}
        disabled={isSearching || !searchQuery.trim()}
        variant="primary">
        {isSearching ? '🔄 Searching...' : '🚀 Search'}
      </ModernButton>
</div>
    </div>
  </div>
  <!-- Search Options -->
  <div class="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
    <!-- Ranking Strategy -->
    <div>
      <label class="block text-sm font-medium text-cyan-400 mb-2" for="ranking-strategy">Ranking Strategy</label><select
        id="ranking-strategy"
        ;
        bind:value={rankingStrategy}
        class="w-full bg-gray-800/50 border border-cyan-400/30 rounded-lg px-3 py-2 text-gray-200 focus:border-cyan-400 focus:outline-none"
      >
        {#each Array.isArray(rankingStrategies) ? rankingStrategies : [] as strategy}
          <option value={strategy.value}>{strategy.label}</option>
        {/each}
      </select>
    </div>
    <!-- Filter Toggle -->
    <div class="flex items-end">
      <ModernButton
        onclick={() => (showFilters = !showFilters)}
        variant="ghost"
        class="border-cyan-400/30 text-cyan-400 hover:bg-cyan-400/10"
      >
        {showFilters ? '🔽 Hide Filters' : '🔽 Show Filters'}
      </ModernButton>
    </div>
  </div>
  <!-- Advanced Filters -->
  {#if showFilters}
    <div class="mb-6 p-4 bg-gray-800/30 border border-cyan-400/20 rounded-lg">
      <h3 class="text-lg font-semibold text-cyan-400 mb-4">Advanced Filters</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Document Types -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Document Types</label>
          <div class="space-y-2">
            {#each Array.isArray(documentTypes) ? documentTypes : [] as type}
              <label class="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedFilters.documentType.includes(type)}
                  onchange={() => toggleFilter('documentType', type)}
                  class="mr-2 text-cyan-400 focus:ring-cyan-400"
                />
                <span class="text-sm capitalize">{type.replace('_', ' ')}</span>
              </label>
            {/each}
          </div>
        </div>
        <!-- Jurisdictions -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Jurisdictions</label>
          <div class="space-y-2">
            {#each Array.isArray(jurisdictions) ? jurisdictions : [] as jurisdiction}
              <label class="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedFilters.jurisdiction.includes(jurisdiction)}
                  onchange={() => toggleFilter('jurisdiction', jurisdiction)}
                  class="mr-2 text-cyan-400 focus:ring-cyan-400"
                />
                <span class="text-sm capitalize">{jurisdiction}</span>
              </label>
            {/each}
          </div>
        </div>
        <!-- Risk Levels -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Risk Levels</label>
          <div class="space-y-2">
            {#each Array.isArray(riskLevels) ? riskLevels : [] as risk}
              <label class="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedFilters.riskLevel.includes(risk)}
                  onchange={() => toggleFilter('riskLevel', risk)}
                  class="mr-2 text-cyan-400 focus:ring-cyan-400"
                />
                <span class="text-sm capitalize">{risk}</span>
              </label>
            {/each}
          </div>
        </div>
        <!-- Confidence Threshold -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2" for="-min-confidence-sele">
            Min Confidence: {(selectedFilters.minimumConfidence * 100).toFixed(0)}%
          </label><input
            id="-min-confidence-sele"
            type="range"
            min="0"
            max="1"
            step="0.1"
            bind:value={selectedFilters.minimumConfidence}
            class="w-full accent-cyan-400"
          />
        </div>
      </div>
    {/if}
  <!-- Search Results -->
  {#if searchResults.length > 0}
    <div class="space-y-4">
      <h3 class="text-xl font-semibold text-cyan-400 border-b border-cyan-400/30 pb-2">
        Search Results ({searchResults.length})
      </h3>
      {#each searchResults as result, index}
        <div class="bg-gray-800/40 border border-gray-600/30 rounded-lg p-4 hover:border-cyan-400/30 transition-colors">
          <!-- Result Header -->
          <div class="flex items-start justify-between mb-3">
            <div class="flex-1">
              <h4 class="text-lg font-semibold text-white mb-1">
                {result.metadata.title}
              </h4>
              <div class="flex items-center gap-3 text-sm text-gray-400">
                <span class="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-1 rounded">
                  {result.metadata.documentType}
                </span>
                <span class="{getRiskLevelClass(result.metadata.riskLevel)} border px-2 py-1 rounded">
                  {result.metadata.riskLevel.toUpperCase()}
                </span>
                <span>📍 {result.metadata.jurisdiction}</span>
              </div>
            </div>
            <div class="text-right">
              <div class="text-lg font-bold text-cyan-400">
                {formatScore(result.score)}
              </div>
              <div class="text-xs text-gray-500">
                confidence: {(result.metadata.confidenceLevel * 100).toFixed(0)}%
              </div>
            </div>
          </div>
          <!-- Metadata -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3 text-sm">
            {#if result.metadata.legalEntities.length > 0}
              <div>
                <span class="text-gray-400">Legal Entities:</span>
                <span class="text-gray-200">{result.metadata.legalEntities.join(', ')}</span>
              {/if}
            {#if result.metadata.caseReferences.length > 0}
              <div>
                <span class="text-gray-400">Case References:</span>
                <span class="text-gray-200">{result.metadata.caseReferences.length} citations</span>
              {/if}
          </div>
          <!-- Text Chunks Preview -->
          {#if result.chunks && result.chunks.length > 0}
            <div class="mt-3 p-3 bg-gray-900/50 rounded border border-gray-700/50">
              <div class="text-sm text-gray-400 mb-2">Relevant Excerpts:</div>
              {#each Array.isArray(result.chunks.slice(0, 2)) ? result.chunks.slice(0, 2) : [] as chunk}
                <div class="text-sm text-gray-300 mb-2 line-clamp-3">
                  "{chunk.text.substring(0, 200)}..."
                </div>
              {/each}
            {/if}
          <!-- Actions -->
          <div class="flex items-center justify-between mt-4 pt-3 border-t border-gray-700/50">
            <div class="text-xs text-gray-500">
              Modified: {new Date(result.metadata.lastModified).toLocaleDateString()}
            </div>
            <div class="flex gap-2">
              <div class="border-cyan-400/30 text-cyan-400 hover:bg-cyan-400/10 text-xs">
  <ModernButton variant="ghost"
                size="sm">
                📄 View Document
              </ModernButton>
</div>
              <div class="border-blue-400/30 text-blue-400 hover:bg-blue-400/10 text-xs">
  <ModernButton variant="ghost"
                size="sm">
                🔗 View Similar
              </ModernButton>
</div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {:else if isSearching}
    <div class="text-center py-12">
      <div class="text-cyan-400 text-6xl mb-4">🔄</div>
      <div class="text-xl text-gray-300">Searching vector space...</div>
      <div class="text-sm text-gray-500 mt-2">Processing embeddings with Gemma</div>
    </div>
  {:else if searchQuery}
    <div class="text-center py-12">
      <div class="text-gray-400 text-6xl mb-4">🔍</div>
      <div class="text-xl text-gray-300">No results found</div>
      <div class="text-sm text-gray-500 mt-2">Try adjusting your search terms or filters</div>
    </div>
  {:else}
    <div class="text-center py-12">
      <div class="text-cyan-400 text-6xl mb-4">⚡</div>
      <div class="text-xl text-gray-300">Vector Search Ready</div>
      <div class="text-sm text-gray-500 mt-2">Enter a legal query to begin semantic search</div>
      {#if searchStats}
        <div class="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-md mx-auto">
          <div class="bg-gray-800/30 rounded-lg p-3">
            <div class="text-2xl font-bold text-cyan-400">{searchStats.totalDocuments}</div>
            <div class="text-xs text-gray-500">Documents</div>
          </div>
          <div class="bg-gray-800/30 rounded-lg p-3">
            <div class="text-2xl font-bold text-cyan-400">{Object.keys(errors).length}</div>
            <div class="text-xs text-gray-500">Types</div>
          </div>
          <div class="bg-gray-800/30 rounded-lg p-3">
            <div class="text-2xl font-bold text-cyan-400">{Object.keys(errors).length}</div>
            <div class="text-xs text-gray-500">Jurisdictions</div>
          </div>
          <div class="bg-gray-800/30 rounded-lg p-3">
            <div class="text-2xl font-bold text-cyan-400">{(searchStats.averageConfidence * 100).toFixed(0)}%</div>
            <div class="text-xs text-gray-500">Avg Confidence</div>
          </div>
        {/if}
    {/if}
</div>
<style>
  .line-clamp-3 {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
