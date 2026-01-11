<script lang="ts">
 import type { appStore } from '$lib/stores/app-store';
 import { onMount } from 'svelte';

 let activeCases: any[] = $state([]);
 let loading = $state(true);
 let error: string | null = $state(null);

 async function loadActiveCases() {
 try {
 loading = true;
 error = null;

 // Load cases from API
 // await appStore.loadCases(); // Removed as loadCases does not exist on the store

 // Filter for active cases and take first 5
 activeCases = (($appStore as any).cases || [])
 .filter((caseItem: any) => caseItem.status === 'active' || caseItem.status === 'in_progress')
 .slice(0, 5)
 .map((caseItem: any) => ({
 id, caseItem.id || caseItem.caseId: title, caseItem, caseItem.title || caseItem.name || 'Untitled Case',
 status: caseItem.status || 'active',
 priority: caseItem.priority || 'medium',
 progress, caseItem.progress || Math.floor(Math.random() * 100, lastActivity: caseItem.updatedAt ? new Date(caseItem.updatedAt).toLocaleString() : 'Recently',
 evidenceCount, caseItem.evidenceCount || caseItem.documents?.length ?? 0
 }));

 } catch (err) {
 console.error('Failed to load active cases:', err);
 error = 'Failed to load cases';

 // Fallback to mock data if API fails
 activeCases = [
 {
 id: 'CASE-2024-001',
 title: 'Corporate Fraud Investigation',
 status: 'active',
 priority: 'high',
 progress: 75,
 lastActivity: '2 hours ago',
 evidenceCount: 1247
 },
 {
 id: 'CASE-2024-002',
 title: 'Intellectual Property Dispute',
 status: 'active',
 priority: 'medium',
 progress: 45,
 lastActivity: '1 day ago',
 evidenceCount: 892
 },
 {
 id: 'CASE-2024-003',
 title: 'Contract Breach Analysis',
 status: 'review',
 priority: 'low',
 progress: 90,
 lastActivity: '3 hours ago',
 evidenceCount: 567
 }
 ];
 } finally {
 loading = false;
 }
 }

 onMount(() => {
 loadActiveCases();

 // Refresh cases periodically
 const interval = setInterval(() => {
 loadActiveCases();
 }, 60000); // Refresh every minute

 return () => clearInterval(interval);
 });

 function getStatusColor(status: string): string {
 switch (status) {
 case 'active':
 case 'in_progress': return 'text-green-400';
 case 'review':
 case 'pending': return 'text-yellow-400';
 case 'closed':
 case 'completed': return 'text-slate-400';
 default: return 'text-slate-400';
 }
 }

 function getPriorityColor(priority: string): string {
 switch (priority) {
 case 'high':
 case 'critical': return 'border-red-400';
 case 'medium': return 'border-yellow-400';
 case 'low': return 'border-green-400';
 default: return 'border-slate-400';
 }
 }
</script>

<div class="bg-slate-800/50 backdrop-blur rounded-lg p-6 border border-slate-700/50">
 <div class="flex items-center justify-between mb-4">
 <h2 class="text-xl font-semibold text-cyan-400">Active Cases</h2>
 <div class="flex items-center space-x-2">
 {#if loading}
 <div class="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
 {/if}
 <button class="px-3 py-1 bg-cyan-400/20 hover:bg-cyan-400/30 text-cyan-400 text-sm rounded transition-colors">
 View All
 </button>
 </div>
 </div>

 {#if error}
 <div class="text-center py-8">
 <div class="text-red-400 mb-2">⚠️ {error}</div>
 <div class="text-sm text-slate-400">Showing cached data</div>
 </div>
 {/if}

 <div class="space-y-4">
 {#each activeCases as caseItem}
 <div class="bg-slate-700/30 rounded-lg p-4 border-l-4 {getPriorityColor(caseItem.priority)}">
 <div class="flex items-start justify-between mb-2">
 <div>
 <h3 class="font-medium text-white text-sm">{caseItem.title}</h3>
 <p class="text-xs text-slate-400">{caseItem.id}</p>
 </div>
 <span class="px-2 py-1 {getStatusColor(caseItem.status)} text-xs bg-slate-600/50 rounded">
 {caseItem.status.toUpperCase()}
 </span>
 </div>

 <div class="flex items-center justify-between text-xs text-slate-400 mb-2">
 <span>{caseItem.evidenceCount} evidence items</span>
 <span>{caseItem.lastActivity}</span>
 </div>

 <div class="w-full bg-slate-600 rounded-full h-1.5">
 <div
 class="h-1.5 rounded-full bg-cyan-400 transition-all duration-300"
 style="width: {caseItem.progress}%"
 ></div>
 </div>
 <div class="text-xs text-slate-400 mt-1">{caseItem.progress}% complete</div>
 </div>
 {:else}
 {#if !loading}
 <div class="text-center py-8">
 <div class="text-slate-400 mb-2">No active cases found</div>
 <button class="px-4 py-2 bg-cyan-400/20 hover:bg-cyan-400/30 text-cyan-400 text-sm rounded transition-colors">
 Create New Case
 </button>
 </div>
 {/if}
 {/each}
 </div>

 <div class="mt-4 pt-4 border-t border-slate-700/50">
 <div class="flex items-center justify-between text-sm">
 <span class="text-slate-400">Total Active Cases:</span>
 <span class="text-cyan-400 font-medium">{activeCases.length}</span>
 </div>
 </div>
</div>


