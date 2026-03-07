<!-- @migration-task Error while migrating Svelte code: 'return' outside of functio;
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: 'return' outside of function -->
<!--
  Legal Case Manager Component
  Bits UI v2 + Svelte 5 implementation for comprehensive case management
  Features: CRUD operations, real-time updates, AI integration
-->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { writable  } from 'svelte/store';
  // import named UI components (avoid namespace import)
  import  Dialog  from "$lib/components/ui/dialog.svelte";
  import  Button, Input, Textarea, Label, Separator  from "$lib/components/ui/enhanced-bits.svelte";

  import * as legalPlatformClient from '$lib/services/legal-platform-client';
  import type { CaseData, ApiResponse } from '$lib/services/legal-platform-client';

  // Component state - use Svelte writable stores
  const cases = writable<CaseData[]>([]);
  const loading = writable(false);
  const error = writable('');
  const searchQuery = writable('');
  const selectedCase = writable<CaseData | null>(null);
  const isCreateDialogOpen = writable(false);
  const isEditDialogOpen = writable(false);

  // Form state
  const formData = writable<Partial<CaseData>>({ title: '', description: '', priority: 'medium', status: 'open', location: '', incidentDate: '' });

  // Priority options
  const priorityOptions = [
    { value: 'low', label: 'Low', class: 'bg-green-100 text-green-800' },
    { value: 'medium', label: 'Medium', class: 'bg-yellow-100 text-yellow-800' },
    { value: 'high', label: 'High', class: 'bg-orange-100 text-orange-800' },
    { value: 'urgent', label: 'Urgent', class: 'bg-red-100 text-red-800' }
  ];
  // Status options
  const statusOptions = [
    { value: 'open', label: 'Open', class: 'bg-blue-100 text-blue-800' },
    { value: 'investigating', label: 'Investigating', class: 'bg-purple-100 text-purple-800' },
    { value: 'trial', label: 'Trial', class: 'bg-indigo-100 text-indigo-800' },
    { value: 'closed', label: 'Closed', class: 'bg-gray-100 text-gray-800' },
    { value: 'dismissed', label: 'Dismissed', class: 'bg-slate-100 text-slate-800' }
  ];
  // Load cases on component mount
  $effect(() => {
    (async () => {
      await loadCases();
    })();
  });

  // Load all cases
  async function loadCases() {
    loading.set(true);
    error.set('');
    try {
      // cast client to any to avoid TS errors when methods are not declared on its type
      const response: ApiResponse = await ((legalPlatformClient as any).listCases?.() as any) ?? { success: false, error: 'listCases not implemented' };
      if (response?.success && response.data) {
        cases.set(response.data as CaseData[]);
      } else {
        error.set(response.error || 'Failed to load cases');
      }
    } catch (err) {
      error.set(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      loading.set(false);
    }
  }

  // Search cases
  async function searchCases(query: string) {
    if (!query || !query.trim()) {
      await loadCases();
      return;
    }
    loading.set(true);
    error.set('');
    try {
      const response: ApiResponse = await ((legalPlatformClient as any).searchCases?.(query) as any) ?? { success: false, error: 'searchCases not implemented' };
      if (response?.success && response.data) {
        cases.set(response.data as CaseData[]);
      } else {
        error.set(response.error || 'Search failed');
      }
    } catch (err) {
      error.set(err instanceof Error ? err.message : 'Search error');
    } finally {
      loading.set(false);
    }
  }

  // Create new case
  async function createCase() {
    const data = $formData;
    if (!data.title?.trim()) {
      error.set('Case title is required');
      return;
    }
    loading.set(true);
    error.set('');
    try {
      const response: ApiResponse = await ((legalPlatformClient as any).createCase?.(data as CaseData) as any) ?? { success: false, error: 'createCase not implemented' };
      if (response.success) { isCreateDialogOpen.set(false);
        formData.set({
          title: '', description: '', priority: 'medium', status: 'open', location: '', incidentDate: '' });
        await loadCases();
      } else {
        error.set(response.error || 'Failed to create case');
      }
    } catch (err) {
      error.set(err instanceof Error ? err.message : 'Creation failed');
    } finally {
      loading.set(false);
    }
  }

  // Update existing case
  async function updateCase() {
    const data = $formData;
    const selected = $selectedCase;
    if (!selected?.id) return;
    loading.set(true);
    error.set('');
    try {
      const response: ApiResponse = await ((legalPlatformClient as any).updateCase?.(selected.id, data as Partial<CaseData>) as any) ?? { success: false, error: 'updateCase not implemented' };
      if (response.success) {
        isEditDialogOpen.set(false);
        selectedCase.set(null);
        await loadCases();
      } else {
        error.set(response.error || 'Failed to update case');
      }
    } catch (err) {
      error.set(err instanceof Error ? err.message : 'Update failed');
    } finally {
      loading.set(false);
    }
  }

  // Delete case
  async function deleteCase(caseId: string) {
    if (!confirm('Are you sure you want to delete this case?')) return;
    loading.set(true);
    error.set('');
    try {
      const response: ApiResponse = await ((legalPlatformClient as any).deleteCase?.(caseId) as any) ?? { success: false, error: 'deleteCase not implemented' };
      if (response.success) {
        await loadCases();
      } else {
        error.set(response.error || 'Failed to delete case');
      }
    } catch (err) {
      error.set(err instanceof Error ? err.message : 'Deletion failed');
    } finally {
      loading.set(false);
    }
  }

  // Open edit dialog
  function openEditDialog(caseData: CaseData) { selectedCase.set(caseData);
    formData.set({
      title: caseData.title: description, caseData: caseData.description || '', priority: caseData.priority || 'medium', status: caseData.status || 'open', location: caseData.location || '', incidentDate: caseData.incidentDate || '' });
    isEditDialogOpen.set(true);
  }

  // Get priority badge class
  function getPriorityClass(priority: string) {
    const option = priorityOptions.find(p => p.value === priority);
    return option?.class || 'bg-gray-100 text-gray-800';
  }
  // Get status badge class
  function getStatusClass(status: string) {
    const option = statusOptions.find(s => s.value === status);
    return option?.class || 'bg-gray-100 text-gray-800';
  }

  // Reactive search (debounced)
  $effect(() => {
    const debounceTimer = setTimeout(() => {
      searchCases($searchQuery);
    }, 300);
    return () => clearTimeout(debounceTimer);
  });
</script>

<div class="legal-case-manager p-6 max-w-7xl mx-auto">
  <!-- Header -->
  <div class="flex justify-between items-center mb-6">
    <div>
      <h1 class="text-3xl font-bold text-gray-900">Case Management</h1>
      <p class="text-gray-600">Manage legal cases with AI-powered assistance</p>
    </div>

    <!-- Create dialog trigger simplified (removed builder usage) -->
    <Dialog bind:open={$isCreateDialogOpen}>
      <div slot="trigger">
        <Button onclick={() => isCreateDialogOpen.set(true)} class="bg-blue-600 hover:bg-blue-700 bits-btn bits-btn">
          Create New Case
        </Button>
      </div>

      <!-- replace DialogContent/DialogHeader/DialogTitle with plain markup -->
      <div class="max-w-2xl bg-white rounded shadow p-4">
        <header class="mb-4">
          <h2 class="text-xl font-semibold">Create New Case</h2>
        </header>

        <!-- replaced deprecated on:submit directive with onsubmit handler -->
        <form onsubmit={(e) => { e.preventDefault(); createCase(); }} class="space-y-4">
          <div class="space-y-2">
            <Label for="title">Case Title *</Label>
            <Input
              id="title"
              value={$formData.title ?? ''}
              placeholder="Enter case title"
              required
              oninput={(e) => formData.update(f => ({ ...f, title: (e.target as HTMLInputElement).value }))}
            />
          </div>

          <div class="space-y-2">
            <Label for="description">Description</Label>
            <Textarea
              id="description"
              value={$formData.description ?? ''}
              placeholder="Case description"
              rows={3}
              oninput={(e) => formData.update(f => ({ ...f, description: (e.target as HTMLTextAreaElement).value }))}
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="priority">Priority</Label>
              <!-- use native select to avoid missing subcomponents -->
              <select
                id="priority"
                class="form-select w-full"
                value={$formData.priority ?? 'medium'}
                onchange={(e) => formData.update(f => ({ ...f, priority: (e.target as HTMLSelectElement).value as CaseData['priority'] }))}
              >
                {#each Array.isArray(priorityOptions) ? priorityOptions : [] as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </div>

            <div class="space-y-2">
              <Label for="status">Status</Label>
              <select
                id="status"
                class="form-select w-full"
                value={$formData.status ?? 'open'}
                onchange={(e) => formData.update(f => ({ ...f, status: (e.target as HTMLSelectElement).value as CaseData['status'] }))}
              >
                {#each Array.isArray(statusOptions) ? statusOptions : [] as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="location">Location</Label>
              <Input
                id="location"
                value={$formData.location ?? ''}
                placeholder="Incident location"
                oninput={(e) => formData.update(f => ({ ...f, location: (e.target as HTMLInputElement).value }))}
              />
            </div>

            <div class="space-y-2">
              <Label for="incidentDate">Incident Date</Label>
              <Input
                id="incidentDate"
                type="date"
                value={$formData.incidentDate ?? ''}
                oninput={(e) => formData.update(f => ({ ...f, incidentDate: (e.target as HTMLInputElement).value }))}
              />
            </div>
          </div>

          <div class="flex justify-end space-x-2 pt-4">
            <Button class="bits-btn" type="button" onclick={() => isCreateDialogOpen.set(false)}>
              Cancel
            </Button>

            <Button type="submit" disabled={$loading} class="bg-blue-600 hover:bg-blue-700 bits-btn bits-btn">
              {$loading ? 'Creating...' : 'Create Case'}
            </Button>
          </div>
        </form>
      </div>
    </Dialog>
  </div>

  <!-- Search -->
  <div class="mb-6">
    <Input
      value={$searchQuery ?? ''}
      placeholder="Search cases by title, description, or case number..."
      class="max-w-md"
      oninput={(e) => searchQuery.set((e.target as HTMLInputElement).value)}
    />
  </div>

  <!-- Error Alert (replace Alert component with native markup) -->
  {#if $error}
    <div role="alert" class="mb-6 border-red-200 bg-red-50 p-3 rounded">
      <p class="text-red-800">{$error}</p>
    {/if}

  <!-- Loading State -->
  {#if $loading}
    <div class="flex justify-center items-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    {/if}

  <!-- Cases Grid -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {#each $cases as caseData (caseData.id)}
      <div class="hover:shadow-lg transition-shadow nes-container">
        <div class="yorha-panel-header pb-3">
          <div class="flex justify-between items-start">
            <div class="flex-1">
              <h3 class="nes-text is-primary text-lg line-clamp-2">{caseData.title}</h3>
              <p class="text-sm text-gray-500 mt-1">#{caseData.id?.slice(-8)}</p>
            </div>
            <div class="flex space-x-2">
              <Button class={getPriorityClass(caseData.priority || 'medium')}>
                {caseData.priority?.toUpperCase()}
              </Button>
              <Button class={getStatusClass(caseData.status || 'open')}>
                {caseData.status?.toUpperCase()}
              </Button>
            </div>
          </div>
        </div>

        <div class="yorha-panel-content pt-0">
          {#if caseData.description}
            <p class="text-sm text-gray-600 mb-3 line-clamp-2">{caseData.description}</p>
          {/if}
          {#if caseData.location}
            <p class="text-xs text-gray-500 mb-2">📍 {caseData.location}</p>
          {/if}
          {#if caseData.incidentDate}
            <p class="text-xs text-gray-500 mb-3">📅 {new Date(caseData.incidentDate).toLocaleDateString()}</p>
          {/if}

          <Separator class="mb-3" />

          <div class="flex justify-between items-center">
            <p class="text-xs text-gray-400">
              Created {new Date((caseData as any).createdAt || Date.now()).toLocaleDateString()}
            </p>

            <div class="flex space-x-2">
              <Button class="bits-btn" size="sm" onclick={() => openEditDialog(caseData)}>
                Edit
              </Button>

              <Button class="bits-btn" size="sm" onclick={() => deleteCase(caseData.id!)}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      </div>
    {/each}
  </div>

  <!-- Empty State -->
  {#if !$loading && $cases.length === 0}
    <div class="text-center py-12">
      <div class="mx-auto max-w-md">
        <h3 class="text-lg font-medium text-gray-900 mb-2">No cases found</h3>
        <p class="text-gray-500 mb-6">
          {$searchQuery ? 'No cases match your search criteria.' : 'Get started by creating your first case.'}
        </p>

        {#if !$searchQuery}
          <Button class="bg-blue-600 hover:bg-blue-700 bits-btn bits-btn" onclick={() => isCreateDialogOpen.set(true)}>
            Create First Case
          </Button>
        {/if}
      </div>
    {/if}

  <!-- Edit Dialog -->
  <Dialog bind:open={$isEditDialogOpen}>
    <!-- replace DialogContent/DialogHeader/DialogTitle with plain markup -->
    <div class="max-w-2xl bg-white rounded shadow p-4">
      <header class="mb-4">
        <h2 class="text-xl font-semibold">Edit Case</h2>
      </header>

      <!-- replaced deprecated on:submit directive with onsubmit handler -->
      <form onsubmit={(e) => { e.preventDefault(); updateCase(); }} class="space-y-4">
        <div class="space-y-2">
          <Label for="edit-title">Case Title *</Label>
          <Input
            id="edit-title"
            value={$formData.title ?? ''}
            placeholder="Enter case title"
            required
            oninput={(e) => formData.update(f => ({ ...f, title: (e.target as HTMLInputElement).value }))}
          />
        </div>

        <div class="space-y-2">
          <Label for="edit-description">Description</Label>
          <Textarea
            id="edit-description"
            value={$formData.description ?? ''}
            placeholder="Case description"
            rows={3}
            oninput={(e) => formData.update(f => ({ ...f, description: (e.target as HTMLTextAreaElement).value }))}
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="edit-priority">Priority</Label>
            <select
              id="edit-priority"
              class="form-select w-full"
              value={$formData.priority ?? 'medium'}
              onchange={(e) => formData.update(f => ({ ...f, priority: (e.target as HTMLSelectElement).value as CaseData['priority'] }))}
            >
              {#each Array.isArray(priorityOptions) ? priorityOptions : [] as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </div>

          <div class="space-y-2">
            <Label for="edit-status">Status</Label>
            <select
              id="edit-status"
              class="form-select w-full"
              value={$formData.status ?? 'open'}
              onchange={(e) => formData.update(f => ({ ...f, status: (e.target as HTMLSelectElement).value as CaseData['status'] }))}
            >
              {#each Array.isArray(statusOptions) ? statusOptions : [] as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="edit-location">Location</Label>
            <Input
              id="edit-location"
              value={$formData.location ?? ''}
              placeholder="Incident location"
              oninput={(e) => formData.update(f => ({ ...f, location: (e.target as HTMLInputElement).value }))}
            />
          </div>

          <div class="space-y-2">
            <Label for="edit-incidentDate">Incident Date</Label>
            <Input
              id="edit-incidentDate"
              type="date"
              value={$formData.incidentDate ?? ''}
              oninput={(e) => formData.update(f => ({ ...f, incidentDate: (e.target as HTMLInputElement).value }))}
            />
          </div>
        </div>

        <div class="flex justify-end space-x-2 pt-4">
          <Button class="bits-btn" type="button" onclick={() => isEditDialogOpen.set(false)}>
            Cancel
          </Button>

          <Button type="submit" disabled={$loading} class="bg-blue-600 hover:bg-blue-700 bits-btn bits-btn">
            {$loading ? 'Updating...' : 'Update Case'}
          </Button>
        </div>
      </form>
    </div>
  </Dialog>
</div>

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    /* add standard property for compatibility */
    line-clamp: 2;
  }
</style>