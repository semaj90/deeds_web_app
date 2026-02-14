<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import { quintInOut, elasticOut } from 'svelte/easing';
  import Search from '@lucide/svelte/icons/search';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import FileText from '@lucide/svelte/icons/file-text';
  import Users from '@lucide/svelte/icons/users';
  import Calendar from '@lucide/svelte/icons/calendar';
  import Zap from '@lucide/svelte/icons/zap';
  import Brain from '@lucide/svelte/icons/brain';
  import Target from '@lucide/svelte/icons/target';
  import {
    commonMCPQueries,
    copilotOrchestrator,
    type MCPContextAnalysis,
    type AutoMCPSuggestion
  } from '$lib/utils/mcp-helpers';
  import { phase13Integration, getSystemHealth } from '$lib/integrations/phase13-full-integration';

  // Props
  interface Props {
    onSelect?: (result: any) => void;
  }

  let { onSelect = () => {} }: Props = $props();

  // Svelte 5 reactive state
  let isOpen = $state(false);
  let searchQuery = $state('');
  let searchResults = $state<unknown[]>([]);
  let isSearching = $state(false);
  let selectedType = $state<'all' | 'cases' | 'evidence' | 'documents' | 'ai'>('all');
  let showAdvanced = $state(false);
  let aiConfidenceThreshold = $state(0.7);
  let useSemanticSearch = $state(true);
  let useMCPAnalysis = $state(true);
  let searchHistory = $state<string[]>([]);
  let suggestions = $state<string[]>([]);
  let mcpContext = $state<MCPContextAnalysis | null>(null);
  let autoSuggestions = $state<AutoMCPSuggestion[]>([]);
  let phase13Status = $state<any>(null);
  let systemHealth = $state<any>(null);

  // Load search history from localStorage and initialize Phase 13
  onMount(async () => {
    const saved = localStorage.getItem('ai-search-history');
    if (saved) {
      searchHistory = JSON.parse(saved);
    }

    await updatePhase13Status();
    generateAutoSuggestions();
  });

  // AI-powered search with MCP integration
  async function performAISearch() {
    if (!searchQuery.trim()) return;

    isSearching = true;

    try {
      if (!searchHistory.includes(searchQuery)) {
        searchHistory = [searchQuery, ...searchHistory.slice(0, 9)];
        localStorage.setItem('ai-search-history', JSON.stringify(searchHistory));
      }

      const response = await fetch('/api/ai/find', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          type: selectedType,
          useAI: true,
          mcpAnalysis: useMCPAnalysis,
          semanticSearch: useSemanticSearch,
          maxResults: 20,
          confidenceThreshold: aiConfidenceThreshold
        })
      });

      const data = await response.json();

      if (data.success) {
        searchResults = data.results;
        mcpContext = data.mcpContext;

        await updateMemoryWithAIContext({
          userId: 'current-user',
          query: searchQuery,
          results: data.results.length,
          aiModel: data.metadata?.model,
          confidence: data.metadata?.confidence,
          processingTime: data.metadata?.processingTime
        });
      } else {
        console.error('Search failed:', data.error);
        searchResults = [];
      }
    } catch (error) {
      console.error('AI search failed:', error);
      searchResults = [];
    } finally {
      isSearching = false;
    }
  }

  async function getSuggestions() {
    if (searchQuery.length < 3) {
      suggestions = [];
      return;
    }

    try {
      const response = await fetch(`/api/ai/find?q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      if (data.success) {
        suggestions = data.suggestions;
      }
    } catch (error) {
      console.error('Failed to get suggestions:', error);
    }
  }

  async function generateAutoSuggestions() {
    try {
      await copilotOrchestrator(
        "Analyze current legal AI workflow and suggest improvements",
        { useSemanticSearch: true, useMemory: true, synthesizeOutputs: true }
      );

      autoSuggestions = [
        {
          type: 'ai-integration',
          priority: 'high',
          suggestion: 'Implement semantic case clustering',
          implementation: 'Group similar cases using AI embeddings',
          mcpQuery: commonMCPQueries.aiChatIntegration()
        },
        {
          type: 'performance',
          priority: 'medium',
          suggestion: 'Cache frequent searches',
          implementation: 'Store common queries in Redis for faster responses',
          mcpQuery: commonMCPQueries.performanceBestPractices()
        },
        {
          type: 'ui-enhancement',
          priority: 'low',
          suggestion: 'Add voice search capability',
          implementation: 'Integrate speech-to-text for hands-free search',
          mcpQuery: commonMCPQueries.uiUxBestPractices()
        }
      ];
    } catch (error) {
      console.error('Failed to generate auto-suggestions:', error);
    }
  }

  async function updateMemoryWithAIContext(interaction: any) {
    try {
      await fetch('/api/mcp/memory/create-relations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: interaction.userId,
          target: `search:${interaction.query}`,
          relationType: 'ai-search',
          properties: {
            timestamp: new Date().toISOString(),
            resultsCount: interaction.results,
            model: interaction.aiModel,
            confidence: interaction.confidence,
            processingTime: interaction.processingTime
          }
        })
      });
    } catch (error) {
      console.error('Failed to update memory graph:', error);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'Enter':
        if (!isSearching) performAISearch();
        break;
      case 'Escape':
        close();
        break;
    }
  }

  $effect(() => {
    if (searchQuery.length >= 3) {
      const debounce = setTimeout(getSuggestions, 300);
      return () => clearTimeout(debounce);
    }
  });

  export function open() {
    isOpen = true;
    setTimeout(() => {
      const input = document.querySelector('[data-testid="search-input"]') as HTMLInputElement;
      input?.focus();
    }, 100);
  }

  export function close() {
    isOpen = false;
    searchQuery = '';
    searchResults = [];
    suggestions = [];
    showAdvanced = false;
  }

  function selectResult(result: any) {
    onSelect?.(result);
    close();
  }

  function selectSuggestion(suggestion: string) {
    searchQuery = suggestion;
    suggestions = [];
    performAISearch();
  }

  function selectHistory(query: string) {
    searchQuery = query;
    performAISearch();
  }

  async function updatePhase13Status() {
    try {
      const response = await fetch('/api/phase13/integration?action=health');
      if (response.ok) {
        const data = await response.json();
        systemHealth = data.data;
        phase13Status = systemHealth.phase13;
      }
    } catch (error) {
      console.error('Failed to get Phase 13 status:', error);
    }
  }

  async function applyAutoSuggestion(suggestion: AutoMCPSuggestion) {
    try {
      const response = await fetch('/api/phase13/integration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply-suggestion', suggestion })
      });

      if (response.ok) {
        await updatePhase13Status();
        alert(`Applied: ${suggestion.suggestion}\n${suggestion.implementation}`);
      } else {
        throw new Error('Failed to apply suggestion');
      }
    } catch (error) {
      console.error('Failed to apply suggestion:', error);
    }
  }
</script>

{#if isOpen}
  <!-- Overlay -->
  <div
    class="nier-overlay fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
    transition:fade={{ duration: 200 }}
    onclick={close}
    role="presentation"
  ></div>

  <!-- Modal Content -->
  <div
    class="fixed left-1/2 top-1/2 z-50 w-full max-w-4xl -translate-x-1/2 -translate-y-1/2"
    transition:fly={{ y: -20, duration: 300, easing: quintInOut }}
    data-testid="find-modal"
    role="dialog"
    aria-modal="true"
  >
    <div class="nier-container bg-gray-900 border-2 border-yellow-400 shadow-2xl overflow-hidden">

      <div class="absolute inset-0 bg-gradient-to-r from-yellow-400 via-transparent to-yellow-400 opacity-20 animate-pulse pointer-events-none"></div>

      <!-- Header -->
      <div class="border-b border-yellow-400/30 p-4 relative">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="nier-icon-container">
              <Sparkles class="w-6 h-6 text-yellow-400 animate-pulse" />
            </div>
            <h2 class="text-xl font-mono text-yellow-400 tracking-wider">
              AI-POWERED SEARCH SYSTEM
            </h2>
          </div>

          <div class="flex items-center gap-2">
            {#if useMCPAnalysis}
              <div class="nier-status-badge bg-green-500/20 border border-green-500/50 text-green-400">
                <Brain class="w-3 h-3" />
                MCP
              </div>
            {/if}
            {#if useSemanticSearch}
              <div class="nier-status-badge bg-blue-500/20 border border-blue-500/50 text-blue-400">
                <Target class="w-3 h-3" />
                SEMANTIC
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Main Search Area -->
      <div class="p-6 space-y-4">
        <div class="relative">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 z-10" />
          <input
            bind:value={searchQuery}
            onkeydown={handleKeydown}
            placeholder="Search cases, evidence, documents with AI..."
            class="nier-input w-full pl-12 pr-16 py-4 bg-black border border-yellow-400/50 text-white font-mono placeholder-gray-500 focus:outline-none focus:border-yellow-400 focus:shadow-lg focus:shadow-yellow-400/20 transition-all duration-300"
            disabled={isSearching}
            data-testid="search-input"
          />

          <div class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {#if isSearching}
              <div class="w-5 h-5 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin"></div>
            {:else if searchResults.length > 0}
              <div class="text-green-400 text-sm font-mono">{searchResults.length}</div>
            {/if}
          </div>

          {#if suggestions.length > 0 && searchQuery.length >= 3}
            <div
              class="absolute top-full left-0 right-0 mt-2 bg-gray-800 border border-gray-600 max-h-40 overflow-y-auto z-20"
              transition:fly={{ y: -10, duration: 200 }}
            >
              {#each suggestions as suggestion}
                <button
                  class="w-full px-4 py-2 text-left text-gray-300 hover:bg-gray-700 hover:text-white font-mono text-sm transition-colors"
                  onclick={() => selectSuggestion(suggestion)}
                >
                  <Search class="w-4 h-4 inline mr-2" />
                  {suggestion}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Search Type Filters -->
        <div class="flex flex-wrap gap-2">
          {#each [
            { value: 'all', label: 'ALL TYPES', icon: Search, color: 'yellow' },
            { value: 'cases', label: 'CASES', icon: FileText, color: 'blue' },
            { value: 'evidence', label: 'EVIDENCE', icon: Users, color: 'green' },
            { value: 'documents', label: 'DOCUMENTS', icon: Calendar, color: 'purple' }
          ] as filter}
            <button
              onclick={() => selectedType = filter.value}
              class="nier-filter-btn {selectedType === filter.value ? 'active' : ''} {filter.color}"
            >
              <svelte:component this={filter.icon} class="w-4 h-4" />
              {filter.label}
            </button>
          {/each}

          <button
            onclick={() => showAdvanced = !showAdvanced}
            class="nier-filter-btn advanced {showAdvanced ? 'active' : ''}"
          >
            <Zap class="w-4 h-4" />
            ADVANCED
          </button>
        </div>

        <!-- Advanced Options Panel -->
        {#if showAdvanced}
          <div
            class="nier-advanced-panel bg-gray-800/50 border border-gray-600 p-4 space-y-3"
            transition:fly={{ y: -20, duration: 300, easing: elasticOut }}
          >
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="space-y-2">
                <label class="text-yellow-400 font-mono text-sm">AI CONFIDENCE: {Math.round(aiConfidenceThreshold * 100)}%</label>
                <input
                  type="range"
                  bind:value={aiConfidenceThreshold}
                  min="0.1"
                  max="1"
                  step="0.1"
                  class="nier-slider w-full"
                />
              </div>

              <div class="space-y-2">
                <label class="text-yellow-400 font-mono text-sm">FEATURES</label>
                <div class="space-y-1">
                  <label class="flex items-center gap-2 text-gray-300 font-mono text-sm cursor-pointer">
                    <input type="checkbox" bind:checked={useSemanticSearch} class="nier-checkbox" />
                    Semantic Search
                  </label>
                  <label class="flex items-center gap-2 text-gray-300 font-mono text-sm cursor-pointer">
                    <input type="checkbox" bind:checked={useMCPAnalysis} class="nier-checkbox" />
                    MCP Analysis
                  </label>
                </div>
              </div>

              <div class="space-y-2">
                <label class="text-yellow-400 font-mono text-sm">RECENT SEARCHES</label>
                <div class="space-y-1 max-h-20 overflow-y-auto">
                  {#each searchHistory.slice(0, 3) as query}
                    <button
                      class="block w-full text-left text-gray-400 hover:text-white font-mono text-xs p-1 rounded hover:bg-gray-700 transition-colors"
                      onclick={() => selectHistory(query)}
                    >
                      {query}
                    </button>
                  {/each}
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- AI Search Button -->
        <button
          onclick={performAISearch}
          disabled={isSearching || !searchQuery.trim()}
          class="nier-search-btn w-full py-4 bg-yellow-400 hover:bg-yellow-300 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-mono font-bold transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
          data-testid="ai-search-btn"
        >
          <div class="flex items-center justify-center gap-3">
            {#if isSearching}
              <div class="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
              ANALYZING...
            {:else}
              <Brain class="w-5 h-5" />
              AI SEARCH
            {/if}
          </div>
        </button>
      </div>

      <!-- Search Results -->
      {#if searchResults.length > 0}
        <div class="border-t border-yellow-400/30 max-h-96 overflow-y-auto" data-testid="search-results">
          {#each searchResults as result, index (result.id)}
            <div
              class="nier-result-item border-b border-gray-700/50 p-4 hover:bg-gray-800/50 cursor-pointer transition-all duration-200 group"
              onclick={() => selectResult(result)}
              role="button"
              tabindex="0"
              onkeydown={(e) => e.key === 'Enter' && selectResult(result)}
              transition:fly={{ x: -20, duration: 300, delay: index * 50 }}
              data-testid="result-item"
            >
              <div class="flex items-start gap-4">
                <div class="nier-result-index w-10 h-10 bg-yellow-400/20 border border-yellow-400/50 flex items-center justify-center flex-shrink-0 group-hover:bg-yellow-400/30 transition-colors">
                  <span class="text-yellow-400 font-mono font-bold text-sm">{String(index + 1).padStart(2, '0')}</span>
                </div>

                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between gap-2 mb-2">
                    <h3 class="text-white font-mono font-bold text-lg leading-tight group-hover:text-yellow-400 transition-colors">
                      {result.title}
                    </h3>

                    {#if result.aiConfidence}
                      <div class="nier-confidence-badge flex-shrink-0" data-testid="ai-confidence">
                        <Brain class="w-3 h-3" />
                        {Math.round(result.aiConfidence * 100)}%
                      </div>
                    {/if}
                  </div>

                  <p class="text-gray-300 text-sm mb-3 line-clamp-2 leading-relaxed">
                    {result.excerpt}
                  </p>

                  <div class="flex items-center flex-wrap gap-3 text-xs">
                    <span class="nier-type-badge bg-gray-800 border border-gray-600 px-2 py-1">
                      {result.type?.toUpperCase()}
                    </span>

                    {#if result.relevanceScore}
                      <span class="text-blue-400 flex items-center gap-1">
                        <Target class="w-3 h-3" />
                        {Math.round(result.relevanceScore * 100)}% relevant
                      </span>
                    {/if}

                    <span class="text-gray-500">{result.lastModified}</span>

                    {#if result.highlights && result.highlights.length > 0}
                      <div class="flex items-center gap-1">
                        <Sparkles class="w-3 h-3 text-yellow-400" />
                        <span class="text-yellow-400">{result.highlights.length} highlights</span>
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>

      {:else if searchQuery && !isSearching}
        <div class="border-t border-yellow-400/30 p-8 text-center">
          <div
            class="w-20 h-20 mx-auto mb-4 bg-gray-800 border border-gray-600 flex items-center justify-center"
            transition:scale={{ duration: 400, easing: elasticOut }}
          >
            <Search class="w-10 h-10 text-gray-500" />
          </div>
          <h3 class="text-white font-mono text-lg mb-2">NO RESULTS FOUND</h3>
          <p class="text-gray-400 text-sm mb-4">Try adjusting your search terms, filters, or AI confidence threshold</p>

          {#if mcpContext?.recommendations && mcpContext.recommendations.length > 0}
            <div class="text-left max-w-md mx-auto">
              <h4 class="text-yellow-400 font-mono text-sm mb-2">AI SUGGESTIONS:</h4>
              <ul class="space-y-1">
                {#each mcpContext.recommendations.slice(0, 3) as suggestion}
                  <li class="text-gray-300 text-sm">{suggestion}</li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>

      {:else if !searchQuery}
        <div class="border-t border-yellow-400/30 p-6">
          <h3 class="text-yellow-400 font-mono text-lg mb-4 flex items-center gap-2">
            <Sparkles class="w-5 h-5" />
            INTELLIGENT SUGGESTIONS
          </h3>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            {#each autoSuggestions as suggestion}
              <div
                class="nier-suggestion-card bg-gray-800/50 border border-gray-600 p-4 hover:border-yellow-400/50 transition-colors group cursor-pointer"
                onclick={() => applyAutoSuggestion(suggestion)}
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === 'Enter' && applyAutoSuggestion(suggestion)}
              >
                <div class="flex items-start gap-3">
                  <div class="nier-priority-indicator {suggestion.priority} w-3 h-3 rounded-full flex-shrink-0 mt-1"></div>
                  <div class="flex-1">
                    <h4 class="text-white font-mono font-bold text-sm mb-1 group-hover:text-yellow-400 transition-colors">
                      {suggestion.suggestion}
                    </h4>
                    <p class="text-gray-400 text-xs mb-2 leading-relaxed">
                      {suggestion.implementation}
                    </p>
                    <div class="flex items-center gap-2">
                      <span class="nier-type-badge bg-gray-900 border border-gray-700 px-2 py-1 text-xs">
                        {suggestion.type.replace('-', ' ').toUpperCase()}
                      </span>
                      <span class="text-xs font-mono {suggestion.priority === 'high' ? 'text-red-400' : suggestion.priority === 'medium' ? 'text-yellow-400' : 'text-green-400'}">
                        {suggestion.priority.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Footer -->
      <div class="border-t border-yellow-400/30 p-4 flex justify-between items-center text-xs text-gray-500 font-mono bg-gray-900/50">
        <div class="flex items-center gap-4">
          <span>POWERED BY AI + CONTEXT7 MCP</span>
          {#if mcpContext}
            <span class="text-green-400">MCP ACTIVE</span>
          {/if}
        </div>
        <div class="flex items-center gap-4">
          <span>CTRL+K TO OPEN</span>
          <span>ESC TO CLOSE</span>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .nier-container {
    clip-path: polygon(0 0, calc(100% - 25px) 0, 100% 25px, 100% 100%, 25px 100%, 0 calc(100% - 25px));
    position: relative;
    max-height: 90vh;
  }

  .nier-container::before {
    content: '';
    position: absolute;
    top: -2px;
    left: -2px;
    right: -2px;
    bottom: -2px;
    background: linear-gradient(45deg, #fbbf24, #fbbf24, transparent, transparent, #fbbf24);
    clip-path: polygon(0 0, calc(100% - 25px) 0, 100% 25px, 100% 100%, 25px 100%, 0 calc(100% - 25px));
    z-index: -1;
    animation: borderFlow 4s ease-in-out infinite;
  }

  .nier-input {
    clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
    transition: all 0.3s ease;
  }

  .nier-input:focus {
    box-shadow: 0 0 20px rgba(251, 191, 36, 0.3);
    transform: translateY(-1px);
  }

  .nier-filter-btn {
    padding: 0.5rem 1rem;
    background: rgb(31 41 55);
    border: 1px solid rgb(75 85 99);
    color: rgb(209 213 219);
    font-family: monospace;
    font-size: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: all 0.2s;
    clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px));
  }

  .nier-filter-btn:hover { background: rgb(55 65 81); }

  .nier-filter-btn.active {
    background: #fbbf24;
    color: black;
    border-color: #fbbf24;
    box-shadow: 0 0 15px rgba(251, 191, 36, 0.4);
  }

  .nier-filter-btn.blue.active { background: rgb(59 130 246); border-color: rgb(59 130 246); }
  .nier-filter-btn.green.active { background: rgb(34 197 94); border-color: rgb(34 197 94); }
  .nier-filter-btn.purple.active { background: rgb(168 85 247); border-color: rgb(168 85 247); }

  .nier-search-btn {
    clip-path: polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px));
    position: relative;
    overflow: hidden;
  }

  .nier-search-btn::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
    transition: left 0.5s;
  }

  .nier-search-btn:hover::before { left: 100%; }

  .nier-result-item { position: relative; }

  .nier-result-item::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    width: 2px;
    height: 100%;
    background: transparent;
    transition: background 0.3s ease;
  }

  .nier-result-item:hover::before {
    background: linear-gradient(to bottom, #fbbf24, #f59e0b);
  }

  .nier-result-index {
    clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px));
  }

  .nier-type-badge,
  .nier-confidence-badge {
    clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px));
    padding: 0.25rem 0.5rem;
    font-family: monospace;
    font-size: 0.75rem;
  }

  .nier-confidence-badge {
    background: rgba(251, 191, 36, 0.2);
    border: 1px solid rgba(251, 191, 36, 0.5);
    color: #fbbf24;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .nier-advanced-panel {
    clip-path: polygon(0 0, calc(100% - 15px) 0, 100% 15px, 100% 100%, 15px 100%, 0 calc(100% - 15px));
  }

  .nier-slider {
    background: rgb(55 65 81);
    height: 0.5rem;
    cursor: pointer;
    -webkit-appearance: none;
  }

  .nier-slider::-webkit-slider-thumb {
    background: #fbbf24;
    width: 1rem;
    height: 1rem;
    cursor: pointer;
    -webkit-appearance: none;
    clip-path: polygon(0 0, calc(100% - 4px) 0, 100% 4px, 100% 100%, 4px 100%, 0 calc(100% - 4px));
  }

  .nier-status-badge {
    padding: 0.25rem 0.5rem;
    font-family: monospace;
    font-size: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px));
  }

  .nier-suggestion-card {
    clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
    transition: all 0.3s ease;
  }

  .nier-suggestion-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(251, 191, 36, 0.15);
  }

  .nier-priority-indicator.high { background: rgb(239 68 68); box-shadow: 0 0 8px rgba(239, 68, 68, 0.6); }
  .nier-priority-indicator.medium { background: rgb(245 158 11); box-shadow: 0 0 8px rgba(245, 158, 11, 0.6); }
  .nier-priority-indicator.low { background: rgb(16 185 129); box-shadow: 0 0 8px rgba(16, 185, 129, 0.6); }

  .nier-icon-container {
    width: 2rem;
    height: 2rem;
    background: rgba(251, 191, 36, 0.2);
    border: 1px solid rgba(251, 191, 36, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px));
  }

  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  @keyframes borderFlow {
    0%, 100% { background: linear-gradient(45deg, #fbbf24, transparent, transparent, #fbbf24); opacity: 0.8; }
    25% { background: linear-gradient(135deg, transparent, #fbbf24, transparent, transparent); opacity: 1; }
    50% { background: linear-gradient(225deg, transparent, transparent, #fbbf24, transparent); opacity: 0.8; }
    75% { background: linear-gradient(315deg, transparent, transparent, transparent, #fbbf24); opacity: 1; }
  }

  @media (max-width: 768px) {
    .nier-container {
      clip-path: polygon(0 0, calc(100% - 15px) 0, 100% 15px, 100% 100%, 15px 100%, 0 calc(100% - 15px));
      margin: 1rem;
      max-height: calc(100vh - 2rem);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .nier-container, .nier-container * {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }

  .nier-input:focus, .nier-search-btn:focus, .nier-filter-btn:focus {
    outline: 2px solid #fbbf24;
    outline-offset: 2px;
  }
</style>
