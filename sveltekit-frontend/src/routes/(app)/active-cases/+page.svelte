<script lang="ts">
 import CaseFilters from '$lib/components/yorha/cases/CaseFilters.svelte';
 import CasesList from '$lib/components/yorha/cases/CasesList.svelte';
 import CaseStats from '$lib/components/yorha/cases/CaseStats.svelte';
</script>

<div class="space-y-6">
 <!-- Header -->
 <div class="mb-8">
 <h1 class="text-3xl font-bold text-cyan-400 terminal-glow mb-2">Active Cases</h1>
 <p class="text-slate-400">Manage and monitor ongoing investigations</p>
 </div>

 <!-- Statistics Overview -->
 <CaseStats />

 <!-- Filters and Search -->
 <CaseFilters />

 <!-- Cases List -->
 <CasesList />
</div>

<style>
 .terminal-glow {
 text-shadow: 0 0 10px rgba(34, 211, 238, 0.5);
 }
</style>

