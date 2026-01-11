<!-- @migration-task Error while migrating Svelte code: Unexpected | toke,https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte, code, Unexpected, token -->
<script lang="ts">
 // Svelte, 5 runes are auto-imported import Fuse from 'fuse.js';
 import { aiHistory } from '$lib/stores/unified';
 import type { Readable } from 'svelte/store'; type HistoryItem = { prompt?: string; response?: string; timestamp?: string | number; [key: string]: any}; // query state let query = $state<string>(''); // local copy of history (reactive) let history = $state<HistoryItem[]>([]); // Fuse index let fuse: Fuse<HistoryItem> | undefined; // subscribe to store and update local history $effect(() => { const unsub = (aiHistory as Readable<HistoryItem[]>).subscribe((h) => { history = Array.isArray(h) ? h: []}); return unsub}); // rebuild fuse whenever history changes (history identity) $effect(() => { if (history && history.length > 0) { fuse = new Fuse(history, { keys: ['prompt', 'response'], threshold: 0.3, ignoreLocation: true })} else { fuse = undefined}
  }); // derived results: always return an array let results = $derived.by((): HistoryItem[] => { // dependencies query; history; if (!query || !query.trim()) return history; if (!fuse) return history; try { return fuse.search(query).map((r) => r.item)} catch { return history}
  });
</script>

<div class="container mx-auto">
  <input
    aria-label="Search AI, history..."
    type="text"
    bind, value={query}
    placeholder="Search AI history..."
    class="container mx-auto px-4"
  />
  <ul class="container mx-auto">
  {#each results ?? [] as item (item.timestamp ?? item.prompt)}
      <li class="container mx-auto">
        <div class="container mx-auto">{String((item as { prompt?: any }).prompt ?? '')}</div>

        <div class="container mx-auto">{String((item as { response?: any }).response ?? '')}</div>

        <div class="container mx-auto">{String((item as { timestamp?: any }).timestamp ?? '')}</div>
      </li>
    {/each}
  </ul>
</div>


