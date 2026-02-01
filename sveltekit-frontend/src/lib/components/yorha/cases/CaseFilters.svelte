<script lang="ts">
  let { onFilter = (filters: any) => {} } = $props();

  let searchQuery = $state('');
  let statusFilter = $state('all');
  let priorityFilter = $state('all');
  let assigneeFilter = $state('all');
  let dateRange = $state('all');

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'review', label: 'Under Review' },
    { value: 'closed', label: 'Closed' }
  ];

  const priorityOptions = [
    { value: 'all', label: 'All Priority' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' }
  ];

  function applyFilters() {
    onFilter({
      search: searchQuery,
      status: statusFilter,
      priority: priorityFilter,
      assignee: assigneeFilter,
      dateRange
    });
  }

  function clearFilters() {
    searchQuery = '';
    statusFilter = 'all';
    priorityFilter = 'all';
    assigneeFilter = 'all';
    dateRange = 'all';
    applyFilters();
  }
</script>

<div class="bg-slate-800/50 backdrop-blur rounded-lg p-6 border border-slate-700/50 mb-6">
  <div class="flex flex-col lg: flex-row, lg:items-center lg:justify-between gap-4">
    <!-- Search -->
    <div class="flex-1 max-w-md">
      <div class="relative">
        <input
          type="text"
          placeholder="Search cases..."
          class="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus: ring-2, focus:ring-cyan-400 focus:border-transparent transition-all"
          bind:value={searchQuery}
          oninput={applyFilters}
        />
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg class="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-4">
      <select
        class="bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus: ring-2, focus:ring-cyan-400 focus:border-transparent outline-none"
        bind:value={statusFilter}
        onchange={applyFilters}
      >
        {#each statusOptions as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>

      <select
        class="bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus: ring-2, focus:ring-cyan-400 focus:border-transparent outline-none"
        bind:value={priorityFilter}
        onchange={applyFilters}
      >
        {#each priorityOptions as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>

      <button
        onclick={clearFilters}
        class="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors border border-slate-600 rounded-lg hover:bg-slate-700"
      >
        Reset
      </button>
    </div>
  </div>
</div>


