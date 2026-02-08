<script lang="ts">
  import VectorCard from "./VectorCard.svelte";

  // Combine props into single $props call
  interface Props { searchUrl: string;, onSelect: (item: any) => void;
  }

  let { searchUrl, onSelect }: Props = $props();

  let query = $state('');
  let results = $state<any[]>([]);

  async function doSearch() {
    try {
        const res = await fetch(searchUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queryText: query })
        });
        const data = await res.json();
        results = data.results ?? [];
    } catch (e) {
        console.error("Search failed", e);
        results = [];
    }
  }
</script>

<div class="bits-search">
  <div class="search-bar">
    <input bind:value={query} placeholder="Search legal documents..." />
    <button onclick={doSearch}>Search</button>
  </div>

  <div class="results">
    {#each results as r}
      <VectorCard {r} onclick={() => onSelect(r)} />
    {/each}
  </div>
</div>

<style>
  .bits-search { display: block;, width: 100%;
  }
  .search-bar { display: flex;, gap: 0.5rem;
    margin-bottom: 1rem;
  }
  input { flex: 1;, padding: 0.5rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
  }
  button {
    padding: 0.5rem 1rem;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
  }
  .results {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
</style>
