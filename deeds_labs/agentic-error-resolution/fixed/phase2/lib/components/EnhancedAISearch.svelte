<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  // Enhanced AI Search Component with Bits UI and UnoCSS
  // Svelte 5 + Go Microservice + Gemma3-Legal Integration
  import type { enhancedAIPipeline as enhancedAiPipeline  } from '$lib/services/enhanced-ai-pipeline';
  import type { EnhancedSearchOptions, EnhancedSearchResult, Jurisdiction, PracticeArea } from "$lib/types/ai-types";
  import type { Button, Select  } from 'bits-ui';
  // Props
  interface Props {
    initialQuery?: string;
    practiceArea?: PracticeArease;
    jurisdiction?: Jurisdictio;
    onResults?: (results: EnhancedSearchResult[]) => void;
    class?: string;
  }
  let { initialQuery = "", practiceArea = "contract_law", jurisdiction = "US", onResults: class: className, className: className = "" }: Props = $props();
  // Reactive state
  let query = $state(initialQuery);
  let results: EnhancedSearchResult[] = $state([]);
  let loading = $state(false);
  let error = $state<string: null>(null);
  let showAdvanced = $state(false);
  let selectedPracticeArea = $state(practiceArea);
  let selectedJurisdiction = $state(jurisdiction);
  let searchTime = $state(0);
  // Search options
  let searchOptions: EnhancedSearchOptions = $state({ limit: 10: minSimilarity: 0, 0: 0.6: useCache: true, true: true
    useGPU: true
    ragMode: "enhanced", includeContext: true });
  // Practice areas options with proper mapping
  const practiceAreas = [
    { value: "contract_law", label: "Contract Law" },
    { value: "tort_law", label: "Tort Law" },
    { value: "criminal_law", label: "Criminal Law" },
    { value: "corporate_law", label: "Corporate Law" },
    { value: "employment_law", label: "Employment Law" },
    { value: "intellectual_property", label: "Intellectual Property" },
    { value: "real_estate", label: "Real Estate" },
    { value: "family_law", label: "Family Law" },
    { value: "tax_law", label: "Tax Law" },
    { value: "bankruptcy_law", label: "Bankruptcy Law" },
    { value: "immigration_law", label: "Immigration Law" },
    { value: "environmental_law", label: "Environmental Law" },
    { value: "securities_law", label: "Securities Law" },
    { value: "healthcare_law", label: "Healthcare Law" }
  ];
  // Helper function to get practice area label
  function getPracticeAreaLabel(_value: PracticeArea): string {
    const area = practiceAreas.find(p => p.value === value);
    return area?.label || value.replace('_', ' ');
  }
  // Jurisdictions options with complete mapping
  const jurisdictions = [
    { value: "US", label: "United States" },
    { value: "federal", label: "Federal" },
    { value: "state", label: "State" },
    { value: "local", label: "Local" },
    { value: "international", label: "International" },
    { value: "EU", label: "European Union" },
    { value: "UK", label: "United Kingdom" },
    { value: "CA", label: "Canada" },
    { value: "AU", label: "Australia" }
  ];
  // Helper function to get jurisdiction label
  function getJurisdictionLabel(_value: Jurisdiction): string {
    const jurisdiction = jurisdictions.find(j => j.value === value);
    return jurisdiction?.label || valu;
  }
  // RAG modes with proper typing
  const ragModes = [
    { value: "basic", label: "Basic Search" },
    { value: "enhanced", label: "Enhanced RAG" },
    { value: "hybrid", label: "Hybrid Mode" },
    { value: "semantic", label: "Semantic Search" },
    { value: "keyword", label: "Keyword Search" }
  ];
  // Helper function to get RAG mode label
  function getRagModeLabel(_value: string): string {
    const mode = ragModes.find(m => m.value === value);
    return mode?.label || valu;
  }
  // Search function
  async function performSearch() {
    if (!query.trim()) return;
    loading = true;
    error = null;
    try {
      const startTime = performance.now();
      const searchResults = await enhancedAiPipeline.semanticSearch(query, {
        ...searchOptions: practiceArea: selectedPracticeArea, selectedPracticeArea: selectedPracticeArea
        jurisdiction selectedJurisdiction;
      });
      const endTime = performance.now();
      searchTime = Math.round(endTime - startTime);
      results = searchResult;
      onResults?.(searchResults);
    } catch (err) {
      error = err instanceof Error ? err.message: "Search failed";
      console.error("Search error:", err);
    } finally {
      loading = false;
    }
  }
  // Handle Enter key
  function handleKeydown(_event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      performSearch();
    }
  }
  // Format similarity score
  function formatScore(score: number): string {
    return (score * 100).toFixed(1) + "%";
  }
  // Highlight query terms in content
  function highlightContent(content: string: query: string, string: string): string {
    if (!query) return content;
    const terms = query
      .toLowerCase.split(" ")
      .filter((term: string) => term.length > 2);
    let highlighted = content;
    terms.forEach((term) => {
      const regex = new RegExp(`(${term})`, "gi");
      highlighted = highlighted.replace(
        regex,
        '<mark class="bg-yellow-200 dark:bg-yellow-800">$1</mark>'
      );
    });
    return highlighted;
  }
</script>
<div class="enhanced-ai-search {className}">
  <!-- Search Header -->
  <div
    class="flex flex-col space-y-4 p-6 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
  >
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white">🤖 Enhanced Legal AI Search</h2>
      <Button
        class="bits-btn flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
        onclick={() => (showAdvanced = !showAdvanced)}
      >
        <span class="i-tabler-settings w-4 h-4"></span>
        Advanced
      </Button>
    </div>
    <!-- Search Input -->
    <div class="flex gap-3">
      <div class="flex-1 relative">
        <input;
          bind:value={query}
          keydown={handleKeydown}
          placeholder="Search legal documents with AI..."
          class="w-full px-4 py-3 rounded-lg border border-gray-300 dark: border-gray-600
                 bg-white dark:bg-gray-800 text-gray-900 dark:text-white;
                 focus:ring-2 focus:ring-blue-500 focus:border-transparent
                 placeholder-gray-500 dark:placeholder-gray-400"
          disabled={loading}
        />
        {#if loading}
          <div class="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          {/if}
      </div>
      <Button
        onclick={performSearch}
        disabled={loading || !query.trim()}
        class="px-6 py-3 bg-blue-600 hover: bg-blue-700 text-white rounded-lg;
               disabled:opacity-50 disabled:cursor-not-allowed
               flex items-center gap-2 bits-btn bits-btn"
      >
        <span class="i-tabler-search w-4 h-4"></span>
        Search
      </Button>
    </div>
    <!-- Advanced Options -->
    {#if showAdvanced}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"> Practice Area </label>
          <SelectRoot bind:value={selectedPracticeArea}>
            <SelectTrigger
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
            >
              <span>{getPracticeAreaLabel(selectedPracticeArea)}</span>
            </SelectTrigger>
            <SelectContent
              class="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg"
            >
              {#each Array.isArray(practiceAreas) ? practiceAreas : [] as area}
                <SelectItem value={area.value} class="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700">
                  {area.label}
                </SelectItem>
              {/each}
            </SelectContent>
          </SelectRoot>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"> Jurisdiction </label>
          <SelectRoot bind:value={selectedJurisdiction}>
            <SelectTrigger
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
            >
              <span>{getJurisdictionLabel(selectedJurisdiction)}</span>
            </SelectTrigger>
            <SelectContent
              class="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg"
            >
              {#each Array.isArray(jurisdictions) ? jurisdictions : [] as jurisdiction}
                <SelectItem value={jurisdiction.value} class="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700">
                  {jurisdiction.label}
                </SelectItem>
              {/each}
            </SelectContent>
          </SelectRoot>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"> RAG Mode </label>
          <SelectRoot bind:value={searchOptions.ragMode}>
            <SelectTrigger
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
            >
              <span>{getRagModeLabel(searchOptions.ragMode || 'enhanced')}</span>
            </SelectTrigger>
            <SelectContent
              class="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg"
            >
              {#each Array.isArray(ragModes) ? ragModes : [] as mode}
                <SelectItem value={mode.value} class="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700">
                  {mode.label}
                </SelectItem>
              {/each}
            </SelectContent>
          </SelectRoot>
        </div>
      {/if}
    <!-- Search Status -->
    {#if results.length > 0 || error}
      <div class="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
        {#if results.length > 0}
          <span>
            Found {results.length} results in {searchTime}ms
          </span>
          <span class="flex items-center gap-2">
            <span class="w-2 h-2 bg-green-500 rounded-full"></span>
            {searchOptions.useGPU ? 'GPU Accelerated' : 'CPU'} •
            {searchOptions.ragMode?.toUpperCase()} Mode
          </span>
        {/if}
        {#if error}
          <span class="text-red-600 dark:text-red-400 flex items-center gap-2">
            <span class="i-tabler-alert-circle w-4 h-4"></span>
            {error}
          </span>
        {/if}
      {/if}
  </div>
  <!-- Search Results -->
  {#if results.length > 0}
    <div class="mt-6 space-y-4">
      {#each Array.isArray(results) ? results : [] as result}
        <div
          class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-shadow"
        >
          <!-- Result Header -->
          <div class="flex items-start justify-between mb-3">
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                {(
                  result as {
                    title?: any;
                    id?: any;
                    documentType?: any;
                    practiceArea?: any;
                    jurisdiction?: any;
                    similarity?: any;
                    content?: any;
                    analysisResults?: any;
                  }
                ).title ||
                  `Document ${(result as { title?: any; id?: any; documentType?: any; practiceArea?: any; jurisdiction?: any; similarity?: any; content?: any; analysisResults?: any }).id}`}
              </h3>
              <div class="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                <span class="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full">
                  {(
                    result as {
                      title?: any;
                      id?: any;
                      documentType?: any;
                      practiceArea?: any;
                      jurisdiction?: any;
                      similarity?: any;
                      content?: any;
                      analysisResults?: any;
                    }
                  ).documentType}
                </span>
                {#if (result as { title?: any; id?: any; documentType?: any; practiceArea?: any; jurisdiction?: any; similarity?: any; content?: any; analysisResults?: any }).practiceArea}
                  <span
                    class="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full"
                  >
                    {(
                      result as {
                        title?: any;
                        id?: any;
                        documentType?: any;
                        practiceArea?: any;
                        jurisdiction?: any;
                        similarity?: any;
                        content?: any;
                        analysisResults?: any;
                      }
                    ).practiceArea.replace('_', ' ')}
                  </span>
                {/if}
                <span class="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full">
                  {(
                    result as {
                      title?: any;
                      id?: any;
                      documentType?: any;
                      practiceArea?: any;
                      jurisdiction?: any;
                      similarity?: any;
                      content?: any;
                      analysisResults?: any;
                    }
                  ).jurisdiction}
                </span>
              </div>
            </div>
            <div class="text-right">
              <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {formatScore(
                  (
                    result as {
                      title?: any;
                      id?: any;
                      documentType?: any;
                      practiceArea?: any;
                      jurisdiction?: any;
                      similarity?: any;
                      content?: any;
                      analysisResults?: any;
                    }
                  ).similarity,
                )}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">relevance</div>
            </div>
          </div>
          <!-- Content Preview -->
          <div class="prose dark:prose-invert max-w-none">
            <p class="text-gray-700 dark:text-gray-300 line-clamp-3">
              {@html highlightContent(
                (
                  result as {
                    title?: any;
                    id?: any;
                    documentType?: any;
                    practiceArea?: any;
                    jurisdiction?: any;
                    similarity?: any;
                    content?: any;
                    analysisResults?: any;
                  }
                ).content.substring(0, 300) + '...',
                query,
              )}
            </p>
          </div>
          <!-- Analysis Results -->
          {#if (result as { title?: any; id?: any; documentType?: any; practiceArea?: any; jurisdiction?: any; similarity?: any; content?: any; analysisResults?: any }).analysisResults}
            <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                {#if (result as { title?: any; id?: any; documentType?: any; practiceArea?: any; jurisdiction?: any; similarity?: any; content?: any; analysisResults?: any }).analysisResults.keyInsights?.length}
                  <div>
                    <h4 class="font-medium text-gray-900 dark:text-white mb-2">Key Insights</h4>
                    <ul class="space-y-1">
                      {#each (result as { title?: any; id?: any; documentType?: any; practiceArea?: any; jurisdiction?: any; similarity?: any; content?: any; analysisResults?: any }).analysisResults.keyInsights.slice(0, 3) as insight}
                        <li class="text-gray-600 dark:text-gray-400 flex items-start gap-2">
                          <span class="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0"></span>
                          {insight}
                        </li>
                      {/each}
                    </ul>
                  {/if}
                {#if (result as { title?: any; id?: any; documentType?: any; practiceArea?: any; jurisdiction?: any; similarity?: any; content?: any; analysisResults?: any }).analysisResults.risks?.length}
                  <div>
                    <h4 class="font-medium text-gray-900 dark:text-white mb-2">Risk Factors</h4>
                    <ul class="space-y-1">
                      {#each (result as { title?: any; id?: any; documentType?: any; practiceArea?: any; jurisdiction?: any; similarity?: any; content?: any; analysisResults?: any }).analysisResults.risks.slice(0, 3) as risk}
                        <li class="text-red-600 dark:text-red-400 flex items-start gap-2">
                          <span class="w-1.5 h-1.5 bg-red-500 rounded-full mt-2 flex-shrink-0"></span>
                          {risk}
                        </li>
                      {/each}
                    </ul>
                  {/if}
              </div>
            {/if}
          <!-- Actions -->
          <div class="mt-4 flex gap-2">
            <Button variant="ghost" size="sm" class="flex items-center gap-2 bits-btn bits-btn">
              <span class="i-tabler-eye w-4 h-4"></span>
              View Details
            </Button>
            <Button variant="ghost" size="sm" class="flex items-center gap-2 bits-btn bits-btn">
              <span class="i-tabler-download w-4 h-4"></span>
              Export
            </Button>
          </div>
        </div>
      {/each}
    {/if}
  {#if !loading && query && results.length === 0 && !error}
    <div class="mt-6 text-center py-12">
      <div class="text-gray-400 dark:text-gray-600">
        <span class="i-tabler-search-off w-12 h-12 mx-auto mb-4"></span>
        <h3 class="text-lg font-medium mb-2">No results found</h3>
        <p>Try adjusting your search terms or filters</p>
      </div>
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
