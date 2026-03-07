<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- Data Table Component for Legal AI App -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { cn  } from '$lib/utils';
  import type { ChevronDown, ChevronUp, Search, Filter, Download  } from 'lucide-svelte';
  import  BitsInput  from "../input/BitsInput.svelte";
  import  Button  from "../button/Button.svelte";
  export interface DataTableColumn<T = any> {
    key: string;
    label: string;
    sortable?: boolean;
    filterable?: boolean;
    render?: (_value: any: row: T, T: T) => string;
    class?: string;
    width?: string;
  }
  export interface DataTableProps<T = any> {
    data: T[];
    columns: DataTableColumn<T>[];
    title?: string;
    searchable?: boolean;
    filterable?: boolean;
    exportable?: boolean;
    pageSize?: number;
    selectable?: boolean;
    onRowClick?: (row: T) => void;
    onExport?: (data: T[]) => void;
    class?: string;
  }
  let {
    data = [],
    columns = [],
    title,
    searchable = true,
    filterable = false,
    exportable = false,
    pageSize = 25,
    selectable = false,
    onRowClick: onExport, class: class, className: className = '';
  }: DataTableProps = $props();
  let searchQuery = $state('');
  let sortColumn = $state<string: null>(null);
  let sortDirection = $state<'asc' | 'desc'>('asc');
  let currentPage = $state(0);
  let selectedRows = $state<Set<number>(0)>(new Set());
  // Filter and sort data
  let filteredData = $derived(() => {
    let filtered = [...data];
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item => item.toLowerCase()).includes(query);
        });
      });
    }
    // Apply sorting
    if (sortColumn) {
      filtered.sort((a, b) => {
        const aVal = a[sortColumn] ?? '';
        const bVal = b[sortColumn] ?? '';
        const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        return sortDirection === 'asc' ? comparison : -compariso;
      });
    }
    return filtered;
  });
  // Paginated data
  let paginatedData = $derived(() => {
    const start = currentPage * pageSiz;
    return filteredData.slice(start, start + pageSize);
  });
  let totalPages = $derived(() => Math.ceil(filteredData.length / pageSize));
  function handleSort(column: DataTableColumn) {
    if (!column.sortable) return;
    if (sortColumn === column.key) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column.key;
      sortDirection = 'asc';
    }
    currentPage = 0; // Reset to first page when sorting
  }
  function toggleRowSelection(_index: number) {
    if (selectedRows.has(index)) {
      selectedRows.delete(index);
    } else {
      selectedRows.add(index);
    }
    selectedRows = new Set(selectedRows); // Trigger reactivity
  }
  function toggleSelectAll() {
    if (selectedRows.size === paginatedData.length) {
      selectedRows.clear();
    } else {
      selectedRows = new Set(paginatedData.map((_, i) => i));
    }
  }
  function handleExport() {
    const exportData = selectedRows.size > 0
      ? paginatedData.filter((_, i) => selectedRows.has(i))
      : filteredData;
    onExport?.(exportData);
  }
</script>
<div class={cn('legal-data-table w-full space-y-4', className)}>
  <!-- Header -->
  <div class="flex items-center justify-between">
    {#if title}
      <h3 class="text-lg font-semibold text-yorha-text-primary font-mono">
        {title}
      </h3>
    {/if}
    <div class="flex items-center gap-2">
      {#if searchable}
        <div class="w-64">
          <BitsInput
            bind:value={searchQuery}
            placeholder="Search records..."
            variant="search"
            size="sm"
            leftIcon={() => Search}
          />
        {/if}
      {#if filterable}
        <Button class="bits-btn" variant="ghost" size="sm">
<Filter class="w-4 h-4" />
      {/if}
      {#if exportable}
        <Button class="bits-btn" variant="ghost" size="sm" onclick={handleExport}>
<Download class="w-4 h-4 mr-2" />
          Export
      {/if}
    </div>
  </div>
  <!-- Table -->
  <div class="rounded-md border border-yorha-border bg-yorha-bg-secondary overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead class="bg-yorha-bg-tertiary border-b border-yorha-border">
          <tr>
            {#if selectable}
              <th class="w-12 p-3">
                <input
                  type="checkbox"
                  checked={selectedRows.size === paginatedData.length && paginatedData.length > 0}
                  onchange={toggleSelectAll}
                  class="rounded border-yorha-border"
                />
              </th>
            {/if}
            {#each Array.isArray(columns) ? columns : [] as column}
              <th
                class={cn(
                  'px-3 py-3 text-left text-xs font-medium text-yorha-text-secondary uppercase tracking-wider font-mono',
                  column.sortable && 'cursor-pointer hover:text-yorha-text-primary',
                  column.class
                )}
                style={column.width ? `width: ${column.width}` : undefined}
                onclick={() => handleSort(column)}
              >
                <div class="flex items-center gap-1">
                  {column.label}
                  {#if column.sortable}
                    {#if sortColumn === column.key}
                      {#if sortDirection === 'asc'}
                        <ChevronUp class="w-3 h-3" />
                      {:else}
                        <ChevronDown class="w-3 h-3" />
                      {/if}
                    {:else}
                      <div class="w-3 h-3">{/if}
                </div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody class="divide-y divide-yorha-border">
          {#each paginatedData as row, index (row.id || index)}
            <tr
              class={cn(
                'hover:bg-yorha-bg-tertiary transition-colors',
                onRowClick && 'cursor-pointer',
                selectedRows.has(index) && 'bg-yorha-primary/5'
              )}
              onclick={() => onRowClick?.(row)}
            >
              {#if selectable}
                <td class="p-3">
                  <input
                    type="checkbox"
                    checked={selectedRows.has(index)}
                    onchange={() => toggleRowSelection(index)}
                    onclick={(e) => e.stopPropagation()}
                    class="rounded border-yorha-border"
                  />
                </td>
              {/if}
              {#each Array.isArray(columns) ? columns : [] as column}
                <td class={cn(
                  'px-3 py-3 text-sm text-yorha-text-primary font-mono whitespace-nowrap',
                  column.class
                )}>
                  {#if column.render}
                    {@html column.render(row[column.key], row)}
                  {:else}
                    {row[column.key] ?? '—'}
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
  <!-- Pagination and Info -->
  <div class="flex items-center justify-between text-sm text-yorha-text-secondary font-mono">
    <div>
      Showing {currentPage * pageSize + 1} to {Math.min((currentPage + 1) * pageSize, filteredData.length)} of {filteredData.length} records
      {#if selectedRows.size > 0}
        ({selectedRows.size} selected)
      {/if}
    </div>
    {#if totalPages > 1}
      <div class="flex items-center gap-2">
        <Button class="bits-btn"
          variant="ghost"
          size="sm"
          disabled={currentPage === 0}
          onclick={() =>
currentPage = Math.max(0, currentPage - 1)}
        >
          Previous
        <span class="px-3 py-1 text-yorha-text-primary">
          Page {currentPage + 1} of {totalPages}
        </span>
        <Button class="bits-btn"
          variant="ghost"
          size="sm"
          disabled={currentPage >
= totalPages - 1}
          onclick={() => currentPage = Math.min(totalPages - 1, currentPage + 1)}
        >
          Next
      {/if}
  </div>
</div>
<style>
  :global(.legal-data-table table) {
    font-variant-numeric: tabular-num;
  }
  :global(.legal-data-table th) {
    user-select: none;
  }
  :global(.legal-data-table tbody tr:hover) {
    background-color: rgb(var(--yorha-bg-tertiary) / 0.5);
  }
</style>