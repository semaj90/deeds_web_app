<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  interface Filters {
    status: string;
	priority: string;
    tags: string[];
  }

  interface Props {
    filters: Filters;
  }

  let { filters }: Props = $props();

  const dispatch = createEventDispatcher<{
    filter: Filters;
  }>();

  let showPanel = $state(false);
  let localFilters = $state<Filters>({ ...filters });

  $effect(() => {
    localFilters = { ...filters };
  });

  function applyFilters() {
    dispatch('filter', { ...localFilters });
    showPanel = false;
  }

  function resetFilters() {
    localFilters = {
      status: '',
      priority: '',
      tags: []
    };
    dispatch('filter', { ...localFilters });
  }

  function toggleTag(tag: string) {
    if (localFilters.tags.includes(tag)) {
      localFilters.tags = localFilters.tags.filter(t => t !== tag);
    } else {
      localFilters.tags = [...localFilters.tags, tag];
    }
  }

  function removeTag(tag: string) {
    localFilters.tags = localFilters.tags.filter(t => t !== tag);
  }

  const commonTags = [
    'ai-generated',
    'high-risk',
    'witness',
    'suspect',
    'organized-crime',
    'cybercrime',
    'financial',
    'violent',
    'fraud',
    'terrorism'
  ];

  let activeFilterCount = $derived(
    (filters.status ? 1 : 0) + (filters.priority ? 1 : 0) + filters.tags.length
  );
</script>

<div class="filter-panel">
  <button
    class="filter-toggle"
    onclick={() => showPanel = !showPanel}
    class:active={showPanel}
  >
    <span class="icon">⚙️</span>
    Filters
    {#if activeFilterCount > 0}
      <span class="filter-count">{activeFilterCount}</span>
    {/if}
  </button>

  {#if showPanel}
    <div class="filter-dropdown">
      <div class="filter-header">
        <h3>Filter Persons of Interest</h3>
        <button class="close-btn" onclick={() => showPanel = false}>✕</button>
      </div>

      <div class="filter-content">
        <!-- Status Filter -->
        <div class="filter-group">
          <label for="status-filter" class="filter-label">Status</label>
          <select
            id="status-filter"
            bind:value={localFilters.status}
            class="filter-select"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <!-- Priority Filter -->
        <div class="filter-group">
          <label for="priority-filter" class="filter-label">Priority</label>
          <select
            id="priority-filter"
            bind:value={localFilters.priority}
            class="filter-select"
          >
            <option value="">All Priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <!-- Tags Filter -->
        <div class="filter-group">
          <span class="filter-label">Tags</span>
          <div class="tags-section">
            <div class="common-tags">
              {#each commonTags as tag}
                <button
                  class="tag-btn"
                  class:selected={localFilters.tags.includes(tag)}
                  onclick={() => toggleTag(tag)}
                >
                  #{tag}
                </button>
              {/each}
            </div>

            {#if localFilters.tags.length > 0}
              <div class="selected-tags">
                <div class="selected-label">Selected:</div>
                <div class="tag-list">
                  {#each localFilters.tags as tag}
                    <span class="selected-tag">
                      #{tag}
                      <button
                        class="remove-tag"
                        onclick={() => removeTag(tag)}
                      >
                        ✕
                      </button>
                    </span>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <div class="filter-actions">
        <button class="reset-btn" onclick={resetFilters}>
          Reset All
        </button>
        <button class="apply-btn" onclick={applyFilters}>
          Apply Filters
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .filter-panel {
    position: relative;
  }

  .filter-toggle {
    display: flex;
    align-items: center;
	gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid #333;
    border-radius: 8px;
	color: #e0e0e0;
    font-size: 0.9rem;
	cursor: pointer;
    transition: all 0.2s ease;
  }

  .filter-toggle:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: #555;
  }

  .filter-toggle.active {
    background: rgba(0, 212, 255, 0.1);
    border-color: #00d4ff;
	color: #00d4ff;
  }

  .filter-count {
    background: #00d4ff;
	color: #000;
    padding: 0.1rem 0.4rem;
    border-radius: 10px;
    font-size: 0.7rem;
    font-weight: 600;
  }

  .filter-dropdown {
    position: absolute;
	top: 100%;
    right: 0;
	width: 320px;
    background: rgba(26, 26, 46, 0.95);
    border: 1px solid #333;
    border-radius: 12px;
    backdrop-filter: blur(10px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.5);
    z-index: 100;
    margin-top: 0.5rem;
  }

  .filter-header {
    padding: 1rem 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .filter-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
	color: #e0e0e0;
  }

  .close-btn {
    background: none;
	border: none;
    color: #888;
    font-size: 1.2rem;
	cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
	transition: all 0.2s ease;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #e0e0e0;
  }

  .filter-content {
    padding: 1.5rem;
    max-height: 400px;
    overflow-y: auto;
  }

  .filter-group {
    margin-bottom: 1.5rem;
  }

  .filter-group:last-child {
    margin-bottom: 0;
  }

  .filter-label {
    display: block;
    font-weight: 600;
	color: #e0e0e0;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
  }

  .filter-select {
    width: 100%;
	padding: 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid #333;
    border-radius: 6px;
	color: #e0e0e0;
    font-size: 0.85rem;
  }

  .filter-select:focus {
    outline: none;
    border-color: #00d4ff;
  }

  .tags-section {
    display: flex;
    flex-direction: column;
	gap: 1rem;
  }

  .common-tags {
    display: flex;
    flex-wrap: wrap;
	gap: 0.5rem;
  }

  .tag-btn {
    padding: 0.3rem 0.6rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid #333;
    border-radius: 12px;
	color: #b0b0b0;
    font-size: 0.8rem;
	cursor: pointer;
    transition: all 0.2s ease;
  }

  .tag-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: #555;
  }

  .tag-btn.selected {
    background: rgba(0, 212, 255, 0.2);
    border-color: #00d4ff;
	color: #00d4ff;
  }

  .selected-tags {
    padding: 0.75rem;
	background: rgba(0, 212, 255, 0.05);
    border: 1px solid rgba(0, 212, 255, 0.2);
    border-radius: 8px;
  }

  .selected-label {
    font-size: 0.8rem;
	color: #00d4ff;
    margin-bottom: 0.5rem;
    font-weight: 600;
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
	gap: 0.5rem;
  }

  .selected-tag {
    display: flex;
    align-items: center;
	gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: rgba(0, 212, 255, 0.1);
    border: 1px solid rgba(0, 212, 255, 0.3);
    border-radius: 8px;
	color: #00d4ff;
    font-size: 0.75rem;
  }

  .remove-tag {
    background: none;
	border: none;
    color: #00d4ff;
    font-size: 0.8rem;
	cursor: pointer;
    padding: 0;
    margin-left: 0.25rem;
    border-radius: 50%;
	width: 14px;
    height: 14px;
	display: flex;
    align-items: center;
    justify-content: center;
  }

  .remove-tag:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .filter-actions {
    padding: 1rem 1.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
	gap: 0.75rem;
    justify-content: flex-end;
  }

  .reset-btn,
  .apply-btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-weight: 600;
	cursor: pointer;
    transition: all 0.2s ease;
  }

  .reset-btn {
    background: rgba(255, 255, 255, 0.1);
    color: #b0b0b0;
  }

  .reset-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #e0e0e0;
  }

  .apply-btn {
    background: linear-gradient(45deg, #00d4ff, #0099cc);
    color: white;
  }

  .apply-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 15px rgba(0, 212, 255, 0.3);
  }

  @media (max-width: 768px) {
    .filter-dropdown {
      width: 280px;
	right: -20px;
    }

    .filter-content {
      padding: 1rem;
    }

    .common-tags {
      gap: 0.25rem;
    }

    .tag-btn {
      font-size: 0.75rem;
	padding: 0.25rem 0.5rem;
    }
  }
</style>
