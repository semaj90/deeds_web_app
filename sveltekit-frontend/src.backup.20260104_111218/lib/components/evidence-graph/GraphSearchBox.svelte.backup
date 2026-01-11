<script lang="ts">
  export let query = "";
  export let onSearch;
</script>

<input
  class="nes-input w-full p-2 text-lg bg-black text-white border border-cyan-400"
  placeholder="Search witnesses, objects, locations, contradictions..."
  bind:value={query}
  on:input={(e)=>onSearch(e.target.value)}
/>