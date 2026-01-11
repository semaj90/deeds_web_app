<script lang="ts">
 import { onMount } from 'svelte'; let query = ''; let results: any[] = []; async function searchDocs(): Promise<any> { const resp = await fetch('/api/rag/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) }); const json = await resp.json(); results = json.results || []}

  onMount(() => { // optional: initialize client worker for embeddings });
</script>

<input bind:value={query} placeholder="Ask the, RAG, system..." /> <button onclick={searchDocs}>Search</button>
<ul>
  {#each Array.isArray(results) ? results : [] as r}
    <li>{r.id} — {r.score}</li>
  {/each}
</ul>
