<script lang="ts">
  import type { Snippet } from 'svelte';

  export interface TableColumn {
    key: string;
	title: string;
    sortable?: boolean;
    width?: string;
    align?: 'left' | 'center' | 'right';
    type?: 'text' | 'number' | 'date' | 'status' | 'action';
  }

  export interface TableRow {
    id: string | number;
    [key: string]: any;
  }

  interface Props {
    columns: TableColumn[];
    data: TableRow[];
    loading?: boolean;
    selectable?: boolean;
    sortable?: boolean;
    pagination?: boolean;
    pageSize?: number;
    className?: string;
    dense?: boolean;
    actionsSnippet?: Snippet<[TableRow, number]>;
  }

  let {
    columns = [],
    data = [],
    loading = false,
    selectable = false,
    sortable = true,
    pagination = false,
    pageSize = 10,
    className = '',
    dense = false,
    actionsSnippet
  }: Props = $props();

  let selectedRows = $state(new Set<string | number>());
  let sortColumn = $state<string | null>(null);
  let sortDirection = $state<'asc' | 'desc'>('asc');
  let currentPage = $state(1);
  let searchQuery = $state('');

  const filteredData = $derived.by(() => {
    let filtered = [...data];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        Object.values(item).some(val => String(val).toLowerCase().includes(q))
      );
    }
    if (sortColumn) {
      filtered.sort((a, b) => {
        const aVal = a[sortColumn!];
        const bVal = b[sortColumn!];
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        return sortDirection === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      });
    }
    return filtered;
  });

  const paginatedData = $derived.by(() => {
    const list = filteredData;
    if (!pagination) return list;
    const start = (currentPage - 1) * pageSize;
    return list.slice(start, start + pageSize);
  });

  const totalPages = $derived(Math.ceil(filteredData.length / pageSize));

  function handleSort(column: TableColumn) {
    if (!column.sortable || !sortable) return;
    if (sortColumn === column.key) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column.key;
      sortDirection = 'asc';
    }
  }

  function toggleRowSelection(rowId: string | number) {
    if (selectedRows.has(rowId)) {
      selectedRows.delete(rowId);
    } else {
      selectedRows.add(rowId);
    }
    selectedRows = new Set(selectedRows);
  }

  function formatCellValue(value: any, column: TableColumn) {
    if (value === null || value === undefined) return '-';
    switch (column.type) {
      case 'date':
        return new Date(String(value)).toLocaleDateString();
      case 'number':
        return typeof value === 'number' ? value.toLocaleString() : String(value);
	default:return String(value);
    }
  }
</script>

<div class="w-full bg-panel border border-sand/20 rounded overflow-hidden {className}">
  <!-- Table Search -->
  <div class="p-3 border-b border-sand/20 flex items-center gap-4 bg-panel/50">
    <div class="relative flex-1 max-w-sm">
      <input
        bind:value={searchQuery}
        placeholder="Filter records..."
        class="w-full bg-panelSoft border border-sand/20 rounded px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-info outline-none"
      />
    </div>
    {#if loading}
      <div class="text-[10px] text-info font-mono animate-pulse uppercase">Syncing...</div>
    {/if}
  </div>

  <!-- Table Body -->
  <div class="overflow-x-auto">
    <table class="w-full text-left border-collapse">
      <thead>
        <tr class="border-b border-sand/20 bg-panel/50">
          {#if selectable}
            <th class="p-3 w-10">
              <input type="checkbox" onchange={() => {}} class="rounded bg-panelSoft border-sand/20" />
            </th>
          {/if}
          {#each columns as col}
            <th
              class="p-3 text-[10px] font-bold text-sand/60 uppercase tracking-widest cursor-pointer hover:text-sand/40"
              style:width={col.width}
              onclick={() => handleSort(col)}
            >
              <div class="flex items-center gap-1">
                {col.title}
                {#if sortColumn === col.key}
                  <span class="text-info">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                {/if}
              </div>
            </th>
          {/each}
          {#if actionsSnippet}
            <th class="p-3 text-[10px] font-bold text-sand/60 uppercase tracking-widest text-right">Actions</th>
          {/if}
        </tr>
      </thead>
      <tbody class="divide-y divide-sand/50">
        {#each paginatedData as row, i}
          <tr class="hover:bg-info/5 transition-colors group">
            {#if selectable}
              <td class="p-3">
                <input
                  type="checkbox"
                  checked={selectedRows.has(row.id)}
                  onchange={() => toggleRowSelection(row.id)}
                  class="rounded bg-panelSoft border-sand/20"
                />
              </td>
            {/if}
            {#each columns as col}
              <td class="p-3 text-sm text-sand/40 group-hover:text-white transition-colors" style:text-align={col.align}>
                {#if col.type === 'status'}
                  <span class="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-panelSoft border border-sand/20">
                    {row[col.key]}
                  </span>
                {:else}
                  {formatCellValue(row[col.key], col)}
                {/if}
              </td>
            {/each}
            {#if actionsSnippet}
              <td class="p-3 text-right">
                {@render actionsSnippet(row, i)}
              </td>
            {/if}
          </tr>
        {:else}
          <tr>
            <td colspan={columns.length + (selectable ? 1 : 0) + (actionsSnippet ? 1 : 0)} class="p-8 text-center text-sand/60 font-mono text-xs italic">
              NO RECORDS LOADED
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Pagination -->
  {#if pagination && totalPages > 1}
    <div class="p-3 border-t border-sand/20 flex justify-between items-center bg-panel/50">
      <span class="text-[10px] font-mono text-sand/60 uppercase">
        Page {currentPage} of {totalPages}
      </span>
      <div class="flex gap-1">
        <button
          disabled={currentPage === 1}
          onclick={() => currentPage--}
          class="px-2 py-1 bg-panelSoft border border-sand/20 text-[10px] font-bold enabled:hover bg-panelSoft disabled:opacity-30 transition-all font-mono"
        >
          PREV
        </button>
        <button
          disabled={currentPage === totalPages}
          onclick={() => currentPage++}
          class="px-2 py-1 bg-panelSoft border border-sand/20 text-[10px] font-bold enabled:hover bg-panelSoft disabled:opacity-30 transition-all font-mono"
        >
          NEXT
        </button>
      </div>
    </div>
  {/if}
</div>





