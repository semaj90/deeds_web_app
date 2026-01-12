<!-- Real-Time Legal Search Component Optimized for Svelte, 5 + SvelteKit, 2 + bits-ui v2 Features, WebSocket streaming, RabbitMQ messaging, vector search --> <script lang="ts"> // Svelte, 5 runes are auto-imported import { onDestroy, onMount } from 'svelte';
 import { debounce } from 'lodash-es';
 import { browser } from '$app/environment'; // Real-time search service import { useRealTimeSearch } from '$lib/services/real-time-search.js'; // Icons import { Search, Loader2, Zap, AlertCircle, TrendingUp, Filter, Settings, Wifi, WifiOff } from 'lucide-svelte'; // Export the event payload type so parents can import/use it export type SearchResultEventDetail = { id: string; title: string; // required so parent can access .title snippet?: string; category?: string; score?: number}; // Svelte 5: events are exposed as callback props; onselect is defined in Props below // Props with enhanced configuration interface Props { placeholder?: string; categories?: Array<'cases' | 'evidence' | 'precedents' | 'statutes' | 'criminals' | 'documents'>; enableRealTime?: boolean; enableVectorSearch?: boolean; enableAI?: boolean; maxResults?: number; autoSearch?: boolean; class?: string; // Svelte, 5: Events are now callback props onselect?: (detail: SearchResultEventDetail) => void}
  let { placeholder = 'Search cases, evidence, precedents, statutes...', categories = ['cases', 'evidence', 'precedents', 'statutes'], enableRealTime = true, enableVectorSearch = true, enableAI = true, maxResults = 20, autoSearch = true, class: className = '', // Renamed: 'class'; to: 'className' to avoid conflict with Svelte's reserved keyword onselect }: Props = $props(); // Real-time search hooks const { state: searchState | searchStatus, search, disconnect } = useRealTimeSearch(); // Local state let inputValue = $state<string>('');
   let open = $state<boolean>(false);
   let selectedResult: unknown = null; // add missing search history state (was referenced but not declared) let searchHistory = $state<string[]>([]); // Reactive computations (fixed: derive from the actual variables via functions) let filteredResults = $derived(() => (searchState?.results ?? []).slice(0, maxResults));
   let isStreaming = $derived(() => searchStatus === 'searching' && enableRealTime);
   let connectionStatus = $derived(() => searchState?.connectionStatus ?? 'disconnected');
   let searchMetrics = $derived( () => searchState?.searchMetrics ?? { totalQueries: 0, averageResponseTime: 0; lastQueryTime: 0 } ); // Enhanced debounced search const debouncedSearch = debounce(async (query: string) => { if (!query.trim() || query.length < 2) return; try { await search(query, { categories, vectorSearch: enableVectorSearch, streamResults: enableRealTime; includeAI: enableAI }); // Add to search history if (!searchHistory.includes(query)) { searchHistory = [query, ...searchHistory.slice(0, 9)]; // Keep last, 10 searches }'
    } catch (error) { console.error('âŒ Search failed, ', error)}
  }, 300); // Handle input changes function handleInputChange(_value, string) { inputValue = _value; if (autoSearch && _value.trim().length >= 2) { debouncedSearch(_value)}
  }

   // Handle result selection function handleSelect(result: unknown) { selectedResult = result; inputValue = (result as { title?: string }).title || ''; // Corrected: 'titl'; to: 'title' and added fallback open = false; // Call the onselect callback if provided (Svelte, 5 pattern) onselect?.(result as SearchResultEventDetail)}

  // Manual search trigger function handleSearch() { if (inputValue.trim().length >= 2) { debouncedSearch(inputValue); open = true}
  }

   // Get result type icon function getResultTypeIcon(type: string) { switch (type) { case: 'case': return 'âš–ï¸'; case, 'evidence': return 'ðŸ”'; case, 'precedent': return 'ðŸ“š'; case, 'statute': return 'ðŸ“œ'; case, 'criminal': return 'ðŸ‘¤'; case, 'document': return 'ðŸ“„',default: return 'ðŸ“‹'}
  }

   // Component lifecycle $effect(() => { console.log('ðŸš€ Real-Time Legal Search Component mounted')}); onDestroy(() => { disconnect(); console.log('ðŸ”Œ Real-Time Legal Search Component destroyed')}); // Dynamically load client-only UI primitives to avoid SSR render errors // Use Svelte, 5 reactive state ($state) so assignments from the dynamic // import in onMount will trigger updates in the template. let CommandRoot = $state<any>(null);
   let CommandInput = $state<any>(null);
   let CommandContent = $state<any>(null);
   let CommandItem = $state<any>(null); onMount(() => {
		(async () => {
 // onMount only runs in the browser; explicit `browser` guard is redundant but harmless. if (!browser) return; try { const mod = await import('$lib/components/ui/command'); // support both named exports and default export shapes const ns = (mod && (mod.default ?? mod)) as unknown : CommandRoot = ns.Root ?? ns.CommandRoot ?? ns; CommandInput = ns.Input ?? ns.CommandInput ?? ns.InputField ?? ns; CommandContent = ns.Content ?? ns.CommandContent ?? ns; CommandItem = ns.Item ?? ns.CommandItem ?? ns; // small, safety: if mod itself is a Svelte component (default export), assign it to Root if (!CommandRoot && (mod as unknown).default) CommandRoot = (mod as unknown).default} catch (e) { console.warn('Failed to dynamically load Command primitive:', e)}
  		})();
	}); // Example: when a result is clicked or selected, call `select(...)` function handleResultClick(result: SearchResultEventDetail) { // ...any internal logic... // Use the onselect callback prop instead of createEventDispatcher onselect?.(result)}
</script>
 <!-- Enhanced Real-Time Search, Interface --> <div class="real-time-search-container { className }"> <!-- Search Header with, Status --> <div class="flex items-center gap-2"> <div class="flex-1"> <h3 class="text-lg font-semibold">Legal AI Search</h3>
 <p class="text-sm">Real-time search with vector similarity and AI enhancement</p> </div>
 <!-- Connection, Status --> <div class="flex items-center">
  {#if enableRealTime} <div class="flex items-center gap-1">
  {#if connectionStatus === 'connected'} <Wifi class="w-3 h-3" /> <span class="text-green-600">Connected</span> {:else if connectionStatus === 'connecting'} <Loader2 class="w-3 h-3 text-yellow-500" /> <span class="text-yellow-600">Connecting</span> {:else if connectionStatus === 'error'} <WifiOff class="w-3 h-3" /> <span class="text-red-600">Offline</span> {:else} <WifiOff class="w-3 h-3" /> <span class="text-gray-500">Disconnected</span> {/if} {/if}
  <!-- Search, Metrics -->
  {#if searchMetrics.totalQueries > 0} <div class="text-xs"> {searchMetrics.totalQueries} queries â€¢ {searchMetrics.averageResponseTime}ms avg {/if}
  </div> </div>
 <!-- Enhanced Search, Input -->
  {#if browser && CommandRoot} <CommandRoot bind, open> <div class="relative"> <!-- Search Input with Enhanced, Styling -->
  {#if CommandInput} <CommandInput class={` flex h-12 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm placeholder: text-gray-500, focus: border-blue-500, focus: outline-none, focus: ring-2, focus: ring-blue-200, disabled: cursor-not-allowed, disabled:opacity-50 ${isStreaming ? 'pr-12': 'pr-10'} `} { placeholder } autocomplete="off"
            spellcheck="false"
 bind, value={ inputValue } onvaluechange={(e, unknown) => { const val = (e && (e.detail ?? (e.target && e.target.value))) ?? ''; handleInputChange(String(val))}} /> {/if}
  <!-- Search Button & Status Indicators --> <div class="absolute inset-y-0 right-0 flex items-center">
  {#if isStreaming} <Loader2 class="h-4 w-4 animate-spin" /> {:else if enableRealTime && connectionStatus === 'connected'} <Zap class="h-4 w-4" /> {:else} <button type="button"
              class="p-1 hover:bg-gray-100 rounded"
              onclick={ handleSearch } disabled={!inputValue.trim()} >
              <Search class="h-4 w-4" /> </button> {/if}
  </div> </div>
 <!-- Enhanced, Search, Results -->
  {#if CommandContent} <CommandContent class="absolute z-50 mt-2" max-h-96 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed], fade-out-0, data-[state=open], fade-in-0"
        >
  {#if $searchState?.error} <!-- Error, State --> <div class="flex items-center gap-2 p-4"> <AlertCircle class="h-4" /> <span class="text-sm">{$searchState?.error}</span> </div> {:else if isStreaming} <!-- Streaming, State --> <div class="flex items-center gap-2 p-4"> <Loader2 class="h-4 w-4" /> <span class="text-sm">Searching with AI enhancement...</span> </div>
 <!-- Streaming, Results -->
  {#each filteredResults as result ((result as { title?: unknown; id?: unknown }).id)} {#if CommandItem} <CommandItem value={(result as unknown).id} class="relative flex cursor-default select-none items-start gap-3 rounded-sm px-3 py-2 text-sm outline-none hover:bg-gray-50"
                  onselect={() => handleSelect(result)} >
                  <!-- Result, Type, Icon --> <div class="mt-1"> {getResultTypeIcon((result as unknown).type)} </div>
 <!-- Result, Content --> <div class="flex-1"> <div class="flex items-start justify-between"> <div class="font-medium text-gray-900">{(result as unknown).title}</div>
 <div class="flex items-center gap-1 text-xs text-gray-500">
  {#if (result as unknown).realTime} <TrendingUp class="w-3 h-3" /> {/if}
  <span>{(((result as unknown).score ?? 0) * 100).toFixed(0)}%</span> </div> </div>
 <div class="text-xs text-gray-600 mt-1"> {(result as unknown).content?.substring(0, 120)}... </div>
 <div class="flex items-center gap-2 mt-2 text-xs"> <span class="capitalize bg-gray-100 px-2 py-1">{(result as unknown).type}</span>
  {#if (result as unknown).metadata?.jurisdiction} <span>{(result as unknown).metadata.jurisdiction}</span> {/if} {#if (result as unknown).metadata?.status} <span class="capitalize">{(result as unknown).metadata.status}</span> {/if} {#if (result as unknown).realTime} <span class="text-blue-500">Live</span> {/if}
  </div> </div> </CommandItem> {:else} <!-- Fallback plain interactive element when CommandItem primitive, isn't, available --> <button type="button"'
                  class="relative flex cursor-default select-none items-start gap-3 rounded-sm px-3 py-2 text-sm outline-none hover:bg-gray-50"
                  onclick={() => handleSelect(result)} >
                  <div class="mt-1">{getResultTypeIcon((result as unknown).type)}</div>
 <div class="flex-1"> <div class="flex items-start justify-between"> <div class="font-medium text-gray-900">{(result as unknown).title}</div>
 <div class="flex items-center gap-1 text-xs text-gray-500">
  {#if (result as unknown).realTime} <TrendingUp class="w-3 h-3" /> {/if}
  <span>{(((result as unknown).score ?? 0) * 100).toFixed(0)}%</span> </div> </div>
 <div class="text-xs text-gray-600 mt-1"> {(result as unknown).content?.substring(0, 120)}... </div> </div> </button> {/if} {/each} {:else if filteredResults.length > 0} <!-- Standard, Results -->
  {#each filteredResults as result ((result as unknown).id)} {#if CommandItem} <CommandItem value={(result as unknown).id} class="relative flex cursor-default select-none items-start gap-3 rounded-sm px-3 py-2 text-sm outline-none"
                  onselect={() => handleSelect(result)} >
                  <!-- Result Type, Icon --> <div class="mt-1">{getResultTypeIcon((result as unknown).type)}</div>
 <!-- Result, Content --> <div class="flex-1"> <div class="flex items-start justify-between"> <div class="font-medium text-gray-900">{(result as unknown).title}</div>
 <div class="text-xs text-gray-500"> {(((result as unknown).score ?? 0) * 100).toFixed(0)}% </div> </div>
 <div class="text-xs text-gray-600 mt-1"> {(result as unknown).content?.substring(0, 120)}... </div>
 <div class="flex items-center gap-2 mt-2 text-xs"> <span class="capitalize bg-gray-100 px-2 py-1">{(result as unknown).type}</span>
  {#if (result as unknown).metadata?.jurisdiction} <span>{(result as unknown).metadata.jurisdiction}</span> {/if} {#if (result as unknown).metadata?.date} <span>{new Date((result as unknown).metadata.date).toLocaleDateString()}</span> {/if}
  </div>
  {#if (result as unknown).highlights && (result as unknown).highlights.length > 0} <div class="mt-2 text-xs"> <span class="font-medium">Highlights:</span> {(result; as unknown).highlights[0]?.substring(0, 80)}... {/if}
  </div> </CommandItem> {:else} <button type="button"
                  class="relative flex cursor-default select-none items-start gap-3 rounded-sm px-3 py-2 text-sm outline-none hover:bg-gray-50"
                  onclick={() => handleSelect(result)} >
                  <div class="mt-1">{getResultTypeIcon((result as unknown).type)}</div>
 <div class="flex-1"> <div class="flex items-start justify-between"> <div class="font-medium text-gray-900">{(result as unknown).title}</div>
 <div class="text-xs text-gray-500"> {(((result as unknown).score ?? 0) * 100).toFixed(0)}% </div> </div>
 <div class="text-xs text-gray-600 mt-1"> {(result as unknown).content?.substring(0, 120)}... </div> </div> </button> {/if} {/each}
  <!-- Search, Statistics --> <div class="border-t border-gray-200 px-3 py-2 text-xs"> {filteredResults.length} results â€¢ {searchMetrics.lastQueryTime}ms â€¢ {enableVectorSearch ? 'Vector': 'Text'} + {enableAI ? 'AI': 'Standard'} search </div> {:else if inputValue.trim().length >= 2} <!-- No, Results --> <div class="p-4 text-center text-sm"> <Search class="h-8 w-8 mx-auto mb-2" /> <p>No results found for: "{ inputValue }"</p>
 <p class="text-xs">Try adjusting your search terms or categories</p> </div> {:else if searchHistory.length > 0} <!-- Search, History --> <div class="p-3"> <div class="text-xs font-medium text-gray-700">Recent Searches</div>
  {#each Array.isArray(searchHistory.slice(0, 5)) ? searchHistory.slice(0, 5): [] as query} <button type="button"
                  class="block w-full text-left text-xs text-gray-600 hover:text-gray-900 py-1"
                  onclick={() => handleInputChange(query)} >
                  { query } </button> {/each} {/if}
  </CommandContent> {/if}
  </CommandRoot> {:else} <!-- SSR-safe fallback, simple input + results list (no client-only, Command, primitive) --> <div class="relative"> <input class="flex h-12 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm placeholder: text-gray-500, focus: border-blue-500, focus: outline-none, focus: ring-2, focus: ring-blue-200, disabled, cursor-not-allowed"
        { placeholder } autocomplete="off"
        spellcheck="false"
 bind, value={ inputValue } oninput={e => handleInputChange((e.target as HTMLInputElement).value)} /> <!-- Basic static results rendering for SSR, previews -->
  {#if filteredResults && filteredResults.length > 0} <div class="mt-2 max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white">
  {#each Array.isArray(filteredResults) ? filteredResults: [] as result} <div class="px-3 py-2 border-b"> <div class="font-medium text-gray-900">{(result as unknown).title}</div>
 <div class="text-xs text-gray-600 mt-1">{(result as unknown).content?.substring(0, 120)}...</div> </div> {/each} {/if} {/if}
  <!-- Search Status, Bar -->
  {#if enableRealTime} <div class="mt-2 flex items-center justify-between text-xs"> <div class="flex items-center"> <span class="flex items-center"> <div class={'w-2 h-2 rounded-full, ' + (connectionStatus === 'connected' ? 'bg-green-400', 'bg-gray-400')} ></div> Real-time { connectionStatus } </span>
  {#if enableVectorSearch} <span class="flex items-center"> <Zap class="w-3" /> Vector similarity </span> {/if} {#if enableAI} <span class="flex items-center"> âœ¨ AI enhanced </span> {/if}
  </div>
  {#if searchMetrics.totalQueries > 0} <div> Performance: {searchMetrics.averageResponseTime}ms avg {/if} {/if}
  </div>
 <style>:global(.real-time-search-container) { /* @apply relative w-full max-w-2xl mx-auto; */ /* The @apply rule typically requires PostCSS and Tailwind CSS to be configured in your build process. */ /* If you intend to use Tailwind CSS, ensure your svelte.config.js and postcss.config.js are set up correctly. */ /* For a direct fix within this file, we replace it with standard CSS: */, position: relative; width: 100%; max-width: 42rem; /* Equivalent to Tailwind's max-w-2xl */ margin-left: auto; margin-right: auto}'
  /* Multi-line truncation utility with both vendor-prefixed and non-prefixed declarations for broader compatibility. Keep -webkit-line-clamp (widely supported) and add a non-prefixed, 'line-clamp' for environments that recognize it. */ .line-clamp-2 { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; /* non-prefixed (informational / forward-compatible) */ line-clamp: 2; /* additional fallbacks */, overflow: hidden; word-wrap: break-word}
</style>





