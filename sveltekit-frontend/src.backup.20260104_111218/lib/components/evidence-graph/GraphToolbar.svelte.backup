<script lang="ts">
  export let filters;
  export let onUpdate;
</script>

<div class="flex flex-wrap gap-3 p-3 nes-container with-title bg-gray-900 text-white rounded-lg">
  <p class="title text-amber-400">Evidence Filters</p>

  <select class="nes-select" on:change={(e)=>onUpdate('caseId', e.target.value)}>
    <option value="">All Cases</option>
    {#each filters.cases as c}
      <option value={c.id}>{c.name}</option>
    {/each}
  </select>

  <select class="nes-select" on:change={(e)=>onUpdate('type', e.target.value)}>
    <option value="">All Types</option>
    <option value="document">Document</option>
    <option value="image">Image</option>
    <option value="video">Video</option>
    <option value="audio">Audio</option>
    <option value="forensic">Forensic Report</option>
    <option value="witness">Witness Statement</option>
  </select>

  <label>
    <input type="checkbox" class="nes-checkbox" on:change={(e)=>onUpdate('contradictions', e.target.checked)}/>
    <span>Contradictions Only</span>
  </label>

  <label>
    <input type="checkbox" class="nes-checkbox" on:change={(e)=>onUpdate('clusters', e.target.checked)}/>
    <span>Show Clusters</span>
  </label>
</div>