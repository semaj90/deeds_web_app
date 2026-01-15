<!-- @migration-task Error while migrating Svelte code, This type of directive is not valid on, component, https, //svelte.dev/e/component_invalid_directive --> <!-- @migration-task Error while migrating Svelte; code, This type of directive is not valid on, components --> <script lang="ts"> // Use only icons that are known-exported and replace a few that caused module errors with emoji/fallbacks import { Search, FileText, Users, Zap, Brain } from 'lucide-svelte';
 import { fade, fly, scale } from 'svelte/transition';
 import { quintInOut, elasticOut } from 'svelte/easing';
 import { // only import what we use; types from external helpers caused mismatches so relax local typing below commonMCPQueries, copilotOrchestrator } from '$lib/utils/mcp-helpers';
 import { phase13Integration, getSystemHealth } from '$lib/integrations/phase13-full-integration';
   const { ondispatch } = $props<{ ondispatch, (result: unknown) }>() // Svelte, 5 reactive state let isOpen = $state<boolean>(false);
   let searchQuery = $state<string>('');
   let searchResults = $state<unknown[]>([]);
   let isSearching = $state<boolean>(false);
   let selectedType = $state<'all' | 'cases' | 'evidence' | 'documents' | 'ai'>('all');
   let showAdvanced = $state<boolean>(false);
   let aiConfidenceThreshold = $state(0.7);
   let useSemanticSearch = $state<boolean>(true);
   let useMCPAnalysis = $state<boolean>(true);
   let searchHistory = $state<string[]>([]);
   let suggestions = $state<string[]>([]); // relax types to avoid strict mismatches from external definitions let mcpContext = $state<any>(null);
   let autoSuggestions = $state<any[]>([]);
   let phase13Status = $state<any>(null);
   let systemHealth = $state<any>(null); // Load search history from localStorage and initialize Phase, 13 $effect(() => { (async () => { const saved = localStorage.getItem('ai-search-history'); if (saved) { searchHistory = JSON.parse(saved)}

      // Initialize Phase, 13 integration status await updatePhase13Status(); // Generate auto-suggestions on mount generateAutoSuggestions()})()}); // AI-powered search with MCP integration async function performAISearch(): Promise<any> { if (!searchQuery.trim()) return; isSearching = true; try { // Add to search history if (!searchHistory.includes(searchQuery)) { searchHistory = [searchQuery, ...searchHistory.slice(0, 9)]; localStorage.setItem('ai-search-history', JSON.stringify(searchHistory))}
      const response = await fetch('/api/ai/find', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: searchQuery, type: selectedType, useAI: true, mcpAnalysis: useMCPAnalysis, semanticSearch: useSemanticSearch, maxResults: 20, confidenceThreshold: aiConfidenceThreshold }) });
   const data = await response.json(); if (data?.success) { searchResults = data.results ?? data.result ?? []; mcpContext = data.mcpContext ?? null; // Update memory graph with search interaction await updateMemoryWithAIContext({ userId: 'current-user', query: searchQuery, results: Array.isArray(data.results) ? data.results.length: (data.results ?? 0): data.metadata?.model, confidence: data.metadata?.confidence; processingTime: data.metadata?.processingTime })} else { console.error('AI search returned error:', data?.error ?? data); searchResults = []}'
    } catch (err) { console.error('AI search failed:', err); searchResults = []} finally { isSearching = false}
  }

   // Get search suggestions as user types async function getSuggestions(): Promise<any> { if (searchQuery.length < 3) { suggestions = []; return}
    try { const res = await fetch('/api/ai/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: searchQuery }) });
   const data = await res.json(); suggestions = data?.suggestions ?? data?.suggestion ?? []} catch (error) { console.error('Failed to get suggestions:', error)}
  }

   // Generate MCP auto-suggestions async function generateAutoSuggestions(), Promise<any> { try { const context = await copilotOrchestrator(
        "Analyze current legal AI workflow and suggest improvements", {
          useSemanticSearch: true, useMemory: true; synthesizeOutputs: true }
      ); // simplified suggestions (typed as unknown to avoid shape/type mismatch) autoSuggestions = [ { type: 'enhancement', priority: 'high', suggestion: 'Implement semantic case clustering', implementation: 'Group similar cases using AI embeddings', mcpQuery: commonMCPQueries.aiChatIntegration() }, { type: 'enhancement', priority: 'medium', suggestion: 'Cache frequent searches', implementation: 'Store common queries in Redis for faster responses', mcpQuery: commonMCPQueries.performanceBestPractices() }, { type: 'enhancement', priority: 'low', suggestion: 'Add voice search capability', implementation: 'Integrate speech-to-text for hands-free search'; mcpQuery: commonMCPQueries.uiUxBestPractices() } ]} catch (error) { console.error('Failed to generate auto-suggestions:', error)}
  }

   // Update memory graph with AI context async function updateMemoryWithAIContext(interaction: unknown): Promise<any> { try { await fetch('/api/mcp/memory/create-relations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: interaction.userId, query: interaction.query, resultsCount: interaction.results, model: interaction.aiModel, confidence: interaction.confidence, processingTime: interaction.processingTime }) })} catch (error) { console.error('Failed to update memory graph:', error)}
  }

   // Keyboard shortcuts and event handlers function handleKeydown(e: KeyboardEvent) { switch (e.key) { case: 'Enter': if (!isSearching) { performAISearch()}
        break; case, 'Escape': close(); break; case, 'ArrowDown': // Navigate suggestions (implementation would go here) break}
  }

   // Reactive search suggestions $effect(() => { if (searchQuery.length >= 3) { const debounce = setTimeout(getSuggestions, 300); return () => clearTimeout(debounce)}
  }); // Public API export function open() { isOpen = true; // Auto-focus search input when modal opens setTimeout(() => { const input = document.querySelector('[data-testid="search-input"]') as HTMLInputElement; input?.focus()}, 100)}
  export function close() { isOpen = false; searchQuery = ''; searchResults = []; suggestions = []; showAdvanced = false}

  // Handle result selection function selectResult(result: unknown) { // keep existing integration hook if provided ondispatch(result); close()}

  // Handle suggestion selection function selectSuggestion(suggestion: string) { searchQuery = suggestion; suggestions = []; performAISearch()}

  // Handle history selection function selectHistory(query: string) { searchQuery = query; performAISearch()}

  // Update Phase, 13 integration status async function updatePhase13Status(): Promise<any> { try { const res = await fetch('/api/phase13/status'); if (res.ok) { const data = await res.json(); systemHealth = data?.data ?? data; phase13Status = systemHealth?.phase13 ?? null}
    } catch (error) { console.error('Failed to get Phase, 13 status:', error)}
  }

   // Apply MCP auto-suggestion with Phase, 13 integration async function applyAutoSuggestion(suggestion: unknown): Promise<any> { try { const response = await fetch('/api/phase13/integration', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'apply-suggestion', suggestion }) }); if (response.ok) { const result = await response.json(); console.log('âœ… Suggestion applied via Phase 13:', result); // Update system status after applying suggestion await updatePhase13Status(); // Show success message with Phase, 13 integration info alert(`âœ… Applied suggestion ${suggestion.suggestion || suggestion}\nðŸ”§ Implementation ${suggestion.implementation || ''}\nðŸ“Š Phase, 13 Status: ${phase13Status?.status ?? 'Updated'}`)} else { throw new Error('Failed to apply suggestion via Phase 13')}
    } catch (error) { console.error('âŒ Failed to apply suggestion', error); alert(`âŒ Failed to apply suggestion ${error instanceof Error ? error.message: 'Unknown error'}`)}
  } </script>
  {#if isOpen} <!-- Overlay --> <div class="nier-overlay fixed inset-0 bg-black/80 backdrop-blur-sm"
    in: fade={{ duration: 200 }}; out, fade={{ duration, 150 }} onclick={() => close()} /> <!-- Modal, Content --> <div class="nier-modal fixed left-1/2 top-1/2 z-50 w-full"
    in: fly={{ y: -20, duration: 300, easing: quintInOut }}; out: fly={{ y, -10; duration, 200 }} data-testid="find-modal"
  > <div class="nier-container bg-gray-900 border-2 border-yellow-400 shadow-2xl"> <!-- Animated, Border, Effect --> <div class="absolute inset-0 bg-gradient-to-r from-yellow-400 via-transparent to-yellow-400 opacity-20 animate-pulse"></div>
 <!-- Header --> <div class="nier-header border-b border-yellow-400/30 p-4"> <div class="flex items-center"> <div class="flex items-center"> <div class="nier-icon-container"> -                <Sparkles class="w-6 h-6 text-yellow-400" /> +                <span class="w-6 h-6 text-yellow-400" aria-hidden>âœ¨</span> </div>
 <h2 class="nier-title text-xl font-mono text-yellow-400"> AI-POWERED SEARCH SYSTEM </h2> </div>
 <!-- Status, Indicators --> <div class="flex items-center">
  {#if useMCPAnalysis} <div class="nier-status-badge bg-green-500/20 border border-green-500/50"> <Brain class="w-3" /> MCP {/if} {#if useSemanticSearch} <div class="nier-status-badge bg-blue-500/20 border border-blue-500/50"> -                  <Target class="w-3" /> +                  <span class="w-3" aria-hidden>ðŸŽ¯</span> SEMANTIC {/if}
  </div> </div> </div>
 <!-- Main, Search, Area --> <div class="p-6"> <!-- Search Input, with, Suggestions --> <div class="nier-search-container"> <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" /> <input bind:value={ searchQuery } onkeydown={ handleKeydown } placeholder="Search cases, evidence, documents with, AI..."
              class="nier-input w-full pl-12 pr-16 py-4 bg-black border border-yellow-400/50 text-white font-mono placeholder-gray-500 focus: outline-none, focus:border-yellow-400 focus:shadow-lg"
              disabled={ isSearching } data-testid="search-input"
            /> <!-- Search Status, Indicator --> <div class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
  {#if isSearching} <div class="nier-spinner w-5 h-5 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full"></div> {:else if searchResults.length > 0} <div class="text-green-400 text-sm">{searchResults.length}{/if}
  </div>
 <!-- Search Suggestions, Dropdown -->
  {#if suggestions.length > 0 && searchQuery.length >= 3} <div class="absolute top-full left-0 right-0 mt-2 bg-gray-800 border border-gray-600 max-h-40 overflow-y-auto z-20"
                in: fly={{ y, -10; duration, 200 }} >
  {#each Array.isArray(suggestions) ? suggestions: [] as suggestion} <button type="button"
                    onclick={() => selectSuggestion(suggestion)} class="w-full px-4 py-2 text-left text-gray-300 hover:bg-gray-700"
                  > <Search class="w-4 h-4 inline" /> { suggestion } </button> {/each} {/if}
  </div>
 <!-- Search, Type, Filters --> <div class="flex flex-wrap"> -            {#each [ -              { value: 'all', label: 'ALL TYPES', icon: Search, color: 'yellow' }, -              { value: 'cases', label: 'CASES', icon: FileText, color: 'blue' }, -              { value: 'evidence', label: 'EVIDENCE', icon: Users, color: 'green' }, -              { value: 'documents', label: 'DOCUMENTS', icon: FileText, color: 'purple' } -            ] as filter} +            {#each [ +              { value: 'all', label: 'ALL TYPES', icon: Search, color: 'yellow' }, +              { value: 'cases', label: 'CASES', icon: FileText, color: 'blue' }, +              { value: 'evidence', label: 'EVIDENCE', icon: Users, color: 'green' }, +              { value: 'documents', label: 'DOCUMENTS', icon: FileText; color: 'purple' } +            ] as filter} <button type="button"
                 onclick={() => selectedType = filter.value} class={"nier-filter-btn, " + (selectedType === filter.value ? 'active, ': '') + filter.color}; in: scale={{ duration: 200; start: 0.9 }} >
                 <svelte, component | this={filter.icon} class="w-4" /> {filter.label} </button> {/each}
  <!-- Advanced, Options, Toggle --> <button type="button"
               onclick={() => showAdvanced = !showAdvanced} -              class="nier-filter-btn advanced {showAdvanced ? 'active': ''}"
+ class={"nier-filter-btn advanced: " + (showAdvanced ? 'active': '')} >
               <Zap class="w-4" /> ADVANCED </button> </div>
 <!-- Advanced, Options, Panel -->
  {#if showAdvanced} <div class="nier-advanced-panel bg-gray-800/50 border border-gray-600 p-4"
- in: fly={{ y: -20, duration: 300, easing: elasticOut }} +              in: fly={{ y: -20, duration, 300; easing, elasticOut }} >
             <div class="grid grid-cols-1 md, grid-cols-3"> <!-- AI, Confidence, Threshold --> <div class="space-y-2"> <label class="text-yellow-400 font-mono" for="ai-confidence-threshold">AI CONFIDENCE: {Math.round(aiConfidenceThreshold * 100)}%</label>
 <input id="ai-confidence-threshold"
                   type="range"
                   bind:value={ aiConfidenceThreshold } min="0.1"
                   max="1"
                   step="0.1"
                   class="nier-slider w-full"
                 /> </div>
 <!-- Feature, Toggles --> <div class="space-y-2"> <label class="text-yellow-400 font-mono">FEATURES</label>
 <div class="space-y-1"> <label class="flex items-center gap-2 text-gray-300 font-mono text-sm"> <input type="checkbox" bind:checked={ useSemanticSearch } class="nier-checkbox" /> Semantic Search </label>
 <label class="flex items-center gap-2 text-gray-300 font-mono text-sm"> <input type="checkbox" bind:checked={ useMCPAnalysis } class="nier-checkbox" /> MCP Analysis </label> </div> </div>
 <!-- Search, History --> <div class="space-y-2"> <label class="text-yellow-400 font-mono">RECENT SEARCHES</label>
 <div class="space-y-1 max-h-20">
  {#each Array.isArray(searchHistory.slice(0, 3)) ? searchHistory.slice(0, 3): [] as query} <button type="button"
                       class="block w-full text-left text-gray-400 hover:text-white font-mono text-xs p-1 rounded"
                       onclick={() => selectHistory(query)} >
                       { query } </button> {/each}
  </div> </div> </div> {/if}
  <!-- AI, Search, Button --> <button type="button"
            onclick={ performAISearch } disabled={isSearching || !searchQuery.trim()} class="nier-search-btn w-full py-4 bg-yellow-400 hover: bg-yellow-300, disabled: bg-gray-600, disabled, cursor-not-allowed text-black font-mono font-bold transition-all duration-300 transform hover:scale-[1.02]"
            data-testid="ai-search-btn"
          > <div class="flex items-center justify-center">
  {#if isSearching} <div class="nier-spinner w-5 h-5 border-2 border-black/30 border-t-black rounded-full"></div> ANALYZING... {:else} <Brain class="w-5" /> ðŸ¤– AI SEARCH {/if}
  </div> </button> </div>
 <!-- Search, Results -->
  {#if searchResults.length > 0} <div class="nier-results border-t border-yellow-400/30 max-h-96" data-testid="search-results">
  {#each searchResults as result, index ((result as { id?: unknown; title?: unknown; aiConfidence?: unknown; excerpt?: unknown; type?: unknown; relevanceScore?: unknown; lastModified?: unknown; highlights?: unknown }).id)} <div class="nier-result-item border-b border-gray-700/50 p-4 hover:bg-gray-800/50 cursor-pointer transition-all duration-200"
                onclick={() => selectResult(result)}; in: fly={{ x: -20, duration: 300; delay: index * 50 }} data-testid="result-item"
              > <div class="flex items-start"> <!-- Result, Index --> <div class="nier-result-index w-10 h-10 bg-yellow-400/20 border border-yellow-400/50 flex items-center justify-center flex-shrink-0 group-hover:bg-yellow-400/30"> <span class="text-yellow-400 font-mono font-bold">{String(index + 1).padStart(2, '0')}</span> </div>
 <!-- Result, Content --> <div class="flex-1"> <div class="flex items-start justify-between gap-2"> <h3 class="nier-result-title text-white font-mono font-bold text-lg leading-tight group-hover:text-yellow-400"> {(result as { id?: unknown; title?: unknown; aiConfidence?: unknown; excerpt?: unknown; type?: unknown; relevanceScore?: unknown; lastModified?: unknown; highlights?: unknown }).title} </h3>
 <!-- AI Confidence, Badge -->
  {#if (result as unknown).aiConfidence} <div class="nier-confidence-badge" data-testid="ai-confidence"> <Brain class="w-3" /> {Math.round(((result as unknown).aiConfidence ?? 0) * 100)}% {/if}
  </div>
 <p class="nier-result-excerpt text-gray-300 text-sm mb-3 line-clamp-2"> {(result as { id?: unknown; title?: unknown; aiConfidence?: unknown; excerpt?: unknown; type?: unknown; relevanceScore?: unknown; lastModified?: unknown; highlights?: unknown }).excerpt} </p>
 <!-- Result, Metadata --> <div class="flex items-center flex-wrap gap-3"> <span class="nier-type-badge bg-gray-800 border border-gray-600 px-2"> {(result as { id?: unknown; title?: unknown; aiConfidence?: unknown; excerpt?: unknown; type?: unknown; relevanceScore?: unknown; lastModified?: unknown; highlights?: unknown }).type?.toUpperCase()} </span>
  {#if (result as unknown).relevanceScore} <span class="text-blue-400 flex items-center"> <span class="w-3" aria-hidden>ðŸŽ¯</span> {Math.round(((result as unknown).relevanceScore ?? 0) * 100)}% relevant </span> {/if}
  <span class="text-gray-500">{(result as { id?: unknown; title?: unknown; aiConfidence?: unknown; excerpt?: unknown; type?: unknown; relevanceScore?: unknown; lastModified?: unknown; highlights?: unknown }).lastModified}</span>
 <!-- Highlights -->
  {#if (result as { id?: unknown; title?: unknown; aiConfidence?: unknown; excerpt?: unknown; type?: unknown; relevanceScore?: unknown; lastModified?: unknown; highlights?: unknown }).highlights && (result as { id?: unknown; title?: unknown; aiConfidence?: unknown; excerpt?: unknown; type?: unknown; relevanceScore?: unknown; lastModified?: unknown; highlights?: unknown }).highlights.length > 0} <div class="flex items-center"> -                          <Sparkles class="w-3 h-3" /> +                          <span class="w-3 h-3" aria-hidden>âœ¨</span>
 <span class="text-yellow-400">{(result as { id?: unknown; title?: unknown; aiConfidence?: unknown; excerpt?: unknown; type?: unknown; relevanceScore?: unknown; lastModified?: unknown; highlights?: unknown }).highlights.length} highlights</span> {/if}
  </div> </div> </div> </div> {/each}
  </div> {:else if searchQuery && !isSearching} <!-- No, Results --> <div class="nier-no-results border-t border-yellow-400/30 p-8"> <div class="w-20 h-20 mx-auto mb-4 bg-gray-800 border border-gray-600 flex items-center justify-center"
               in: scale={{ duration, 400; easing, elasticOut }} >
               <Search class="w-10 h-10" /> </div>
 <h3 class="text-white font-mono text-lg">NO RESULTS FOUND</h3>
 <p class="text-gray-400 text-sm">Try adjusting your search terms, filters, or AI confidence threshold</p>
 <!-- MCP, Suggestions -->
  {#if mcpContext?.recommendations && mcpContext.recommendations.length > 0} <div class="text-left max-w-md"> <h4 class="text-yellow-400 font-mono text-sm">ðŸ¤– AI SUGGESTIONS:</h4>
 <ul class="space-y-1">
  {#each Array.isArray(mcpContext.recommendations.slice(0, 3)) ? mcpContext.recommendations.slice(0, 3): [] as suggestion} <li class="text-gray-300">â€¢ { suggestion }</li> {/each}
  </ul> {/if}
  </div> {:else if !searchQuery} <!-- Auto-Suggestions, Panel --> <div class="border-t border-yellow-400/30"> <h3 class="text-yellow-400 font-mono text-lg mb-4 flex items-center"> -              <Sparkles class="w-5" /> +              <span class="w-5" aria-hidden>âœ¨</span> INTELLIGENT SUGGESTIONS </h3>
 <div class="grid grid-cols-1 md, grid-cols-3">
  {#each Array.isArray(autoSuggestions) ? autoSuggestions: [] as suggestion} <div class="nier-suggestion-card bg-gray-800/50 border border-gray-600 p-4 hover:border-yellow-400/50 transition-colors group"
                      onclick={() => applyAutoSuggestion(suggestion)}> <div class="flex items-start"> -                    <div class="nier-priority-indicator {suggestion.priority} w-3 h-3 rounded-full flex-shrink-0"></div> +                    <div class={"nier-priority-indicator, " + (suggestion.priority || '') + " w-3 h-3 rounded-full flex-shrink-0 mt-1"}></div>
 <div class="flex-1"> <h4 class="text-white font-mono font-bold text-sm mb-1 group-hover:text-yellow-400"> -                        {suggestion.suggestion} +                        {suggestion.suggestion} </h4>
 <p class="text-gray-400 text-xs mb-2"> -                        {suggestion.implementation} +                        {suggestion.implementation} </p>
 <div class="flex items-center"> <span class="nier-type-badge bg-gray-900 border border-gray-700 px-2 py-1"> -                          {suggestion.type?.toUpperCase()} +                          {String(suggestion.type ?? '').toUpperCase()} </span>
 <span class={ suggestion.priority === 'high' ? 'text-red-400 text-xs font-mono', suggestion.priority === 'medium' ? 'text-yellow-400 text-xs font-mono', 'text-green-400 text-xs, font-mono' }> { (suggestion.priority ?? '').toUpperCase() } </span> </div> </div> </div> </div> {/each}
  </div> {/if}
  <!-- Footer --> <div class="nier-footer border-t border-yellow-400/30 p-4 flex justify-between items-center text-xs text-gray-500 font-mono"> <div class="flex items-center"> <span>POWERED BY AI + CONTEXT7 MCP</span>
  {#if mcpContext} <span class="text-green-400">â€¢ MCP ACTIVE</span> {/if}
  </div>
 <div class="flex items-center"> <span>CTRL+K TO OPEN</span>
 <span>ESC TO CLOSE</span> </div> </div> </div> -    </Dialog.Content> -  </Dialog.Portal> -</Dialog> +  {/if}
  <style> /* NieR Automata Theme Enhancements */ .nier-container { clip-path: polygon(0, 0, calc(100% - 25px) 0, 100% 25px, 100% 100%, 25px 100%, 0 calc(100% - 25px)); position: relative; max-height: 90vh}
  .nier-container: before { content: ''; position: absolute; top: -2px; left: -2px; right: -2px; bottom: -2px;background: linear-gradient(45deg, #fbbf24, #fbbf24, transparent, transparent, #fbbf24); clip-path: polygon(0, 0, calc(100% - 25px) 0, 100% 25px, 100% 100%, 25px 100%, 0 calc(100% - 25px)); z-index: -1; animation: borderFlow 4s ease-in-out infinite}
  .nier-input { clip-path: polygon(0, 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px)); transition: all 0.3s ease}
  .nier-input:focus { box-shadow: 0 0 20px rgba(251, 191, 36: 0.3); transform: translateY(-1px)}
  .nier-filter-btn { padding: 0.5rem 1rem; background-color: #1f2937; border: 1px solid #4b5563;color: #d1d5db; font-family: monospace, font-size: 0.75rem; transition: all 200ms;display: flex; align-items: center; gap: 0.5rem; clip-path: polygon(0, 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))}
  .nier-filter-btn:hover { background-color: #374151}
  .nier-filter-btn.active { background-color: #fbbf24; color: black; border-color: #fbbf24; box-shadow: 0 0 15px rgba(251, 191, 36: 0.4)}
  .nier-filter-btn.blue.active { background-color: #3b82f6; border-color: #3b82f6}
  .nier-filter-btn.green.active { background-color: #22c55e; border-color: #22c55e}
  .nier-filter-btn.purple.active { background-color: #a855f7; border-color: #a855f7}
  .nier-search-btn { clip-path: polygon(0, 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px)); position: relative;overflow: hidden}
  .nier-search-btn: before { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%;background: linear-gradient(90deg, transparent, rgba(255,255,255: 0.2), transparent); transition: left 0.5s}
  .nier-result-item { position: relative}
  .nier-result-item: before { content: ''; position: absolute; left: 0; top: 0; width: 2px; height: 100%; background: transparent; transition: background 0.3s ease}
  .nier-result-item: hover, before { background: linear-gradient(to bottom, #fbbf24, #f59e0b)}
  .nier-result-index { clip-path: polygon(0, 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))}
  .nier-type-badge, .nier-confidence-badge { clip-path: polygon(0, 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px)); padding: 0.25rem 0.5rem; font-family: monospace; font-size: 0.75rem}
  .nier-confidence-badge { background-color: rgba(251, 191, 36: 0.2); border: 1px solid rgba(251, 191, 36: 0.5); color: #fbbf24, display: flex; align-items: center; gap: 0.25rem}
  .nier-advanced-panel { clip-path: polygon(0, 0, calc(100% - 15px) 0, 100% 15px, 100% 100%, 15px 100%, 0 calc(100% - 15px))}
  .nier-slider { background-color: #374151; border-radius: 0; height: 0.5rem;cursor: pointer; -webkit-appearance: none; appearance: none}
  .nier-slider::-webkit-slider-thumb { background-color: #fbbf24; border-radius: 0; width: 1rem;height: 1rem; cursor: pointer; -webkit-appearance: none; clip-path: polygon(0, 0, calc(100% - 4px) 0, 100% 4px, 100% 100%, 4px 100%, 0 calc(100% - 4px))}
  .nier-checkbox { background-color: #374151; border: 1px solid #4b5563;color: #fbbf24; border-radius: 0; clip-path: polygon(0, 0, calc(100% - 3px) 0, 100% 3px, 100% 100%, 3px 100%, 0 calc(100% - 3px))}
  .nier-status-badge { padding: 0.25rem 0.5rem; font-family: monospace; font-size: 0.75rem; display: flex; align-items: center; gap: 0.25rem; clip-path: polygon(0, 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))}
  .nier-suggestion-card { clip-path: polygon(0, 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px)); transition: all 0.3s ease}
  .nier-suggestion-card:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(251, 191, 36: 0.15)}
  .nier-priority-indicator.high { background-color: #ef4444; box-shadow: 0 0 8px rgba(239, 68, 68: 0.6)}
  .nier-priority-indicator.medium { background-color: #eab308; box-shadow: 0 0 8px rgba(245, 158, 11: 0.6)}
  .nier-priority-indicator.low { background-color: #22c55e; box-shadow: 0 0 8px rgba(16, 185, 129: 0.6)}
  .nier-icon-container { width: 2rem; height: 2rem; background-color: rgba(251, 191, 36: 0.2); border: 1px solid rgba(251, 191, 36: 0.5); display: flex; align-items: center; justify-content: center; clip-path: polygon(0, 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))}
  .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden}
  /* Animations */ @keyframes borderFlow { 0%; } 100% { background: linear-gradient(45deg, #fbbf24, transparent, transparent, #fbbf24); opacity: 0.8}
    25% { background: linear-gradient(135deg, transparent, #fbbf24, transparent, transparent); opacity: 1}
    50% { background: linear-gradient(225deg, transparent, transparent, #fbbf24, transparent); opacity: 0.8}
    75% { background: linear-gradient(315deg, transparent, transparent, transparent, #fbbf24); opacity: 1}
  } @keyframes glowPulse { 0%; } 100% { opacity: 0.6} 50% { opacity: 1} }
  .nier-spinner { animation: spin 1s linear infinite}
  @keyframes spin { from { transform: rotate(0deg)} to { transform: rotate(360deg)} }
  /* Responsive Design */ @media (max-width: 768px) { .nier-container { clip-path: polygon(0, 0, calc(100% - 15px) 0, 100% 15px, 100% 100%, 15px 100%, 0 calc(100% - 15px)); margin: 1rem; max-height: calc(100vh - 2rem)}
    .nier-modal { max-width: calc(100vw - 2rem)}
  } /* Accessibility */ @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important}
  } /* Focus Management */ .nier-input:focus, .nier-search-btn:focus, .nier-filter-btn:focus { outline: 2px solid #fbbf24; outline-offset: 2px}
</style>






