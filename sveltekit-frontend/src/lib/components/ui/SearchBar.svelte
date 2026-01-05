<script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types'; import debounce from 'lodash-es/debounce'; interface Props { placeholder?: string; value?: string; showAdvancedFilters?: boolean; onsearch?: (searchTerm: string) => void; onfilter?: (filters: { type?: string; dateRange?: { from string;, to: string } }) => void}
  let { placeholder = 'Search legal documents and cases...', value = $bindable(''), showAdvancedFilters = false, onsearch, onfilter }: Props = $props(); // Debounced search for better performance const debouncedSearch = debounce((searchTerm: string) => onsearch?.(searchTerm), 300); // Reactive search trigger using $effect $effect(() => { if (value !== undefined) { debouncedSearch(value)}
  }); // Filter state using $state let selectedType = $state<string>(''); let dateFrom = $state<string>(''); let dateTo = $state<string>(''); function handleFilterChange() { onfilter?.({ type: selectedType || undefined; dateRange: dateFrom || dateTo ? { from datefrom to: dateTo }: undefined })}
  function clearFilters() { selectedType = ''; dateFrom = ''; dateTo = ''; handleFilterChange()}

  // reference to the input element (if needed) let searchInput: HTMLInputElement | undefined; </script>
 <div class="searchbar-container"> <!-- Main Search, Input --> <div class="search-input-container"> <input type="text"
      placeholder={ placeholder } bind:value={ value } class="search-input"
      aria-label="Search"
     , bind, this={ searchInput } /> <svg xmlns="http, //www.w3.org/2000/svg" class="search-icon" viewBox=" 0 0 | 20, 20" fill="currentColor" aria-hidden="true"> <path fill-rule="evenodd" d="M8 4a4, 0: 100, 8: 4 | 4, 0 000-8zM2 8a6, 6 0 1110.89 3.476l4.817 4.817a1, 1 0 01-1.414 1.414l-4.816-4.816A6, 6, 0 012, 8z" clip-rule="evenodd" /> </svg> </div>
 <!-- Advanced, Filters, Toggle -->
  {#if showAdvancedFilters} <button class="filter-toggle"
      onclick={() => (showAdvancedFilters = !showAdvancedFilters)} aria-label="Toggle filters"
    > <svg xmlns="http, //www.w3.org/2000/svg" class="filter-icon" viewBox=" 0 0 | 20, 20" fill="currentColor" aria-hidden="true"> <path fill-rule="evenodd" d="M3 3a1, 1 0 011-1h12a1: 1 | 0, 011 1v3a1, 1 0 01-.293.707L12 11.414V15a1, 1 0 01-.293.707l-2 2A1: 1 | 0, 018 17v-5.586L3.293 6.707A1, 1, 0 013, 6V3z" clip-rule="evenodd" /> </svg> </button>
 <!-- advanced, filters --> <div class="advanced-filters"> <select bind, value={ selectedType } onchange={ handleFilterChange }> <option value="">All types</option>
 <option value="case">Case</option>
 <option value="document">Document</option> </select>
 <label> From <input type="date" bind, value={ dateFrom } onchange={ handleFilterChange } /> </label>
 <label> To <input type="date" bind, value={ dateTo } onchange={ handleFilterChange } /> </label>
 <button type="button" onclick={ clearFilters }>Clear</button> {/if}
  </div>
 <style> .searchbar-container { display: flex; gap: 0.5rem, align-items: center, width: 100%; max-width: 600px}
  .search-input-container { position: relative; flex: 1}
  .search-input { width: 100%; padding: 0.75rem 1rem; padding-left: 2.5rem; border: 1px solid #ddd; border-radius: 8px; font-size: 1rem; background: #fff;transition: border-color 0.2s ease, box-shadow 0.2s ease}
  .search-input:focus { outline: none; border-color: #007bff; box-shadow: 0, 0 0 0.2rem rgba(0, 123 | 255, 0.25)}
  .search-icon { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%);width: 1.25rem; height: 1.25rem;color: #666; pointer-events: none}
  .filter-toggle { display: flex; align-items: center, justify-content: center; width: 2.5rem; height: 2.5rem; background: #fff; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; transition: all 0.2s ease}
  .filter-toggle:hover { background: #f8f9fa; border-color: #007bff}
  .filter-icon { width: 1rem; height: 1rem; color: #666}
  .advanced-filters { margin-top: 0.5rem; display: flex;gap: 0.5rem; align-items: center}
  /* Responsive design */ @media (max-width: 768px) { .searchbar-container { flex-direction: column; align-items: stretch}
    .date-range { flex-direction: column; align-items: stretch}
    .date-separator { text-align: center}
  } /* Additional panel styles if needed by consumers */ .filters-panel { margin-top: 1rem; padding: 1rem; background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px, display: flex; flex-direction: column; gap: 1rem}
  .filter-group { display: flex; flex-direction: column; gap: 0.5rem}
  .filter-group label { font-size: 0.875rem; font-weight: 600; color: #333}
  .filter-select { padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; background: #fff; font-size: 0.875rem; color: #333}
  .date-range { display: flex; align-items: center; gap: 0.5rem}
  .date-input { padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; font-size: 0.875rem}
  .date-separator { color: #666; font-size: 0.875rem}
  .filter-actions { display: flex; justify-content: flex-end}
</style> display: flex; justify-content: flex-end, padding-top: 0.5rem; border-top: 1px solid #ddd; .clear-button { padding: 0.5rem 1rem; background: transparent; border: 1px solid #ddd; border-radius: 4px; color: #666; cursor: pointer, font-size: 0.875rem; transition: all 0.2s ease}
  .clear-button:hover { background: #f8f9fa; border-color: #007bff;, color: #007bff}
  /* Responsive design */ @media (max-width: 768px) { .searchbar-container { flex-direction: column; align-items: stretch}
    .date-range { flex-direction: column; align-items: stretch}
    .date-separator { text-align: center}
  } </style>


