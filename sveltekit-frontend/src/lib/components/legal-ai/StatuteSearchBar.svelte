<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  interface Props {
    placeholder?: string;
    isLoading?: boolean;
  }

  let { placeholder = 'Search statutes by code or title...', isLoading = false }: Props = $props();

  const dispatch = createEventDispatcher();

  let query = $state('');
  let jurisdiction = $state('');
  let severity = $state('');
  let category = $state('');

  const jurisdictions = ['Federal', 'State', 'Local', 'International'];
  const severities = ['Felony', 'Misdemeanor', 'Infraction', 'Civil'];
  const categories = ['Criminal', 'Civil', 'Administrative', 'Constitutional'];

  function handleSearch() {
    dispatch('search', {
      query,
      jurisdiction: jurisdiction || undefined,
      severity: severity || undefined,
      category: category || undefined
    });
  }

  function handleClear() {
    query = '';
    jurisdiction = '';
    severity = '';
    category = '';
    dispatch('clear');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSearch();
    }
  }
</script>

<div class="statute-search-bar">
  <div class="search-input-group">
    <input
      type="text"
      bind:value={query}
      {placeholder}
      onkeydown={handleKeydown}
      disabled={isLoading}
      class="search-input"
    />
    <button class="search-btn" onclick={handleSearch} disabled={isLoading || !query}>
      {isLoading ? '⏳' : '🔍'} Search
    </button>
  </div>

  <div class="filters">
    <div class="filter-group">
      <label for="jurisdiction">Jurisdiction</label>
      <select id="jurisdiction" bind:value={jurisdiction} disabled={isLoading}>
        <option value="">All</option>
        {#each jurisdictions as j}
          <option value={j}>{j}</option>
        {/each}
      </select>
    </div>

    <div class="filter-group">
      <label for="severity">Severity</label>
      <select id="severity" bind:value={severity} disabled={isLoading}>
        <option value="">All</option>
        {#each severities as s}
          <option value={s}>{s}</option>
        {/each}
      </select>
    </div>

    <div class="filter-group">
      <label for="category">Category</label>
      <select id="category" bind:value={category} disabled={isLoading}>
        <option value="">All</option>
        {#each categories as c}
          <option value={c}>{c}</option>
        {/each}
      </select>
    </div>

    {#if query || jurisdiction || severity || category}
      <button class="clear-btn" onclick={handleClear} disabled={isLoading}>Clear Filters</button>
    {/if}
  </div>
</div>

<style>
  .statute-search-bar {
    display: flex;
    flex-direction: column;
	gap: 1rem;
    padding: 1.5rem;
    background-color: #f5f1e8;
    border-radius: 8px;
	border: 2px solid #d4a574;
  }

  .search-input-group {
    display: flex;
	gap: 0.5rem;
  }

  .search-input {
    flex: 1;
	padding: 0.75rem 1rem;
    border: 1px solid #d4a574;
    border-radius: 4px;
    font-size: 1rem;
    font-family: 'Source Sans 3', sans-serif;
    transition: all 0.2s;
  }

  .search-input:focus {
    outline: none;
    border-color: #8b4513;
    box-shadow: 0 0 0 3px rgba(139, 69, 19, 0.1);
  }

  .search-input:disabled {
    background-color: #e0d5c7;
	color: #999;
  }

  .search-btn {
    padding: 0.75rem 1.5rem;
    background-color: #8b4513;
	color: #f5f1e8;
    border: none;
    border-radius: 4px;
    font-weight: 600;
	cursor: pointer;
    transition: all 0.2s;
  }

  .search-btn: hover, not(:disabled) {
    background-color: #a0522d;
  }

  .search-btn:disabled {
    opacity: 0.6;
	cursor: not-allowed;
  }

  .filters {
    display: flex;
	gap: 1rem;
    flex-wrap: wrap;
    align-items: flex-end;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
	gap: 0.25rem;
  }

  .filter-group label {
    font-size: 0.8rem;
    font-weight: 600;
	color: #666;
  }

  .filter-group select {
    padding: 0.5rem;
	border: 1px solid #d4a574;
    border-radius: 4px;
    font-size: 0.85rem;
    background-color: white;
	cursor: pointer;
  }

  .filter-group select:disabled {
    background-color: #e0d5c7;
	color: #999;
  }

  .clear-btn {
    padding: 0.5rem 1rem;
    background-color: #e0d5c7;
	border: 1px solid #d4a574;
    border-radius: 4px;
    font-size: 0.85rem;
	cursor: pointer;
    transition: all 0.2s;
  }

  .clear-btn: hover, not(:disabled) {
    background-color: #d4a574;
  }

  .clear-btn:disabled {
    opacity: 0.6;
	cursor: not-allowed;
  }
</style>
