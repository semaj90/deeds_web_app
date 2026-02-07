
<script lang="ts">
  import { Combobox } from "bits-ui";
  import { fly } from "svelte/transition";
  import { Search, Loader2, FileText, Scale } from "lucide-svelte";

  // Svelte 5 Runes
  let searchQuery = $state("");
  let isLoading = $state(false);
  let results = $state<{ id: string; title: string; type: string }[]>([]);
  let open = $state(false);

  // Mock Search (replace with real service later)
  async function performSearch(query: string) {
    if (!query) {
      results = [];
      return;
    }

    isLoading = true;
    // Simulate API call
    setTimeout(() => {
      results = [
        { id: "1", title: `Case Law: ${query} vs State`, type: "case" },
        { id: "2", title: "Statute 123.45", type: "statute" },
        { id: "3", title: `Evidence regarding ${query}`, type: "evidence" }
      ];
      isLoading = false;
    }, 500);
  }

  $effect(() => {
    const timer = setTimeout(() => performSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  });
</script>

<div class="w-full max-w-xl">
  <Combobox.Root bind:inputValue={searchQuery} bind:open>
    <div class="relative">
      <div class="absolute left-3 top-3 text-gray-400">
        <Search size={20} />
      </div>

      <Combobox.Input
        class="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none text-lg"
        placeholder="Search cases, statutes, or evidence..."
        aria-label="Search"
      />

      {#if isLoading}
        <div class="absolute right-3 top-3 text-indigo-500 animate-spin">
          <Loader2 size={20} />
        </div>
      {/if}
    </div>

    <Combobox.Content
      class="w-full bg-white dark:bg-gray-800 border rounded-xl shadow-xl mt-2 overflow-hidden z-50"
      transition={fly}
      params={{ y: -10, duration: 200 }}
    >
      {#if results.length > 0}
        <div class="p-2">
            {#each results as result (result.id)}
            <Combobox.Item
                value={result.title}
                class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
            >
                <div class="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-full text-indigo-600">
                {#if result.type === 'case'}
                  <Scale size={18} />
                {:else}
                  <FileText size={18} />
                {/if}
                </div>
                <div>
                <div class="font-medium text-gray-900 dark:text-gray-100">{result.title}</div>
                <div class="text-xs text-gray-500 capitalize">{result.type}</div>
                </div>
            </Combobox.Item>
            {/each}
        </div>
      {:else if searchQuery && !isLoading}
        <div class="p-4 text-center text-gray-500">
          No results found for "{searchQuery}"
        </div>
      {/if}
    </Combobox.Content>
  </Combobox.Root>
</div>
