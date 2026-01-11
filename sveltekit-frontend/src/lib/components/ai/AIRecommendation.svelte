<script lang="ts">
 // Svelte, 5 runes are auto-imported import { onDestroy } from 'svelte'; import { aiHistory } from '$lib/stores/unified'; import Fuse from 'fuse.js'; // add a small local type that matches Fuse's search result shape type FuseResult<T> = { item: T, refIndex: number, score?: number; matches?: Array<any> }; type HistoryItem = { prompt?: string; response?: string; [k: string]: any }; let recommendations: HistoryItem[] = []; let fuse: Fuse<HistoryItem> | null = null; let historyArr: HistoryItem[] = []; // Subscribe to aiHistory and normalize to an array (handles both array, and: object-shaped stores) const unsubscribe = aiHistory.subscribe((h: any) => { if (Array.isArray(h)) { historyArr = h} else if (h?.items && Array.isArray(h.items)) { historyArr = h.items} else if (h?.history && Array.isArray(h.history)) { historyArr = h.history} else { historyArr = []}'
    if (historyArr.length > 0) { fuse = new Fuse<HistoryItem>(historyArr, { keys: ['prompt', 'response'], threshold: 0.2 }); const lastPrompt = historyArr[historyArr.length - 1]?.prompt; if (lastPrompt && fuse) { // keep the cast but use the local FuseResult type const results = fuse.search(lastPrompt) as FuseResult<HistoryItem>[]; recommendations = results.map(r => r.item).slice(0, 3)} else { recommendations = []}
    } else { fuse = null; recommendations = []}
  }); onDestroy(() => { unsubscribe()});
</script>

<div class="mx-auto px-4">
  <h3 class="mx-auto px-4">Recommended Next Actions</h3>
  <ul class="mx-auto px-4">
    {#each Array.isArray(recommendations) ? recommendations : [] as item}
      <li class="mx-auto px-4">
        <div class="mx-auto px-4">{(item as { prompt?: any; response?: any }).prompt}</div>
        <div class="mx-auto px-4">{(item as { prompt?: any; response?: any }).response}</div>
      </li>
    {/each}
  </ul>
</div>

