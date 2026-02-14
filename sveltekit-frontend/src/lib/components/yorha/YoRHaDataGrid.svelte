<script lang="ts">
  import type { Snippet } from 'svelte';

  export interface GridColumn {
    key: string;
	title: string;
    formatter?: (value: any, row: any) => string;
  }

  interface DataGridProps {
    columns?: GridColumn[];
    data?: any[];
    loading?: boolean;
    className?: string;
    actionsSnippet?: Snippet<[any, number]>;
  }

  let {
    columns = [],
    data = [],
    loading = false,
    className = '',
    actionsSnippet
  }: DataGridProps = $props();

  function formatCellValue(value: any, col: GridColumn, row: any) {
    if (col.formatter) return col.formatter(value, row);
    return value === undefined || value === null ? '-' : String(value);
  }
</script>

<div class="w-full bg-panel border-2 border-sand/20 font-mono text-xs {className}">
  {#if loading}
    <div class="p-8 text-center text-info animate-pulse uppercase tracking-widest bg-panel/50">
      Syncing Neural Network...
    </div>
  {:else}
    <div class="overflow-auto max-h-[600px] custom-scrollbar">
      <table class="w-full border-collapse">
        <thead class="sticky top-0 z-10">
          <tr class="bg-panelSoft border-b-2 border-sand/20">
            {#each columns as col}
              <th class="p-3 text-sand/40 uppercase text-left font-bold">{col.title}</th>
            {/each}
            {#if actionsSnippet}
              <th class="p-3 text-sand/40 uppercase text-right font-bold">Actions</th>
            {/if}
          </tr>
        </thead>
        <tbody class="divide-y divide-sand/20">
          {#each data as row, i (row?.id ?? i)}
            <tr class="hover:bg-panelSoft/50 transition-colors group">
              {#each columns as col}
                <td class="p-3 text-sand/40 group-hover:text-info transition-colors">
                  {formatCellValue(row[col.key], col, row)}
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
              <td colspan={columns.length + (actionsSnippet ? 1 : 0)} class="p-12 text-center text-sand/60 italic">
                NO DATA RECORDS RETRIEVED
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
	height: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #334155;
    border-radius: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #475569;
  }
</style>




