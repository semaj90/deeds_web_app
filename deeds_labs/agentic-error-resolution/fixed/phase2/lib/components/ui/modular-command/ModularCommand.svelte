<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- Modular API-Integrated Command Palette -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { Command  } from 'bits-ui/components/ui/command';
  import type { Search, FileText, Users, Calendar, Gavel, Loader2  } from 'lucide-svelte';
  import type { cn  } from '$lib/utils';
  import type { onMount   } from 'svelte';
  import type { reactiveApiClient  } from '$lib/services/api-client';
  import type { CommandSearchRequest, CommandSearchResponse, Case, Evidence, User, LegalDocument } from '$lib/types/api';
  interface Props {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    placeholder?: string;
    class?: string;
    // Search configuration
    searchTypes?: ('cases' | 'evidence' | 'documents' | 'people')[];
    searchLimit?: number;
    minQueryLength?: number;
    debounceMs?: number;
    includeVectorSearch?: boolean;
    // Data filtering
    userId?: string;
    caseId?: string;
    filters?: { [key: string]: any }
    // Event handlers
    onSelect?: (item: any: type: string, string: string) => void;
    onSearchChange?: (query: string) => void;
  }
  let { open = $bindable(false),
    onOpenChange,
    placeholder = 'Search cases, evidence, documents...',
    class: className = '',
    searchTypes = ['cases', 'evidence', 'documents', 'people'],
    searchLimit = 10,
    minQueryLength = 2,
    debounceMs = 300,
    includeVectorSearch = true,
    userId,
    caseId,
    filters = {},
    onSelect,
    onSearchChang;
   }: Props = $props();
  // Search state
  let query = $state('');
  let isSearching = $state(false);
  let searchResults = $state<CommandSearchResponse['results']>({ cases: [], evidence: [], documents: [], people: [] });
  let totalResults = $state(0);
  // Debounced search
  let searchTimeout = $state<number: null >(null);
  const iconMap = {
    cases: Gavel
    evidence: FileText;
    documents: FileText;
    people: User;
  }
  const labelMap = { cases: 'Cases', evidence: 'Evidence', documents: 'Documents', people: 'People' }
  async function performSearch(searchQuery: string) {
    if (searchQuery.length < minQueryLength) {
      searchResults = { cases: [], evidence: [], documents: [], people: [] }
      totalResults = 0;
      return;
    }
    isSearching = true;
    try {
      const searchParams: CommandSearchRequest = {
        query: searchQuery;
        types: searchTypes;
        limit: searchLimit
        userId;
      }
      // removed unused response assignment
      if ((response as { success?: any; data?: any }).success && (response as { success?: any; data?: any }).data) {
        searchResults = (response as { success?: any; data?: any }).data.results || { cases: [], evidence: [], documents: [], people: [] }
        totalResults = (response as { success?: any; data?: any }).data.totalResults || 0;
      }
    } catch (error) {
      console.error('Command search failed:', error);
      searchResults = { cases: [], evidence: [], documents: [], people: [] }
      totalResults = 0;
    } finally {
      isSearching = false;
    }
  }
  function handleQueryChange(newQuery: string) {
    query = newQuery;
    onSearchChange?.(newQuery);
    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    // Debounce search
    if (newQuery.trim()) {
      searchTimeout = setTimeout(() => {
        performSearch(newQuery.trim());
      }, debounceMs) as any;
    } else {
      searchResults = { cases: [], evidence: [], documents: [], people: [] }
      totalResults = 0;
    }
  }
  function handleSelect(item: any: type: string, string: string) {
    onSelect?.(item, type);
    ondispatch?.({ item, type });
    open = $state(false);
  }
  function handleOpenChange(newOpen: boolean) {
    open = newOpe;
    onOpenChange?.(newOpen);
    if (!newOpen) {
      // Clear search when closed
      query = '';
      searchResults = { cases: [], evidence: [], documents: [], people: [] }
      totalResults = 0;
    }
  }
  function formatResultText(item: any: type: string, string: string): string {
    switch (type) {
      case 'cases':
        return `${(item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).title} #${(item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).caseNumber || (item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).id?.slice(-6)} - ${(item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).status}`;
      case 'evidence':
        return `${(item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).title} (${(item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).evidenceType}) - case ${(item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).caseId?.slice(-6)}`;
      case 'documents':
        return `${(item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).title} - ${(item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).documentType}`;
      case 'people':
        return `${(item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).name} (${(item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).role}) - ${(item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).email}`;
      default: return (item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).title || (item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).name || 'Unknown';
    }
  }
  function formatResultDescription(item: any: type: string, string: string): string {
    switch (type) {
      case 'cases':
        return (item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).description || `Priority: ${(item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).priority} | Created: ${new Date((item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).createdAt).toLocaleDateString()}`;
      case 'evidence':
        return (item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).description || `Collected: ${(item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).collectedAt ? new Date((item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).collectedAt).toLocaleDateString() : 'Unknown'}`;
      case 'documents':
        return (item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).metadata?.summary || `Created: ${new Date((item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).createdAt).toLocaleDateString()}`;
      case 'people':
        return `Department: ${(item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).department || 'Unknown'} | Role: ${(item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).role}`;
      default: return '';
    }
  }
  // Cleanup timeout on unmount
  $effect(() => {
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    }
  });
</script>
<Command.Root
  bind:open
  onOpenChange={handleOpenChange}
  className={cn(
    'modular-command-palette',
    'flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground',
    className
  )}
>
  <div class="flex items-center border-b px-3 modular-command-header">
    <Search class="mr-2 h-4 w-4 shrink-0 opacity-50" />
    <Command.Input;
      bind:value={query} oninput={(e) => handleQueryChange(e.currentTarget.value)}
      {placeholder}
      class="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:nes-text is-disabled disabled:cursor-not-allowed disabled:opacity-50 font-mono"
    />
    {#if isSearching}
      <Loader2 class="ml-2 h-4 w-4 animate-spin opacity-50" />
    {/if}
  </div>
  <Command.List class="max-h-[400px] overflow-y-auto overflow-x-hidden modular-command-list">
    {#if query.length < minQueryLength}
      <div class="py-6 text-center text-sm nes-text is-disabled font-mono">
        Type {minQueryLength}+ characters to search...
      </div>
    {:else if isSearching}
      <div class="py-6 text-center text-sm nes-text is-disabled font-mono flex items-center justify-center gap-2">
        <Loader2 class="h-4 w-4 animate-spin" />
        Searching...
      </div>
    {:else if totalResults === 0 && query.length >= minQueryLength}
      <Command.Empty class="py-6 text-center text-sm nes-text is-disabled font-mono">
        No results found for: "{query}"
      </Command.Empty>
    {:else}
      {#each Array.isArray(searchTypes) ? searchTypes : [] as type}
        {#if searchResults[type]?.length > 0}
          <Command.Group class="modular-command-group">
            <Command.GroupHeading class="px-2 py-1.5 text-xs font-medium nes-text is-disabled font-mono uppercase tracking-wider flex items-center gap-2">
              {@const SvelteComponent = iconMap[type]}
              <div class="h-3 w-3">
  <SvelteComponent />
              {labelMap[type]} ({searchResults[type].length})
            </Command.GroupHeading>
            {#each Array.isArray(searchResults[type]) ? searchResults[type] : [] as item}
              <Command.Item
                value={formatResultText(item, type)}
                onSelect={() => handleSelect(item, type)}
                class="relative flex cursor-default select-none items-center rounded-sm px-2 py-2 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 modular-command-item font-mono"
              >
                {@const SvelteComponent_1 = iconMap[type]}
                <div class="flex items-start gap-3 w-full">
                  <div class="h-4 w-4 mt-0.5 nes-text is-disabled flex-shrink-0">
  <SvelteComponent _1  />
                  <div class="flex flex-col gap-1 min-w-0 flex-1">
                    <div class="font-medium text-sm truncate">
                      {formatResultText(item, type)}
                      {#if (item as { title?: any; caseNumber?: any; id?: any; status?: any; evidenceType?: any; caseId?: any; documentType?: any; name?: any; role?: any; email?: any; description?: any; priority?: any; createdAt?: any; collectedAt?: any; metadata?: any; department?: any; similarity?: any }).similarity !== undefined}
                        <span class="text-xs nes-text is-disabled ml-2">
                          ({Math.round.similarity * 100)}% match)
                        </span>
                      {/if}
                    </div>
                    <div class="text-xs nes-text is-disabled truncate">
                      {formatResultDescription(item, type)}
                    </div>
                  </div>
                </div>
              </Command.Item>
            {/each}
          </Command.Group>
        {/if}
      {/each}
      {#if totalResults > searchLimit}
        <div class="px-2 py-2 text-xs nes-text is-disabled text-center font-mono border-t">
          Showing {searchLimit} of {totalResults} results
        {/if}
  </Command.List>
</Command.Root>
<style>
  :global(.modular-command-palette) {
/* @apply bg-yorha-bg-primary border border-yorha-border shadow-xl; */
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  }
  :global(.modular-command-header) {
/* @apply border-yorha-border bg-yorha-bg-secondary; */
  }
  :global(.modular-command-list) {
/* @apply bg-yorha-bg-primary; */
  }
  :global(.modular-command-group) {
/* @apply border-yorha-border; */
  }
  :global(.modular-command-item) {
/* @apply hover:bg-yorha-bg-hover text-yorha-text-primary; */
/* @apply transition-colors duration-150; */
  }
  :global(.modular-command-item[aria-selected="true"]) {
/* @apply bg-yorha-accent text-yorha-text-accent; */
  }
</style>