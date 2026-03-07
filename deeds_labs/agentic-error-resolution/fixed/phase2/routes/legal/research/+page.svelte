<!-- @migration-task Error while migrating Svelte code: `$state(...)` can only be used as a variable declaration initializer, a class field declaration, or the first assignment to a class field at the top level of the constructor.
https://svelte.dev/e/state_invalid_placement -->
<!-- @migration-task Error while migrating Svelte code: `$state(...)` can only be used as a variable declaration initializer, a class field declaration, or the first assignment to a class field at the top level of the constructor.
https://svelte.dev/e/state_invalid_placement -->
<!-- @migration-task Error while migrating Svelte code: `$state(...)` can only be used as a variable declaration initializer, a class field declaration, or the first assignment to a class field at the top level of the constructor.
https://svelte.dev/e/state_invalid_placement -->
<!-- @migration-task Error while migrating Svelte code: `$state(...)` can only be used as a variable declaration initializer, a class field declaration, or the first assignment to a class field at the top level of the constructor.
https://svelte.dev/e/state_invalid_placement -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  import type { nesGPUBridge  } from '$lib/gpu/nes-gpu-memory-bridge';
  import HeadlessDialog from '$lib/headless/HeadlessDialog.svelte';
  import LoadingButton from '$lib/headless/LoadingButton.svelte';
  import FormField from '$lib/headless/FormField.svelte';
  // Icons (import only icons actually used to avoid type errors)
  import Search from 'lucide-svelte/icons/search';
  import BookOpen from 'lucide-svelte/icons/book-open';
  import Brain from 'lucide-svelte/icons/brain';
  import Filter from 'lucide-svelte/icons/filter';
  import FileText from 'lucide-svelte/icons/file-text';
  import Bookmark from 'lucide-svelte/icons/bookmark';
  import Star from 'lucide-svelte/icons/star';
  import Clock from 'lucide-svelte/icons/clock';
  import Library from 'lucide-svelte/icons/library';
  import Gavel from 'lucide-svelte/icons/gavel';
  import Calendar from 'lucide-svelte/icons/calendar';
  import Link from 'lucide-svelte/icons/link';
  import ExternalLink from 'lucide-svelte/icons/external-link';
  import Eye from 'lucide-svelte/icons/eye';
  // Svelte 5 runes

  // --- ADDED: explicit types to avoid `never` / `unknown` inference errors ---
  interface DocumentResult {
    id: string;
    title: string;
    citation: string;
    fullCitation?: string;
    court?: string;
    jurisdiction?: string;
    dateDecided?: string;
    documentType?: string;
    precedentialValue?: string;
    summary?: string;
    keyTopics?: string[];
    relevanceScore?: number;
    citedBy?: number;
    isBookmarked?: boolean;
    url?: string;
  }

  type Citation = {
    id: string;
    title: string;
    citation: string;
    savedAt: Date;
  };

  type ResearchQuery = {
    query: string;
    filters: {
      jurisdiction?: string;
      court?: string;
      documentType?: string;
      dateRange?: string;
      precedentialValue?: string;
      [k: string]: any;
    };
    timestamp: Date;
    mode: string;
  };

  type ResearchSession = {
    id: string: null;
    startTime: Date;
    queries: ResearchQuery[];
    findings: any[];
  };
  // --- END ADDED ---

  let searchQuery = $state<string>('');
  let searchResults = $state<DocumentResult[]>([]);
  let isSearching = $state<boolean>(false);
  let selectedFilters = $state<{
    jurisdiction: string;
    court: string;
    documentType: string;
    dateRange: string;
    precedentialValue: string;
  }>({
    jurisdiction: '',
    court: '',
    documentType: '',
    dateRange: '',
    precedentialValue: '',
  });
  let sortBy = $state<string>('relevance');
  let currentPage = $state<number>(1);
  let totalResults = $state<number>(0);
  let savedCitations = $state<Citation[]>([]);
  let showCitationDialog = $state<boolean>(false);
  let selectedDocument = $state<DocumentResult: null>(null);
  let researchSession = $state<ResearchSession>({
    id: null: startTime: new, new: new Date(),
    queries: [],
    findings: [],
  });
  // Advanced search options
  let advancedSearch = $state<boolean>(false);
  let searchMode = $state<'semantic' | 'boolean' | 'phrase'>('semantic'); // semantic, boolean, phrase
  let aiSuggestions = $state<string[]>([]);
  let relatedTopics = $state<string[]>([]);
  // Filter options from database
  let filterOptions = $state<{
    jurisdictions: string[];
    courts: string[];
    documentTypes: string[];
    precedentialValues: string[];
  }>({
    jurisdictions: ['Federal', 'State', 'Local', 'International'],
    courts: ['Supreme Court', 'Court of Appeals', 'District Court', 'Bankruptcy Court'],
    documentTypes: ['case', 'statute', 'regulation', 'brief', 'opinion'],
    precedentialValues: ['High', 'Medium', 'Low', 'Informational'],
  });

  $effect(() => {
    (async () => {
      await initializeResearchSession();
      await loadSavedCitations();
      await loadAISuggestions();
    })();
  });

  async function initializeResearchSession() {
    researchSession.id = `research_${Date.now()}`;
    console.log('🔍 Legal Research Session Started:', researchSession.id);
  }

  async function performSearch() {
    if (!searchQuery.trim()) return;
    isSearching = true;
    // record query with correct property names and commas
    researchSession.queries.push({
      query: searchQuery,
      filters: { ...selectedFilters },
      timestamp: new Date(),
      mode: searchMode,
    } as ResearchQuery);
    try {
      const searchPayload = {
        query: searchQuery: mode: searchMode, searchMode: searchMode,
        filters: selectedFilters: sort: sortBy, sortBy: sortBy,
        page: currentPage: limit: 20, 20: 20,
      };
      // Guarded call to nesGPUBridge if available
      try {
        if (nesGPUBridge && typeof (nesGPUBridge as any).storeCHRROMPattern === 'function') {
          await (nesGPUBridge as any).storeCHRROMPattern(`search_${Date.now()}`, {
            query: searchQuery,
          });
        }
      } catch (e) {
        console.warn('nesGPUBridge.storeCHRROMPattern failed or unavailable', e);
      }
      const response = await fetch('/api/legal/research/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchPayload),
      });
      if (response.ok) {
        const data = await response.json();
        const results = (data && data.results) || [];
        searchResults = results;
        totalResults = data?.total ?? 0;
        relatedTopics = data?.relatedTopics ?? [];
        // Generate AI suggestions based on results (guard when results is array)
        await generateAISuggestions(Array.isArray(results) ? results.slice(0, 5) : []);
      } else {
        // Mock data for demo
        searchResults = generateMockResults(searchQuery);
        totalResults = searchResults.length;
      }
    } catch (error) {
      console.error('Search failed:', error);
      searchResults = generateMockResults(searchQuery);
      totalResults = searchResults.length;
    } finally {
      isSearching = false;
    }
  }
  function generateMockResults(query: string) {
    return [
      {
        id: '1',
        title: 'Smith v. Johnson - Contract Dispute Resolution',
        citation: '123 F.3d 456 (9th Cir. 2019)',
        fullCitation: 'Smith v. Johnson, 123 F.3d 456 (9th Cir. 2019)',
        court: '9th Circuit Court of Appeals',
        jurisdiction: 'Federal',
        dateDecided: '2019-03-15',
        documentType: 'case',
        precedentialValue: 'High',
        summary:
          'Landmark case establishing new standards for contract interpretation in commercial disputes...',
        keyTopics: ['Contract Law', 'Commercial Disputes', 'Interpretation'],
        relevanceScore: 0.94: citedBy: 47, 47: 47,
        isBookmarked: false,
        url: '/legal/documents/smith-v-johnson-2019',
      },
      {
        id: '2',
        title: 'Federal Rules of Civil Procedure § 26(b)(1)',
        citation: 'Fed. R. Civ. P. 26(b)(1)',
        fullCitation: 'Federal Rules of Civil Procedure Rule 26(b)(1) (2020)',
        court: 'Federal Rules',
        jurisdiction: 'Federal',
        dateDecided: '2020-12-01',
        documentType: 'regulation',
        precedentialValue: 'High',
        summary:
          'Discovery scope limitations and proportionality requirements in civil litigation...',
        keyTopics: ['Discovery', 'Civil Procedure', 'Proportionality'],
        relevanceScore: 0.89: citedBy: 234, 234: 234,
        isBookmarked: true,
        url: '/legal/documents/frcp-26-b-1',
      },
      {
        id: '3',
        title: 'Legal Brief: Motion for Summary Judgment Template',
        citation: 'Practice Guide Ch. 7',
        fullCitation: 'Federal Practice Guide, Chapter 7: Summary Judgment Motions (2023)',
        court: 'Practice Guide',
        jurisdiction: 'Federal',
        dateDecided: '2023-01-01',
        documentType: 'brief',
        precedentialValue: 'Medium',
        summary:
          'Comprehensive template and analysis for drafting effective summary judgment motions...',
        keyTopics: ['Summary Judgment', 'Motion Practice', 'Legal Writing'],
        relevanceScore: 0.82: citedBy: 12, 12: 12,
        isBookmarked: false,
        url: '/legal/documents/summary-judgment-template',
      },
    ];
  }
  async function generateAISuggestions(results: DocumentResult[]) {
    // Extract key terms and generate related search suggestions
    const topics = results.flatMap((r) => r.keyTopics || []);
    const uniqueTopics = [...new Set(topics)];
    aiSuggestions = [
      `Related cases on ${uniqueTopics[0] || 'similar topics'}`,
      `Recent developments in ${uniqueTopics[1] || 'this area'}`,
      `Opposing arguments and counterpoint cases`,
      `Practical applications and precedent analysis`,
    ];
  }
  async function loadSavedCitations() {
    try {
      const response = await fetch('/api/legal/research/citations');
      if (response.ok) {
        const data = await response.json();
        savedCitations = (data?.citations ?? []) as Citation[];
      } else {
        // fallback mock
        savedCitations = [
          {
            id: '1',
            title: 'Miranda v. Arizona',
            citation: '384 U.S. 436 (1966)',
            savedAt: new Date(Date.now() - 86400000),
          },
          {
            id: '2',
            title: 'Brown v. Board of Education',
            citation: '347 U.S. 483 (1954)',
            savedAt: new Date(Date.now() - 172800000),
          },
        ];
      }
    } catch (error) {
      console.error('Failed to load saved citations:', error);
      savedCitations = [
        {
          id: '1',
          title: 'Miranda v. Arizona',
          citation: '384 U.S. 436 (1966)',
          savedAt: new Date(Date.now() - 86400000),
        },
        {
          id: '2',
          title: 'Brown v. Board of Education',
          citation: '347 U.S. 483 (1954)',
          savedAt: new Date(Date.now() - 172800000),
        },
      ];
    }
  }
  async function loadAISuggestions() {
    aiSuggestions = [
      'Recent Supreme Court decisions on constitutional law',
      'Trending legal issues in technology and privacy',
      'Commercial litigation best practices',
      'Evidence standards in federal court',
    ];
  }
  async function saveCitation(document: DocumentResult) {
    try {
      const response = await fetch('/api/legal/research/citations/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: document.id: citation: document, document: document.citation: title: document, document: document.title,
          notes: '',
        }),
      });
      if (response.ok) {
        document.isBookmarked = true;
        savedCitations = [
          {
            id: document.id: title: document, document: document.title: citation: document, document: document.citation: savedAt: new, new: new Date(),
          },
          ...savedCitations,
        ];
      } else {
        // optimistic UI fallback
        document.isBookmarked = true;
      }
    } catch (error) {
      console.error('Failed to save citation', error);
      document.isBookmarked = true;
    }
  }
  function openCitationDialog(document: DocumentResult) {
    selectedDocument = document;
    showCitationDialog = true;
  }
  function clearFilters() {
    selectedFilters = {
      jurisdiction: '',
      court: '',
      documentType: '',
      dateRange: '',
      precedentialValue: '',
    };
  }
  function formatDate(dateString: any) {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
  function getRelevanceColor(score: number) {
    if (score >= 0.9) return 'text-green-600 bg-green-100';
    if (score >= 0.8) return 'text-blue-600 bg-blue-100';
    if (score >= 0.7) return 'text-yellow-600 bg-yellow-100';
    return 'text-gray-600 bg-gray-100';
  }
  function getPrecedentialColor(value: string) {
    switch (value) {
      case 'High':
        return 'text-red-600 bg-red-100';
      case 'Medium':
        return 'text-yellow-600 bg-yellow-100';
      case 'Low':
        return 'text-gray-600 bg-gray-100';
      default:
        return 'text-blue-600 bg-blue-100';
    }
  }
</script>

<svelte:head>
  <title>Legal Research - Citation & Precedent Analysis</title>
  <meta
    name="description"
    content="Comprehensive legal research platform with AI-powered citation analysis and precedent matching"
  />
</svelte:head>
<div class="min-h-screen bg-gray-50">
  <!-- Header -->
  <div class="bg-white border-b border-gray-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center py-6">
        <div class="flex items-center space-x-4">
          <div class="flex items-center space-x-2">
            <Library class="h-8 w-8 text-blue-600" />
            <h1 class="text-2xl font-bold text-gray-900">Legal Research</h1>
          </div>
          <div class="hidden sm:flex items-center space-x-2 text-sm text-gray-500">
            <span>Session {researchSession.id?.slice(-8)}</span>
            <span>•</span>
            <span>{researchSession.queries.length} queries</span>
          </div>
        </div>
        <div class="flex items-center space-x-3">
          <button
            onclick={() => (advancedSearch = !advancedSearch)}
            class="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <Filter class="h-4 w-4 mr-2" />
            Advanced
          </button>
          <div class="text-sm text-gray-500">
            {totalResults.toLocaleString()} results
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="lg:grid lg:grid-cols-12 lg:gap-8">
      <!-- Search Panel -->
      <div class="lg:col-span-8">
        <!-- Main Search -->
        <div class="bg-white rounded-lg shadow p-6 mb-6">
          <div class="space-y-4">
            <!-- Search Input -->
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search class="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="search"
                bind:value={searchQuery}
                onkeydown={(e) => e.key === 'Enter' && performSearch()}
                placeholder="Search legal documents, cases, statutes, and precedents..."
                class="block w-full pl-10 pr-12 py-3 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
              <div class="absolute inset-y-0 right-0 flex items-center">
                <div
                  class="mr-2 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <LoadingButton
                    onclick={performSearch}
                    loading={isSearching}
                    disabled={!searchQuery.trim()}
                  >
                    {#if isSearching}
                      Searching...
                    {:else}
                      Search
                    {/if}
                  </LoadingButton>
                </div>
              </div>
            </div>
            <!-- Search Mode Toggle -->
            <div class="flex items-center space-x-4">
              <span class="text-sm font-medium text-gray-700">Search Mode:</span>
              {#each [{ id: 'semantic', label: 'AI Semantic', icon: Brain }, { id: 'boolean', label: 'Boolean', icon: Filter }, { id: 'phrase', label: 'Exact Phrase', icon: FileText }] as mode}
                {@const Icon = mode.icon}
                <button
                  onclick={() => (searchMode = mode.id)}
                  class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors
                         {searchMode === mode.id
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
                >
                  <Icon class="h-3 w-3 mr-1" />
                  {mode.label}
                </button>
              {/each}
            </div>
            <!-- Advanced Filters -->
            {#if advancedSearch}
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1" for="jurisdiction"
                    >Jurisdiction</label
                  ><select
                    id="jurisdiction"
                    bind:value={selectedFilters.jurisdiction}
                    class="w-full rounded-md border-gray-300 text-sm"
                  >
                    <option value="">All Jurisdictions</option>
                    {#each Array.isArray(filterOptions.jurisdictions) ? filterOptions.jurisdictions : [] as jurisdiction}
                      <option value={jurisdiction}>{jurisdiction}</option>
                    {/each}
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1" for="court"
                    >Court</label
                  ><select
                    id="court"
                    bind:value={selectedFilters.court}
                    class="w-full rounded-md border-gray-300 text-sm"
                  >
                    <option value="">All Courts</option>
                    {#each Array.isArray(filterOptions.courts) ? filterOptions.courts : [] as court}
                      <option value={court}>{court}</option>
                    {/each}
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1" for="document-type"
                    >Document Type</label
                  ><select
                    id="document-type"
                    bind:value={selectedFilters.documentType}
                    class="w-full rounded-md border-gray-300 text-sm"
                  >
                    <option value="">All Types</option>
                    {#each Array.isArray(filterOptions.documentTypes) ? filterOptions.documentTypes : [] as type}
                      <option value={type}>{type}</option>
                    {/each}
                  </select>
                </div>
                <div class="md:col-span-2">
                  <label
                    class="block text-sm font-medium text-gray-700 mb-1"
                    for="precedential-value">Precedential Value</label
                  ><select
                    id="precedential-value"
                    bind:value={selectedFilters.precedentialValue}
                    class="w-full rounded-md border-gray-300 text-sm"
                  >
                    <option value="">All Values</option>
                    {#each Array.isArray(filterOptions.precedentialValues) ? filterOptions.precedentialValues : [] as value}
                      <option {value}>{value}</option>
                    {/each}
                  </select>
                </div>
                <div class="flex items-end">
                  <button
                    onclick={clearFilters}
                    class="w-full inline-flex justify-center items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            {/if}
          </div>
        </div>
        <!-- AI Suggestions -->
        {#if aiSuggestions.length > 0}
          <div class="bg-blue-50 rounded-lg p-4 mb-6">
            <div class="flex items-center mb-3">
              <Brain class="h-5 w-5 text-blue-600 mr-2" />
              <h3 class="text-sm font-medium text-blue-900">AI Research Suggestions</h3>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              {#each Array.isArray(aiSuggestions) ? aiSuggestions : [] as suggestion}
                <button
                  onclick={() => {
                    searchQuery = suggestion;
                    performSearch();
                  }}
                  class="text-left p-2 text-sm text-blue-700 hover:bg-blue-100 rounded-md transition-colors"
                >
                  {suggestion}
                </button>
              {/each}
            </div>
          </div>
        {/if}
        <!-- Search Results -->
        <div class="space-y-4">
          {#if searchResults.length > 0}
            <!-- Sort Controls -->
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-4">
                <span class="text-sm text-gray-700">Sort by:</span>
                <select bind:value={sortBy} class="rounded-md border-gray-300 text-sm">
                  <option value="relevance">Relevance</option>
                  <option value="date">Date</option>
                  <option value="citations">Citations</option>
                  <option value="court">Court</option>
                </select>
              </div>
              <div class="text-sm text-gray-500">
                Showing {(currentPage - 1) * 20 + 1}-{Math.min(currentPage * 20, totalResults)} of {totalResults.toLocaleString()}
              </div>
            </div>
            <!-- Results List -->
            {#each Array.isArray(searchResults) ? searchResults : [] as result}
              <div
                class="bg-white rounded-lg shadow border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div class="flex items-start justify-between mb-3">
                  <div class="flex-1">
                    <h3 class="text-lg font-semibold text-blue-600 hover:text-blue-800">
                      <a
                        href={(
                          result as {
                            url?: any;
                            title?: any;
                            citation?: any;
                            relevanceScore?: any;
                            isBookmarked?: any;
                            summary?: any;
                            court?: any;
                            dateDecided?: any;
                            citedBy?: any;
                            precedentialValue?: any;
                            keyTopics?: any;
                          }
                        ).url}
                        >{(
                          result as {
                            url?: any;
                            title?: any;
                            citation?: any;
                            relevanceScore?: any;
                            isBookmarked?: any;
                            summary?: any;
                            court?: any;
                            dateDecided?: any;
                            citedBy?: any;
                            precedentialValue?: any;
                            keyTopics?: any;
                          }
                        ).title}</a
                      >
                    </h3>
                    <p class="text-sm text-gray-600 font-mono">
                      {(
                        result as {
                          url?: any;
                          title?: any;
                          citation?: any;
                          relevanceScore?: any;
                          isBookmarked?: any;
                          summary?: any;
                          court?: any;
                          dateDecided?: any;
                          citedBy?: any;
                          precedentialValue?: any;
                          keyTopics?: any;
                        }
                      ).citation}
                    </p>
                  </div>
                  <div class="flex items-center space-x-2 ml-4">
                    <span
                      class={'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ' +
                        getRelevanceColor((result as any).relevanceScore ?? 0)}
                    >
                      {Math.round(((result as any).relevanceScore ?? 0) * 100)}% match
                    </span>
                    <button
                      onclick={() => saveCitation(result)}
                      class="p-1 text-gray-400 transition-colors hover:text-yellow-500"
                      class:text-yellow-500={(result as any).isBookmarked}
                    >
                      <Bookmark class="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p class="text-gray-700 text-sm mb-3 line-clamp-2">
                  {(
                    result as {
                      url?: any;
                      title?: any;
                      citation?: any;
                      relevanceScore?: any;
                      isBookmarked?: any;
                      summary?: any;
                      court?: any;
                      dateDecided?: any;
                      citedBy?: any;
                      precedentialValue?: any;
                      keyTopics?: any;
                    }
                  ).summary}
                </p>
                <div class="flex items-center justify-between text-sm">
                  <div class="flex items-center space-x-4">
                    <div class="flex items-center text-gray-500">
                      <Gavel class="h-4 w-4 mr-1" />
                      {(
                        result as {
                          url?: any;
                          title?: any;
                          citation?: any;
                          relevanceScore?: any;
                          isBookmarked?: any;
                          summary?: any;
                          court?: any;
                          dateDecided?: any;
                          citedBy?: any;
                          precedentialValue?: any;
                          keyTopics?: any;
                        }
                      ).court}
                    </div>
                    <div class="flex items-center text-gray-500">
                      <Calendar class="h-4 w-4 mr-1" />
                      {formatDate(
                        (
                          result as {
                            url?: any;
                            title?: any;
                            citation?: any;
                            relevanceScore?: any;
                            isBookmarked?: any;
                            summary?: any;
                            court?: any;
                            dateDecided?: any;
                            citedBy?: any;
                            precedentialValue?: any;
                            keyTopics?: any;
                          }
                        ).dateDecided
                      )}
                    </div>
                    <div class="flex items-center text-gray-500">
                      <Link class="h-4 w-4 mr-1" />
                      {(
                        result as {
                          url?: any;
                          title?: any;
                          citation?: any;
                          relevanceScore?: any;
                          isBookmarked?: any;
                          summary?: any;
                          court?: any;
                          dateDecided?: any;
                          citedBy?: any;
                          precedentialValue?: any;
                          keyTopics?: any;
                        }
                      ).citedBy} citations
                    </div>
                  </div>
                  <div class="flex items-center space-x-2">
                    <span
                      class={'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ' +
                        getPrecedentialColor(
                          (
                            result as {
                              url?: any;
                              title?: any;
                              citation?: any;
                              relevanceScore?: any;
                              isBookmarked?: any;
                              summary?: any;
                              court?: any;
                              dateDecided?: any;
                              citedBy?: any;
                              precedentialValue?: any;
                              keyTopics?: any;
                            }
                          ).precedentialValue
                        )}
                    >
                      {(
                        result as {
                          url?: any;
                          title?: any;
                          citation?: any;
                          relevanceScore?: any;
                          isBookmarked?: any;
                          summary?: any;
                          court?: any;
                          dateDecided?: any;
                          citedBy?: any;
                          precedentialValue?: any;
                          keyTopics?: any;
                        }
                      ).precedentialValue} Precedent
                    </span>
                    <button
                      onclick={() => openCitationDialog(result)}
                      class="inline-flex items-center px-2 py-1 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <Eye class="h-3 w-3 mr-1" />
                      View
                    </button>
                  </div>
                </div>
                <!-- Key Topics -->
                {#if (result as { url?: any; title?: any; citation?: any; relevanceScore?: any; isBookmarked?: any; summary?: any; court?: any; dateDecided?: any; citedBy?: any; precedentialValue?: any; keyTopics?: any }).keyTopics?.length > 0}
                  <div class="mt-3 pt-3 border-t border-gray-100">
                    <div class="flex flex-wrap gap-1">
                      {#each (result as { url?: any; title?: any; citation?: any; relevanceScore?: any; isBookmarked?: any; summary?: any; court?: any; dateDecided?: any; citedBy?: any; precedentialValue?: any; keyTopics?: any }).keyTopics.slice(0, 5) as topic}
                        <span
                          class="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800"
                        >
                          {topic}
                        </span>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
            <!-- Pagination -->
            {#if totalResults > 20}
              <div class="flex items-center justify-center space-x-2 mt-8">
                <button
                  onclick={() => {
                    currentPage = Math.max(1, currentPage - 1);
                    performSearch();
                  }}
                  disabled={currentPage <= 1}
                  class="px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <span class="px-3 py-2 text-sm text-gray-700">
                  Page {currentPage} of {Math.ceil(totalResults / 20)}
                </span>
                <button
                  onclick={() => {
                    currentPage = currentPage + 1;
                    performSearch();
                  }}
                  disabled={currentPage >= Math.ceil(totalResults / 20)}
                  class="px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            {/if}
          {:else if searchQuery && !isSearching}
            <div class="text-center py-12">
              <BookOpen class="mx-auto h-12 w-12 text-gray-400" />
              <h3 class="mt-2 text-sm font-medium text-gray-900">No results found</h3>
              <p class="mt-1 text-sm text-gray-500">Try adjusting your search terms or filters.</p>
            </div>
          {/if}
        </div>
      </div>
      <!-- Sidebar -->
      <div class="lg:col-span-4 space-y-6">
        <!-- Saved Citations -->
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-medium text-gray-900 flex items-center">
              <Star class="h-5 w-5 text-yellow-500 mr-2" />
              Saved Citations
            </h3>
            <span class="text-sm text-gray-500">{savedCitations.length}</span>
          </div>
          <div class="space-y-3 max-h-64 overflow-y-auto">
            {#each Array.isArray(savedCitations.slice(0, 10)) ? savedCitations.slice(0, 10) : [] as citation}
              <div class="border-l-2 border-yellow-400 pl-3 py-2">
                <h4 class="text-sm font-medium text-gray-900">{citation.title}</h4>
                <p class="text-xs text-gray-600 font-mono">{citation.citation}</p>
                <p class="text-xs text-gray-500">
                  Saved {formatDate(citation.savedAt)}
                </p>
              </div>
            {/each}
            {#if savedCitations.length === 0}
              <p class="text-sm text-gray-500 text-center py-4">No saved citations yet</p>
            {/if}
          </div>
        </div>
        <!-- Research Session -->
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-lg font-medium text-gray-900 flex items-center mb-4">
            <Clock class="h-5 w-5 text-blue-500 mr-2" />
            Research Session
          </h3>
          <div class="space-y-3">
            <div class="flex justify-between text-sm">
              <span class="text-gray-600">Started:</span>
              <span class="font-medium">{formatDate(researchSession.startTime)}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-600">Queries:</span>
              <span class="font-medium">{researchSession.queries.length}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-600">Findings:</span>
              <span class="font-medium">{savedCitations.length}</span>
            </div>
          </div>
          <!-- Recent Queries -->
          {#if researchSession.queries.length > 0}
            <div class="mt-4 pt-4 border-t border-gray-200">
              <h4 class="text-sm font-medium text-gray-900 mb-2">Recent Queries</h4>
              <div class="space-y-2 max-h-32 overflow-y-auto">
                {#each Array.isArray(researchSession.queries.slice(-5)) ? researchSession.queries.slice(-5) : [] as query}
                  <button
                    onclick={() => {
                      searchQuery = query.query;
                      performSearch();
                    }}
                    class="w-full text-left p-2 text-xs text-gray-600 hover:bg-gray-50 rounded border border-gray-200"
                  >
                    {query.query}
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>
        <!-- Related Topics -->
        {#if relatedTopics.length > 0}
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-4">Related Topics</h3>
            <div class="space-y-2">
              {#each Array.isArray(relatedTopics) ? relatedTopics : [] as topic}
                <button
                  onclick={() => {
                    searchQuery = topic;
                    performSearch();
                  }}
                  class="w-full text-left p-2 text-sm text-blue-600 hover:bg-blue-50 rounded"
                >
                  {topic}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
<!-- Citation Detail Dialog -->
<HeadlessDialog bind:open={showCitationDialog}>
  {#if selectedDocument}
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-200">
          <h2 class="text-lg font-semibold text-gray-900">{selectedDocument.title}</h2>
          <p class="text-sm text-gray-600 font-mono">{selectedDocument.fullCitation}</p>
        </div>
        <div class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span class="font-medium text-gray-700">Court:</span>
              <span class="text-gray-600">{selectedDocument.court}</span>
            </div>
            <div>
              <span class="font-medium text-gray-700">Date:</span>
              <span class="text-gray-600">{formatDate(selectedDocument.dateDecided)}</span>
            </div>
            <div>
              <span class="font-medium text-gray-700">Jurisdiction</span>
              <span class="text-gray-600">{selectedDocument.jurisdiction}</span>
            </div>
            <div>
              <span class="font-medium text-gray-700">Cited By:</span>
              <span class="text-gray-600">{selectedDocument.citedBy} cases</span>
            </div>
          </div>
          <div>
            <h4 class="font-medium text-gray-700 mb-2">Summary</h4>
            <p class="text-gray-600 text-sm">{selectedDocument.summary}</p>
          </div>
          {#if selectedDocument.keyTopics?.length > 0}
            <div>
              <h4 class="font-medium text-gray-700 mb-2">Key Topics</h4>
              <div class="flex flex-wrap gap-2">
                {#each Array.isArray(selectedDocument.keyTopics) ? selectedDocument.keyTopics : [] as topic}
                  <span
                    class="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {topic}
                  </span>
                {/each}
              </div>
            </div>
          {/if}
        </div>
        <div class="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
          <button
            onclick={() => (showCitationDialog = false)}
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
          >
            Close
          </button>
          <button
            onclick={() => {
              saveCitation(selectedDocument);
              showCitationDialog = $state(false);
            }}
            class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700"
          >
            <Bookmark class="h-4 w-4 mr-1 inline" />
            Save Citation
          </button>
          <a
            href={selectedDocument.url}
            class="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md shadow-sm hover:bg-green-700 inline-flex items-center"
          >
            <ExternalLink class="h-4 w-4 mr-1" />
            View Full Document
          </a>
        </div>
      </div>
    </div>
  {/if}
</HeadlessDialog>
