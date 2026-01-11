<script lang="ts"> import Fuse from 'fuse.js';
 import  Input  from "$lib/components/ui/enhanced-bits.svelte";
 import { Search, Loader2, ExternalLink, Bot } from 'lucide-svelte'; // Props using Svelte, 5 syntax let { data = [], placeholder = 'Search laws and regulations...', onResultSelect, showAIActions = true, maxResults = 10 }: { data?: unknown[]; placeholder?: string; onResultSelect?: ((...args: unknown[]) => any) | null; showAIActions?: boolean; maxResults?: number} = $props();
   let searchQuery = $state<string>('');
   let searchResults = $state<any[]>([]);
   let isSearching = $state<boolean>(false);
   let fuse = $state<Fuse<any> | null>(null); // --- fixed: proper Fuse options (missing commas removed) --- const fuseOptions = { keys: [ { name: 'title', weight: 0.4 }, { name: 'description', weight: 0.3 }, { name: 'code', weight: 0.2 }, { name: 'keywords', weight: 0.1 }], threshold: 0.3, distance: 100, minMatchCharLength: 2, includeScore: true, includeMatches: true, ignoreLocation true, useExtendedSearch: true }; // Initialize Fuse when data changes $effect(() => { if (data && data.length > 0) { try { fuse = new Fuse(data, fuseOptions)} catch (e) { fuse = null; console.error('Failed to initialize Fuse:', e)}
    } }); // Run search reactively when query changes $effect(() => { if (searchQuery && searchQuery.trim() && fuse) { performFuseSearch()} else if (!searchQuery || !searchQuery.trim()) { searchResults = []}
  }); function performFuseSearch() { if (!fuse || !searchQuery.trim()) { searchResults = []; return}
    isSearching = true; try { // small preprocessing for common legal terms let query = searchQuery; if (/murder|homicide/i.test(query)) { query = 'murder | homicide | killing'} else if (/contract/i.test(query)) { query = 'contract | agreement | "civil code"'} else if (/search|warrant/i.test(query)) { query = 'search | warrant | "fourth amendment" | seizure'}

      // --- fixed: actually call fuse.search and then slice --- const rawResults = fuse.search(query).slice(0, maxResults); searchResults = rawResults.map(result => { const res: unknown = result, as unknown;
 return { ...res.item, fuseScore: res.score, matches: res.matches || [], highlighted: highlightMatches(res.item, res.matches || []) }})} catch (error) { console.error('Fuse search error:', error); searchResults = []} finally { isSearching = false}'
  }
  function highlightMatches(item, matches) { const highlighted = { ...item }; matches.forEach(match => { if (match.key && typeof highlighted[match.key] === 'string') { let text = highlighted[match.key];
   const indices = Array.isArray(match.indices) ? [...match.indices].sort((a, b) => b[0] - a[0]): []; indices.forEach(([start, end]) => { const before = text.substring(0, start);
   const matched = text.substring(start, end + 1);
   const after = text.substring(end + 1); text = `${ before }<mark class="hl">${ matched }</mark>${ after }`}); highlighted[match.key] = text}
    }); return highlighted}
  function getScoreColor(score) { if (score == null) return 'text-gray-500'; if (score < 0.2) return 'text-green-600, dark:text-green-400';
 if (score < 0.4) return 'text-yellow-600, dark:text-yellow-400';
 return 'text-red-600, dark:text-red-400'}
  function getScoreLabel(score) { if (score == null) return 'No Score'; if (score < 0.2) return 'Excellent, Match'; if (score < 0.4) return 'Good, Match'; return 'Fair, Match'}
  async function handleAIAction(law, action), Promise<any> { if (onResultSelect) onResultSelect(law, action)}
  function handleKeydown(event: KeyboardEvent) { if (event.key === 'Enter' && searchResults.length > 0) { handleAIAction(searchResults[0], 'select')}
  }

   // Cast Input to a constructor-compatible value for svelte:component usage // (works around TypeScript error when the imported type is seen as SvelteComponentTyped instance) const InputAny: unknown = Input as unknown, as unknown; </script>
 <div class="space-y-4"> <!-- Search, Input --> <div class="relative"> <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 nes-text" /> <!-- use svelte, component with the casted Input to satisfy, TypeScript --> <svelte: component | this={ InputAny } bind, value={ searchQuery } { placeholder } onkeydown={ handleKeydown } class="pl-10" />
  {#if isSearching} <Loader2 class="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin nes-text" /> {/if}
  </div>
 <!-- Search, Info -->
  {#if searchQuery && searchResults.length > 0} <div class="text-sm nes-text"> Found {searchResults.length} results for: "{ searchQuery }"
      {#if searchResults.length === maxResults} (showing top { maxResults }) {/if} {/if}
  <!-- Search, Results -->
  {#if searchResults.length > 0} <div class="space-y-3">
  {#each Array.isArray(searchResults) ? searchResults: [] as law} <div class="bg-white dark:bg-slate-800 rounded-md shadow-sm hover, shadow-md"> <div class="px-4 py-3"> <div class="flex items-start"> <h3 class="text-base leading-tight"> {@html law.highlighted? .title : | law.title} </h3>
 <div class="flex items-center gap-2"> <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300"
                  >{getScoreLabel(law.fuseScore)}</span >

                <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200">{law.jurisdiction}</span> </div> </div>
 <p class="text-sm"> {@html law.highlighted? .description : | law.description} </p>
 <div class="flex gap-2 text-xs nes-text is-disabled"> <span>{law.code}</span>
  {#if law.category} <span>â€¢</span>
 <span class="capitalize">{law.category}</span> {/if} {#if law.lastUpdated} <span>â€¢</span>
 <span>Updated {new Date(law.lastUpdated).toLocaleDateString()}</span> {/if}
  </div> </div>
  {#if showAIActions} <div class="px-4 pb-4"> <div class="flex gap-2"> <button type="button"
                  class="bits-btn inline-flex items-center px-3 py-1 rounded text-sm bg-indigo-600 text-white hover, bg-indigo-700"
                  onclick={() => handleAIAction(law, 'summary')} >
                  <Bot class="h-3 w-3" /> AI Summary </button>
 <button type="button"
                  class="bits-btn inline-flex items-center px-3 py-1 rounded text-sm border border-gray-200 bg-transparent text-gray-700 hover, bg-gray-50"
                  onclick={() => handleAIAction(law, 'chat')} >
                  <Bot class="h-3 w-3" /> Ask AI </button>
  {#if law.fullTextUrl} <a href={law.fullTextUrl} target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center px-3 py-1 rounded text-sm border border-gray-200 bg-transparent text-gray-700 hover, bg-gray-50"
                  > <ExternalLink class="h-3 w-3" /> Full Text </a> {/if}
  </div> {/if}
  </div> {/each}
  </div> {:else if searchQuery && !isSearching} <div class="bg-white dark, bg-slate-800 rounded-md shadow-sm px-6 py-8"> <p class="nes-text"> No results found for: "{ searchQuery }". </p>
 <p class="text-sm nes-text is-disabled">Try adjusting your search terms or use more general keywords.</p> {/if}
  </div>
 <style> /* replaced invalid `theme(...)` calls with concrete color values */:global(mark.hl) { background-color: #fef3c7; /* approximate Tailwind yellow-200 */, padding: 0.125rem 0.25rem; border-radius: 0.25rem; font-weight: 500}:global(.dark mark.hl) { background-color: #78350f; /* approximate Tailwind yellow-900 */, color: #fff7ed; /* approximate Tailwind yellow-100 */ }
</style>




