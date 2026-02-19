
<script lang="ts">
  import { Slider } from "bits-ui";
import { Switch } from "bits-ui";
import { Search, SlidersHorizontal, Zap } from "@lucide/svelte";

  // Props
  let {
    onSearch
  }: {
    onSearch?: (params: { query: string, threshold: number, semantic: boolean }) => void
  } = $props();

  // State
  let query = $state("");
  let threshold = $state([0.7]);
  let isSemantic = $state(true);
  let isSearching = $state(false);
  let showFilters = $state(false);

  async function handleSearch() {
    if (!query.trim()) return;

    isSearching = true;
    try {
      if (onSearch) {
        onSearch({
            query,
            threshold: threshold[0],
            semantic: isSemantic
        });
      }
      // Simulate delay if no callback
      if (!onSearch) await new Promise(r => setTimeout(r, 800));
    } finally {
      isSearching = false;
    }
  }
</script>

<div class="bg-white dark:bg-panelSoft p-4 rounded-xl shadow-sm border border-sand/20 dark:border-sand/20">
  <div class="flex gap-2 mb-4">
    <div class="relative flex-1">
      <div class="absolute left-3 top-1/2 -translate-y-1/2 text-sand/40">
        <Search size={18} />
      </div>
      <input
        bind:value={query}
        onkeydown={(e) => e.key === 'Enter' && handleSearch()}
        class="w-full pl-10 pr-4 py-2 bg-sand/5 dark:bg-panel border border-sand/20 dark:border-sand/20 rounded-lg focus:ring-2 focus:ring-info outline-none transition-all"
        placeholder="Enter vector search query..."
      />
    </div>

    <Button.Root
      onclick={() => (showFilters = !showFilters)}
      class="p-2 border border-sand/20 dark:border-sand/20 rounded-lg hover:bg-sand/5 dark:hover:bg-panelSoft text-sand/60 dark:text-sand/40"
      aria-label="Toggle Filters"
    >
      <SlidersHorizontal size={20} />
    </Button.Root>

    <Button.Root
      onclick={handleSearch}
      disabled={isSearching || !query.trim()}
      class="px-4 py-2 bg-info text-white rounded-lg hover:bg-info/40 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors flex items-center gap-2"
    >
      {#if isSearching}
        <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
      {:else}
        <Zap size={16} />
      {/if}
      <span>Run Search</span>
    </Button.Root>
  </div>

  {#if showFilters}
    <div class="pt-4 border-t border-sand/10 dark:border-sand/20 grid gap-6 sm:grid-cols-2 animate-in fade-in slide-in-from-top-2 duration-200">

      <!-- Similarity Threshold -->
      <div>
        <div class="flex justify-between mb-2">
          <label class="text-xs font-medium text-sand/60 uppercase tracking-wider">Similarity Threshold</label>
          <span class="text-xs font-mono bg-sand/10 dark:bg-panelSoft px-2 py-0.5 rounded text-sand/80 dark:text-sand/40">
            {threshold[0].toFixed(2)}
          </span>
        </div>
        <Slider.Root
          bind:value={threshold}
          min={0}
          max={1}
          step={0.01}
          class="relative flex items-center select-none touch-none w-full h-5"
        >
          <span class="bg-sand/10 dark:bg-panelSoft relative grow rounded-full h-[3px]">
            <Slider.Range class="absolute bg-info rounded-full h-full" />
          </span>
          <Slider.Thumb
            class="block w-4 h-4 bg-white border border-sand/20 shadow-sm rounded-full hover:scale-110 focus:ring-2 focus:ring-info focus:outline-none transition-transform"
          />
        </Slider.Root>
      </div>

      <!-- Semantic Mode Toggle -->
      <div class="flex items-center justify-between sm:justify-end gap-4">
        <label class="text-sm font-medium text-sand/80 dark:text-sand/40 cursor-pointer" for="semantic-mode">
          Deep Semantic Search
        </label>
        <Switch.Root
          id="semantic-mode"
          bind:checked={isSemantic}
          class="w-10 h-6 bg-sand/10 dark:bg-panelSoft rounded-full relative data-[state=checked]:bg-info transition-colors cursor-pointer focus:ring-2 focus:ring-offset-2 focus:ring-info outline-none"
        >
          <Switch.Thumb
            class="block w-4 h-4 bg-white rounded-full shadow-sm transition-transform translate-x-1 will-change-transform data-[state=checked]:translate-x-5"
          />
        </Switch.Root>
      </div>

    </div>
  {/if}
</div>
