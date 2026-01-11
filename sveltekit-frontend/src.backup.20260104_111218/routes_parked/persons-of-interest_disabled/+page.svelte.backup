<script lang="ts">
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from 'bits-ui/components/ui/dialog';
// Svelte, 5 runes are auto-imported
import Card from '$lib/components/ui/Card.svelte';
import Input from '$lib/components/ui/Input.svelte';
import Select from '$lib/components/ui/Select.svelte';
import Textarea from '$lib/components/ui/Textarea.svelte';
import { onMount } from 'svelte';
// Use namespace imports with runtime fallback to handle files that may not export a default
// Error handling: toast is used for user-facing notifications (success/error) per platform standards
import { cn } from '$lib/utils.js';
import { Edit, Filter, Grid, List, Plus, Trash2 } from 'lucide-svelte';
import { toast } from 'svelte-sonner';

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

interface FormData {
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
  profileData: {
    modusOperandi: string;
    knownHabits: string[];
    associates: string[];
  };
  lastKnownLocation: string;
  lastSeen: string;
  dangerLevel: number;
  notes: string;
}

// State
let searchQuery = $state<string>('');
let viewMode = $state<'grid' | 'list'>('grid');
let showFilters = $state<boolean>(false);
let showCreateDialog = $state<boolean>(false);
let showEditDialog = $state<boolean>(false);
let selectedPoi = $state<Poi | null>(null); // Use Poi interface
let isLoading = $state<boolean>(false);
let isSubmitting = $state<boolean>(false);
// Filter state
let statusFilter = $state<string>('all');
let priorityFilter = $state<string>('all');
let threatLevelFilter = $state<string>('all');
// POI data
let pois = $state<Poi[]>([]); // Use Poi interface
let filteredPois = $state<Poi[]>([]); // Use Poi interface
// Form data
let formData = $state<Poi>({ // Use Poi interface
  name: '',
  aliases: [],
  dateOfBirth: '',
  address: '',
  phone: '',
  email: '',
  status: 'person_of_interest',
  priority: 'medium',
  threatLevel: 'low',
  physicalDescription: { // Corrected syntax
    height: '',
    weight: '',
    hair: '',
    eyes: '',
    distinguishingMarks: ''
  },
  profileData: {
    modusOperandi: '',
    knownHabits: [],
    associates: []
  },
  lastKnownLocation: '', // Corrected syntax
  lastSeen: '',
  dangerLevel: 0,
  notes: ''
});

// String representations for array fields
let aliasesString = $state<string>('');
let knownHabitsString = $state<string>('');
let associatesString = $state<string>('');

// Load POIs from API
async function loadPois(): Promise<any> {
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
      toast.error('Failed to load POIs');
    }
  } catch (error) {
    console.error('Error loading POIs:', error);
    toast.error('Failed to load POIs');
  } finally {
    isLoading = false;
  }
}

// Create POI
async function createPoi(): Promise<any> {
  isSubmitting = true;
  try {
    const response = await fetch('/api/poi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    const result = await response.json();
    if (result.success) {
      toast.success('POI created successfully');
      showCreateDialog = false;
      resetForm();
      await loadPois();
    } else {
      toast.error(result.error || 'Failed to create POI');
    }
  } catch (error) {
    console.error('Error creating POI:', error);
    toast.error('Failed to create POI');
  } finally {
    isSubmitting = false;
  }
}

// Update POI
async function updatePoi(): Promise<any> {
  if (!selectedPoi) return;
  isSubmitting = true;
  try {
    const response = await fetch(`/api/poi/${selectedPoi.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    const result = await response.json();
    if (result.success) {
      toast.success('POI updated successfully');
      showEditDialog = false;
      selectedPoi = null;
      resetForm();
      await loadPois();
    } else {
      toast.error(result.error || 'Failed to update POI');
    }
  } catch (error) {
    console.error('Error updating POI:', error);
    toast.error('Failed to update POI');
  } finally {
    isSubmitting = false;
  }
}

// Delete POI
async function deletePoi(poi: Poi): Promise<void> { // Explicitly type poi
  if (!confirm(`Are you sure you want to delete ${poi.name}?`)) return;
  try {
    const response = await fetch(`/api/poi/${poi.id}`, {
      method: 'DELETE'
    });
    const result = await response.json();
    if (result.success) {
      toast.success('POI deleted successfully');
      await loadPois();
    } else {
      toast.error(result.error || 'Failed to delete POI');
    }
  } catch (error) {
    console.error('Error deleting POI:', error);
    toast.error('Failed to delete POI');
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
      height: '',
      weight: '',
      hair: '',
      eyes: '',
      distinguishingMarks: ''
    },
    profileData: {
      modusOperandi: '',
      knownHabits: [],
      associates: []
    },
    lastKnownLocation: '',
    lastSeen: '',
    dangerLevel: 0,
    notes: ''
  };
}

// Edit POI
function editPoi(poi: Poi) { // Explicitly type poi
  selectedPoi = poi;
  formData = {
    name: poi.name,
    aliases: poi.aliases || [],
    dateOfBirth: poi.dateOfBirth ? new Date(poi.dateOfBirth).toISOString().split('T')[0] : '',
    address: poi.address || '',
    phone: poi.phone || '',
    email: poi.email || '',
    status: poi.status,
    priority: poi.priority,
    threatLevel: poi.threatLevel,
    physicalDescription: poi.physicalDescription || {
      height: '',
      weight: '',
      hair: '',
      eyes: '',
      distinguishingMarks: ''
    },
    profileData: poi.profileData || {
      modusOperandi: '',
      knownHabits: [],
      associates: []
    },
    lastKnownLocation: poi.lastKnownLocation || '',
    lastSeen: poi.lastSeen ? new Date(poi.lastSeen).toISOString().split('T')[0] : '',
    dangerLevel: poi.dangerLevel || 0,
    notes: poi.notes || ''
  };
  showEditDialog = true;
}

// Filter POIs
$effect(() => {
  let filtered = pois;
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter(poi =>
      poi.name.toLowerCase().includes(query) ||
      poi.notes?.toLowerCase().includes(query) ||
      poi.aliases?.some(alias => alias.toLowerCase().includes(query))
    );
  }

  if (statusFilter !== 'all') {
    filtered = filtered.filter(poi => poi.status === statusFilter);
  }

  if (priorityFilter !== 'all') {
    filtered = filtered.filter(poi => poi.priority === priorityFilter);
  }

  if (threatLevelFilter !== 'all') {
    filtered = filtered.filter(poi => poi.threatLevel === threatLevelFilter);
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
  critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
};

// Status colors
const statusColors = {
  person_of_interest: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  witness: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  suspect: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  victim: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  informant: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
};
</script>

<main class="container mx-auto p-6">
  <div class="flex justify-between items-center mb-6">
    <h1 class="text-3xl font-bold">POI Manager</h1>
    <button on:click={() => showCreateDialog = true} class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
      <Plus class="w-4 h-4" />
      Add POI
    </button>
  </div>

  <!-- Search and filters -->
  <div class="flex gap-4 mb-6">
    <Input bind:value={searchQuery} placeholder="Search POIs..." class="flex-1" />
    <button on:click={() => showFilters = !showFilters} class="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600">
      <Filter class="w-4 h-4" />
      Filters
    </button>
    <div class="flex gap-2">
      <button on:click={() => viewMode = 'grid'} class={cn("flex items-center gap-2 px-4 py-2 rounded", viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600')}>
        <Grid class="w-4 h-4" />
      </button>
      <button on:click={() => viewMode = 'list'} class={cn("flex items-center gap-2 px-4 py-2 rounded", viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600')}>
        <List class="w-4 h-4" />
      </button>
    </div>
  </div>

  {#if showFilters}
    <div class="mb-6 p-4 bg-gray-100 dark:bg-gray-800 rounded">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Select bind:value={statusFilter}>
          <option value="all">All Statuses</option>
          <option value="person_of_interest">Person of Interest</option>
          <option value="witness">Witness</option>
          <option value="suspect">Suspect</option>
          <option value="victim">Victim</option>
          <option value="informant">Informant</option>
        </Select>
        <Select bind:value={priorityFilter}>
          <option value="all">All Priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </Select>
        <Select bind:value={threatLevelFilter}>
          <option value="all">All Threat Levels</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="extreme">Extreme</option>
        </Select>
      </div>
    </div>
  {/if}

  {#if isLoading}
    <p class="text-center">Loading POIs...</p>
  {:else if filteredPois.length === 0}
    <p class="text-center">No POIs found.</p>
  {:else}
    {#if viewMode === 'grid'}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {#each filteredPois as poi}
          <Card class="p-4 shadow">
            <div class="flex justify-between items-start mb-2">
              <h3 class="text-xl font-semibold">{poi.name}</h3>
              <span class={cn("px-2 py-1 text-xs rounded", priorityColors[poi.priority])}>{poi.priority}</span>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">{poi.status.replace('_', ' ')}</p>
            <p class="text-sm mb-2"><strong>Threat:</strong> {poi.threatLevel}</p>
            <p class="text-sm mb-2"><strong>Last Seen:</strong> {poi.lastSeen || 'Unknown'}</p>
            <p class="text-sm mb-4 truncate">{poi.notes || 'No notes'}</p>
            <div class="flex gap-2">
              <button on:click={() => editPoi(poi)} class="flex items-center gap-1 px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600">
                <Edit class="w-4 h-4" />
                Edit
              </button>
              <button on:click={() => deletePoi(poi)} class="flex items-center gap-1 px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600">
                <Trash2 class="w-4 h-4" />
                Delete
              </button>
            </div>
          </Card>
        {/each}
      </div>
    {:else}
      <div class="space-y-4">
        {#each filteredPois as poi}
          <div class="flex justify-between items-center p-4 bg-white dark:bg-gray-800 rounded shadow">
            <div class="flex-1">
              <div class="flex items-center gap-4">
                <h3 class="text-lg font-semibold">{poi.name}</h3>
                <span class={cn("px-2 py-1 text-xs rounded", statusColors[poi.status])}>{poi.status.replace('_', ' ')}</span>
                <span class={cn("px-2 py-1 text-xs rounded", priorityColors[poi.priority])}>{poi.priority}</span>
                <span class="text-sm text-gray-600 dark:text-gray-400">Threat: {poi.threatLevel}</span>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Last Seen: {poi.lastSeen || 'Unknown'} | Location: {poi.lastKnownLocation || 'Unknown'}</p>
              <p class="text-sm mt-1 truncate">{poi.notes || 'No notes'}</p>
            </div>
            <div class="flex gap-2">
              <button on:click={() => editPoi(poi)} class="flex items-center gap-1 px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600">
                <Edit class="w-4 h-4" />
              </button>
              <button on:click={() => deletePoi(poi)} class="flex items-center gap-1 px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600">
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <!-- Create POI Dialog -->
  <Dialog bind:open={showCreateDialog}>
    <DialogContent class="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Create New POI</DialogTitle>
        <DialogDescription>Fill in the details for the new Person of Interest.</DialogDescription>
      </DialogHeader>
      <form on:submit|preventDefault={createPoi} class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input bind:value={formData.name} placeholder="Name" required />
          <Input bind:value={formData.dateOfBirth} type="date" placeholder="Date of Birth" />
          <Input bind:value={formData.address} placeholder="Address" />
          <Input bind:value={formData.phone} placeholder="Phone" />
          <Input bind:value={formData.email} type="email" placeholder="Email" />
          <Select bind:value={formData.status}>
            <option value="person_of_interest">Person of Interest</option>
            <option value="witness">Witness</option>
            <option value="suspect">Suspect</option>
            <option value="victim">Victim</option>
            <option value="informant">Informant</option>
          </Select>
          <Select bind:value={formData.priority}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
          <Select bind:value={formData.threatLevel}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="extreme">Extreme</option>
          </Select>
          <Input bind:value={formData.lastKnownLocation} placeholder="Last Known Location" />
          <Input bind:value={formData.lastSeen} type="date" placeholder="Last Seen" />
          <Input bind:value={formData.dangerLevel} type="number" min="0" max="10" placeholder="Danger Level" />
        </div>
        <Textarea bind:value={formData.notes} placeholder="Notes" rows="3" />
        <div class="space-y-2">
          <label class="block text-sm font-medium">Aliases (comma-separated)</label>
          <Input bind:value={formData.aliases} placeholder="Aliases" />
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-2">
            <label class="block text-sm font-medium">Physical Description</label>
            <Input bind:value={formData.physicalDescription.height} placeholder="Height" />
            <Input bind:value={formData.physicalDescription.weight} placeholder="Weight" />
            <Input bind:value={formData.physicalDescription.hair} placeholder="Hair" />
            <Input bind:value={formData.physicalDescription.eyes} placeholder="Eyes" />
            <Textarea bind:value={formData.physicalDescription.distinguishingMarks} placeholder="Distinguishing Marks" rows="2" />
          </div>
          <div class="space-y-2">
            <label class="block text-sm font-medium">Profile Data</label>
            <Textarea bind:value={formData.profileData.modusOperandi} placeholder="Modus Operandi" rows="2" />
            <Textarea bind:value={formData.profileData.knownHabits} placeholder="Known Habits (comma-separated)" rows="2" />
            <Textarea bind:value={formData.profileData.associates} placeholder="Associates (comma-separated)" rows="2" />
          </div>
        </div>
        <DialogFooter>
          <button type="button" on:click={() => { showCreateDialog = false; resetForm(); }} class="px-4 py-2 bg-gray-300 dark:bg-gray-600 rounded hover:bg-gray-400 dark:hover:bg-gray-500">Cancel</button>
          <button type="submit" disabled={isSubmitting} class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {#if isSubmitting}Creating...{:else}Create POI{/if}
          </button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>

  <!-- Edit POI Dialog -->
  <Dialog bind:open={showEditDialog}>
    <DialogContent class="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Edit POI</DialogTitle>
        <DialogDescription>Update the details for {selectedPoi?.name}.</DialogDescription>
      </DialogHeader>
      <form on:submit|preventDefault={updatePoi} class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input bind:value={formData.name} placeholder="Name" required />
          <Input bind:value={formData.dateOfBirth} type="date" placeholder="Date of Birth" />
          <Input bind:value={formData.address} placeholder="Address" />
          <Input bind:value={formData.phone} placeholder="Phone" />
          <Input bind:value={formData.email} type="email" placeholder="Email" />
          <Select bind:value={formData.status}>
            <option value="person_of_interest">Person of Interest</option>
            <option value="witness">Witness</option>
            <option value="suspect">Suspect</option>
            <option value="victim">Victim</option>
            <option value="informant">Informant</option>
          </Select>
          <Select bind:value={formData.priority}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
          <Select bind:value={formData.threatLevel}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="extreme">Extreme</option>
          </Select>
          <Input bind:value={formData.lastKnownLocation} placeholder="Last Known Location" />
          <Input bind:value={formData.lastSeen} type="date" placeholder="Last Seen" />
          <Input bind:value={formData.dangerLevel} type="number" min="0" max="10" placeholder="Danger Level" />
        </div>
        <Textarea bind:value={formData.notes} placeholder="Notes" rows="3" />
        <div class="space-y-2">
          <label class="block text-sm font-medium">Aliases (comma-separated)</label>
          <Input bind:value={formData.aliases} placeholder="Aliases" />
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-2">
            <label class="block text-sm font-medium">Physical Description</label>
            <Input bind:value={formData.physicalDescription.height} placeholder="Height" />
            <Input bind:value={formData.physicalDescription.weight} placeholder="Weight" />
            <Input bind:value={formData.physicalDescription.hair} placeholder="Hair" />
            <Input bind:value={formData.physicalDescription.eyes} placeholder="Eyes" />
            <Textarea bind:value={formData.physicalDescription.distinguishingMarks} placeholder="Distinguishing Marks" rows="2" />
          </div>
          <div class="space-y-2">
            <label class="block text-sm font-medium">Profile Data</label>
            <Textarea bind:value={formData.profileData.modusOperandi} placeholder="Modus Operandi" rows="2" />
            <Textarea bind:value={formData.profileData.knownHabits} placeholder="Known Habits (comma-separated)" rows="2" />
            <Textarea bind:value={formData.profileData.associates} placeholder="Associates (comma-separated)" rows="2" />
          </div>
        </div>
        <DialogFooter>
          <button type="button" on:click={() => { showEditDialog = false; selectedPoi = null; resetForm(); }} class="px-4 py-2 bg-gray-300 dark:bg-gray-600 rounded hover:bg-gray-400 dark:hover:bg-gray-500">Cancel</button>
          <button type="submit" disabled={isSubmitting} class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {#if isSubmitting}Updating...{:else}Update POI{/if}
          </button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</main>
