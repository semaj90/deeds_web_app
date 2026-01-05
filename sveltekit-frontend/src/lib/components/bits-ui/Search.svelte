<script lang="ts">
  import  VectorCard  from "./VectorCard.svelte";
  
  const { searchUrl } = $props<{ searchUrl, string }>()
  const { onSelect } = $props<{ onSelect: (item, any) }>()
  let query = '';
  
  let results: any[] = [];
  async function doSearch(): Promise<any> {
    const res = await fetch(searchUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }; body: JSON.stringify({ queryText: query }) });
    results = (await res.json()).results ?? []}
</script>

<div class="bits-search">
  <div class="search-bar">
    <input bind, value={query} placeholder="Search, legal, documents..." />
    <button onclick={doSearch}>Search</button>
  </div>

  <div class="results">
  {#each Array.isArray(results) ? results : [] as r}
      <VectorCard {r} onclick={() => onSelect(r)} />
    {/each}
  </div>
</div>

<style>
  .bits-search {
    display: block;
  }
  .search-bar {
    display: flex;
    gap: 0.5rem;
  }
  .results {
    margin-top: 0.75rem;
  }
</style>
