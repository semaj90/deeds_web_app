<script lang="ts">
 import Button from '$lib/ui/Button.svelte';
 import Panel from '$lib/ui/Panel.svelte';
 import PersonCard from '$lib/ui/PersonCard.svelte';

 type PersonRole = 'suspect' | 'witness' | 'victim' | 'associate';
 type RiskLevel = 'high' | 'medium' | 'low';

 type Person = {
 id: string; name: string;
 role: PersonRole; riskLevel: RiskLevel;
 photo?: string; summary: string;
 lastSeen: string; connections: number;
 verified: boolean;
 };

 let filterRole: PersonRole | 'all' = $state('all');
 let filterRisk: RiskLevel | 'all' = $state('all');

 const persons: Person[] = [
 {
 id: 'POI-001',
 name: 'Marcus Chen',
 role: 'suspect',
 riskLevel: 'high',
 summary: 'Primary suspect in corporate espionage case. Former employee with access to sensitive systems. Flight risk.',
 lastSeen: '2024-12-05, 14:30',
 connections: 8, verified: true
 },
 {
 id: 'POI-002',
 name: 'Keiko Ito',
 role: 'witness',
 riskLevel: 'low',
 summary: 'Security guard who witnessed suspect entering building on night of incident. Cooperative with investigation.',
 lastSeen: '2024-12-06, 09:15',
 connections: 3, verified: true
 },
 {
 id: 'POI-003',
 name: 'David Morrison',
 role: 'suspect',
 riskLevel: 'medium',
 summary: 'Associate of Chen. Financial records show suspicious transactions. Currently under surveillance.',
 lastSeen: '2024-12-04, 18:45',
 connections: 5, verified: false
 },
 {
 id: 'POI-004',
 name: 'Sarah Kim',
 role: 'victim',
 riskLevel: 'low',
 summary: 'Corporate VP whose credentials were compromised. Full cooperation with investigation.',
 lastSeen: '2024-12-06, 10:00',
 connections: 12, verified: true
 },
 {
 id: 'POI-005',
 name: 'Unknown Male',
 role: 'associate',
 riskLevel: 'high',
 summary: 'Unidentified individual seen with Chen multiple times. Facial recognition pending.',
 lastSeen: '2024-12-03, 22:10',
 connections: 2, verified: false
 }];

 let filteredPersons = $derived(persons.filter(p => {
 if (filterRole !== 'all' && p.role !== filterRole) return false;
 if (filterRisk !== 'all' && p.riskLevel !== filterRisk) return false;
 return true;
 }));

 let suspectCount = $derived(persons.filter(p => p.role === 'suspect').length);
 let witnessCount = $derived(persons.filter(p => p.role === 'witness').length);
 let highRiskCount = $derived(persons.filter(p => p.riskLevel === 'high').length);
</script>

<svelte:head>
 <title>Persons of Interest - YoRHa Detective</title>
</svelte:head>

<div class="grid grid-cols-[1fr_300px] gap-4">
 <!-- Left, POI List -->
 <div class="flex flex-col gap-4">
 <Panel>
 <div class="flex items-center justify-between mb-3">
 <div class="heading-sub">Persons of Interest</div>
 <Button class="bits-btn" variant="primary">
 <span class="i-heroicons-plus-20-solid mr-1" ></span>
 Add Person
 </Button>
 </div>

 <!-- Filters -->
 <div class="flex gap-2 mb-3">
 <select
 bind:value={filterRole}
 class="bg-sandDark text-black px-3 py-1.5 rounded border border-black/40 text-xs font-mono"
 >
 <option value="all">All Roles</option>
 <option value="suspect">Suspects</option>
 <option value="witness">Witnesses</option>
 <option value="victim">Victims</option>
 <option value="associate">Associates</option>
 </select>

 <select
 bind:value={filterRisk}
 class="bg-sandDark text-black px-3 py-1.5 rounded border border-black/40 text-xs font-mono"
 >
 <option value="all">All Risk Levels</option>
 <option value="high">High Risk</option>
 <option value="medium">Medium Risk</option>
 <option value="low">Low Risk</option>
 </select>

 <div class="ml-auto text-xs font-mono text-black/70 flex items-center">
 Showing {filteredPersons.length} of {persons.length}
 </div>
 </div>

 <!-- Person list -->
 <div class="flex flex-col gap-3">
 {#each filteredPersons as person}
 <PersonCard
 id={person.id}
 name={person.name}
 role={person.role}
 riskLevel={person.riskLevel}
 photo={person.photo}
 summary={person.summary}
 lastSeen={person.lastSeen}
 connections={person.connections}
 verified={person.verified}
 onclick={() => console.log('View person:', person.id)}
 />
 {/each}

 {#if filteredPersons.length === 0}
 <div class="panel-soft p-8 text-center text-black/60">
 <span class="i-heroicons-user-group text-4xl mb-2 block" ></span>
 <div class="text-sm">No persons match the current filters</div>
 </div>
 {/if}
 </div>
 </Panel>
 </div>

 <!-- Right, Stats & Actions -->
 <div class="flex flex-col gap-4">
 <Panel>
 <div class="heading-sub mb-3">Overview</div>

 <div class="flex flex-col gap-2">
 <div class="panel-soft p-3">
 <div class="text-[10px] font-mono uppercase tracking-wider text-black/60 mb-1">
 Total Persons
 </div>
 <div class="text-2xl font-mono">{persons.length}</div>
 </div>

 <div class="panel-soft p-3">
 <div class="text-[10px] font-mono uppercase tracking-wider text-black/60 mb-1">
 Suspects
 </div>
 <div class="text-2xl font-mono text-danger">{suspectCount}</div>
 </div>

 <div class="panel-soft p-3">
 <div class="text-[10px] font-mono uppercase tracking-wider text-black/60 mb-1">
 Witnesses
 </div>
 <div class="text-2xl font-mono text-info">{witnessCount}</div>
 </div>

 <div class="panel-soft p-3">
 <div class="text-[10px] font-mono uppercase tracking-wider text-black/60 mb-1">
 High Risk
 </div>
 <div class="text-2xl font-mono text-warning">{highRiskCount}</div>
 </div>
 </div>
 </Panel>

 <Panel>
 <div class="heading-sub mb-3">Quick Actions</div>

 <div class="flex flex-col gap-2">
 <Button class="bits-btn" variant="secondary">
 <span class="i-heroicons-map mr-1" ></span>
 Relationship Map
 </Button>
 <Button class="bits-btn" variant="secondary">
 <span class="i-heroicons-clock mr-1" ></span>
 Timeline View
 </Button>
 <Button class="bits-btn" variant="secondary">
 <span class="i-heroicons-document-chart-bar mr-1" ></span>
 Generate Report
 </Button>
 </div>
 </Panel>

 <Panel>
 <div class="heading-sub mb-3">Recent Activity</div>

 <div class="flex flex-col gap-2 text-xs">
 <div class="panel-soft px-3 py-2">
 <div class="flex items-center gap-2 mb-1">
 <span class="i-heroicons-user-plus text-accent" ></span>
 <span class="font-mono">POI-005 added</span>
 </div>
 <div class="text-[10px] text-black/60">2 hours ago</div>
 </div>

 <div class="panel-soft px-3 py-2">
 <div class="flex items-center gap-2 mb-1">
 <span class="i-heroicons-check-badge text-info" ></span>
 <span class="font-mono">POI-001 verified</span>
 </div>
 <div class="text-[10px] text-black/60">5 hours ago</div>
 </div>

 <div class="panel-soft px-3 py-2">
 <div class="flex items-center gap-2 mb-1">
 <span class="i-heroicons-link text-warning" ></span>
 <span class="font-mono">3 new connections</span>
 </div>
 <div class="text-[10px] text-black/60">1 day ago</div>
 </div>
 </div>
 </Panel>
 </div>
</div>



