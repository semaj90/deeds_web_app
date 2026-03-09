<!--
  Case Tracker Component
  Advanced case management with filtering, sorting, and real-time updates using Enhanced Bits UI
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import {
    ButtonBits,
    CardBits,
    BadgeBits,
    InputBits,
    SelectBits,
    TableBits,
    DropdownMenuBits,
    AlertBits,
    ProgressBits,
    SkeletonBits,
    SeparatorBits,
    TooltipBits
  } from '$lib/components/ui/bits-ui';
  import {
    Search,
    Filter,
    Plus,
    MoreHorizontal,
    Edit3,
    Eye,
    Calendar,
    User,
    Building,
    AlertTriangle,
    Clock,
    CheckCircle,
    ArrowUpDown,
    ChevronLeft,
    ChevronRight,
    RefreshCw
  } from 'lucide-svelte';
  import type { Case, CaseFilters } from '$lib/server/services/case-management';

  // Svelte 5 runes for state management
  let cases = $state<Case[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let currentPage = $state(1);
  let totalPages = $state(1);
  let totalCases = $state(0);

  // Filters and search
  let searchQuery = $state('');
  let statusFilter = $state<string[]>([]);
  let practiceAreaFilter = $state<string[]>([]);
  let priorityFilter = $state<string[]>([]);
  let sortBy = $state('updatedAt');
  let sortOrder = $state<'asc' | 'desc'>('desc');

  // UI state
  let showFilters = $state(false);
  let selectedCases = $state<string[]>([]);
  let itemsPerPage = $state(20);

  // Filter options
  const statusOptions = [
    { value: 'active', label: 'Active', color: 'bg-green-100 text-green-800' },
    { value: 'pending', label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'on_hold', label: 'On Hold', color: 'bg-orange-100 text-orange-800' },
    { value: 'closed', label: 'Closed', color: 'bg-gray-100 text-gray-800' },
    { value: 'archived', label: 'Archived', color: 'bg-blue-100 text-blue-800' }
  ];

  const practiceAreaOptions = [
    { value: 'corporate', label: 'Corporate Law' },
    { value: 'litigation', label: 'Litigation' },
    { value: 'criminal', label: 'Criminal Law' },
    { value: 'family', label: 'Family Law' },
    { value: 'intellectual_property', label: 'IP Law' },
    { value: 'real_estate', label: 'Real Estate' },
    { value: 'employment', label: 'Employment' },
    { value: 'tax', label: 'Tax Law' },
    { value: 'immigration', label: 'Immigration' },
    { value: 'other', label: 'Other' }
  ];

  const priorityOptions = [
    { value: 'low', label: 'Low', color: 'bg-blue-100 text-blue-800' },
    { value: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-800' },
    { value: 'critical', label: 'Critical', color: 'bg-red-100 text-red-800' }
  ];

  const sortOptions = [
    { value: 'updatedAt', label: 'Last Updated' },
    { value: 'createdAt', label: 'Date Created' },
    { value: 'dueDate', label: 'Due Date' },
    { value: 'title', label: 'Case Title' },
    { value: 'priority', label: 'Priority' },
    { value: 'progress', label: 'Progress' }
  ];

  // Derived values
  const userId = $derived($page.data?.user?.id || 'mock-user-id');
  const hasFilters = $derived(
    statusFilter.length > 0 ||
    practiceAreaFilter.length > 0 ||
    priorityFilter.length > 0 ||
    searchQuery.trim() !== ''
  );

  onMount(() => {
    loadCases();
  });

  async function loadCases(silent = false) {
    if (!silent) isLoading = true;
    error = null;

    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
        sortBy,
        sortOrder,
        ...(searchQuery && { search: searchQuery }),
        ...(statusFilter.length && { status: statusFilter.join(',') }),
        ...(practiceAreaFilter.length && { practiceArea: practiceAreaFilter.join(',') }),
        ...(priorityFilter.length && { priority: priorityFilter.join(',') })
      });

      const response = await fetch(`/api/case-management/cases?${params}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        cases = data.cases || [];
        totalCases = data.total || 0;
        totalPages = Math.ceil(totalCases / itemsPerPage);
      } else {
        throw new Error(data.error || 'Failed to load cases');
      }
    } catch (err) {
      console.error('Failed to load cases:', err);
      error = err instanceof Error ? err.message : 'Failed to load cases';
    } finally {
      isLoading = false;
    }
  }

  function handleSearch() {
    currentPage = 1;
    loadCases();
  }

  function handleSort(column: string) {
    if (sortBy === column) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = column;
      sortOrder = 'desc';
    }
    currentPage = 1;
    loadCases();
  }

  function handlePageChange(page: number) {
    currentPage = page;
    loadCases();
  }

  function clearFilters() {
    searchQuery = '';
    statusFilter = [];
    practiceAreaFilter = [];
    priorityFilter = [];
    currentPage = 1;
    loadCases();
  }

  function toggleCaseSelection(caseId: string) {
    if (selectedCases.includes(caseId)) {
      selectedCases = selectedCases.filter(id => id !== caseId);
    } else {
      selectedCases = [...selectedCases, caseId];
    }
  }

  function selectAllCases() {
    if (selectedCases.length === cases.length) {
      selectedCases = [];
    } else {
      selectedCases = cases.map(c => c.id);
    }
  }

  function getStatusColor(status: string): string {
    const option = statusOptions.find(opt => opt.value === status);
    return option?.color || 'bg-gray-100 text-gray-800';
  }

  function getPriorityColor(priority: string): string {
    const option = priorityOptions.find(opt => opt.value === priority);
    return option?.color || 'bg-gray-100 text-gray-800';
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString();
  }

  function formatRelativeDate(dateString: string): string {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return formatDate(dateString);
  }

  function navigateToCase(caseId: string) {
    window.location.href = `/cases/${caseId}`;
  }

  function createNewCase() {
    window.location.href = '/cases/new';
  }
</script>

<svelte:head>
  <title>Case Tracker - Legal AI Platform</title>
</svelte:head>

<div class="case-tracker">
  <!-- Header -->
  <div class="tracker-header">
    <div class="header-content">
      <h1 class="tracker-title">📁 Case Tracker</h1>
      <p class="tracker-subtitle">
        Manage and track all legal cases with advanced filtering and AI insights
      </p>
    </div>

    <div class="header-actions">
      <ButtonBits onclick={createNewCase} size="sm">
        <Plus class="w-4 h-4 mr-2" />
        New Case
      </ButtonBits>
    </div>
  </div>

  <!-- Filters and Search -->
  <CardBits class="mb-6">
    <div class="p-4">
      <div class="flex flex-col lg:flex-row gap-4">
        <!-- Search -->
        <div class="flex-1">
          <div class="relative">
            <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <InputBits
              bind:value={searchQuery}
              placeholder="Search cases by title, number, or description..."
              class="pl-10"
              onkeydown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
        </div>

        <!-- Quick Filters -->
        <div class="flex gap-2">
          <SelectBits bind:value={statusFilter} multiple placeholder="Status">
            {#each statusOptions as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </SelectBits>

          <SelectBits bind:value={practiceAreaFilter} multiple placeholder="Practice Area">
            {#each practiceAreaOptions as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </SelectBits>

          <SelectBits bind:value={sortBy} placeholder="Sort by">
            {#each sortOptions as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </SelectBits>
        </div>

        <!-- Actions -->
        <div class="flex gap-2">
          <ButtonBits onclick={handleSearch} variant="outline" size="sm">
            <Search class="w-4 h-4" />
          </ButtonBits>

          <ButtonBits
            onclick={() => showFilters = !showFilters}
            variant="outline"
            size="sm"
            class={showFilters ? 'bg-blue-50 border-blue-200' : ''}
          >
            <Filter class="w-4 h-4" />
          </ButtonBits>

          <ButtonBits onclick={() => loadCases()} variant="outline" size="sm">
            <RefreshCw class="w-4 h-4" />
          </ButtonBits>

          {#if hasFilters}
            <ButtonBits onclick={clearFilters} variant="outline" size="sm">
              Clear Filters
            </ButtonBits>
          {/if}
        </div>
      </div>

      <!-- Advanced Filters (Collapsible) -->
      {#if showFilters}
        <SeparatorBits class="my-4" />
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SelectBits bind:value={priorityFilter} multiple placeholder="Priority Level">
            {#each priorityOptions as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </SelectBits>

          <InputBits
            type="date"
            placeholder="Due Date From"
            class="w-full"
          />

          <InputBits
            type="date"
            placeholder="Due Date To"
            class="w-full"
          />
        </div>
      {/if}
    </div>
  </CardBits>

  <!-- Results Summary -->
  {#if !isLoading}
    <div class="results-summary mb-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <span class="text-sm text-gray-600">
            Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, totalCases)} of {totalCases} cases
          </span>

          {#if hasFilters}
            <BadgeBits variant="secondary" class="text-xs">
              Filtered Results
            </BadgeBits>
          {/if}
        </div>

        {#if selectedCases.length > 0}
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600">
              {selectedCases.length} selected
            </span>
            <ButtonBits variant="outline" size="sm">
              Bulk Actions
            </ButtonBits>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Cases Table -->
  <CardBits>
    {#if error}
      <AlertBits variant="destructive" class="m-4">
        <AlertTriangle class="w-4 h-4" />
        <div class="ml-2">
          <h3 class="font-semibold">Error loading cases</h3>
          <p class="text-sm mt-1">{error}</p>
          <ButtonBits onclick={() => loadCases()} variant="outline" size="sm" class="mt-2">
            <RefreshCw class="w-4 h-4 mr-2" />
            Retry
          </ButtonBits>
        </div>
      </AlertBits>
    {:else if isLoading}
      <div class="p-4">
        <div class="space-y-4">
          {#each Array(10) as _}
            <div class="flex items-center space-x-4">
              <SkeletonBits class="h-4 w-4" />
              <SkeletonBits class="h-4 w-32" />
              <SkeletonBits class="h-4 w-24" />
              <SkeletonBits class="h-4 w-20" />
              <SkeletonBits class="h-4 w-16" />
              <SkeletonBits class="h-4 w-24" />
            </div>
          {/each}
        </div>
      </div>
    {:else if cases.length === 0}
      <div class="p-12 text-center">
        <div class="text-6xl mb-4">📭</div>
        <h3 class="text-lg font-semibold text-gray-900 mb-2">No cases found</h3>
        <p class="text-gray-500 mb-4">
          {hasFilters ? 'Try adjusting your filters or search terms.' : 'Get started by creating your first case.'}
        </p>
        {#if hasFilters}
          <ButtonBits onclick={clearFilters} variant="outline">
            Clear Filters
          </ButtonBits>
        {:else}
          <ButtonBits onclick={createNewCase}>
            <Plus class="w-4 h-4 mr-2" />
            Create First Case
          </ButtonBits>
        {/if}
      </div>
    {:else}
      <TableBits>
        <thead>
          <tr class="border-b">
            <th class="w-8 p-4">
              <input
                type="checkbox"
                checked={selectedCases.length === cases.length && cases.length > 0}
                indeterminate={selectedCases.length > 0 && selectedCases.length < cases.length}
                onchange={selectAllCases}
                class="rounded border-gray-300"
              />
            </th>
            <th class="text-left p-4 cursor-pointer hover:bg-gray-50" onclick={() => handleSort('caseNumber')}>
              <div class="flex items-center space-x-1">
                <span class="font-medium">Case Number</span>
                <ArrowUpDown class="w-3 h-3 text-gray-400" />
              </div>
            </th>
            <th class="text-left p-4 cursor-pointer hover:bg-gray-50" onclick={() => handleSort('title')}>
              <div class="flex items-center space-x-1">
                <span class="font-medium">Title</span>
                <ArrowUpDown class="w-3 h-3 text-gray-400" />
              </div>
            </th>
            <th class="text-left p-4">Status</th>
            <th class="text-left p-4 cursor-pointer hover:bg-gray-50" onclick={() => handleSort('priority')}>
              <div class="flex items-center space-x-1">
                <span class="font-medium">Priority</span>
                <ArrowUpDown class="w-3 h-3 text-gray-400" />
              </div>
            </th>
            <th class="text-left p-4">Progress</th>
            <th class="text-left p-4">Practice Area</th>
            <th class="text-left p-4 cursor-pointer hover:bg-gray-50" onclick={() => handleSort('updatedAt')}>
              <div class="flex items-center space-x-1">
                <span class="font-medium">Last Updated</span>
                <ArrowUpDown class="w-3 h-3 text-gray-400" />
              </div>
            </th>
            <th class="text-left p-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each cases as case (case.id)}
            <tr class="border-b hover:bg-gray-50 transition-colors">
              <td class="p-4">
                <input
                  type="checkbox"
                  checked={selectedCases.includes(case.id)}
                  onchange={() => toggleCaseSelection(case.id)}
                  class="rounded border-gray-300"
                />
              </td>
              <td class="p-4">
                <TooltipBits text={`Created: ${formatDate(case.createdAt)}`}>
                  <div class="font-mono text-sm text-blue-600 hover:text-blue-800 cursor-pointer"
                       onclick={() => navigateToCase(case.id)}>
                    {case.caseNumber}
                  </div>
                </TooltipBits>
              </td>
              <td class="p-4">
                <div class="max-w-xs">
                  <div class="font-medium text-gray-900 truncate cursor-pointer hover:text-blue-600"
                       onclick={() => navigateToCase(case.id)}>
                    {case.title}
                  </div>
                  {#if case.description}
                    <div class="text-sm text-gray-500 truncate mt-1">
                      {case.description}
                    </div>
                  {/if}
                </div>
              </td>
              <td class="p-4">
                <BadgeBits variant="secondary" class={getStatusColor(case.status)}>
                  {case.status.replace('_', ' ')}
                </BadgeBits>
              </td>
              <td class="p-4">
                <BadgeBits variant="outline" class={getPriorityColor(case.priority)}>
                  {case.priority}
                </BadgeBits>
              </td>
              <td class="p-4">
                <div class="w-20">
                  <div class="flex items-center space-x-2">
                    <ProgressBits value={case.progress || 0} class="flex-1" />
                    <span class="text-xs text-gray-500 w-8">{case.progress || 0}%</span>
                  </div>
                </div>
              </td>
              <td class="p-4">
                <span class="text-sm text-gray-600 capitalize">
                  {case.practiceArea.replace('_', ' ')}
                </span>
              </td>
              <td class="p-4">
                <TooltipBits text={formatDate(case.updatedAt)}>
                  <div class="text-sm text-gray-500">
                    {formatRelativeDate(case.updatedAt)}
                  </div>
                </TooltipBits>
              </td>
              <td class="p-4">
                <DropdownMenuBits>
                  <ButtonBits variant="ghost" size="sm" class="h-8 w-8 p-0">
                    <MoreHorizontal class="w-4 h-4" />
                  </ButtonBits>
                  <div slot="content" class="w-40">
                    <button
                      class="flex items-center w-full px-2 py-1.5 text-sm hover:bg-gray-100 rounded"
                      onclick={() => navigateToCase(case.id)}
                    >
                      <Eye class="w-4 h-4 mr-2" />
                      View Details
                    </button>
                    <button
                      class="flex items-center w-full px-2 py-1.5 text-sm hover:bg-gray-100 rounded"
                      onclick={() => window.location.href = `/cases/${case.id}/edit`}
                    >
                      <Edit3 class="w-4 h-4 mr-2" />
                      Edit Case
                    </button>
                    {#if case.dueDate}
                      <button
                        class="flex items-center w-full px-2 py-1.5 text-sm hover:bg-gray-100 rounded"
                      >
                        <Calendar class="w-4 h-4 mr-2" />
                        Due {formatDate(case.dueDate)}
                      </button>
                    {/if}
                  </div>
                </DropdownMenuBits>
              </td>
            </tr>
          {/each}
        </tbody>
      </TableBits>
    {/if}
  </CardBits>

  <!-- Pagination -->
  {#if totalPages > 1}
    <div class="flex items-center justify-between mt-6">
      <div class="text-sm text-gray-600">
        Page {currentPage} of {totalPages}
      </div>

      <div class="flex items-center space-x-2">
        <ButtonBits
          onclick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
          variant="outline"
          size="sm"
        >
          <ChevronLeft class="w-4 h-4" />
        </ButtonBits>

        {#each Array(Math.min(5, totalPages)) as _, i}
          {@const page = i + 1}
          <ButtonBits
            onclick={() => handlePageChange(page)}
            variant={page === currentPage ? 'default' : 'outline'}
            size="sm"
            class="w-8"
          >
            {page}
          </ButtonBits>
        {/each}

        <ButtonBits
          onclick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          variant="outline"
          size="sm"
        >
          <ChevronRight class="w-4 h-4" />
        </ButtonBits>
      </div>
    </div>
  {/if}
</div>

<style>
  .case-tracker {
    padding: 2rem;
    max-width: 1400px;
    margin: 0 auto;
    min-height: 100vh;
    background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  }

  .tracker-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    gap: 2rem;
  }

  .header-content {
    flex: 1;
  }

  .tracker-title {
    font-size: 2rem;
    font-weight: 700;
    color: #1e293b;
    margin: 0 0 0.5rem 0;
  }

  .tracker-subtitle {
    font-size: 1.1rem;
    color: #64748b;
    margin: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .results-summary {
    border-radius: 8px;
    background: white;
    padding: 1rem;
    border: 1px solid #e2e8f0;
  }

  /* Responsive Design */
  @media (max-width: 768px) {
    .case-tracker {
      padding: 1rem;
    }

    .tracker-header {
      flex-direction: column;
      gap: 1rem;
    }

    .tracker-title {
      font-size: 1.5rem;
    }
  }
</style>


