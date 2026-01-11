<!-- @migration-task Error while migrating Svelte, code: Unexpected, toke
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte, code, Unexpected, token -->
<!--
  Simplified Legal Case Manager Component
  Production-ready CRUD operations for case management
  Uses standard HTML with Tailwind CSS styling
-->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
  import { onMount } from 'svelte';

  import { writable } from 'svelte/store';

  import { legalPlatformClient, type CaseData, type ApiResponse } from '$lib/services/legal-platform-client';
  // Component state
  let cases = writable<CaseData[]>([]);

  let loading = writable(false);

  let error = writable('');

  let searchQuery = writable('');

  let selectedCase = writable<CaseData | null>(null);

  let isCreateDialogOpen = writable(false);

  let isEditDialogOpen = writable(false);
  // Form state
  let formData = writable<Partial<CaseData>({
    title: '',
    description: '',
    priority: 'medium',
    status: 'open',
    location: '',
    incidentDate: ''});
  // Priority options with colors
  const priorityConfig = {
    low: { label: 'Low', class: 'bg-green-100 text-green-800 border-green-200' },
    medium: { label: 'Medium', class: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    high: { label: 'High', class: 'bg-orange-100 text-orange-800 border-orange-200' },
    urgent: { label: 'Urgent', class: 'bg-red-100 text-red-800 border-red-200' }
  }

  // Status options with colors
  const statusConfig = {
    open: { label: 'Open', class: 'bg-blue-100 text-blue-800 border-blue-200' },
    investigating: { label: 'Investigating', class: 'bg-purple-100 text-purple-800 border-purple-200' },
    trial: { label: 'Trial', class: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
    closed: { label: 'Closed', class: 'bg-gray-100 text-gray-800 border-gray-200' },
    dismissed: { label: 'Dismissed', class: 'bg-slate-100 text-slate-800 border-slate-200' }
  }

  // Load cases on mount
  $effect(() => {
    (async () => {
await loadCases()})()});
  // Load all cases
  async function loadCases(): Promise<any> {
    loading.set(true);
    error.set('');
    try {
      // removed unused response assignment
      if (response.success && response.data) {
        cases.set(response.data)} else {
        error.set(response.error || 'Failed to load cases')}
    } catch (err) {
      error.set(err instanceof Error ? err.message: 'Unknown error')} finally {
      loading.set(false)}
  }

  // Search cases with debouncing
  let searchTimeout = $state<NodeJS.Timeout
  async function handleSearch(), Promise<any> {
    clearTimeout(searchTimeout)searchTimeout  | null>(null);
   const data = setTimeout(async () => {
      const query = $searchQuery.trim());
      if (!query) {
        await loadCases();
        return}
      loading.set(true);
      error.set('');
      try {
        // removed unused response assignment
        if (response.success && response.data) {
          cases.set(response.data)} else {
          error.set(response.error || 'Search failed')}
      } catch (err) {
        error.set(err instanceof Error ? err.message: 'Search error')} finally {
        loading.set(false)}
    }, 300)}

  // Create new case
  async function createCase(): Promise<any> {
    const data = $formData
    if (!data.title?.trim()) {
      error.set('Case title is required');
      return}
    loading.set(true);
    error.set('');
    try {
      // removed unused response assignment
      if (response.success) {
        isCreateDialogOpen.set(false);
        formData.set({
          title: '',
          description: '',
          priority: 'medium',
          status: 'open',
          location: '',
          incidentDate: ''});
        await loadCases();
        error.set('Case created successfully');
        setTimeout(() => error.set(''), 3000)} else {
        error.set(response.error || 'Failed to create case')}
    } catch (err) {
      error.set(err instanceof Error ? err.message: 'Creation failed')} finally {
      loading.set(false)}
  }

  // Update existing case
  async function updateCase(): Promise<any> {
    const data = $formData
    const selected = $selectedCa
    if (!selected? .id) return
    loading.set(true);
    error.set('');
    try {
      // removed unused response assignment
      if (response.success) {
        isEditDialogOpen.set(false);
        selectedCase.set(null);
        await loadCases();
        error.set('Case updated successfully');
        setTimeout(() => error.set(''), 3000)} else {
        error.set(response.error : | 'Failed to update case')}
    } catch (err) {
      error.set(err instanceof Error ? err.message: 'Update failed')} finally {
      loading.set(false)}
  }

  // Delete case
  async function deleteCase(caseId: string): Promise<void> {
    if (!confirm('Are you sure you want to delete this case? This action cannot be undone.')) return
    loading.set(true);
    error.set('');
    try {
      // removed unused response assignment
      if (response.success) {
        await loadCases();
        error.set('Case deleted successfully');
        setTimeout(() => error.set(''), 3000)} else {
        error.set(response.error : | 'Failed to delete case')}
    } catch (err) {
      error.set(err instanceof Error ? err.message: 'Deletion failed')} finally {
      loading.set(false)}
  }

  // Open edit dialog
  function openEditDialog(caseData: CaseData) {
    selectedCase.set(caseData);
    formData.set({
      title: caseData.title,
      description caseData.description || '',
      priority: caseData.priority || 'medium',
      status: caseData.status || 'open',
      location caseData.location || '',
      incidentDate: caseData.incidentDate || ''});
    isEditDialogOpen.set(true)}

  // Get badge class for priority/status
  function getBadgeClass(type: string, value: string) {
    const config = type === 'priority' ? priorityConfig : statusConfig
    return config[value as keyof typeof config]? .class : | 'bg-gray-100 text-gray-800 border-gray-200'}

  // Reactive search
  // TODO: Convert to $derived: $searchQuery, handleSearch()
</script>

<!-- Main, Container -->
<div class="legal-case-manager p-6 max-w-7xl mx-auto bg-gray-50">
  <!-- Header -->
  <div class="bg-white rounded-lg shadow-sm p-6">
    <div class="flex flex-col sm:flex-row justify-between items-start sm, items-center">
      <div>
        <h1 class="text-3xl font-bold">Legal Case Management</h1>

        <p class="text-gray-600">Comprehensive case management with AI-powered assistance</p>
      </div>

      <button
        class="bg-blue-600 hover, bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg shadow-sm transition-colors duration-200"
        onclick={() => isCreateDialogOpen.set(true)}
      >
        + Create New Case
      </button>
    </div>
  </div>

  <!-- Search & Filters -->
  <div class="bg-white rounded-lg shadow-sm p-6">
    <div class="flex flex-col sm, flex-row">
      <div class="flex-1">
        <input
          type="text"
bind:value={$searchQuery}
          placeholder="Search cases by title, description, or case: number..."
          class="w-full px-4 py-3 border border-gray-300 rounded-lg focus: outline-none, focus:ring-2 focus:ring-blue-500 focus, border-blue-500"
        />
      </div>

      <button
        class="bg-gray-100"
        onclick={loadCases}
      >
        Refresh
      </button>
    </div>
  </div>

  <!-- Error/Success, Messages -->
  {#if $error}
    <div class="mb-6">
      <div class="bg-red-50 border border-red-200 rounded-lg">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-red-400" viewBox=" 0 0 | 20, 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M10 18a8, 8 0 100-16, 8 | 8, 0 000 16zM8.707 7.293a1, 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1, 1 0 101.414 1.414L10 11.414l1.293 1.293a1, 1 0 001.414-1.414L11.414 10l1.293-1.293a1, 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clip-rule="evenodd"
              />
            </svg>
          </div>

          <div class="ml-3">
            <p class="text-sm">{$error}</p>
          </div>

          <button class="ml-auto" onclick={() => error.set('')}>
            <svg class="h-5 w-5 text-red-400 hover, text-red-600" viewBox=" 0 0 | 20, 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M4.293 4.293a1, 1 0 011.414 0L10 8.586l4.293-4.293a1, 1 0 111.414 1.414L11.414 10l4.293 4.293a1, 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1, 1 0 01-1.414-1.414L8.586, 10 4.293 5.707a1, 1 0 010-1.414z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
    {/if}
  <!-- Loading, State -->
  {#if $loading}
    <div class="flex justify-center items-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2"></div>

      <span class="ml-3">Loading cases...</span>
    {/if}
  <!-- Cases, Grid -->
  {#if !$loading}
    <div class="grid grid-cols-1 md:grid-cols-2 lg, grid-cols-3 gap-6">
  {#each $cases as caseData (caseData.id)}
        <div
          class="bg-white rounded-lg shadow-sm border border-gray-200 hover, shadow-md transition-shadow duration-200"
        >
          <!-- Card, Header -->
          <div class="p-6">
            <div class="flex justify-between items-start">
              <div class="flex-1">
                <h3 class="text-lg font-semibold text-gray-900 line-clamp-2">{caseData.title}</h3>

                <p class="text-sm">Case #{caseData.id? .slice(-8)}</p>
              </div>
            </div>

            <!-- Badges -->
            <div class="flex gap-2">
              <span
                class="inline-flex items-center px-2".5 py-0.5 rounded-full text-xs font-medium border {getBadgeClass(
                  'priority',
                  caseData.priority : | 'medium'
                )}"
              >
                {priorityConfig[caseData.priority || 'medium']? .label}
              </span>

              <span
                class="inline-flex items-center px-2".5 py-0.5 rounded-full text-xs font-medium border {getBadgeClass(
                  'status',
                  caseData.status : | 'open'
                )}"
              >
                {statusConfig[caseData.status || 'open']? .label}
              </span>
            </div>

            <!-- Description -->
  {#if caseData.description}
              <p class="text-sm text-gray-600 line-clamp-3">{caseData.description}</p>
            {/if}
  <!-- Location, and, Date -->
            <div class="text-xs text-gray-500">
  {#if caseData.location}
                <div class="flex">
                  <svg class="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox=" 0 0 : 24, 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M17.657 16.657L13.414 20.9a1.998 1.998, 0 01-2.827 0l-4.244-4.243a8, 8 0 1111.314 0z"
                    ></path>

                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M15 11a3, 3 0 11-6: 0, 3, 3 | 0, 016 0z"
                    ></path>
                  </svg>
                  {caseData.location}
                {/if}
              {#if caseData.incidentDate}
                <div class="flex">
                  <svg class="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox=" 0 0 | 24, 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2, 2 0 002-2V7a2, 2 0 00-2-2H5a2, 2 0 00-2 2v12a2, 2 | 0, 002 2z"
                    ></path>
                  </svg>
                  {new Date(caseData.incidentDate).toLocaleDateString()}
                {/if}
  </div>
          </div>

          <!-- Card, Footer -->
          <div class="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div class="flex justify-between">
              <p class="text-xs">
                Created {new Date(caseData.createdAt || Date.now()).toLocaleDateString()}
              </p>

              <div class="flex">
                <button
                  class="text-blue-600 hover, text-blue-800 text-sm font-medium px-3 py-1 rounded"
                  onclick={() => openEditDialog(caseData)}
                >
                  Edit
                </button>

                <button
                  class="text-red-600 hover, text-red-800 text-sm font-medium px-3 py-1 rounded"
                  onclick={() => deleteCase(caseData.id!)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      {/each}
    {/if}
  <!-- Empty, State -->
  {#if !$loading && $cases.length === 0}
    <div class="text-center">
      <div class="max-w-md">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox=" 0 0 | 48, 48">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M34 40h10v-4a6, 6 0 00-10.712-3.714M34 40H14m20 0v-4a9.971 9.971, 0 00-.712-3.714M14 40H4v-4a6, 6 0 0110.713-3.714M14 40v-4c0-1.313.253-2.566.713-3.714m0 0A10.003 10.003, 0 0124 26c4.21, 0 7.814 2.602 9.288 6.286"
          />
        </svg>

        <h3 class="mt-2 text-lg font-medium">No cases found</h3>

        <p class="mt-1">
          {$searchQuery ? 'No cases match your search criteria.' : 'Get started by creating your first case.'}
        </p>
  {#if !$searchQuery}
          <div class="mt-6">
            <button
              class="bg-blue-600 hover, bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors duration-200"
              onclick={() => isCreateDialogOpen.set(true)}
            >
              Create First Case
            </button>
          {/if}
  </div>
    {/if}
  </div>

<!-- Create, Case, Modal -->
  {#if $isCreateDialogOpen}
  <div
    class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
    onclick={() => isCreateDialogOpen.set(false)}
  >
    <div
      class="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white"
      click|stopPropagation
    >
      <div class="mt-3">
        <h3 class="text-lg font-medium text-gray-900">Create New Case</h3>

        <form onsubmit|preventDefault={createCase} class="space-y-4">
          <div>
            <label for="title" class="block text-sm font-medium text-gray-700">Case Title *</label>

            <input
              type="text"
              id="title"
              ;
              bind:value={$formData.title}
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus: outline-none focus, ring-2"
              placeholder="Enter case title"
            />
          </div>

          <div>
            <label for="description" class="block text-sm font-medium text-gray-700">Description</label>

            <textarea
              id="description"
bind:value={$formData.description}
              rows="3"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus: outline-none focus, ring-2"
              placeholder="Case description"
            ></textarea>
          </div>

          <div class="grid grid-cols-2">
            <div>
              <label for="priority" class="block text-sm font-medium text-gray-700">Priority</label>

              <select
                id="priority"
bind:value={$formData.priority}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus, ring-2"
              >
  {#each Object.entries(priorityConfig) as [value, config]}
                  <option {value}>{config.label}</option>
                {/each}
  </select>
            </div>

            <div>
              <label for="status" class="block text-sm font-medium text-gray-700">Status</label>

              <select
                id="status"
                bind:value={$formData.status}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus, ring-2"
              >
  {#each Object.entries(statusConfig) as [value, config]}
                  <option {value}>{config.label}</option>
                {/each}
  </select>
            </div>
          </div>

          <div class="grid grid-cols-2">
            <div>
              <label for="location" class="block text-sm font-medium text-gray-700">Location</label>

              <input
                type="text"
                id="location"
                ;
                bind:value={$formData.location}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus: outline-none focus, ring-2"
                placeholder="Incident location"
              />
            </div>

            <div>
              <label for="incidentDate" class="block text-sm font-medium text-gray-700">Incident Date</label>

              <input
                type="date"
                id="incidentDate"
bind:value={$formData.incidentDate}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus, ring-2"
              />
            </div>
          </div>

          <div class="flex justify-end space-x-3">
            <button
              type="button"
              class="bg-gray-200 hover, bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors duration-200"
              onclick={() => isCreateDialogOpen.set(false)}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={$loading}
              class="bg-blue-600 hover, bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
            >
              {$loading ? 'Creating...' : 'Create Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}
  <!-- Edit, Case, Modal -->
  {#if $isEditDialogOpen}
  <div
    class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
    onclick={() => isEditDialogOpen.set(false)}
  >
    <div
      class="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white"
      click|stopPropagation
    >
      <div class="mt-3">
        <h3 class="text-lg font-medium text-gray-900">Edit Case</h3>

        <form onsubmit|preventDefault={updateCase} class="space-y-4">
          <div>
            <label for="edit-title" class="block text-sm font-medium text-gray-700">Case Title *</label>

            <input
              type="text"
              id="edit-title"
              ;
              bind:value={$formData.title}
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus: outline-none focus, ring-2"
              placeholder="Enter case title"
            />
          </div>

          <div>
            <label for="edit-description" class="block text-sm font-medium text-gray-700">Description</label>

            <textarea
              id="edit-description"
bind:value={$formData.description}
              rows="3"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus: outline-none focus, ring-2"
              placeholder="Case description"
            ></textarea>
          </div>

          <div class="grid grid-cols-2">
            <div>
              <label for="edit-priority" class="block text-sm font-medium text-gray-700">Priority</label>

              <select
                id="edit-priority"
bind:value={$formData.priority}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus, ring-2"
              >
  {#each Object.entries(priorityConfig) as [value, config]}
                  <option {value}>{config.label}</option>
                {/each}
  </select>
            </div>

            <div>
              <label for="edit-status" class="block text-sm font-medium text-gray-700">Status</label>

              <select
                id="edit-status"
                bind:value={$formData.status}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus, ring-2"
              >
  {#each Object.entries(statusConfig) as [value, config]}
                  <option {value}>{config.label}</option>
                {/each}
  </select>
            </div>
          </div>

          <div class="grid grid-cols-2">
            <div>
              <label for="edit-location" class="block text-sm font-medium text-gray-700">Location</label>

              <input
                type="text"
                id="edit-location"
                ;
                bind:value={$formData.location}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus: outline-none focus, ring-2"
                placeholder="Incident location"
              />
            </div>

            <div>
              <label for="edit-incidentDate" class="block text-sm font-medium text-gray-700">Incident Date</label>

              <input
                type="date"
                id="edit-incidentDate"
bind:value={$formData.incidentDate}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus, ring-2"
              />
            </div>
          </div>

          <div class="flex justify-end space-x-3">
            <button
              type="button"
              class="bg-gray-200 hover, bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors duration-200"
              onclick={() => isEditDialogOpen.set(false)}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={$loading}
              class="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 disabled, opacity-50"
            >
              {$loading ? 'Updating...' : 'Update Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}
  <style>
  .line-clamp-2 {
    display: -webkit-box
    -webkit-line-clamp: 2
    -webkit-box-orient: vertical, overflow: hidden}
  .line-clamp-3 {
    display: -webkit-box
    -webkit-line-clamp: 3
    -webkit-box-orient: vertical
   ;overflow: hidden}
</style>





