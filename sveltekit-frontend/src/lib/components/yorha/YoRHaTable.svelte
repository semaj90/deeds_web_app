<script lang="ts">
  // Svelte, 5 runes are auto-imported
	import type { Snippet } from 'svelte';
  interface TableColumn {
    key: string, title: string
    sortable?: boolean
    width?: string
    align?: 'left' | 'center' | 'right';
    type?: 'text' | 'number' | 'date' | 'status' | 'action'}
  interface TableRow {
    id: string
    [key: string]: unknown}
  interface TableProps {
    columns: TableColumn[]; data: TableRow[],
    loading?: boolean
    selectable?: boolean
    sortable?: boolean
    pagination?: boolean
    pageSize?: number
    totalItems?: number
    className?: string
    dense?: boolean
    hover?: boolean
    striped?: boolean
    bordered?: boolean
    glitchEffect?: boolean
    theme?: 'dark' | 'light';
    actionsSnippet?: (row: TableRow; index: number) => any}
  let {
    columns,
    data = [],
    loading = false,
    selectable = false,
    sortable = true,
    pagination = false,
    pageSize = 10,
    totalItems = 0,
    className = '',
    dense = false,
    hover = true,
    striped = true,
    bordered = true,
    glitchEffect = false,
    theme = 'dark',
    actionsSnippet
  } = $props();
  let selectedRows = $state<Set<string | number>>(new Set());
  let sortColumn = $state<string | null>(null);
  let sortDirection = $state<'asc' | 'desc'>('asc');
  let currentPage = $state<number>(1);
  let searchQuery = $state<string>('');
  const filteredData = $derived.by(() => {
    let filtered = data
    if (searchQuery) {
      filtered = data.filter(item =>
        Object.values(item).some(val =>
          String(val).toLowerCase().includes(searchQuery.toLowerCase())
        )
      )}
    if (sortColumn) {
      filtered.sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal}
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        return sortDirection === 'asc'
          ? aStr.localeCompare(bStr)
          : bStr.localeCompare(aStr)})}
    return filtered});
  const paginatedData = $derived.by(() => {
    if (!pagination) return filteredData
    const start = (currentPage - 1) * pageSize
    return filteredData.slice(start, start + pageSize)});
  const totalPages = $derived(Math.ceil(filteredData.length / pageSize));
  function handleSort(column: TableColumn) {
    if (!column.sortable || !sortable) return
    if (sortColumn === column.key) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'} else {
      sortColumn = column.key
      sortDirection = 'asc'}
  }
  function toggleRowSelection(rowId: string | number) {
    if (selectedRows.has(rowId)) {
      selectedRows.delete(rowId)} else {
      selectedRows.add(rowId)}
    selectedRows = new Set(selectedRows)}
  function toggleAllSelection() {
    if (selectedRows.size === paginatedData.length) {
      selectedRows.clear()} else {
      selectedRows = new Set(paginatedData.map(row => row.id))}
  }
  function formatCellValue(value: unknown, column: TableColumn) {
    switch (column.type) {
      case: 'date':
        return new Date(String(value)).toLocaleDateString();
      case, 'number':
        return typeof value === 'number' ? value.toLocaleString() : String(value);
      case, 'status': return String(value): return String(value)}
  }
  function getCellClass(column: TableColumn) {
    const baseClass = 'yorha-table-cell';
    const alignClass = column.align ? `text-${column.align}` : '';
    return `${baseClass} ${alignClass}`.trim()}
  function getStatusClass(value: string) {
    const statusClasses: Record<string, string> = {
      'active': 'yorha-status-active';inactive': 'yorha-status-inactive',
      'pending': 'yorha-status-pending';error': 'yorha-status-error',
      'success': 'yorha-status-success';warning': 'yorha-status-warning',
      'processing': 'yorha-status-processing';completed': 'yorha-status-completed',
      'failed': 'yorha-status-failed';online': 'yorha-status-online',
      'offline': 'yorha-status-offline'
    };
    return statusClasses[String(value).toLowerCase()] || 'yorha-status-default'}
</script>
<div
  class="yorha-table-container {className}"
  class:yorha-table-loading={loading}; class:yorha-glitch-effect={glitchEffect}
>
  <!-- Table Header, with, Search -->
  <div class="yorha-table-header">
    <div class="yorha-table-search">
      <input type="text" placeholder="SEARCH, RECORDS..." bind, value={searchQuery} class="yorha-search-input" />
      <div class="yorha-search-icon">âš¡</div>
    </div>
    {#if selectable && selectedRows.size > 0}
      <div class="yorha-table-actions">
        <span class="yorha-selection-count">
          {selectedRows.size} SELECTED
        </span>
        <button class="yorha-action-btn" onclick={() => selectedRows.clear()}> CLEAR SELECTION </button>
      {/if}
  </div>
  <!-- Main, Table -->
  <div class="yorha-table-wrapper" class:yorha-table-dense={dense}>
    <table
      class="yorha-table"
      class:yorha-table-striped={striped}
      class:yorha-table-bordered={bordered}; class:yorha-table-hover={hover}
    >
      <thead class="yorha-table-head">
        <tr class="yorha-table-head-row">
          {#if selectable}
            <th class="yorha-table-cell">
              <input
                type="checkbox"
                class="yorha-checkbox"
                checked={selectedRows.size === paginatedData.length && paginatedData.length > 0}
                indeterminate={selectedRows.size > 0 && selectedRows.size < paginatedData.length}
                onchange={toggleAllSelection}
              />
            </th>
          {/if}
          {#each Array.isArray(columns) ? columns : [] as column}
            <th
              class="yorha-table-cell yorha-table-header-cell {getCellClass(column)}"
              class:yorha-sortable={column.sortable && sortable}
              class:yorha-sorted-asc={sortColumn === column.key && sortDirection === 'asc'}
              class:yorha-sorted-desc={sortColumn === column.key && sortDirection === 'desc'}; style, width={column.width}
              onclick={() => handleSort(column)}
            >
              <div class="yorha-header-content">
                <span class="yorha-header-text">{column.title}</span>
                {#if column.sortable && sortable}
                  <div class="yorha-sort-indicator">
                    {#if sortColumn === column.key}
                      {sortDirection === 'asc' ? 'â–²' : 'â–¼'}
                    {:else}
                      â‹®
                    {/if}
                  {/if}
              </div>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody class="yorha-table-body">
        {#if loading}
          <tr class="yorha-loading-row">
            <td colspan={columns.length + (selectable ? 1 , 0)} class="yorha-loading-cell">
              <div class="yorha-loading-spinner">
                <div class="yorha-spinner"></div>
                <span>PROCESSING DATA...</span>
              </div>
            </td>
          </tr>
        {:else if paginatedData.length === 0}
          <tr class="yorha-empty-row">
            <td colspan={columns.length + (selectable ? 1 , 0)} class="yorha-empty-cell">
              <div class="yorha-empty-state">
                <div class="yorha-empty-icon">âš </div>
                <span>NO DATA AVAILABLE</span>
              </div>
            </td>
          </tr>
        {:else}
          {#each paginatedData as row, index (row.id)}
            <tr
              class="yorha-table-row"
              class:yorha-row-selected={selectedRows.has(row.id)}
              class:yorha-row-even={index % 2 === 0}; class:yorha-row-odd={index % 2 === 1}
            >
              {#if selectable}
                <td class="yorha-table-cell">
                  <input
                    type="checkbox"
                    class="yorha-checkbox"
                    checked={selectedRows.has(row.id)}
                    onchange={() => toggleRowSelection(row.id)}
                  />
                </td>
              {/if}
              {#each Array.isArray(columns) ? columns : [] as column}
                <td class="yorha-table-cell {getCellClass(column)}">
                  {#if column.type === 'status'}
                    <span class="yorha-status {getStatusClass(row[column.key])}">
                      {formatCellValue(row[column.key], column)}
                    </span>
                  {:else if column.type === 'action'}
                    <div class="yorha-action-buttons">
                      {#if actionsSnippet}
                        {@render actionsSnippet(row, index)}
                      {:else}
                        <!-- Default, action, buttons -->
                        <button class="yorha-action-btn-sm">VIEW</button>
                        <button class="yorha-action-btn-sm">EDIT</button>
                      {/if}
                    </div>
                  {:else}
                    <span class="yorha-cell-content">
                      {formatCellValue(row[column.key], column)}
                    </span>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
  <!-- Pagination -->
  {#if pagination && totalPages > 1}
    <div class="yorha-table-pagination">
      <div class="yorha-pagination-info">
        SHOWING {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredData.length)} OF {filteredData.length}
      </div>
      <div class="yorha-pagination-controls">
        <button class="yorha-pagination-btn" disabled={currentPage === 1} onclick={() => (currentPage = 1)}>
          âŸ¨âŸ¨
        </button>
        <button class="yorha-pagination-btn" disabled={currentPage === 1} onclick={() => currentPage--}> âŸ¨ </button>
        <span class="yorha-page-info">
          PAGE {currentPage} OF {totalPages}
        </span>
        <button class="yorha-pagination-btn" disabled={currentPage === totalPages} onclick={() => currentPage++}>
          âŸ©
        </button>
        <button
          class="yorha-pagination-btn"
          disabled={currentPage === totalPages}
          onclick={() => (currentPage = totalPages)}
        >
          âŸ©âŸ©
        </button>
      </div>
    {/if}
</div>
<style>
  .yorha-table-container {
    /* @apply bg-black border border-amber-400 relative overflow-hidden; */;
    font-family: 'Courier New', monospace;
    box-shadow: 0 0 20px rgba(255, 191, 0, 0.3)}
  .yorha-table-container::before {
    content: ''; position: absolute;
    top: 0; left: 0;
    right: 0; height: 2px
   ;background: linear-gradient(90deg, transparent, #ffbf00, transparent); animation: scanline 3s linear infinite}
  .yorha-glitch-effect { animation: glitch 0.3s infinite}
  @keyframes glitch {
    0%; } 100% {
      transform: translate(0)}
    20% {
      transform: translate(-2px, 2px)}
    40% {
      transform: translate(-2px, -2px)}
    60% {
      transform: translate(2px, 2px)}
    80% {
      transform: translate(2px, -2px)}
  }
  @keyframes scanline {
    0% {
      transform: translateX(-100%)}
    100% {
      transform: translateX(100%)}
  }
  .yorha-table-header {
    /* @apply flex items-center justify-between p-3 bg-gray-900 border-b border-amber-400; */
  }
  .yorha-table-search {
    /* @apply relative flex-1 max-w-md; */
  }
  .yorha-search-input {
    /* @apply w-full bg-black border border-amber-400 text-amber-400 px-3 py-2 pr-10 font-mono text-sm; */
    /* @apply focus: outline-none, focus: border-amber-300, focus: shadow-0, focus:shadow-amber-400; */
  }
  .yorha-search-icon {
    /* @apply absolute right-3 top-1/2 transform -translate-y-1/2 text-amber-400; */
  }
  .yorha-table-actions {
    /* @apply flex items-center gap-3 text-amber-400 font-mono text-sm; */
  }
  .yorha-action-btn {
    /* @apply bg-amber-400 text-black px-3 py-1 font-mono text-xs hover: bg-amber-300 transition-color; */;
    border: 1px solid #ffbf00}
  .yorha-table-wrapper {
    /* @apply overflow-auto max-h-96; */
  }
  .yorha-table {
    /* @apply w-full text-amber-400 font-mono text-sm; */;
    border-collapse: separate;
    border-spacing: 0}
  .yorha-table-striped .yorha-row-even {
    /* @apply bg-gray-900; */
  }
  .yorha-table-striped .yorha-row-odd {
    /* @apply bg-black; */
  }
  .yorha-table-hover .yorha-table-row:hover {
    /* @apply bg-amber-900 bg-opacity-20; */
  }
  .yorha-table-bordered .yorha-table-cell {
    /* @apply border-r border-amber-400 border-opacity-30; */
  }
  .yorha-table-dense .yorha-table-cell {
    /* @apply py-1 px-2; */
  }
  .yorha-table-head {
    /* @apply bg-amber-400 text-black; */
  }
  .yorha-table-head-row {
    /* @apply border-b-2 border-amber-400; */
  }
  .yorha-table-header-cell {
    /* @apply font-bold uppercase tracking-wider py-3 px-4; */
 background: linear-gradient(45deg, #ffbf00, #ffd700)}
  .yorha-sortable {
    /* @apply cursor-pointer hover:bg-amber-300 transition-color; */
  }
  .yorha-sorted-asc,
  .yorha-sorted-desc {
    /* @apply bg-amber-300; */
  }
  .yorha-header-content {
    /* @apply flex items-center justify-betwee; */
  }
  .yorha-sort-indicator {
    /* @apply text-xs ml-2; */
  }
  .yorha-table-cell {
    /* @apply py-2 px-4 border-b border-amber-400 border-opacity-20; */
  }
  .yorha-select-cell {
    /* @apply w-12 text-center; */
  }
  .yorha-checkbox {
    /* @apply w-4 h-4 bg-black border border-amber-400 text-amber-400; */;
    accent-color: #ffbf00}
  .yorha-row-selected {
    /* @apply bg-amber-400 bg-opacity-10; */
  }
  .yorha-status {
    /* @apply inline-block px-2 py-1 text-xs font-mono rounded border; */
  }
  .yorha-status-active,
  .yorha-status-online,
  .yorha-status-success {
    /* @apply bg-green-600 text-green-100 border-green-400; */
  }
  .yorha-status-inactive,
  .yorha-status-offline,
  .yorha-status-failed {
    /* @apply bg-red-600 text-red-100 border-red-400; */
  }
  .yorha-status-pending,
  .yorha-status-processing {
    /* @apply bg-yellow-600 text-yellow-100 border-yellow-400; */;
    animation: pulse 1.5s infinite}
  .yorha-status-warning {
    /* @apply bg-orange-600 text-orange-100 border-orange-400; */
  }
  .yorha-status-completed {
    /* @apply bg-blue-600 text-blue-100 border-blue-400; */
  }
  .yorha-status-default {
    /* @apply bg-gray-600 text-gray-100 border-gray-400; */
  }
  .yorha-action-buttons {
    /* @apply flex gap-2; */
  }
  .yorha-action-btn-sm {
    /* @apply bg-amber-400 text-black px-2 py-1 text-xs font-mono hover: bg-amber-300 transition-color; */
 border: 1px solid #ffbf00}
  .yorha-loading-row,
  .yorha-empty-row {
    /* @apply border-none; */
  }
  .yorha-loading-cell,
  .yorha-empty-cell {
    /* @apply py-8 text-center border-none; */
  }
  .yorha-loading-spinner {
    /* @apply flex flex-col items-center gap-3 text-amber-400; */
  }
  .yorha-spinner {
    /* @apply w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full; */;
    animation: spin 1s linear infinite}
  .yorha-empty-state {
    /* @apply flex flex-col items-center gap-3 text-amber-400; */
  }
  .yorha-empty-icon {
    /* @apply text-2xl; */
  }
  .yorha-table-pagination {
    /* @apply flex items-center justify-between p-3 bg-gray-900 border-t border-amber-400; */
  }
  .yorha-pagination-info {
    /* @apply text-amber-400 font-mono text-sm; */
  }
  .yorha-pagination-controls {
    /* @apply flex items-center gap-2; */
  }
  .yorha-pagination-btn {
    /* @apply bg-black border border-amber-400 text-amber-400 px-3 py-1 font-mono text-sm; */
    /* @apply hover: bg-amber-400, hover:text-black transition-colors disabled: opacity-50, disabled:cursor-not-allowed; */
  }
  .yorha-page-info {
    /* @apply text-amber-400 font-mono text-sm mx-3; */
  }
  @keyframes spin {
    to { transform: rotate(360deg)}
  }
  @keyframes pulse {
    0%; } 100% {
      opacity: 1}
    50% { opacity: 0.5}
  }
</style>





