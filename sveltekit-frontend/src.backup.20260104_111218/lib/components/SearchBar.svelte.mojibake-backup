<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  let { placeholder = 'Search...', value = '' } = $props();

  const dispatch = createEventDispatcher<{
    search: string;
  }>();

  let searchTimeout: number;
  let inputElement: HTMLInputElement;

  function handleInput() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      dispatch('search', value);
    }, 300); // Debounce search by 300ms
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      clearTimeout(searchTimeout);
      dispatch('search', value);
    } else if (event.key === 'Escape') {
      value = '';
      dispatch('search', '');
      inputElement?.blur();
    }
  }

  function clearSearch() {
    value = '';
    dispatch('search', '');
    inputElement?.focus();
  }

  // Cleanup timeout on destroy
  import { onDestroy } from 'svelte';
  onDestroy(() => {
    clearTimeout(searchTimeout);
  });
</script>

<div class="search-bar">
  <div class="search-input-container">
    <span class="search-icon">🔍</span>
    <input
      bind:this={inputElement}
      type="text"
      {placeholder}
      bind:value
      oninput={handleInput}
      onkeydown={handleKeydown}
      class="search-input"
    />
    {#if value}
      <button
        class="clear-btn"
        onclick={clearSearch}
        aria-label="Clear search"
      >
        ✕
      </button>
    {/if}
  </div>
</div>

<style>
  .search-bar {
    width: 100%;
    max-width: 500px;
  }

  .search-input-container {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 1rem;
    color: #888;
    font-size: 1rem;
    z-index: 1;
  }

  .search-input {
    width: 100%;
    padding: 0.75rem 1rem 0.75rem 3rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid #333;
    border-radius: 25px;
    color: #e0e0e0;
    font-size: 0.9rem;
    transition: all 0.2s ease;
  }

  .search-input:focus {
    outline: none;
    border-color: #00d4ff;
    box-shadow: 0 0 0 2px rgba(0, 212, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
  }

  .search-input::placeholder {
    color: #888;
  }

  .clear-btn {
    position: absolute;
    right: 1rem;
    background: none;
    border: none;
    color: #888;
    font-size: 1rem;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 50%;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .clear-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #e0e0e0;
  }

  @media (max-width: 768px) {
    .search-input {
      padding: 0.6rem 0.8rem 0.6rem 2.5rem;
      font-size: 0.85rem;
    }

    .search-icon {
      left: 0.8rem;
      font-size: 0.9rem;
    }

    .clear-btn {
      right: 0.8rem;
    }
  }
</style>
