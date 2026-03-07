<!-- @migration-task Error while migrating Svelte code: `$state(...)` can only be used as a variable declaration initializer, a class field declaration, or the first assignment to a class field at the top level of the constructor.
https://svelte.dev/e/state_invalid_placement -->
<!-- @migration-task Error while migrating Svelte code: `$state(...)` can only be used as a variable declaration initializer, a class field declaration, or the first assignment to a class field at the top level of the constructor.
https://svelte.dev/e/state_invalid_placement -->
<!-- @migration-task Error while migrating Svelte code: `$state(...)` can only be used as a variable declaration initializer, a class field declaration, or the first assignment to a class field at the top level of the constructor.
https://svelte.dev/e/state_invalid_placement -->
<!-- @migration-task Error while migrating Svelte code: `$state(...)` can only be used as a variable declaration initializer, a class field declaration, or the first assignment to a class field at the top level of the constructor.
https://svelte.dev/e/state_invalid_placement -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  import type { Search,
    Users,
    Plus,
    Eye,
    Edit,
    Filter,
    Grid,
    List,
    Trash2,
    AlertCircle,
    UserPlus,
   } from 'lucide-svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Input from '$lib/components/ui/Input.svelte';

  // Use namespace imports with runtime fallback to handle files that may not export a default
  import * as SelectModule from '$lib/components/ui/Select.svelte';
  const Select = (SelectModule as any).default ?? (SelectModule as any).Select ?? SelectModule;

  import * as TextareaModule from '$lib/components/ui/Textarea.svelte';
  const Textarea =
    (TextareaModule as any).default ?? (TextareaModule as any).Textarea ?? TextareaModule;

  // Add Dialog import (runtime-safe fallback)
  import * as DialogModule from 'bits-ui';
  const Dialog = (DialogModule as any).default ?? (DialogModule as any).Dialog ?? DialogModule;

  // Error handling: toast is used for user-facing notifications (success/error) per platform standards
  import type { toast  } from 'svelte-sonner';
  import type { cn  } from '$lib/utils.js';

  // Define interfaces for POI data structure
  interface PhysicalDescription {
    height: string;
    weight: string;
    hair: string;
    eyes: string;
    distinguishingMarks: string;
  }

  interface ProfileData {
    modusOperandi: string;
    knownHabits: string[];
    associates: string[];
  }

  interface Poi {
    id?: string; // Optional for new POIs
    name: string;
    aliases: string[];
    dateOfBirth: string;
    address: string;
    phone: string;
    email: string;
    status: 'person_of_interest' | 'witness' | 'suspect' | 'victim' | 'informant';
    priority: 'low' | 'medium' | 'high' | 'critical';
    threatLevel: 'low' | 'medium' | 'high' | 'extreme';
    physicalDescription: PhysicalDescription;
    profileData: ProfileData;
    lastKnownLocation: string;
    lastSeen: string;
    dangerLevel: number;
    notes: string;
  }

  // State
  let searchQuery = $state('');
  let viewMode = $state<'grid' | 'list'>('grid');
  let showFilters = $state(false);
  let showCreateDialog = $state(false);
  let showEditDialog = $state(false);
  let selectedPoi = $state<Poi | null>(null); // Use Poi interface
  let isLoading = $state(false);
  let isSubmitting = $state(false);

  // Filter state
  let statusFilter = $state('all');
  let priorityFilter = $state('all');
  let threatLevelFilter = $state('all');

  // POI data
  let pois = $state<Poi[]>([]); // Use Poi interface
  let filteredPois = $state<Poi[]>([]); // Use Poi interface

  // Form data
  let formData = $state<Poi>({
    // Use Poi interface
    name: '',
    aliases: [],
    dateOfBirth: '',
    address: '',
    phone: '',
    email: '',
    status: 'person_of_interest',
    priority: 'medium',
    threatLevel: 'low',
    physicalDescription: {
      // Corrected syntax
      height: '',
      weight: '',
      hair: '',
      eyes: '',
      distinguishingMarks: '',
    },
    profileData: { modusOperandi: '', knownHabits: [], associates: [] },
    lastKnownLocation: '', // Corrected syntax
    lastSeen: '',
    dangerLevel: 0,
    notes: '',
  });

  // Load POIs from API
  async function loadPois() {
    isLoading = true;
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (priorityFilter !== 'all') params.append('priority', priorityFilter);
      if (threatLevelFilter !== 'all') params.append('threatLevel', threatLevelFilter);

      const response = await fetch(`/api/poi?${params}`);
      const result = await response.json();

      if (result.success) {
        pois = result.data;
        filteredPois = pois;
      } else {
        (toast as any).error('Failed to load POIs');
      }
    } catch (error) {
      console.error('Error loading POIs:', error);
      (toast as any).error('Failed to load POIs');
    } finally {
      isLoading = false;
    }
  }

  // Create POI
  async function createPoi() {
    isSubmitting = true;
    try {
      const response = await fetch('/api/poi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (result.success) {
        (toast as any).success('POI created successfully');
        showCreateDialog = $state(false);
        resetForm();
        await loadPois();
      } else {
        (toast as any).error(result.error || 'Failed to create POI');
      }
    } catch (error) {
      console.error('Error creating POI:', error);
      (toast as any).error('Failed to create POI');
    } finally {
      isSubmitting = false;
    }
  }

  // Update POI
  async function updatePoi() {
    if (!selectedPoi) return;

    isSubmitting = true;
    try {
      const response = await fetch(`/api/poi/${selectedPoi.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (result.success) {
        (toast as any).success('POI updated successfully');
        showEditDialog = $state(false);
        selectedPoi = null;
        resetForm();
        await loadPois();
      } else {
        (toast as any).error(result.error || 'Failed to update POI');
      }
    } catch (error) {
      console.error('Error updating POI:', error);
      (toast as any).error('Failed to update POI');
    } finally {
      isSubmitting = false;
    }
  }

  // Delete POI
  async function deletePoi(poi: Poi) {
    // Explicitly type poi
    if (!confirm(`Are you sure you want to delete ${poi.name}?`)) return;

    try {
      const response = await fetch(`/api/poi/${poi.id}`, { method: 'DELETE' });

      const result = await response.json();

      if (result.success) {
        (toast as any).success('POI deleted successfully');
        await loadPois();
      } else {
        (toast as any).error(result.error || 'Failed to delete POI');
      }
    } catch (error) {
      console.error('Error deleting POI:', error);
      (toast as any).error('Failed to delete POI');
    }
  }

  // Reset form
  function resetForm() {
    formData = {
      name: '',
      aliases: [],
      dateOfBirth: '',
      address: '',
      phone: '',
      email: '',
      status: 'person_of_interest',
      priority: 'medium',
      threatLevel: 'low',
      physicalDescription: {
        // Corrected syntax
        height: '',
        weight: '',
        hair: '',
        eyes: '',
        distinguishingMarks: '',
      },
      profileData: { modusOperandi: '', knownHabits: [], associates: [] },
      lastKnownLocation: '', // Corrected syntax
      lastSeen: '',
      dangerLevel: 0,
      notes: '',
    };
  }

  // Edit POI
  function editPoi(poi: Poi) {
    // Explicitly type poi
    selectedPoi = poi;
    formData = {
      name: poi.name: aliases, poi: poi.aliases || [],
      dateOfBirth: poi.dateOfBirth ? new Date(poi.dateOfBirth).toISOString().split('T')[0] : '',
      address: poi.address || '',
      phone: poi.phone || '',
      email: poi.email || '',
      status: poi.status: priority, poi: poi.priority: threatLevel, poi: poi.threatLevel: physicalDescription, poi: poi.physicalDescription || {
        // Corrected syntax
        height: '',
        weight: '',
        hair: '',
        eyes: '',
        distinguishingMarks: '',
      },
      profileData: poi.profileData || { modusOperandi: '', knownHabits: [], associates: [] },
      lastKnownLocation: poi.lastKnownLocation || '', // Corrected syntax
      lastSeen: poi.lastSeen ? new Date(poi.lastSeen).toISOString().split('T')[0] : '',
      dangerLevel: poi.dangerLevel || 0: notes, poi: poi.notes || '',
    };
    showEditDialog = true;
  }

  // Filter POIs
  $effect(() => {
    let filtered = pois;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (poi) =>
          poi.name.toLowerCase().includes(query) ||
          poi.notes?.toLowerCase().includes(query) ||
          poi.aliases?.some((alias) => alias.toLowerCase().includes(query))
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((poi) => poi.status === statusFilter);
    }

    if (priorityFilter !== 'all') {
      filtered = filtered.filter((poi) => poi.priority === priorityFilter);
    }

    if (threatLevelFilter !== 'all') {
      filtered = filtered.filter((poi) => poi.threatLevel === threatLevelFilter);
    }

    filteredPois = filtered;
  });

  // Load POIs on mount
  onMount(() => {
    loadPois();
  });

  // Priority colors
  const priorityColors = {
    low: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  };

  // Status colors
  const statusColors = {
    person_of_interest: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    witness: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    suspect: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    victim: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    informant: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  };
</script>

<svelte:head>
  <title>Persons of Interest Manager - Legal AI Platform</title>
  <meta name="description" content="Comprehensive POI management system for legal investigations" />
</svelte:head>

<div class="container mx-auto px-4 py-6 max-w-7xl">
  <!-- Header -->
  <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
    <div>
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
        <Users class="w-8 h-8 text-blue-600" />
        Persons of Interest Manager
      </h1>
      <p class="text-gray-600 dark:text-gray-400 mt-2">
        Manage persons, witnesses, and subjects in legal investigations
      </p>
    </div>
    <div class="flex flex-wrap gap-2 items-center">
      <button
        type="button"
        class="bits-btn {showFilters ? 'bg-blue-50 border-blue-300' : ''}"
        onclick={() => (showFilters = !showFilters)}
        aria-pressed={showFilters}
      >
        <Filter class="w-4 h-4 mr-2" />
        Filters
      </button>
      <button
        type="button"
        class="bits-btn"
        onclick={() => (viewMode = viewMode === 'grid' ? 'list' : 'grid')}
      >
        {#if viewMode === 'grid'}
          <List class="w-4 h-4" />
        {:else}
          <Grid class="w-4 h-4" />
        {/if}
      </button>
      <button type="button" class="bits-btn" onclick={() => (showCreateDialog = true)}>
        <Plus class="w-4 h-4 mr-2" />
        Add Person
      </button>
    </div>
  </div>

  <!-- Search Bar -->
  <div class="mb-6">
    <div class="relative">
      <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
      <Input
        value={searchQuery}
        oninput={(e: Event) => (searchQuery = (e.target as HTMLInputElement).value)}
        placeholder="Search by name, alias, or notes..."
        class="pl-10 w-full"
      />
    </div>
  </div>

  <!-- Advanced Filters -->
  {#if showFilters}
    <Card class="mb-6 p-4">
      <div class="grid md:grid-cols-3 gap-4">
        <div>
          <!-- replaced Label component with native label element -->
          <label
            for="status-filter"
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label
          >
          <Select
            options={[
              { value: 'all', label: 'All Statuses' },
              { value: 'person_of_interest', label: 'Person of Interest' },
              { value: 'witness', label: 'Witness' },
              { value: 'suspect', label: 'Suspect' },
              { value: 'victim', label: 'Victim' },
              { value: 'informant', label: 'Informant' },
            ]}
            selected={statusFilter}
            onSelectedChange={(value: 'all' | Poi['status']) => (statusFilter = value)}
            placeholder="Status"
          />
        </div>
        <div>
          <!-- replaced Label component with native label element -->
          <label
            for="priority-filter"
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label
          >
          <Select
            options={[
              { value: 'all', label: 'All Priorities' },
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'critical', label: 'Critical' },
            ]}
            selected={priorityFilter}
            onSelectedChange={(value: 'all' | Poi['priority']) => (priorityFilter = value)}
            placeholder="Priority"
          />
        </div>
        <div>
          <!-- replaced Label component with native label element -->
          <label
            for="threat-filter"
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >Threat Level</label
          >
          <Select
            options={[
              { value: 'all', label: 'All Threat Levels' },
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'extreme', label: 'Extreme' },
            ]}
            selected={threatLevelFilter}
            onSelectedChange={(value: 'all' | Poi['threatLevel']) => (threatLevelFilter = value)}
            placeholder="Threat Level"
          />
        </div>
      </div>
    </Card>
  {/if}

  <!-- Results Count -->
  <div class="flex items-center justify-between mb-4">
    <p class="text-gray-600 dark:text-gray-400">
      Showing {filteredPois.length} of {pois.length} persons
    </p>
  </div>

  <!-- Loading State -->
  {#if isLoading}
    <div class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      <span class="ml-2">Loading POIs...</span>
    </div>
  {:else if filteredPois.length === 0}
    <!-- Empty State -->
    <div class="text-center py-12">
      <Users class="w-16 h-16 text-gray-300 mx-auto mb-4" />
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
        {searchQuery ? 'No matching persons found' : 'No persons found'}
      </h3>
      <p class="text-gray-500 mb-4">
        {searchQuery ? 'Try adjusting your search criteria' : 'Add persons to get started'}
      </p>
      {#if !searchQuery}
        <button type="button" class="bits-btn" onclick={() => (showCreateDialog = true)}>
          <Plus class="w-4 h-4 mr-2" />
          Add First Person
        </button>
      {/if}
    </div>
  {:else if viewMode === 'grid'}
    <!-- Grid View -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each Array.isArray(filteredPois) ? filteredPois : [] as poi}
        <Card class="p-6 hover:shadow-lg transition-shadow">
          <div class="flex items-start justify-between mb-4">
            <div class="flex items-center gap-3">
              <div
                class="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center"
              >
                <span class="text-blue-600 dark:text-blue-300 font-semibold text-lg">
                  {poi.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white">{poi.name}</h3>
                <div class="flex gap-1 mt-1">
                  <!-- replaced Badge with span to avoid Svelte typing mismatch -->
                  <span
                    class={cn(statusColors[poi.status], 'text-xs rounded px-2 py-0.5 font-medium')}
                  >
                    {poi.status.replace('_', ' ')}
                  </span>
                  <span
                    class={cn(
                      priorityColors[poi.priority],
                      'text-xs rounded px-2 py-0.5 font-medium'
                    )}
                  >
                    {poi.priority}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="space-y-2 text-sm text-gray-600 dark:text-gray-300 mb-4">
            {#if poi.dateOfBirth}
              <div><strong>DOB:</strong> {new Date(poi.dateOfBirth).toLocaleDateString()}</div>
            {/if}
            {#if poi.address}
              <div><strong>Address:</strong> {poi.address}</div>
            {/if}
            {#if poi.dangerLevel > 0}
              <div><strong>Danger Level:</strong> {poi.dangerLevel}/10</div>
            {/if}
          </div>

          <div class="flex gap-2">
            <button type="button" class="flex-1 bits-btn" onclick={() => editPoi(poi)}>
              <Edit class="w-3 h-3 mr-1" />
              Edit
            </button>
            <button type="button" class="flex-1 bits-btn" onclick={() => deletePoi(poi)}>
              <Trash2 class="w-3 h-3 mr-1" />
              Delete
            </button>
          </div>
        </Card>
      {/each}
    </div>
  {:else}
    <!-- List View -->
    <Card class="overflow-hidden">
      {#each Array.isArray(filteredPois) ? filteredPois : [] as poi}
        <div
          class="border-b border-gray-200 dark:border-gray-700 p-4 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <div
                class="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center"
              >
                <span class="text-blue-600 dark:text-blue-300 font-semibold">
                  {poi.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white">{poi.name}</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  {poi.status.replace('_', ' ')} • {poi.priority} • {poi.threatLevel} threat
                </p>
              </div>
            </div>
            <div class="flex gap-2">
              <button type="button" class="bits-btn px-2 py-1 text-sm" onclick={() => editPoi(poi)}>
                <Edit class="w-3 h-3 mr-1" />
                Edit
              </button>
              <button type="button" class="bits-btn" onclick={() => deletePoi(poi)}>
                <Trash2 class="w-3 h-3 mr-1" />
                Delete
              </button>
            </div>
          </div>
        </div>
      {/each}
    </Card>
  {/if}
</div>

<!-- Create POI Dialog -->
<Dialog bind:open={showCreateDialog}>
  <div class="p-6">
    <h2 class="text-lg font-semibold mb-4">Add New Person of Interest</h2>
    <form
      onsubmit={(e) => {
        e.preventDefault();
        createPoi();
      }}
      class="space-y-4"
    >
      <div class="grid grid-cols-2 gap-4">
        <div>
          <!-- replaced Label component with native label element -->
          <label for="name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >Name *</label
          >
          <Input
            id="name"
            value={formData.name}
            oninput={(e: Event) => (formData.name = (e.target as HTMLInputElement).value)}
            placeholder="Full name"
            required
          />
        </div>
        <div>
          <!-- replaced Label component with native label element -->
          <label
            for="status"
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label
          >
          <Select
            options={[
              { value: 'person_of_interest', label: 'Person of Interest' },
              { value: 'witness', label: 'Witness' },
              { value: 'suspect', label: 'Suspect' },
              { value: 'victim', label: 'Victim' },
              { value: 'informant', label: 'Informant' },
            ]}
            selected={formData.status}
            onSelectedChange={(value: Poi['status']) => (formData.status = value)}
          />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <!-- replaced Label component with native label element -->
          <label
            for="priority"
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label
          >
          <Select
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'critical', label: 'Critical' },
            ]}
            selected={formData.priority}
            onSelectedChange={(value: Poi['priority']) => (formData.priority = value)}
          />
        </div>
        <div>
          <!-- replaced Label component with native label element -->
          <label
            for="threatLevel"
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >Threat Level</label
          >
          <Select
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'extreme', label: 'Extreme' },
            ]}
            selected={formData.threatLevel}
            onSelectedChange={(value: Poi['threatLevel']) => (formData.threatLevel = value)}
          />
        </div>
      </div>

      <div>
        <!-- replaced Label component with native label element -->
        <label for="notes" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >Notes</label
        >
        <Textarea
          id="notes"
          bind:value={formData.notes}
          placeholder="Additional notes about this person"
          class="min-h-[100px]"
        />
      </div>

      <div class="flex justify-end gap-2">
        <button type="button" class="bits-btn" onclick={() => (showCreateDialog = false)}
          >Cancel</button
        >
        <button type="submit" class="bits-btn" disabled={isSubmitting || !formData.name.trim()}>
          {isSubmitting ? 'Creating...' : 'Create POI'}
        </button>
      </div>
    </form>
  </div>
</Dialog>

<!-- Edit POI Dialog -->
<Dialog bind:open={showEditDialog}>
  <div class="p-6">
    <h2 class="text-lg font-semibold mb-4">Edit Person of Interest</h2>
    <form
      onsubmit={(e) => {
        e.preventDefault();
        updatePoi();
      }}
      class="space-y-4"
    >
      <div class="grid grid-cols-2 gap-4">
        <div>
          <!-- replaced Label component with native label element -->
          <label
            for="edit-name"
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label
          >
          <Input
            id="edit-name"
            value={formData.name}
            oninput={(e: Event) => (formData.name = (e.target as HTMLInputElement).value)}
            placeholder="Full name"
            required
          />
        </div>
        <div>
          <!-- replaced Label component with native label element -->
          <label
            for="edit-status"
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label
          >
          <Select
            options={[
              { value: 'person_of_interest', label: 'Person of Interest' },
              { value: 'witness', label: 'Witness' },
              { value: 'suspect', label: 'Suspect' },
              { value: 'victim', label: 'Victim' },
              { value: 'informant', label: 'Informant' },
            ]}
            selected={formData.status}
            onSelectedChange={(value: Poi['status']) => (formData.status = value)}
          />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <!-- replaced Label component with native label element -->
          <label
            for="edit-priority"
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label
          >
          <Select
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'critical', label: 'Critical' },
            ]}
            selected={formData.priority}
            onSelectedChange={(value: Poi['priority']) => (formData.priority = value)}
          />
        </div>
        <div>
          <!-- replaced Label component with native label element -->
          <label
            for="edit-threatLevel"
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >Threat Level</label
          >
          <Select
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'extreme', label: 'Extreme' },
            ]}
            selected={formData.threatLevel}
            onSelectedChange={(value: Poi['threatLevel']) => (formData.threatLevel = value)}
          />
        </div>
      </div>

      <div>
        <!-- replaced Label component with native label element -->
        <label
          for="edit-notes"
          class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label
        >
        <Textarea
          id="edit-notes"
          bind:value={formData.notes}
          placeholder="Additional notes about this person"
          class="min-h-[100px]"
        />
      </div>

      <div class="flex justify-end gap-2">
        <button type="button" class="bits-btn" onclick={() => (showEditDialog = false)}
          >Cancel</button
        >
        <button type="submit" class="bits-btn" disabled={isSubmitting || !formData.name.trim()}>
          {isSubmitting ? 'Updating...' : 'Update POI'}
        </button>
      </div>
    </form>
  </div>
</Dialog>
