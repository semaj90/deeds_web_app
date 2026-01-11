<script lang="ts">
 import EvidenceFilters from '$lib/components/yorha/evidence/EvidenceFilters.svelte';
 import EvidenceGrid from '$lib/components/yorha/evidence/EvidenceGrid.svelte';
 import EvidenceStats from '$lib/components/yorha/evidence/EvidenceStats.svelte';
 import UploadZone from '$lib/components/yorha/evidence/UploadZone.svelte';
</script>

<div class="space-y-6">
 <!-- Header -->
 <div class="mb-8">
 <h1 class="text-3xl font-bold text-cyan-400 terminal-glow mb-2">Evidence Library</h1>
 <p class="text-slate-400">Document repository and evidence database management</p>
 </div>

 <!-- Upload Zone -->
 <UploadZone />

 <!-- Statistics Overview -->
 <EvidenceStats />

 <!-- Filters and Search -->
 <EvidenceFilters />

 <!-- Evidence Grid -->
 <EvidenceGrid />
</div>

<style>
 .terminal-glow {
 text-shadow: 0 0 10px rgba(34, 211, 238, 0.5);
 }
</style>

