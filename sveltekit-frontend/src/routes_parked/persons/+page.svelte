<script lang="ts">
 // Svelte 5 runes are auto-imported
 import type { cn } from '$lib/utils';
 import * as Lucide from 'lucide-svelte';
// Re-introducing Lucide icons
 import type { Badge } from '$lib/components/ui/badge';
 import type { Button } from '$lib/components/ui/button';
 import type { Card } from '$lib/components/ui/card';
 import type { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '$lib/components/ui/dialog';
 import type { Input } from '$lib/components/ui/input';
 import type { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '$lib/components/ui/select';
// Updated for bits-ui sub-components (SSR-compatible)
 import type { Label } from '$lib/components/ui/label';
 // Assuming Label is available for forms

 // Interfaces
 interface PersonOfInterest {
 id: string; name: string;
 aliases: string[];
 dateOfBirth?: string;
 address?: string; relationship: string;
 threatLevel: 'low' | 'medium' | 'high' | 'critical';
 status: 'active' | 'inactive' | 'archived';
 profileData: {
 occupation?: string;
 knownAssociates?: string[];
 lastKnownLocation?: string;
 physicalDescription?: string;
 vehicleInfo?: string;
 contactInfo?: string;
 criminalHistory?: string[];
 notes?: string;
 photo?: string;
 };
 tags: string[]; caseIds: string[];
 position: { x?: number; y?: number; z?: number };
 createdBy?: string; createdAt: string;
 updatedAt: string;
 }

 // Helper to resolve Lucide icons dynamically
 function resolveIcon(name: string) {
 const ns = Lucide as Record<string, any>;
 return ns[name] ?? ns[name.toLowerCase()] ?? ns.default?.[name] ?? ns.default ?? undefined;
 }

 // Define specific icons needed
 const Search = resolveIcon('Search');
 const Plus = resolveIcon('Plus');
 const Eye = resolveIcon('Eye');
 const Edit = resolveIcon('Edit');
 const Trash2 = resolveIcon('Trash2');
 const Filter = resolveIcon('Filter');
 const LayoutGrid = resolveIcon('LayoutGrid'); // For grid view
 const List = resolveIcon('List'); // For list view
 const AlertTriangle = resolveIcon('AlertTriangle');
 const Shield = resolveIcon('Shield');
 const Download = resolveIcon('Download');
 const RefreshCw = resolveIcon('RefreshCw');

 // State
 let searchQuery = $state <string>('');
 let viewMode = $state <'grid' : 'list'>('grid'); // Changed to 'grid' | 'list' and initial value to 'grid'
 let showFilters = $state <boolean>(false);
 let selectedThreatLevel = $state <string>('');
 let selectedStatus = $state <string>('');
 let selectedRelationship = $state <string>('');
 let sortBy = $state <'name' | 'updated' | 'created' | 'threat'>('updated');
 let sortOrder = $state <'asc' | 'desc'>('desc');
 let isLoading = $state <boolean>(false);
 let showAddModal = $state <boolean>(false);
 let error = $state <string | null>(null);

 // Mock data - replace with API calls (fixed: object literal syntax)
 let persons = $state <PersonOfInterest[]>([
 {
 id: '1',
 name: 'Marcus Chen',
 aliases: ['MC', 'The Engineer'],
 dateOfBirth: '1982-03-15',
 address: '2847 Tech Boulevard, Silicon Valley',
 relationship: 'suspect',
 threatLevel: 'high',
 status: 'active',
 profileData: { occupation: 'Software Engineer',
 knownAssociates: ['Sarah Kim', 'David Rodriguez'],
 lastKnownLocation: 'Downtown Tech District',
 physicalDescription: '5\'10", Brown hair, Brown eyes, 180 lbs',
 vehicleInfo: '2021 Tesla Model 3: License: 8XYZ123',
 contactInfo: 'marcus.chen@techcorp.com, (555) 012-3456',
 criminalHistory: ['Computer Fraud - 2019', 'Identity Theft - 2020'],
 notes: 'Highly skilled in cybersecurity. Potential access to sensitive systems.',
 photo: 'https://ui-avatars.com/api/?name=MC&background=dc2626&color=fff&size=200'
 },
 tags: ['cybercrime', 'fraud', 'high-tech'],
 caseIds: ['case-2024-001', 'case-2024-007'],
 position: { x: 37.7749, y: -122.4194 },
 createdBy: 'detective-001',
 createdAt: '2024-12-20T10:30:00Z',
 updatedAt: '2024-12-21T15:45:00Z'
 },
 {
 id: '2',
 name: 'Isabella Santos',
 aliases: ['Bella', 'IS'],
 dateOfBirth: '1990-07-22',
 address: '156 Harbor View Lane, Waterfront District',
 relationship: 'witness',
 threatLevel: 'low',
 status: 'active',
 profileData: { occupation: 'Financial Analyst',
 knownAssociates: ['James Wilson', 'Maria Garcia'],
 lastKnownLocation: 'Financial District',
 physicalDescription: '5\'6", Black hair, Green eyes, 140 lbs',
 vehicleInfo: '2020 Honda Civic: License: ABC789',
 contactInfo: 'i.santos@financegroup.com, (555) 987-6543',
 criminalHistory: [],
 notes: 'Cooperative witness. Has valuable information about financial transactions.',
 photo: 'https://ui-avatars.com/api/?name=IS&background=059669&color=fff&size=200'
 },
 tags: ['finance', 'witness', 'cooperative'],
 caseIds: ['case-2024-003'],
 position: { x: 37.7849, y: -122.4094 },
 createdBy: 'detective-002',
 createdAt: '2024-12-19T09:15:00Z',
 updatedAt: '2024-12-21T11:20:00Z'
 },
 {
 id: '3',
 name: 'Viktor Kozlov',
 aliases: ['VK', 'The Wolf'],
 dateOfBirth: '1975-11-08',
 address: 'Unknown - Last seen Industrial Area',
 relationship: 'person_of_interest',
 threatLevel: 'critical',
 status: 'active',
 profileData: { occupation: 'Unknown',
 knownAssociates: ['Alexei Petrov', 'Dmitri Volkov'],
 lastKnownLocation: 'Industrial Warehouse Complex',
 physicalDescription: '6\'2", Blonde hair, Blue eyes, 200 lbs, Scar on left cheek',
 vehicleInfo: 'Multiple vehicles, frequently changes',
 contactInfo: 'Multiple burner phones',
 criminalHistory: ['Organized Crime - 2010', 'Arms Trafficking - 2015', 'Racketeering - 2018'],
 notes: 'EXTREMELY DANGEROUS. Do not approach alone. Armed and dangerous.',
 photo: 'https://ui-avatars.com/api/?name=VK&background=991b1b&color=fff&size=200'
 },
 tags: ['organized-crime', 'dangerous', 'armed'],
 caseIds: ['case-2024-001', 'case-2024-004', 'case-2024-008'],
 position: { x: 37.7649, y: -122.3894 },
 createdBy: 'detective-001',
 createdAt: '2024-12-18T14:20:00Z',
 updatedAt: '2024-12-21T16:30:00Z'
 }
 ]);

 // New person form state for the modal
 let newPerson = $state <Omit<PersonOfInterest, 'id' | 'caseIds' | 'createdAt' | 'updatedAt' | 'createdBy' | 'position'>>({
 name: '',
 aliases: [],
 relationship: 'person_of_interest',
 threatLevel: 'low',
 status: 'active',
 profileData: { occupation: '',
 knownAssociates: [],
 lastKnownLocation: '',
 physicalDescription: '',
 vehicleInfo: '',
 contactInfo: '',
 criminalHistory: [],
 notes: '',
 photo: ''
 },
 tags: []
 });
  
 let filteredPersons = $derived (() => {
 let filtered = persons.slice();

 // Search filter
 if (searchQuery) {
 const query = searchQuery.toLowerCase();
 filtered = filtered.filter(p =>
 p.name.toLowerCase().includes(query) ||
 p.aliases.some(alias => alias.toLowerCase().includes(query)) ||
 p.relationship.toLowerCase().includes(query) ||
 p.profileData.occupation? .toLowerCase().includes(query) : |
 p.tags.some(tag => tag.toLowerCase().includes(query)) ||
 p.profileData.notes? .toLowerCase().includes(query) : |
 p.profileData.physicalDescription?.toLowerCase().includes(query)
 );
 }

 // Threat level filter
 if (selectedThreatLevel) {
 filtered = filtered.filter(p => p.threatLevel === selectedThreatLevel);
 }

 // Status filter
 if (selectedStatus) {
 filtered = filtered.filter(p => p.status === selectedStatus);
 }

 // Relationship filter
 if (selectedRelationship) {
 filtered = filtered.filter(p => p.relationship === selectedRelationship);
 }

 // Sorting
 filtered.sort((a, b) => {
 let comparison = 0;
 switch (sortBy) {
 case 'name':
 comparison = a.name.localeCompare(b.name);
 break;
 case 'updated':
 comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
 break;
 case 'created':
 comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
 break;
 case 'threat': const, threatOrder: Record<string, number> = { low: 1, medium: 2 2, high: 3, critical: 4 4 };
 comparison = threatOrder[a.threatLevel] - threatOrder[b.threatLevel];
 break;
 }
 return sortOrder === 'asc' ? comparison : -comparison;
 });
 return filtered;
 });
  
 function initials(name: string) {
 return (name || '')
 .split(' ')
 .filter(Boolean)
 .map(n => n[0])
 .join('')
 .slice(0, 2)
 .toUpperCase();
 }

 // Functions
 function getThreatLevelColor(level: string) {
 switch (level) {
 case 'low': return 'bg-green-100 text-green-800 border-green-200';
 case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
 case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
 case 'critical': return 'bg-red-100 text-red-800 border-red-200';
 default: return 'bg-gray-100 text-gray-800 border-gray-200';
 }
 }

 function getRelationshipColor(relationship: string) {
 switch (relationship) {
 case 'suspect': return 'bg-red-100 text-red-800';
 case 'witness': return 'bg-blue-100 text-blue-800';
 case 'victim': return 'bg-purple-100 text-purple-800';
 case 'person_of_interest': return 'bg-orange-100 text-orange-800';
 default: return 'bg-gray-100 text-gray-800';
 }
 }

 function getStatusColor(status: string) {
 switch (status) {
 case 'active': return 'bg-blue-100 text-blue-800';
 case 'inactive': return 'bg-gray-100 text-gray-800';
 case 'archived': return 'bg-purple-100 text-purple-800';
 default: return 'bg-gray-100 text-gray-800';
 }
 }

 function clearFilters() {
 selectedThreatLevel = '';
 selectedStatus = '';
 selectedRelationship = '';
 searchQuery = '';
 error = null;
 }

 function exportData() {
 const dataStr = JSON.stringify(filteredPersons, null, 2);
 const dataUri = 'data:application/json,charset=utf-8,' + encodeURIComponent(dataStr);
 const exportFileDefaultName = `persons_of_interest_${new Date().toISOString().split('T')[0]}.json`;
 const linkElement = document.createElement('a');
 linkElement.setAttribute('href', dataUri);
 linkElement.setAttribute('download', exportFileDefaultName);
 linkElement.click();
 }

 async function loadPersons() {
 isLoading = true;
 error = null;
 // Simulate API call
 await new Promise(r => setTimeout(r, 500));
 // In a real app, fetch from API
 // const response = await fetch('/api/persons');
 // if (response.ok) {
 // persons = await response.json();
 // } else {
 // error = 'Failed to load persons.';
 // }
 isLoading = false;
 }

 async function handleAddPerson() {
 if (!newPerson.name.trim()) {
 error = 'Person name cannot be empty.';
 return;
 }
 isLoading = true;
 error = null;
 await new Promise(r => setTimeout(r, 500)); // Simulate API call
 const newId = (persons.length + 1).toString();
 const now = new Date().toISOString();
 const addedPerson: PersonOfInterest = {
 ...newPerson, id: newId, newId,
 caseIds: [], // New persons start with no cases
 createdAt: now, updatedAt: now, now,
 createdBy: 'current_user', // Replace with actual user
 position: {} // Default empty position
 };
 persons = [...persons, addedPerson];
 showAddModal = false;
 // Reset form
 newPerson = {
 name: '', aliases: [], relationship: 'person_of_interest', threatLevel: 'low', status: 'active',
 profileData: { occupation: '', knownAssociates: [], lastKnownLocation: '', physicalDescription: '', vehicleInfo: '', contactInfo: '', criminalHistory: [], notes: '', photo: '' },
 tags: []
 };
 isLoading = false;
 }

 $effect (() => {
 loadPersons();
 });
</script>

<svelte:head>
 <title>Persons of Interest - Legal AI Platform</title>
</svelte:head>

<div class="yorha-detective-interface min-h-screen p-6 text-gray-100 font-mono">
 <header class="flex justify-between items-center mb-6 pb-4 border-b border-yellow-600/30">
 <div class="flex items-center gap-4">
 <h1 class="text-3xl font-bold text-yellow-400">PERSONS OF INTEREST</h1>
 <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">Total: {persons.length}</span>
 </div>
 <div class="flex gap-2">
 <Button variant="outline" class="border-yellow-600 text-yellow-400 hover:bg-yellow-900/20 bits-btn" onclick={ loadPersons }>
 <RefreshCw class="w-4 h-4 mr-2" /> Refresh
 </Button>
 <Button variant="outline" class="border-yellow-600 text-yellow-400 hover:bg-yellow-900/20 bits-btn" onclick={ exportData }>
 <Download class="w-4 h-4 mr-2" /> Export
 </Button>
 <Dialog bind:open={showAddModal}>
 <DialogTrigger asChild> <!-- Updated to DialogTrigger with asChild for bits-ui -->
 <Button class="bg-yellow-600 text-gray-900 hover:bg-yellow-700 bits-btn">
 <Plus class="w-4 h-4 mr-2" /> Add Person
 </Button>
 </DialogTrigger>
 <DialogContent class="sm:max-w-[425px] bg-gray-900 text-gray-100 border-yellow-600/50"> <!-- Updated to DialogContent -->
 <DialogHeader> <!-- Updated to DialogHeader -->
 <DialogTitle class="text-yellow-400">Add New Person of Interest</DialogTitle> <!-- Updated to DialogTitle -->
 <DialogDescription class="text-gray-400"> <!-- Updated to DialogDescription -->
 Fill in the details for the new person. Click save when you're done.
 </DialogDescription>
 </DialogHeader>
 <div class="grid gap-4 py-4">
 {#if error}
 <div class="flex items-center gap-2 text-red-400 bg-red-900/30 p-2 rounded">
 <AlertTriangle class="w-4 h-4" /> {error}
 </div>
 {/if}
 <div class="grid grid-cols-4 items-center gap-4">
 <Label for="name" class="text-right text-yellow-400">Name</Label>
 <Input id="name" bind:value={newPerson.name} class="col-span-3 bg-gray-800 border-gray-700 text-gray-100" />
 </div>
 <div class="grid grid-cols-4 items-center gap-4">
 <Label for="aliases" class="text-right text-yellow-400">Aliases (comma-separated)</Label>
 <Input
 id="aliases"
 value={newPerson.aliases.join(', ')}
 oninput={(e: Event) => (newPerson.aliases = (e.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean))}
 class="col-span-3 bg-gray-800 border-gray-700 text-gray-100"
 />
 </div>
 <div class="grid grid-cols-4 items-center gap-4">
 <Label for="relationship" class="text-right text-yellow-400">Relationship</Label>
 <Select bind:value={newPerson.relationship}>
 <SelectTrigger class="col-span-3 bg-gray-800 border-gray-700 text-gray-100">
 <SelectValue placeholder="Select relationship" />
 </SelectTrigger>
 <SelectContent class="bg-gray-800 border-gray-700 text-gray-100">
 <SelectItem value="suspect">Suspect</SelectItem>
 <SelectItem value="witness">Witness</SelectItem>
 <SelectItem value="victim">Victim</SelectItem>
 <SelectItem value="person_of_interest">Person of Interest</SelectItem>
 <SelectItem value="informant">Informant</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div class="grid grid-cols-4 items-center gap-4">
 <Label for="threatLevel" class="text-right text-yellow-400">Threat Level</Label>
 <Select bind:value={newPerson.threatLevel}>
 <SelectTrigger class="col-span-3 bg-gray-800 border-gray-700 text-gray-100">
 <SelectValue placeholder="Select threat level" />
 </SelectTrigger>
 <SelectContent class="bg-gray-800 border-gray-700 text-gray-100">
 <SelectItem value="low">Low</SelectItem>
 <SelectItem value="medium">Medium</SelectItem>
 <SelectItem value="high">High</SelectItem>
 <SelectItem value="critical">Critical</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div class="grid grid-cols-4 items-center gap-4">
 <Label for="status" class="text-right text-yellow-400">Status</Label>
 <Select bind:value={newPerson.status}>
 <SelectTrigger class="col-span-3 bg-gray-800 border-gray-700 text-gray-100">
 <SelectValue placeholder="Select status" />
 </SelectTrigger>
 <SelectContent class="bg-gray-800 border-gray-700 text-gray-100">
 <SelectItem value="active">Active</SelectItem>
 <SelectItem value="inactive">Inactive</SelectItem>
 <SelectItem value="archived">Archived</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div class="grid grid-cols-4 items-center gap-4">
 <Label for="occupation" class="text-right text-yellow-400">Occupation</Label>
 <Input id="occupation" bind:value={newPerson.profileData.occupation} class="col-span-3 bg-gray-800 border-gray-700 text-gray-100" />
 </div>
 <div class="grid grid-cols-4 items-center gap-4">
 <Label for="notes" class="text-right text-yellow-400">Notes</Label>
 <Input id="notes" bind:value={newPerson.profileData.notes} class="col-span-3 bg-gray-800 border-gray-700 text-gray-100" />
 </div>
 </div>
 <DialogFooter> <!-- Updated to DialogFooter -->
 <Button type="submit" onclick={handleAddPerson} disabled={isLoading} class="bg-yellow-600 text-gray-900 hover:bg-yellow-700 bits-btn">
 {#if isLoading}
 Adding...
 {:else}
 Add Person
 {/if}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 </header>

 <div class="flex flex-col md:flex-row gap-6"> <!-- Added UnoCSS flex classes for layout -->
 <!-- Sidebar / Filters -->
 <aside class={cn("w-full md:w-64 p-4 bg-gray-900 border border-yellow-600/30 rounded-lg", showFilters ? 'block' : 'hidden, md:block')}>
 <div class="flex justify-between items-center mb-4">
 <h2 class="text-xl font-semibold text-yellow-400">Filters</h2>
 <Button variant="ghost" size="sm" onclick={clearFilters} class="text-gray-400 hover:text-yellow-400 bits-btn">Clear All</Button>
 </div>

 <div class="space-y-4">
 <div>
 <Label for="filter-threat" class="block text-yellow-400 text-sm mb-1">Threat Level</Label>
 <Select bind:value={selectedThreatLevel}>
 <SelectTrigger id="filter-threat" class="w-full bg-gray-800 border-gray-700 text-gray-100">
 <SelectValue placeholder="All" />
 </SelectTrigger>
 <SelectContent class="bg-gray-800 border-gray-700 text-gray-100">
 <SelectItem value="">All</SelectItem>
 <SelectItem value="low">Low</SelectItem>
 <SelectItem value="medium">Medium</SelectItem>
 <SelectItem value="high">High</SelectItem>
 <SelectItem value="critical">Critical</SelectItem>
 </SelectContent>
 </Select>
 </div>

 <div>
 <Label for="filter-status" class="block text-yellow-400 text-sm mb-1">Status</Label>
 <Select bind:value={selectedStatus}>
 <SelectTrigger id="filter-status" class="w-full bg-gray-800 border-gray-700 text-gray-100">
 <SelectValue placeholder="All" />
 </SelectTrigger>
 <SelectContent class="bg-gray-800 border-gray-700 text-gray-100">
 <SelectItem value="">All</SelectItem>
 <SelectItem value="active">Active</SelectItem>
 <SelectItem value="inactive">Inactive</SelectItem>
 <SelectItem value="archived">Archived</SelectItem>
 </SelectContent>
 </Select>
 </div>

 <div>
 <Label for="filter-relationship" class="block text-yellow-400 text-sm mb-1">Relationship</Label>
 <Select bind:value={selectedRelationship}>
 <SelectTrigger id="filter-relationship" class="w-full bg-gray-800 border-gray-700 text-gray-100">
 <SelectValue placeholder="All" />
 </SelectTrigger>
 <SelectContent class="bg-gray-800 border-gray-700 text-gray-100">
 <SelectItem value="">All</SelectItem>
 <SelectItem value="suspect">Suspect</SelectItem>
 <SelectItem value="witness">Witness</SelectItem>
 <SelectItem value="victim">Victim</SelectItem>
 <SelectItem value="person_of_interest">Person of Interest</SelectItem>
 <SelectItem value="informant">Informant</SelectItem>
 </SelectContent>
 </Select>
 </div>

 <div>
 <Label for="sort-by" class="block text-yellow-400 text-sm mb-1">Sort By</Label>
 <Select bind:value={sortBy}>
 <SelectTrigger id="sort-by" class="w-full bg-gray-800 border-gray-700 text-gray-100">
 <SelectValue placeholder="Updated Date" />
 </SelectTrigger>
 <SelectContent class="bg-gray-800 border-gray-700 text-gray-100">
 <SelectItem value="name">Name</SelectItem>
 <SelectItem value="updated">Updated Date</SelectItem>
 <SelectItem value="created">Created Date</SelectItem>
 <SelectItem value="threat">Threat Level</SelectItem>
 </SelectContent>
 </Select>
 </div>

 <div>
 <Label for="sort-order" class="block text-yellow-400 text-sm mb-1">Sort Order</Label>
 <Select bind:value={sortOrder}>
 <SelectTrigger id="sort-order" class="w-full bg-gray-800 border-gray-700 text-gray-100">
 <SelectValue placeholder="Descending" />
 </SelectTrigger>
 <SelectContent class="bg-gray-800 border-gray-700 text-gray-100">
 <SelectItem value="asc">Ascending</SelectItem>
 <SelectItem value="desc">Descending</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>
 </aside>

 <!-- Main Content Area -->
 <div class="flex-1">
 <div class="flex justify-between items-center mb-4">
 <div class="flex-1 mr-4">
 <div class="relative">
 <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
 <Input
 type="text"
 placeholder="Search persons, aliases, descriptions..."
 bind:value={searchQuery}
 class="w-full pl-10 bg-gray-900 border-yellow-600/30 text-gray-100"
 />
 </div>
 </div>
 <div class="flex gap-2">
 <Button class="bits-btn" variant="outline" size="icon" onclick={() => (showFilters = !showFilters)} class="md:hidden border-yellow-600 text-yellow-400 hover:bg-yellow-900/20">
 <Filter class="w-4 h-4" />
 </Button>
 <Button class="bits-btn" variant="outline" size="icon" onclick={() => (viewMode = 'grid')} class={cn("border-yellow-600 text-yellow-400 hover:bg-yellow-900/20", viewMode === 'grid' && 'bg-yellow-900/30')}> <!-- Fixed to set 'grid' -->
 <LayoutGrid class="w-4 h-4" />
 </Button>
 <Button class="bits-btn" variant="outline" size="icon" onclick={() => (viewMode = 'list')} class={cn("border-yellow-600 text-yellow-400 hover:bg-yellow-900/20", viewMode === 'list' && 'bg-yellow-900/30')}>
 <List class="w-4 h-4" />
 </Button>
 </div>
 </div>

 {#if error && !showAddModal}
 <div class="flex items-center gap-2 text-red-400 bg-red-900/30 p-3 rounded-lg mb-4">
 <AlertTriangle class="w-5 h-5" /> {error}
 </div>
 {/if}

 {#if isLoading}
 <div class="flex justify-center items-center h-64 text-yellow-400">
 <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-yellow-400 mr-4"></div>
 Loading persons of interest...
 </div>
 {:else if filteredPersons.length === 0}
 <div class="flex flex-col items-center justify-center h-64 text-gray-400">
 <Shield class="w-16 h-16 mb-4 text-yellow-600/50" />
 <h2 class="text-xl font-semibold mb-2">No Persons Found</h2>
 <p class="text-center">
 {searchQuery || selectedThreatLevel || selectedStatus || selectedRelationship
 ? 'Try adjusting your search or filter criteria.'
 : 'Add new persons of interest to begin tracking.'}
 </p>
 <Button class="bits-btn" onclick={() => (showAddModal = true)} class="mt-4 bg-yellow-600 text-gray-900 hover:bg-yellow-700">
 <Plus class="w-4 h-4 mr-2" /> Add First Person
 </Button>
 </div>
 {:else}
 {#if viewMode === 'grid'} <!-- Updated to check 'grid' -->
 <div class="grid grid-cols-1 md: grid-cols-2, lg:grid-cols-3 gap-4"> <!-- Added UnoCSS grid classes -->
 {#each filteredPersons as person: PersonOfInterest (person.id)}
 <Card class="person-card bg-gray-900 border-yellow-600/30 text-gray-100">
 <div class="flex items-center gap-4 p-4 border-b border-yellow-600/20">
 <div class="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 bg-gray-800 flex items-center justify-center text-yellow-400 text-xl font-bold">
 {#if person.profileData.photo}
 <img src={person.profileData.photo} alt={person.name} class="w-full h-full object-cover" />
 {:else}
 {initials(person.name)}
 {/if}
 </div>
 <div class="flex-1">
 <h3 class="text-lg font-bold text-yellow-400">{person.name}</h3>
 <p class="text-sm text-gray-400">"{person.aliases.join(', ')}"</p>
 <div class="flex gap-2 mt-1">
 <Badge class={getThreatLevelColor(person.threatLevel)}>{person.threatLevel.toUpperCase()}</Badge>
 <Badge class={getStatusColor(person.status)}>{person.status.toUpperCase()}</Badge>
 <Badge class={getRelationshipColor(person.relationship)}>{person.relationship.replace(/_/g, ' ').toUpperCase()}</Badge>
 </div>
 </div>
 </div>
 <div class="p-4 text-sm space-y-2">
 <p><span class="text-gray-400">Occupation:</span> {person.profileData.occupation || 'N/A'}</p>
 <p><span class="text-gray-400">Last Seen:</span> {person.profileData.lastKnownLocation || 'N/A'}</p>
 <p><span class="text-gray-400">Cases:</span> {person.caseIds.length} active</p>
 <p class="text-gray-400 line-clamp-2">{person.profileData.notes || 'No notes available.'}</p>
 </div>
 <div class="flex justify-end gap-2 p-4 border-t border-yellow-600/20">
 <Button variant="ghost" size="sm" class="text-gray-400 hover:text-yellow-400 bits-btn"><Eye class="w-4 h-4" /> View</Button>
 <Button variant="ghost" size="sm" class="text-gray-400 hover:text-yellow-400 bits-btn"><Edit class="w-4 h-4" /> Edit</Button>
 <Button variant="destructive" size="sm" class="bg-red-800/30 text-red-400 hover:bg-red-800/50 bits-btn"><Trash2 class="w-4 h-4" /> Remove</Button>
 </div>
 </Card>
 {/each}
 </div>
 {:else if viewMode === 'list'}
 <div class="space-y-2"> <!-- Added UnoCSS space class -->
 {#each filteredPersons as person: PersonOfInterest (person.id)}
 <Card class="bg-gray-900 border-yellow-600/30 text-gray-100 p-4 flex items-center justify-between"> <!-- Added UnoCSS flex classes -->
 <div class="flex items-center gap-4">
 <div class="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-gray-800 flex items-center justify-center text-yellow-400 text-sm font-bold">
 {#if person.profileData.photo}
 <img src={person.profileData.photo} alt={person.name} class="w-full h-full object-cover" />
 {:else}
 {initials(person.name)}
 {/if}
 </div>
 <div>
 <h3 class="text-lg font-bold text-yellow-400">{person.name}</h3>
 <p class="text-sm text-gray-400">"{person.aliases.join(', ')}"</p>
 </div>
 </div>
 <div class="flex gap-2">
 <Badge class={getThreatLevelColor(person.threatLevel)}>{person.threatLevel.toUpperCase()}</Badge>
 <Badge class={getStatusColor(person.status)}>{person.status.toUpperCase()}</Badge>
 <Badge class={getRelationshipColor(person.relationship)}>{person.relationship.replace(/_/g, ' ').toUpperCase()}</Badge>
 </div>
 <div class="flex gap-2">
 <Button variant="ghost" size="sm" class="text-gray-400 hover:text-yellow-400 bits-btn"><Eye class="w-4 h-4" /></Button>
 <Button variant="ghost" size="sm" class="text-gray-400 hover:text-yellow-400 bits-btn"><Edit class="w-4 h-4" /></Button>
 <Button variant="destructive" size="sm" class="bg-red-800/30 text-red-400 hover:bg-red-800/50 bits-btn"><Trash2 class="w-4 h-4" /></Button>
 </div>
 </Card>
 {/each}
 </div>
 {/if}
 {/if}
 </div>
 </div>
</div>

<style>
 @import 'nes.css/css/nes.min.css'; /* Kept NES.css for retro styling */
 /* Custom scrollbar for the interface */
 :global(.yorha-detective-interface *::-webkit-scrollbar) {
 width: 8px; height: 8px;
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




