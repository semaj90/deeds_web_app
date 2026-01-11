<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

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

  const assigneeOptions = [
    { value: 'all', label: 'All Assignees' },
    { value: 'Detective A2', label: 'Detective A2' },
    { value: 'Detective B7', label: 'Detective B7' },
    { value: 'Detective C3', label: 'Detective C3' },
    { value: 'Detective D9', label: 'Detective D9' }
  ];

  const dateRangeOptions = [
    { value: 'all', label: 'All Time' },
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'quarter', label: 'This Quarter' }
  ];

  function applyFilters() {
    dispatch('filter', {
      search: searchQuery,
      status: statusFilter,
      priority: priorityFilter,
      assignee: assigneeFilter,
      dateRange: dateRange
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

  function exportCases() {
    // In a real app, this would trigger a download
    console.log('Exporting cases...');
  }
</script>

<div class="bg-slate-800/50 backdrop-blur rounded-lg p-6 border border-slate-700/50">
  <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
    <!-- Search -->
    <div class="flex-1 max-w-md">
      <div class="relative">
        <input
          type="text"
          placeholder="Search cases..."
          class="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
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
    <div class="flex flex-wrap items-center space-x-4">
      <select
        class="bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
        bind:value={statusFilter}
        onchange={applyFilters}
      >
        {#each statusOptions as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>

      <select
        class="bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
        bind:value={priorityFilter}
        onchange={applyFilters}
      >
        {#each priorityOptions as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>

      <select
        class="bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
        bind:value={assigneeFilter}
        onchange={applyFilters}
      >
        {#each assigneeOptions as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>

      <select
        class="bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
        bind:value={dateRange}
        onchange={applyFilters}
      >
        {#each dateRangeOptions as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>

      <!-- Actions -->
      <button
        class="px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 text-sm rounded-lg transition-colors"
        onclick={clearFilters}
      >
        Clear Filters
      </button>

      <button
        class="px-4 py-2 bg-cyan-400/20 hover:bg-cyan-400/30 text-cyan-400 text-sm rounded-lg transition-colors"
        onclick={exportCases}
      >
        Export
      </button>

      <button class="px-4 py-2 bg-green-400/20 hover:bg-green-400/30 text-green-400 text-sm rounded-lg transition-colors">
        + New Case
      </button>
    </div>
  </div>

  <!-- Active Filters Display -->
  {#if searchQuery || statusFilter !== 'all' || priorityFilter !== 'all' || assigneeFilter !== 'all' || dateRange !== 'all'}
    <div class="mt-4 pt-4 border-t border-slate-700/50">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm text-slate-400">Active filters:</span>

        {#if searchQuery}
          <span class="px-2 py-1 bg-cyan-400/20 text-cyan-400 text-xs rounded">
            Search: "{searchQuery}"
          </span>
        {/if}

        {#if statusFilter !== 'all'}
          <span class="px-2 py-1 bg-green-400/20 text-green-400 text-xs rounded">
            Status: {statusOptions.find(o => o.value === statusFilter)?.label}
          </span>
        {/if}

        {#if priorityFilter !== 'all'}
          <span class="px-2 py-1 bg-yellow-400/20 text-yellow-400 text-xs rounded">
            Priority: {priorityOptions.find(o => o.value === priorityFilter)?.label}
          </span>
        {/if}

        {#if assigneeFilter !== 'all'}
          <span class="px-2 py-1 bg-purple-400/20 text-purple-400 text-xs rounded">
            Assignee: {assigneeOptions.find(o => o.value === assigneeFilter)?.label}
          </span>
        {/if}

        {#if dateRange !== 'all'}
          <span class="px-2 py-1 bg-blue-400/20 text-blue-400 text-xs rounded">
            Date: {dateRangeOptions.find(o => o.value === dateRange)?.label}
          </span>
        {/if}
      </div>
    </div>
  {/if}
</div>