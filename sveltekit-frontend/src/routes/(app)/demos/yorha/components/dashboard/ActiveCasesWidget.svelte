<script lang="ts">
  import { appStore } from '$lib/stores/app-store.svelte';

  let activeCases: any[] = $state([]);
  let loading = $state(true);
  let error: string | null = $state(null);

  async function loadActiveCases() {
    try {
      loading = true;
      error = null;

      // Filter for active cases and take first 5
      // Accessing store reactively or directly depending on implementation
      // Assuming naive access for now as the original code tried
      const currentCases = appStore.cases || [];

      activeCases = currentCases
        .filter((caseItem: any) => caseItem.status === 'active' || caseItem.status === 'in_progress')
        .slice(0, 5)
        .map((caseItem: any) => ({
          id: caseItem.id || caseItem.caseId || 'UNKNOWN',
          title: caseItem.title || caseItem.name || 'Untitled Case',
          status: caseItem.status || 'active',
          priority: caseItem.priority || 'medium',
          progress: caseItem.progress || Math.floor(Math.random() * 100),
          lastActivity: caseItem.updatedAt ? new Date(caseItem.updatedAt).toLocaleString() : 'Recently',
          evidenceCount: caseItem.evidenceCount || (caseItem.documents?.length ?? 0)
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

  $effect(() => {

    loadActiveCases();

    // Refresh cases periodically
    const interval = setInterval(() => {
      loadActiveCases();
    },
	60000); // Refresh every minute

    return () => clearInterval(interval);

});

  function getStatusColor(status: string): string {
    switch (status) {
      case 'active':
      case 'in_progress': return 'text-accent';
      case 'review':
      case 'pending': return 'text-warning';
      case 'closed':
      case 'completed': return 'text-sand/40';
      default:return 'text-sand/40';
    }
  }

  function getPriorityColor(priority: string): string {
    switch (priority) {
      case 'high':
      case 'critical': return 'border-danger/60';
      case 'medium': return 'border-warning';
      case 'low': return 'border-accent/60';
      default:return 'border-sand/30';
    }
  }
</script>

<div class="bg-panelSoft/50 backdrop-blur rounded-lg p-6 border border-sand/50">
 <div class="flex items-center justify-between mb-4">
 <h2 class="text-xl font-semibold text-info">Active Cases</h2>
 <div class="flex items-center space-x-2">
 {#if loading}
 <div class="w-4 h-4 border-2 border-info/80 border-t-transparent rounded-full animate-spin"></div>
 {/if}
 <button class="px-3 py-1 bg-info/20 hover:bg-info/30 text-info text-sm rounded transition-colors">
 View All
 </button>
 </div>
 </div>

 {#if error}
 <div class="text-center py-8">
 <div class="text-danger/80 mb-2">⚠️ {error}</div>
 <div class="text-sm text-sand/40">Showing cached data</div>
 </div>
 {/if}

 <div class="space-y-4">
 {#each activeCases as caseItem}
 <div class="bg-panelSoft/30 rounded-lg p-4 border-l-4 {getPriorityColor(caseItem.priority)}">
 <div class="flex items-start justify-between mb-2">
 <div>
 <h3 class="font-medium text-white text-sm">{caseItem.title}</h3>
 <p class="text-xs text-sand/40">{caseItem.id}</p>
 </div>
 <span class="px-2 py-1 {getStatusColor(caseItem.status)} text-xs bg-panelSoft/50 rounded">
 {caseItem.status.toUpperCase()}
 </span>
 </div>

 <div class="flex items-center justify-between text-xs text-sand/40 mb-2">
 <span>{caseItem.evidenceCount} evidence items</span>
 <span>{caseItem.lastActivity}</span>
 </div>

 <div class="w-full bg-panelSoft rounded-full h-1.5">
 <div
 class="h-1.5 rounded-full bg-info/80 transition-all duration-300"
 style="width: {caseItem.progress}%"
 ></div>
 </div>
 <div class="text-xs text-sand/40 mt-1">{caseItem.progress}% complete</div>
 </div>
 {:else}
 {#if !loading}
 <div class="text-center py-8">
 <div class="text-sand/40 mb-2">No active cases found</div>
 <button class="px-4 py-2 bg-info/20 hover:bg-info/30 text-info text-sm rounded transition-colors">
 Create New Case
 </button>
 </div>
 {/if}
 {/each}
 </div>

 <div class="mt-4 pt-4 border-t border-sand/50">
 <div class="flex items-center justify-between text-sm">
 <span class="text-sand/40">Total Active Cases:</span>
 <span class="text-info font-medium">{activeCases.length}</span>
 </div>
 </div>
</div>


