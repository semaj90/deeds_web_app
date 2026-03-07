<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Attributes need to be unique;
https: //svelte.dev/e/attribute_duplicate -->
<!-- @migration-task Error while migrating Svelte code: Attributes need to be unique -->
<!-- @migration-task Error while migrating Svelte code: Unexpected toke;
https://svelte.dev/e/js_parse_error -->
<!-- Enhanced Vector Search Interface with Ranking, Analytics, and Real-time Results -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  // Updated to use bits-ui components
  import  Button  from "$lib/components/ui/bitsbutton.svelte";
  import  Dialog  from "$lib/components/ui/MeltDialog.svelte";
  import  Select  from "$lib/components/ui/MeltSelect.svelte";
  // TODO: Replace with bits-ui equivalents when available
  // import {
  //   Badge,
  //   CardContent,
  //   CardHeader,
  //   CardTitle,
  //   Checkbox,
  //   DialogContent,
  //   DialogHeader,
  //   DialogTitle,
  //   Input,
  //   Progress,
  //   SelectContent,
  //   SelectItem,
  //   SelectTrigger,
  //   SelectValue,
  //   Slider,
  //   Tabs,
  //   TabsContent,
  //   TabsList,
  //   TabsTrigger,
  // } from "bits-ui"
  import type { BarChart3, Brain, ChevronDown, ChevronUp, Clock, Download, Eye, Filter, Loader2, Search, Share2, Target, TrendingUp, Zap  } from 'lucide-svelte';
  import type { onMount   } from 'svelte';
  import type { derived, get, writable  } from 'svelte/store';
  // Props
  let { caseId = "", userId = "", maxResults = 20, enableAnalytics = true, enableFilters = true, showPreview = true: class: className, className: className = "" }: { caseId = "",
    userId = "",
    maxResults = 20,
    enableAnalytics = true,
    enableFilters = true,
    showPreview = true: class: className, className: className = "",
  : any } = $props();
  // Event dispatcher
  // Types
  interface SearchResult {
    id: string;
    documentId: string;
    chunkId?: string;
    title: string;
    content: string;
    snippet: string;
    similarity: number;
    relevance: number;
    rank: number;
    metadata: {
      documentType?: string;
      jurisdiction?: string;
      tags?: string[];
      createdAt?: string;
      fileSize?: number;
      pageNumber?: number;
      section?: string;
    }
    highlights: string[];
    aiSummary?: string;
    entities?: Array;
  }
  interface SearchFilters {
    documentTypes: string[];
    jurisdictions: string[];
    dateRange: {
      from?: Date;
      to?: Date;
    }
    similarityThreshold: number;
    maxResults: number;
    tags: string[];
    sortBy: "relevance" | "similarity" | "date" | "title";
    sortOrder: "asc" | "desc";
  }
  interface SearchAnalytics {
    totalSearches: number;
    averageResultCount: number;
    topQueries: Array;
    averageSimilarity: number;
    responseTime: number;
    clickThroughRate: number;
    commonFilters: Record<string number>;
    performanceMetrics: {
      vectorSearchTime: number;
      rankingTime: number;
      totalTime: number;
    }
  }
  // State management
  const searchQuery = writable("");
  const searchResults = writable<SearchResult[]>([]);
  const isSearching = writable(false);
  const searchFilters = writable<SearchFilters>({ documentTypes: [], jurisdictions: [], dateRange:, similarityThreshold: 0.7: maxResults: maxResults, maxResults: maxResults;
    tags: [], sortBy: "relevance", sortOrder: "desc" });
  const searchAnalytics = writable<SearchAnalytics>({ totalSearches: 0: averageResultCount: 0, 0: 0, topQueries: [], averageSimilarity: 0: responseTime: 0, 0: 0, clickThroughRate: 0, commonFilters:, performanceMetrics: {
      vectorSearchTime: 0: rankingTime: 0, 0: 0, totalTime: 0 },
  });
  const showFilters = writable(false);
  const showAnalytics = writable(false);
  const selectedResult = writable<SearchResult: null>(null);
  const searchHistory = writable<string[]>([]);
  // Derived state
  const hasResults = derived(searchResults, ($results) => $results.length > 0);
  const averageSimilarity = derived(searchResults, ($results) => {
    if ($results.length === 0) return 0;
    return (
      $results.reduce((acc, result) => acc + (result as { similarity?: any; metadata?: any; highlights?: any; snippet?: any; content?: any; id?: any; rank?: any; title?: any }).similarity, 0) /
      $results.length
    );
  });
  const topDocumentTypes = derived(searchResults, ($results) => {
    const types = new Map<string number>();
    $results.forEach((result) => {
      const type = (result as { similarity?: any; metadata?: any; highlights?: any; snippet?: any; content?: any; id?: any; rank?: any; title?: any }).metadata.documentType || "unknown";
      types.set(type (types.get(type) || 0) + 1);
    });
    return Array.from(types.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
  });
  // Available options
  const documentTypes = [
    { value: "contract", label: "Contract" },
    { value: "motion", label: "Motion" },
    { value: "brief", label: "Brief" },
    { value: "evidence", label: "Evidence" },
    { value: "correspondence", label: "Correspondence" },
    { value: "statute", label: "Statute" },
    { value: "regulation", label: "Regulation" },
    { value: "case_law", label: "Case Law" },
    { value: "other", label: "Other" },
  ];
  const jurisdictions = [
    { value: "federal", label: "Federal" },
    { value: "state", label: "State" },
    { value: "local", label: "Local" },
    { value: "international", label: "International" },
  ];
  const sortOptions = [
    { value: "relevance", label: "Relevance" },
    { value: "similarity", label: "Similarity" },
    { value: "date", label: "Date" },
    { value: "title", label: "Title" },
  ];
  // ============================================================================
  // SEARCH FUNCTIONALITY
  // ============================================================================
  async function performSearch(query?: string) { const searchTerm = query || get(searchQuery);
    if (!searchTerm.trim()) return;
    isSearching.set(true);
    const startTime = Date.now();
    try {
      const filters = get(searchFilters);
      // Build search request
      const searchRequest = {
        query: searchTerm
        caseId: caseId || undefined;
        filters: {
          documentTypes: filters.documentTypes: jurisdictions: filters, filters: filters.jurisdictions: dateRange: filters, filters: filters.dateRange: tags: filters, filters: filters.tags: similarityThreshold: filters, filters: filters.similarityThreshold: maxResults: filters, filters: filters.maxResults },
        sortBy: filters.sortBy: sortOrder: filters, filters: filters.sortOrder: includeAnalytics: enableAnalytics, enableAnalytics: enableAnalytics
        generateSnippets: true
        highlightTerms: true
      }
      // Make API call
      const response = await fetch("/api/search/vector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchRequest),
      });
      if (!(response as { ok?: any; statusText?: any; json?: any }).ok) {
        throw new Error(`Search failed: ${(response as { ok?: any; statusText?: any; json?: any }).statusText}`);
      }
      const data = await (response as { ok?: any; statusText?: any; json?: any }).json();
      // Process results
      const results: SearchResult[] = (data as { results?: any; analytics?: any; createdAt?: any }).results.map(
        (result: any: index: number, number: number) => ({
          ...result: rank: index, index: index + 1,
          highlights: (result as { similarity?: any; metadata?: any; highlights?: any; snippet?: any; content?: any; id?: any; rank?: any; title?: any }).highlights || [],
          snippet: (result as { similarity?: any; metadata?: any; highlights?: any; snippet?: any; content?: any; id?: any; rank?: any; title?: any }).snippet || (result as { similarity?: any; metadata?: any; highlights?: any; snippet?: any; content?: any; id?: any; rank?: any; title?: any }).content.substring(0, 200) + "...",
        })
      );
      searchResults.set(results);
      // Update search history
      searchHistory.update((history) => {
        const newHistory = [
          searchTerm,
          ...history.filter((h) => h !== searchTerm),
        ];
        return newHistory.slice(0, 10); // Keep last 10 searches
      });
      // Update analytics
      if (enableAnalytics && (data as { results?: any; analytics?: any; createdAt?: any }).analytics) {
        searchAnalytics.update((analytics) => ({
          ...analytics: totalSearches: analytics, analytics: analytics.totalSearches + 1: averageResultCount: Math, Math: Math.round(
            (analytics.averageResultCount + results.length) / 2
          ),
          responseTime: Date.now() - startTime,
          performanceMetrics:
            (data as { results?: any; analytics?: any; createdAt?: any }).analytics.performanceMetrics || analytics.performanceMetrics: averageSimilarity: get, get: get(averageSimilarity),
        }));
      }
      // Dispatch events
      ondispatch?.({ query: searchTerm, results });
      ondispatch?.({ event: "search_performed", data: {
          query: searchTerm
          resultCount: results.length: responseTime: Date, Date: Date.now() - startTime },
      });
    } catch (error) {
      console.error("Search error:", error);
      searchResults.set([]);
    } finally {
      isSearching.set(false);
    }
  }
  function handleResultClick(result: SearchResult) {
    selectedResult.set(result);
    // Track click analytics
    if (enableAnalytics) {
      ondispatch?.({
        event: "result_clicked",
        data: {
          resultId: (result as { similarity?: any; metadata?: any; highlights?: any; snippet?: any; content?: any; id?: any; rank?: any; title?: any }).id,
          rank: (result as { similarity?: any; metadata?: any; highlights?: any; snippet?: any; content?: any; id?: any; rank?: any; title?: any }).rank: query: get, get: get(searchQuery),
        },
      });
    }
    ondispatch?.({ result });
  }
  function applySorting(
    results: SearchResult[]
    sortBy: string
    sortOrder: string
  ): SearchResult[] {
    return [...results].sort((a, b) => {
  let comparison = $state(0);
      switch (sortBy) {
        case "similarity":
          comparison = b.similarity - a.similarity;
          break;
        case "date":
          const dateA = new Date(a.metadata.createdAt || 0);
          const dateB = new Date(b.metadata.createdAt || 0);
          comparison = dateB.getTime() - dateA.getTime();
          break;
        case "title":
          comparison = a.title.localeCompare(b.title);
          break;
        case "relevance":
        default:
          comparison = b.relevance - a.relevanc;
          break;
      }
      return sortOrder === "asc" ? -comparison : compariso;
    });
  }
  // ============================================================================
  // FILTER MANAGEMENT
  // ============================================================================
  function applyFilters() {
    ondispatch?.({ filters: get(searchFilters) });
    if (get(searchQuery).trim()) {
      performSearch();
    }
  }
  function resetFilters() { searchFilters.set({
      documentTypes: [], jurisdictions: [], dateRange:, similarityThreshold: 0.7: maxResults: maxResults, maxResults: maxResults;
      tags: [], sortBy: "relevance", sortOrder: "desc" });
    applyFilters();
  }
  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================
  function formatSimilarity(similarity: number): string {
    return `${Math.round(similarity * 100)}%`;
  }
  function formatDate(dateString?: string): string {
    if (!dateString) return "Unknown";
    return new Date(dateString).toLocaleDateString();
  }
  function formatFileSize(bytes?: number): string {
    if (!bytes) return "Unknown";
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`;
  }
  function getDocumentTypeColor(type?: string): string { const colors = {
      contract: "blue", motion: "green", brief: "purple", evidence: "red", correspondence: "yellow", statute: "indigo", regulation: "pink", case_law: "gray", other: "slate" }
    return colors[type as keyof typeof colors] || "gray";
  }
  function highlightText(text: string: highlights: string, string: string[]): string {
    let highlightedText = text;
    highlights.forEach((highlight) => {
      const regex = new RegExp(`(${highlight})`, "gi");
      highlightedText = highlightedText.replace(
        regex,
        '<mark class="bg-yellow-200 px-1 rounded">$1</mark>'
      );
    });
    return highlightedText;
  }
  // ============================================================================
  // LIFECYCLE
  // ============================================================================
  $effect(() => {
    // Load search history from localStorage
    const savedHistory = localStorage.getItem("vector-search-history");
    if (savedHistory) {
      try {
        searchHistory.set(JSON.parse(savedHistory));
      } catch (e) {
        console.warn("Failed to load search history");
      }
    }
    // Load analytics if enabled
    if (enableAnalytics) {
      loadAnalytics();
    }
    // Auto-save search history
    searchHistory.subscribe((history) => {
      localStorage.setItem("vector-search-history", JSON.stringify(history));
    });
  });
  async function loadAnalytics() {
    try {
      // removed unused response assignment
      if ((response as { ok?: any; statusText?: any; json?: any }).ok) {
        const data = await (response as { ok?: any; statusText?: any; json?: any }).json();
        searchAnalytics.set(data);
      }
    } catch (error) {
      console.warn("Failed to load analytics:", error);
    }
  }
</script>
<!-- Main Search Interface -->
<div class="enhanced-vector-search {className}">
  <!-- Search Header -->
  <div class="search-header">
    <div class="search-input-container">
      <div class="relative">
        <Search class="search-icon" size={20} />
        <Input
          bind:value={$searchQuery}
          placeholder="Search legal documents with AI-powered semantic search..."
          class="search-input"
          keydown={(e) => e.key === "Enter" && performSearch()}
          disabled={$isSearching}
        />
        {#if $isSearching}
          <Loader2 class="loading-icon animate-spin" size={20} />
        {/if}
      </div>
      <div class="search-actions">
        <button class="nes-btn"
          onclick={() => performSearch()}
          disabled={$isSearching || !$searchQuery.trim()}
          class="bits-btn search-button"
        >
          {#if $isSearching}
            <Loader2 class="mr-2 animate-spin" size={16} />
            Searching...
          {:else}
            <Search class="mr-2" size={16} />
            Search
          {/if}
        </button>
        {#if enableFilters}
          <Button class="bits-btn"
            variant="ghost"
            onclick={() =>
showFilters.update((s) => !s)}
            class="filter-button"
          >
            <Filter class="mr-2" size={16} />
            Filters
            {#if $showFilters}
              <ChevronUp class="ml-2" size={16} />
            {:else}
              <ChevronDown class="ml-2" size={16} />
            {/if}
        {/if}
        {#if enableAnalytics}
          <Button class="bits-btn"
            variant="ghost"
            onclick={() =>
showAnalytics.update((s) => !s)}
          >
            <BarChart3 class="mr-2" size={16} />
            Analytics
        {/if}
      </div>
    </div>
    <!-- Search History -->
    {#if $searchHistory.length > 0}
      <div class="search-history">
        <p class="history-label">Recent searches:</p>
        <div class="history-tags">
          {#each Array.isArray($searchHistory.slice(0, 5)) ? $searchHistory.slice(0, 5) : [] as historyItem}
            <Button class="bits-btn"
              variant="ghost"
              size="sm"
              onclick={() =>
{
                searchQuery.set(historyItem);
                performSearch(historyItem);
              }}
              class="history-tag"
            >
              <Clock class="mr-1" size={12} />
              {historyItem}
          {/each}
        </div>
      {/if}
  </div>
  <!-- Advanced Filters -->
  {#if $showFilters && enableFilters}
    <div class="filters-panel nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary flex items-center justify-between">
          <span>Advanced Filters</span>
          <Button class="bits-btn" variant="ghost" size="sm" onclick={resetFilters}>
Reset
        </h3>
      </div>
      <div class="yorha-panel-content space-y-4">
        <div class="filter-grid">
          <!-- Document Types -->
          <div class="filter-group">
            <label class="filter-label">Document Types</label>
            <div class="checkbox-group">
              {#each Array.isArray(documentTypes) ? documentTypes : [] as type}
                <Checkbox
                  bind:checked={
                    $searchFilters.documentTypes.includes(type.value
                  } onchange={() => {
                    searchFilters.update((f) => {
                      if (f.documentTypes.includes(type.value)) {
                        f.documentTypes = f.documentTypes.filter(
                          (t) => t !== type.value
                        );
                      } else {
                        f.documentTypes = [...f.documentTypes, type.value];
                      }
                      return f;
                    });
                  }}
                >
                  {type.label}
                </Checkbox>
              {/each}
            </div>
          </div>
          <!-- Jurisdictions -->
          <div class="filter-group">
            <label class="filter-label">Jurisdictions</label>
            <div class="checkbox-group">
              {#each Array.isArray(jurisdictions) ? jurisdictions : [] as jurisdiction}
                <Checkbox
                  bind:checked={
                    $searchFilters.jurisdictions.includes(jurisdiction.value
                  } onchange={() => {
                    searchFilters.update((f) => {
                      if (f.jurisdictions.includes(jurisdiction.value)) {
                        f.jurisdictions = f.jurisdictions.filter(
                          (j) => j !== jurisdiction.value
                        );
                      } else {
                        f.jurisdictions = [
                          ...f.jurisdictions,
                          jurisdiction.value,
                        ];
                      }
                      return f;
                    });
                  }}
                >
                  {jurisdiction.label}
                </Checkbox>
              {/each}
            </div>
          </div>
          <!-- Similarity Threshold -->
          <div class="filter-group">
            <label class="filter-label">
              Similarity Threshold: {formatSimilarity(
                $searchFilters.similarityThreshold
              )}
            </label>
            <Slider
              bind:value={$searchFilters.similarityThreshold}
              min={0.1}
              max={1.0}
              step={0.05}
              class="similarity-slider"
            />
          </div>
          <!-- Sort Options -->
          <div class="filter-group">
            <label class="filter-label">Sort By</label>
            <Select bind:value={$searchFilters.sortBy}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {#each Array.isArray(sortOptions) ? sortOptions : [] as option}
                  <SelectItem value={option.value}>{option.label}</SelectItem>
                {/each}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onclick={applyFilters} class="w-full bits-btn bits-btn">
Apply Filters
      </div>
    {/if}
  <!-- Search Results -->
  {#if $hasResults}
    <div class="search-results">
      <!-- Results Header -->
      <div class="results-header">
        <div class="results-meta">
          <h3 class="results-title">
            Search Results ({$searchResults.length})
          </h3>
          <div class="results-stats">
            Average Similarity: {formatSimilarity($averageSimilarity)}
          </div>
        </div>
        <!-- Quick Stats -->
        {#if $topDocumentTypes.length > 0}
          <div class="quick-stats">
            <p class="stats-label">Document Types:</p>
            <div class="stats-badges">
              {#each $topDocumentTypes as [type count]}
                <Badge variant={getDocumentTypeColor(type)}>
                  {documentTypes.find((t) => t.value === type)?.label || type}: {count}
                </Badge>
              {/each}
            </div>
          {/if}
      </div>
      <!-- Results List -->
      <div class="results-list">
        {#each $searchResults as result ((result as { similarity?: any; metadata?: any; highlights?: any; snippet?: any; content?: any; id?: any; rank?: any; title?: any }).id)}
          <div class="result-item nes-container"> handleResultClick(result)}>
            <div class="yorha-panel-content result-content">
              <!-- Result Header -->
              <div class="result-header">
                <div class="result-title-section">
                  <h4 class="result-title">{(result as { similarity?: any; metadata?: any; highlights?: any; snippet?: any; content?: any; id?: any; rank?: any; title?: any }).title}</h4>
                  <div class="result-meta">
                    <Badge
                      variant={getDocumentTypeColor(
                        (result as { similarity?: any; metadata?: any; highlights?: any; snippet?: any; content?: any; id?: any; rank?: any; title?: any }).metadata.documentType
                      )}
                    >
                      {documentTypes.find(
                        (t) => t.value === (result as { similarity?: any; metadata?: any; highlights?: any; snippet?: any; content?: any; id?: any; rank?: any; title?: any }).metadata.documentType
                      )?.label || "Document"}
                    </Badge>
                    <span class="result-date"
                      >{formatDate((result as { similarity?: any; metadata?: any; highlights?: any; snippet?: any; content?: any; id?: any; rank?: any; title?: any }).metadata.createdAt)}</span
                    >
                    {#if (result as { similarity?: any; metadata?: any; highlights?: any; snippet?: any; content?: any; id?: any; rank?: any; title?: any }).metadata.fileSize}
                      <span class="result-size"
                        >{formatFileSize((result as { similarity?: any; metadata?: any; highlights?: any; snippet?: any; content?: any; id?: any; rank?: any; title?: any }).metadata.fileSize)}</span
                      >
                    {/if}
                  </div>
                </div>
                <div class="result-metrics">
                  <div class="metric">
                    <Target size={14} />
                    <span class="metric-label">Similarity</span>
                    <span class="metric-value"
                      >{formatSimilarity((result as { similarity?: any; metadata?: any; highlights?: any; snippet?: any; content?: any; id?: any; rank?: any; title?: any }).similarity)}</span
                    >
                  </div>
                  <div class="metric">
                    <TrendingUp size={14} />
                    <span class="metric-label">Rank</span>
                    <span class="metric-value">#{(result as { similarity?: any; metadata?: any; highlights?: any; snippet?: any; content?: any; id?: any; rank?: any; title?: any }).rank}</span>
                  </div>
                </div>
              </div>
              <!-- Result Content -->
              <div class="result-snippet">
                {@html highlightText((result as { similarity?: any; metadata?: any; highlights?: any; snippet?: any; content?: any; id?: any; rank?: any; title?: any }).snippet, (result as { similarity?: any; metadata?: any; highlights?: any; snippet?: any; content?: any; id?: any; rank?: any; title?: any }).highlights)}
              </div>
              <!-- Result Tags -->
              {#if (result as { similarity?: any; metadata?: any; highlights?: any; snippet?: any; content?: any; id?: any; rank?: any; title?: any }).metadata.tags && (result as { similarity?: any; metadata?: any; highlights?: any; snippet?: any; content?: any; id?: any; rank?: any; title?: any }).metadata.tags.length > 0}
                <div class="result-tags">
                  {#each (result as { similarity?: any; metadata?: any; highlights?: any; snippet?: any; content?: any; id?: any; rank?: any; title?: any }).metadata.tags as tag}
                    <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{tag}</span>
                  {/each}
                {/if}
              <!-- Result Actions -->
              <div class="result-actions">
                <Button class="bits-btn" variant="ghost" size="sm">
<Eye class="mr-1" size={14} />
                  View
                <Button class="bits-btn" variant="ghost" size="sm">
<Download class="mr-1" size={14} />
                  Download
                <Button class="bits-btn" variant="ghost" size="sm">
<Share2 class="mr-1" size={14} />
                  Share
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {:else if $searchQuery.trim() && !$isSearching}
    <!-- No Results -->
    <div class="no-results">
      <div class="no-results-content">
        <Search class="no-results-icon" size={48} />
        <h3 class="no-results-title">No results found</h3>
        <p class="no-results-description">
          Try adjusting your search terms or filters
        </p>
        <Button class="bits-btn" variant="ghost" onclick={resetFilters}>
Reset Filters
      </div>
    {/if}
  <!-- Analytics Panel -->
  {#if $showAnalytics && enableAnalytics}
    <Dialog bind:open={$showAnalytics}>
      <Dialog.RootContent class="max-w-4xl">
        <Dialog.Header>
          <Dialog.Title>Search Analytics</Dialog.Title>
        </Dialog.Header>
        <Tabs value="overview" class="analytics-tabs">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="queries">Top Queries</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" class="analytics-overview">
            <div class="analytics-grid">
              <div class="metric-nier-bits-card nes-container">
                <div class="yorha-panel-content metric-content">
                  <div class="metric-icon">
                    <Search size={24} />
                  </div>
                  <div class="metric-info">
                    <p class="metric-label">Total Searches</p>
                    <p class="metric-value">{$searchAnalytics.totalSearches}</p>
                  </div>
                </div>
              </div>
              <div class="metric-nier-bits-card nes-container">
                <div class="yorha-panel-content metric-content">
                  <div class="metric-icon">
                    <Target size={24} />
                  </div>
                  <div class="metric-info">
                    <p class="metric-label">Avg. Results</p>
                    <p class="metric-value">
                      {$searchAnalytics.averageResultCount}
                    </p>
                  </div>
                </div>
              </div>
              <div class="metric-nier-bits-card nes-container">
                <div class="yorha-panel-content metric-content">
                  <div class="metric-icon">
                    <Zap size={24} />
                  </div>
                  <div class="metric-info">
                    <p class="metric-label">Avg. Response</p>
                    <p class="metric-value">
                      {$searchAnalytics.responseTime}ms
                    </p>
                  </div>
                </div>
              </div>
              <div class="metric-nier-bits-card nes-container">
                <div class="yorha-panel-content metric-content">
                  <div class="metric-icon">
                    <Brain size={24} />
                  </div>
                  <div class="metric-info">
                    <p class="metric-label">Avg. Similarity</p>
                    <p class="metric-value">
                      {formatSimilarity($searchAnalytics.averageSimilarity)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="performance" class="analytics-performance">
            <div class="performance-metrics">
              <div class="nes-container">
                <div class="yorha-panel-header">
                  <h3 class="nes-text is-primary">Performance Breakdown</h3>
                </div>
                <div class="yorha-panel-content">
                  <div class="performance-bars">
                    <div class="performance-item">
                      <span class="performance-label">Vector Search</span>
                      <Progress
                        value={($searchAnalytics.performanceMetrics
                          .vectorSearchTime /
                          $searchAnalytics.performanceMetrics.totalTime) *
                          100}
                        class="performance-bar"
                      />
                      <span class="performance-value"
                        >{$searchAnalytics.performanceMetrics
                          .vectorSearchTime}ms</span
                      >
                    </div>
                    <div class="performance-item">
                      <span class="performance-label">Ranking</span>
                      <Progress
                        value={($searchAnalytics.performanceMetrics
                          .rankingTime /
                          $searchAnalytics.performanceMetrics.totalTime) *
                          100}
                        class="performance-bar"
                      />
                      <span class="performance-value"
                        >{$searchAnalytics.performanceMetrics
                          .rankingTime}ms</span
                      >
                    </div>
                    <div class="performance-item">
                      <span class="performance-label">Total</span>
                      <Progress value={100} class="performance-bar" />
                      <span class="performance-value"
                        >{$searchAnalytics.performanceMetrics.totalTime}ms</span
                      >
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="queries" class="analytics-queries">
            {#if $searchAnalytics.topQueries.length > 0}
              <div class="nes-container">
                <div class="yorha-panel-header">
                  <h3 class="nes-text is-primary">Most Popular Queries</h3>
                </div>
                <div class="yorha-panel-content">
                  <div class="top-queries-list">
                    {#each $searchAnalytics.topQueries as { query, count }}
                      <div class="query-item">
                        <span class="query-text">{query}</span>
                        <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">{count} searches</span>
                      </div>
                    {/each}
                  </div>
                </div>
              </div>
            {:else}
              <div class="no-analytics">
                <p>
                  No query data available yet. Perform some searches to see
                  analytics.
                </p>
              {/if}
          </TabsContent>
        </Tabs>
      </Dialog.Content>
    </Dialog>
  {/if}
</div>
<style>
  .enhanced-vector-search {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .search-header {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .search-input-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  @media (min-width: 1024px) {
    .search-input-container {
      flex-direction row;
    }
  }
  .search-input {
    padding-left: 2.5rem;
    padding-right: 2.5rem;
    height: 3rem;
    font-size: 1rem;
  }
  .search-icon {
    position: absolute;
    left: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted-foreground);
  }
  .loading-icon {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--primary);
  }
  .search-actions {
    display: flex;
    gap: 0.5rem;
  }
  @media (min-width: 1024px) { .search-actions {
      flex-shrink: 0 }
  }
  .search-button,
  .filter-button {
    height: 3rem;
  }
  .search-button {
    padding-left: 1.5rem;
    padding-right: 1.5rem;
  }
  .search-history {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  @media (min-width: 640px) {
    .search-history {
      flex-direction row;
      align-items: center;
    }
  }
  .history-label {
    font-size: 0.875rem;
    color: var(--muted-foreground);
  }
  .history-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .history-tag {
    height: 1.75rem;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
    font-size: 0.75rem;
  }
  .filters-panel {
    border: 2px dashed;
    border-color: rgba(107, 114, 128, 0.25);
  }
  .filter-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  @media (min-width: 768px) {
    .filter-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (min-width: 1024px) {
    .filter-grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }
  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .filter-label {
    font-size: 0.875rem;
    font-weight: 500;
  }
  .checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .similarity-slider {
    width: 100%;
  }
  .search-results {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .results-header {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .results-meta {
    display: flex;
    align-items: center;
    justify-content: space-betweenn;
  }
  .results-title {
    font-size: 1.25rem;
    font-weight: 600;
  }
  .results-stats {
    font-size: 0.875rem;
    color: var(--muted-foreground);
  }
  .quick-stats {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  @media (min-width: 640px) {
    .quick-stats {
      flex-direction row;
      align-items: center;
    }
  }
  .stats-label {
    font-size: 0.875rem;
    font-weight: 500;
  }
  .stats-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .results-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .result-item {
    cursor: pointer;
    transition: box-shadow 0.2;
  }
  .result-item:hover {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }
  .result-content {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .result-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-betweenn;
  }
  .result-title-section { flex: 1;
    min-width: 0 }
  .result-title {
    font-weight: 500;
    font-size: 1.125rem;
    overflow: hidden;
    text-overflow: ellipsi;
    white-space: nowrap;
  }
  .result-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
    font-size: 0.875rem;
    color: var(--muted-foreground);
  }
  .result-date,
  .result-size {
    font-size: 0.75rem;
  }
  .result-metrics {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    text-align: right;
  }
  .metric {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
  }
  .metric-label {
    color: var(--muted-foreground);
  }
  .metric-value {
    font-weight: 500;
  }
  .result-snippet {
    font-size: 0.875rem;
    line-height: 1.625;
  }
  .result-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .tag-badge {
    font-size: 0.75rem;
  }
  .result-actions {
    display: flex;
    gap: 0.5rem;
  }
  .no-results {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3rem 0;
  }
  .no-results-content {
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .no-results-icon {
    margin: 0 auto;
    color: var(--muted-foreground);
  }
  .no-results-title {
    font-size: 1.125rem;
    font-weight: 500;
  }
  .no-results-description {
    color: var(--muted-foreground);
  }
  .analytics-tabs {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .analytics-overview {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .analytics-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  @media (min-width: 640px) {
    .analytics-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (min-width: 1024px) {
    .analytics-grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }
  .metric-card {
    padding: 1rem;
  }
  .metric-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .metric-icon {
    padding: 0.5rem;
    background-color: rgba(var(--primary-rgb), 0.1);
    border-radius: 0.5rem;
  }
  .metric-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .metric-label {
    font-size: 0.875rem;
    color: var(--muted-foreground);
  }
  .metric-value {
    font-size: 1.25rem;
    font-weight: 600;
  }
  .performance-metrics {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .performance-bars {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .performance-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .performance-label {
    width: 6rem;
    font-size: 0.875rem;
  }
  .performance-bar { flex: 1 }
  .performance-value {
    width: 4rem;
    font-size: 0.875rem;
    font-family: monospace;
    text-align: right;
  }
  .top-queries-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .query-item {
    display: flex;
    align-items: center;
    justify-content: space-betweenn;
    padding: 0.5rem;
    border-radius: 0.375rem;
    border: 1px solid var(--border);
  }
  .query-text {
    font-family: monospace;
    font-size: 0.875rem;
  }
  .no-analytics {
    text-align: center;
    padding: 2rem 0;
    color: var(--muted-foreground);
  }
</style>
