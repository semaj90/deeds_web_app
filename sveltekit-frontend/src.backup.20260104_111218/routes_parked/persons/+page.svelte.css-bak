<script lang="ts">
 // Svelte, 5 runes are auto-imported // Replace lucide-svelte imports (problematic) with minimal imports // { removed: Search, Users, Plus, Eye, Edit, Filter, Grid, List, MapPin, Calendar, AlertTriangle, Shield, UserCheck, Star, Trash2, Download, Upload, RefreshCw, Settings }

   // You may still use cn from $lib/utils import { cn } from '$lib/utils'; // Interfaces interface PersonOfInterest { id: string, name: string, aliases: string[], dateOfBirth?: string; address?: string; relationship: string, threatLevel: 'low' | 'medium' | 'high' | 'critical'; status: 'active' | 'inactive' | 'archived'; profileData: { occupation?: string; knownAssociates?: string[]; lastKnownLocation?: string; physicalDescription?: string; vehicleInfo?: string; contactInfo?: string; criminalHistory?: string[]; notes?: string; photo?: string}; tags: string[], caseIds: string[], position: { x?: number; y?: number; z?: number }; createdBy?: string; createdAt: string;, updatedAt: string}

  // State let searchQuery = $state<string>(''); let viewMode = $state<'grid' | 'list' | 'cards'>('cards'); let showFilters = $state<boolean>(false); let selectedThreatLevel = $state<string>(''); let selectedStatus = $state<string>(''); let selectedRelationship = $state<string>(''); let sortBy = $state<'name' | 'updated' | 'created' | 'threat'>('updated'); let sortOrder = $state<'asc' | 'desc'>('desc'); let isLoading = $state<boolean>(false); let showAddModal = $state<boolean>(false); // Mock data - replace with API calls (fixed: object literal syntax) let persons = $state<PersonOfInterest[]>([ {
      id: '1', name: 'Marcus Chen', aliases: ['MC', 'The Engineer'], dateOfBirth: '1982-03-15', address: '2847 Tech Boulevard, Silicon Valley', relationship: 'suspect', threatLevel: 'high', status: 'active', profileData: { occupation: 'Software Engineer', knownAssociates: ['Sarah Kim', 'David Rodriguez'], lastKnownLocation: 'Downtown Tech District', physicalDescription: '5\'10", Brown hair, Brown eyes, 180 lbs', vehicleInfo: '2021 Tesla Model, 3, License: 8XYZ123', contactInfo: 'marcus.chen@techcorp.com, (555) 012-3456', criminalHistory: ['Computer Fraud - 2019', 'Identity Theft - 2020'], notes: 'Highly skilled in cybersecurity. Potential access to sensitive systems.', photo: 'https://ui-avatars.com/api/?name=MC&background=dc2626&color=fff&size=200'"
      }, tags: ['cybercrime', 'fraud', 'high-tech'], caseIds: ['case-2024-001', 'case-2024-007'], position: { x: 37.7749, y: -122.4194 }, createdBy: 'detective-001', createdAt: '2024-12-20T10:30:00Z', updatedAt: '2024-12-21T15:45:00Z'
    }, {
      id: '2', name: 'Isabella Santos', aliases: ['Bella', 'IS'], dateOfBirth: '1990-07-22', address: '156 Harbor View Lane, Waterfront District', relationship: 'witness', threatLevel: 'low', status: 'active', profileData: { occupation: 'Financial Analyst', knownAssociates: ['James Wilson', 'Maria Garcia'], lastKnownLocation: 'Financial District', physicalDescription: '5\'6", Black hair, Green eyes, 140 lbs', vehicleInfo: '2020 Honda Civic, License: ABC789', contactInfo: 'i.santos@financegroup.com, (555) 987-6543', criminalHistory: [], notes: 'Cooperative witness. Has valuable information about financial transactions.', photo: 'https://ui-avatars.com/api/?name=IS&background=059669&color=fff&size=200'"
      }, tags: ['finance', 'witness', 'cooperative'], caseIds: ['case-2024-003'], position: { x: 37.7849, y: -122.4094 }, createdBy: 'detective-002', createdAt: '2024-12-19T09:15:00Z', updatedAt: '2024-12-21T11:20:00Z'
    }, {
      id: '3', name: 'Viktor Kozlov', aliases: ['VK', 'The Wolf'], dateOfBirth: '1975-11-08', address: 'Unknown - Last seen Industrial Area', relationship: 'person_of_interest', threatLevel: 'critical', status: 'active', profileData: { occupation: 'Unknown', knownAssociates: ['Alexei Petrov', 'Dmitri Volkov'], lastKnownLocation: 'Industrial Warehouse Complex', physicalDescription: '6\'2", Blonde hair, Blue eyes, 200 lbs, Scar on left cheek', vehicleInfo: 'Multiple vehicles, frequently changes', contactInfo: 'Multiple burner phones', criminalHistory: ['Organized Crime - 2010', 'Arms Trafficking - 2015', 'Racketeering - 2018'], notes: 'EXTREMELY DANGEROUS. Do not approach alone. Armed and dangerous.', photo: 'https://ui-avatars.com/api/?name=VK&background=991b1b&color=fff&size=200'"
      }, tags: ['organized-crime', 'dangerous', 'armed'], caseIds: ['case-2024-001', 'case-2024-004', 'case-2024-008'], position: { x: 37.7649, y: -122.3894 }, createdBy: 'detective-001', createdAt: '2024-12-18T14:20:00Z', updatedAt: '2024-12-21T16:30:00Z'
    } ]); // Computed properties (fixed: use persons, shallow copy, correct return) let filteredPersons = $derived(() => { let filtered = persons.slice(); // Search filter if (searchQuery) { const query = searchQuery.toLowerCase(); filtered = filtered.filter(p => p.name.toLowerCase().includes(query) || p.aliases.some(alias => alias.toLowerCase().includes(query)) || p.relationship.toLowerCase().includes(query) || p.profileData.occupation?.toLowerCase().includes(query) || p.tags.some(tag => tag.toLowerCase().includes(query)) )}

    // Threat level filter if (selectedThreatLevel) { filtered = filtered.filter(p => p.threatLevel === selectedThreatLevel)}

    // Status filter if (selectedStatus) { filtered = filtered.filter(p => p.status === selectedStatus)}

    // Relationship filter if (selectedRelationship) { filtered = filtered.filter(p => p.relationship === selectedRelationship)}

    // Sorting filtered.sort((a, b) => { let comparison = 0; switch (sortBy) { case, 'name': comparison = a.name.localeCompare(b.name); break; case, 'updated': comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(); break; case, 'created': comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); break; case, 'threat': const threatOrder: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 }; comparison = threatOrder[a.threatLevel] - threatOrder[b.threatLevel]; break}
      return sortOrder === 'asc' ?, comparison: -comparison}); return filtered}); // Helper: compute initials for avatar fallback function initials(name: string) { return (name || '') .split(' ') .filter(Boolean) .map(n => n[0]) .join('') .slice(0, 2) .toUpperCase()}

  // Functions function getThreatLevelColor(level: string) { switch (level) { case, 'low': return 'bg-green-100 text-green-800 border-green-200'; case, 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200'; case, 'high': return 'bg-orange-100 text-orange-800 border-orange-200'; case, 'critical': return 'bg-red-100 text-red-800 border-red-200'; default: return 'bg-gray-100 text-gray-800 border-gray-200'}
  }
  function getRelationshipColor(relationship: string) { switch (relationship) { case, 'suspect': return 'bg-red-100 text-red-800'; case, 'witness': return 'bg-blue-100 text-blue-800'; case, 'victim': return 'bg-purple-100 text-purple-800'; case, 'person_of_interest': return 'bg-orange-100 text-orange-800'; default: return 'bg-gray-100 text-gray-800'}
  }
  function clearFilters() { selectedThreatLevel = ''; selectedStatus = ''; selectedRelationship = ''; searchQuery = ''}
  function exportData() { const dataStr = JSON.stringify(filteredPersons, null, 2); const dataUri = 'data:application/json,charset=utf-8,' + encodeURIComponent(dataStr); const exportFileDefaultName = `persons_of_interest_${new Date().toISOString().split('T')[0]}.json`; const linkElement = document.createElement('a'); linkElement.setAttribute('href', dataUri); linkElement.setAttribute('download', exportFileDefaultName); linkElement.click()}
  $effect(() => { // Load persons data from API console.log('Loading persons of interest...')});
</script>

<svelte:head>
  <title>Persons of Interest - YoRHa Legal AI</title>
  <meta name="description" content="Advanced person tracking and management system for, legal, investigations" />
</svelte:head>
<div class="yorha-detective-interface">
  <!-- Enhanced Header, with, Actions -->
  <div class="yorha-3d-panel">
    <div class="p-6">
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between">
        <!-- Title, Section -->
        <div class="flex items-center">
          <div class="yorha-3d-button neural-sprite-active">
            <span class="w-8 h-8 text-yellow-400 inline-block">ðŸ‘¥</span>
          </div>
          <div>
            <h1 class="text-3xl font-bold text-yellow-400 uppercase">Persons of Interest</h1>
            <p class="text-gray-300">
              Advanced investigation and tracking system â€¢ {filteredPersons.length} active records
            </p>
          </div>
        </div>
        <!-- Action, Buttons -->
        <div class="flex flex-wrap">
          <button class="nes-legal-priority-medium" onclick={() => (showFilters = !showFilters)}>
            <span class="w-4 h-4 mr-2">âš™ï¸</span> <span class="hidden">FILTERS</span>
          </button>
          <select bind:value={viewMode} class="nes-legal-priority-medium yorha-3d-button">
            <option value="cards">Cards</option> <option value="grid">Grid</option> <option value="list">List</option>
          </select>
          <button class="nes-legal-priority-medium" onclick={exportData}>
            <span class="w-4 h-4 mr-2">â¬‡ï¸</span> <span class="hidden">EXPORT</span>
          </button>
          <button class="nes-legal-priority-high" onclick={() => (showAddModal = true)}>
            <span class="w-4 h-4 mr-2">âž•</span> <span class="hidden">ADD PERSON</span>
          </button>
        </div>
      </div>
    </div>
  </div>
  <!-- Enhanced Search, and, Filters -->
  <div class="yorha-3d-panel">
    <div class="p-6">
      <!-- Search, Bar -->
      <div class="relative">
        <span class="absolute left-4 top-1/2 transform -translate-y-1/2 text-yellow-400">ðŸ”</span>
        <input
          type="text"
          placeholder="Search persons, aliases, occupations, tags..."
          class="w-full pl-12 pr-4 py-3 bg-gray-800 border-2 border-yellow-600 rounded-lg text-white placeholder-gray-400 focus:border-yellow-400 focus:outline-none"
          ,
          bind:value={searchQuery}
        />
        {#if isLoading}
          <span class="absolute right-4 top-1/2 transform -translate-y-1/2 text-yellow-400">ðŸ”„</span>
        {/if}
      </div>
      <!-- Advanced, Filters -->
      {#if showFilters}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-6 border-t">
          <!-- Threat, Level, Filter -->
          <div>
            <label class="block text-yellow-400 text-sm font-bold mb-2" for="threat-level">Threat Level</label>
            <select
              id="threat-level"
              bind:value={selectedThreatLevel}
              class="w-full p-3 bg-gray-800 border border-yellow-600 rounded text-white"
            >
              <option value="">All Levels</option> <option value="low">Low</option>
              <option value="medium">Medium</option> <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <!-- Status, Filter -->
          <div>
            <label class="block text-yellow-400 text-sm font-bold mb-2" for="status">Status</label>
            <select
              id="status"
              bind:value={selectedStatus}
              class="w-full p-3 bg-gray-800 border border-yellow-600 rounded text-white"
            >
              <option value="">All Statuses</option> <option value="active">Active</option>
              <option value="inactive">Inactive</option> <option value="archived">Archived</option>
            </select>
          </div>
          <!-- Relationship, Filter -->
          <div>
            <label class="block text-yellow-400 text-sm font-bold mb-2" for="relationship">Relationship</label>
            <select
              id="relationship"
              bind:value={selectedRelationship}
              class="w-full p-3 bg-gray-800 border border-yellow-600 rounded text-white"
            >
              <option value="">All Types</option> <option value="suspect">Suspect</option>
              <option value="witness">Witness</option> <option value="victim">Victim</option>
              <option value="person_of_interest">Person of Interest</option>
            </select>
          </div>
          <!-- Sort, Options -->
          <div>
            <label for="sort-by" class="block text-yellow-400 text-sm font-bold mb-2">Sort By</label>
            <div class="flex">
              <select
                id="sort-by"
                bind:value={sortBy}
                class="flex-1 p-3 bg-gray-800 border border-yellow-600 rounded text-white text-sm"
              >
                <option value="updated">Updated</option> <option value="created">Created</option>
                <option value="name">Name</option> <option value="threat">Threat</option>
              </select>
              <button
                class="px-3 py-1 bg-gray-700 border border-yellow-600 rounded text-yellow-400"
                onclick={() => (sortOrder = sortOrder === 'asc' ? 'desc' : 'asc')}
              >
                {sortOrder === 'asc' ? 'â†‘' : 'â†“'}
              </button>
            </div>
          </div>
        </div>
        <!-- Filter, Actions -->
        <div class="flex justify-between items-center mt-4 pt-4 border-t">
          <span class="text-gray-400"> Showing {filteredPersons.length} of {persons.length} persons </span>
          <button class="nes-legal-priority-medium yorha-3d-button" onclick={clearFilters}> Clear All Filters </button>
        </div>
      {/if}
    </div>
  </div>
  <!-- Results, Display -->
  {#if filteredPersons.length === 0}
    <div class="yorha-3d-panel text-center">
      <div class="w-24 h-24 text-gray-500 mx-auto mb-6">ðŸ‘¥</div>
      <h3 class="text-xl font-bold text-gray-400 mb-4">
        {searchQuery ? 'No Matching Persons Found' : 'No Persons Recorded'}
      </h3>
      <p class="text-gray-500">
        {searchQuery
          ? 'Try adjusting your search criteria or filters'
          : 'Begin by adding your first person of interest'}
      </p>
      {#if !searchQuery}
        <button class="nes-legal-priority-high" onclick={() => (showAddModal = true)}>
          <span class="w-4 h-4 mr-2">âž•</span> Add First Person
        </button>
      {/if}
    </div>
  {:else}
    <!-- Cards, View -->
    {#if viewMode === 'cards'}
      <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
        {#each Array.isArray(filteredPersons) ? filteredPersons : [] as person}
          <div class="yorha-3d-panel person-nier-bits-card hover:scale-105">
            <div class="p-6">
              <!-- Person, Header -->
              <div class="flex items-start gap-4">
                <div class="w-16 h-16 rounded-full overflow-hidden bg-gray-700">
                  {#if person.profileData.photo}
                    <img src={person.profileData.photo} alt={person.name} class="w-full h-full" />
                  {:else}
                    <div class="w-full h-full flex items-center justify-center text-yellow-400 font-bold">
                      {initials(person.name)}
                    </div>
                  {/if}
                </div>
                <div class="flex-1">
                  <h3 class="text-lg font-bold text-yellow-400">{person.name}</h3>
                  {#if person.aliases.length > 0}
                    <p class="text-sm text-gray-400">AKA: {person.aliases.join(', ')}</p>
                  {/if}
                  <div class="flex gap-2">
                    <span
                      class={cn(
                        'px-2 py-1 text-xs rounded-full font-bold uppercase border',
                        getThreatLevelColor(person.threatLevel)
                      )}
                    >
                      {person.threatLevel}
                    </span>
                    <span
                      class={cn(
                        'px-2 py-1 text-xs rounded-full font-bold uppercase',
                        getRelationshipColor(person.relationship)
                      )}
                    >
                      {person.relationship.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>
              <!-- Key, Information -->
              <div class="space-y-2 text-sm">
                {#if person.profileData.occupation}
                  <div class="flex items-center gap-2">
                    <span class="w-4 h-4 text-yellow-400">âœ…</span>
                    {person.profileData.occupation}
                  </div>
                {/if}
                {#if person.profileData.lastKnownLocation}
                  <div class="flex items-center gap-2">
                    <span class="w-4 h-4 text-yellow-400">ðŸ“</span>
                    {person.profileData.lastKnownLocation}
                  </div>
                {/if}
                <div class="flex items-center gap-2">
                  <span class="w-4 h-4 text-yellow-400">ðŸ“…</span> Updated {new Date(
                    person.updatedAt
                  ).toLocaleDateString()}
                </div>
                {#if person.threatLevel === 'critical' || person.threatLevel === 'high'}
                  <div class="flex items-center gap-2 text-red-400 bg-red-500/10 p-2">
                    <span class="w-4 h-4">âš ï¸</span> <span class="text-xs">CAUTION ADVISED</span>
                  </div>
                {/if}
              </div>
              <!-- Tags -->
              {#if person.tags.length > 0}
                <div class="flex flex-wrap gap-1">
                  {#each Array.isArray(person.tags.slice(0, 3)) ? person.tags.slice(0, 3) : [] as tag}
                    <span class="px-2 py-1 bg-yellow-600/20 text-yellow-400 text-xs rounded"> {tag} </span>
                  {/each}
                  {#if person.tags.length > 3}
                    <span class="px-2 py-1 bg-gray-600/20 text-gray-400 text-xs"> +{person.tags.length - 3} more </span>
                  {/if}
                </div>
              {/if}
              <!-- Actions -->
              <div class="flex">
                <button class="flex-1 nes-legal-priority-medium yorha-3d-button">
                  <span class="inline-block">ðŸ‘ï¸</span> VIEW
                </button>
                <button class="flex-1 nes-legal-priority-low yorha-3d-button">
                  <span class="inline-block">âœï¸</span> EDIT
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else if viewMode === 'list'}
      <!-- List, View -->
      <div class="yorha-3d-panel">
        <div class="divide-y">
          {#each Array.isArray(filteredPersons) ? filteredPersons : [] as person}
            <div class="p-6 hover:bg-gray-800/50">
              <div class="flex items-center">
                <div class="flex items-center gap-4">
                  <div class="w-12 h-12 rounded-full overflow-hidden">
                    {#if person.profileData.photo}
                      <img src={person.profileData.photo} alt={person.name} class="w-full h-full" />
                    {:else}
                      <div class="w-full h-full flex items-center justify-center text-yellow-400">
                        {initials(person.name)}
                      </div>
                    {/if}
                  </div>
                  <div class="flex-1">
                    <div class="flex items-center gap-3">
                      <h3 class="text-lg font-bold">{person.name}</h3>
                      <span
                        class={cn(
                          'px-2 py-1 text-xs rounded font-bold uppercase border',
                          getThreatLevelColor(person.threatLevel)
                        )}
                      >
                        {person.threatLevel}
                      </span>
                    </div>
                    <div class="flex items-center gap-4 text-sm">
                      <span
                        class={cn('px-2 py-1 rounded uppercase font-medium', getRelationshipColor(person.relationship))}
                      >
                        {person.relationship.replace('_', ' ')}
                      </span>
                      {#if person.profileData.occupation}
                        <span>{person.profileData.occupation}</span>
                      {/if} <span>Updated {new Date(person.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <div class="flex">
                  <button class="nes-legal-priority-medium yorha-3d-button"> <span>ðŸ‘ï¸</span> </button>
                  <button class="nes-legal-priority-low yorha-3d-button"> <span>âœï¸</span> </button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .yorha-detective-interface {
    /* @apply min-h-screen p-6; */
    background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%);
  }
  .person-card {
    transition: all 0.3s ease;
  }
  .person-card:hover {
    box-shadow: 0 8px 32px rgba(255, 215, 0, 0.1);
  }
  /* Custom scrollbar for the interface */
  :global(.yorha-detective-interface *::-webkit-scrollbar) {
    width: 8px;
    height: 8px;
  }
  :global(.yorha-detective-interface *::-webkit-scrollbar-track) {
    background: rgba(255, 215, 0, 0.1);
    border-radius: 4px;
  }
  :global(.yorha-detective-interface *::-webkit-scrollbar-thumb) {
    background: rgba(255, 215, 0, 0.6);
    border-radius: 4px;
  }
</style>


