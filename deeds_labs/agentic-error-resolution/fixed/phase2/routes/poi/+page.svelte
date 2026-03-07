<!-- @migration-task Error while migrating Svelte code: `</div>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</div>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</div>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</div>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  import type { Search, Users, Plus, Eye, Edit, Filter, Grid, List  } from 'lucide-svelte';
  import Button from '$lib/components/ui/enhanced-bits.svelte';
  // State
  let searchQuery = $state('');
  let viewMode = $state<'grid' | 'list' >('grid');
  let showFilters = $state(false);
  // Mock persons data - replace with real API call
  let persons = $state([
    {
      id: '1',
      name: 'John Smith',
      alias: 'JS',
      dateOfBirth: '1980-05-15',
      address: '123 Main St, City',
      status: 'Person of Interest',
      caseIds: ['case-001', 'case-003'],
      lastUpdated: new Date().toISOString()
    },
    {
      id: '2',
      name: 'Jane Doe',
      alias: 'JD',
      dateOfBirth: '1975-12-08',
      address: '456 Oak Ave, Town',
      status: 'Witness',
      caseIds: ['case-002'],
      lastUpdated: new Date().toISOString()
    }
  ]);
  let filteredPersons = $derived(persons.filter(item => item.includes(searchQuery.toLowerCase()) ||
    person.alias.toLowerCase().includes(searchQuery.toLowerCase()) ||
    person.status.toLowerCase().includes(searchQuery.toLowerCase())
  ));
  $effect(() => {
    // Load persons data
    console.log('Loading persons data...');
  });
</script>
<svelte:head>
  <title>Persons of Interest - Legal AI Platform</title>
  <meta name="description" content="Person tracking and management system for legal investigations" />
</svelte:head>
<div class="container mx-auto px-4 py-6">
  <!-- Header -->
  <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
    <div>
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
        <Users class="w-8 h-8 text-blue-600" />
        Persons of Interest
      </h1>
      <p class="text-gray-600 dark:text-gray-400 mt-2">
        Manage persons, witnesses, and subjects in legal investigations
      </p>
    </div>
    <div class="flex flex-wrap gap-2 items-center">
    <Button class="bits-btn {showFilters ? 'bg-blue-50 border-blue-300' : ''}"
        variant="ghost"
        size="sm"
  onclick={() =>
(showFilters = !showFilters)}
      >
        <Filter class="w-4 h-4 mr-2" />
        Filters
    <Button class="bits-btn"
        variant="ghost"
        size="sm"
  onclick={() =>
(viewMode = viewMode === 'grid' ? 'list' : 'grid')}
      >
        {#if viewMode === 'grid'}
          <List class="w-4 h-4" />
        {:else}
          <Grid class="w-4 h-4" />
        {/if}
      <Button class="bits-btn">
<Plus class="w-4 h-4 mr-2" />
        Add Person
    </div>
  </div>
  <!-- Search Bar -->
  <div class="mb-6">
    <div class="relative">
      <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
      <input
        type="text"
        placeholder="Search by name, alias, or status..."
        class="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus: ring-2 focus:ring-blue-500 focus:border-blue-500";
        bind:value={searchQuery}
      />
    </div>
  </div>
  <!-- Advanced Filters -->
  {#if showFilters}
    <div class="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg mb-6">
      <div class="grid md:grid-cols-3 gap-4">
        <div>
          <label for="status-filter" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
          <select id="status-filter" class="w-full p-2 border border-gray-300 rounded-lg">
            <option value="">All Statuses</option>
            <option value="poi">Person of Interest</option>
            <option value="witness">Witness</option>
            <option value="suspect">Suspect</option>
            <option value="victim">Victim</option>
          </select>
        </div>
        <div>
          <label for="case-filter" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Case</label>
          <select id="case-filter" class="w-full p-2 border border-gray-300 rounded-lg">
            <option value="">All Cases</option>
            <option value="case-001">Case 001</option>
            <option value="case-002">Case 002</option>
            <option value="case-003">Case 003</option>
          </select>
        </div>
        <div class="flex items-end">
          <Button variant="ghost" size="sm" class="w-full bits-btn bits-btn">
Clear Filters
        </div>
      </div>
    </div>
  {/if}
  <!-- Results Count -->
  <div class="flex items-center justify-between mb-4">
    <p class="text-gray-600 dark:text-gray-400">
      Showing {filteredPersons.length} of {persons.length} persons
    </p>
  </div>
  <!-- Persons Grid/List -->
  {#if filteredPersons.length === 0}
    <div class="text-center py-12">
      <Users class="w-16 h-16 text-gray-300 mx-auto mb-4" />
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
        {searchQuery ? 'No matching persons found' : 'No persons found'}
      </h3>
      <p class="text-gray-500 mb-4">
        {searchQuery ? 'Try adjusting your search criteria' : 'Add persons to get started'}
      </p>
      {#if !searchQuery}
        <Button class="bits-btn">
<Plus class="w-4 h-4 mr-2" />
          Add First Person
      {/if}
    </div>
  {:else if viewMode === 'grid'}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each Array.isArray(filteredPersons) ? filteredPersons : [] as person}
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-shadow">
          <div class="flex items-start justify-between mb-4">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                <span class="text-blue-600 dark:text-blue-300 font-semibold text-lg">
                  {person.alias}
                </span>
              </div>
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white">{person.name}</h3>
                <span class="inline-block px-2 py-1 text-xs rounded-full {
                  person.status === 'Person of Interest' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                  person.status === 'Witness' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                  person.status === 'Suspect' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                  'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
                }">
                  {person.status}
                </span>
              </div>
            </div>
          </div>
          <div class="space-y-2 text-sm text-gray-600 dark:text-gray-300 mb-4">
            <div><strong>DOB:</strong> {new Date(person.dateOfBirth).toLocaleDateString()}</div>
            <div><strong>Address:</strong> {person.address}</div>
            <div><strong>Cases:</strong> {person.caseIds.join(', ')}</div>
          </div>
          <div class="flex gap-2">
            <Button size="sm" class="flex-1 bits-btn bits-btn">
<Eye class="w-3 h-3 mr-1" />
              View
            <Button variant="ghost" size="sm" class="flex-1 bits-btn bits-btn">
<Edit class="w-3 h-3 mr-1" />
              Edit
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <!-- List view -->
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {#each Array.isArray(filteredPersons) ? filteredPersons : [] as person}
        <div class="border-b border-gray-200 dark:border-gray-700 p-4 hover:bg-gray-50 dark:hover:bg-gray-700">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                <span class="text-blue-600 dark:text-blue-300 font-semibold">
                  {person.alias}
                </span>
              </div>
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white">{person.name}</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  {person.status} • {new Date(person.dateOfBirth).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div class="flex gap-2">
              <Button class="bits-btn" size="sm">
<Eye class="w-3 h-3 mr-1" />
                View
              <Button class="bits-btn" variant="ghost" size="sm">
<Edit class="w-3 h-3 mr-1" />
                Edit
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>;