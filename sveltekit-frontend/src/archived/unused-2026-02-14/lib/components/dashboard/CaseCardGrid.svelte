<script lang="ts">
  import { goto } from '$app/navigation';

  export interface Case {
    id: string;
	title: string;
    status: 'active' | 'closed';
    createdAt: string;
	updatedAt: string;
    evidence: Array<{
	id: string, status: string }>;
  }

  let { isLoading = false, cases = [] }: {
    isLoading?: boolean;
    cases?: Case[];
  } = $props();

  const getPendingCount = (caseItem: Case) => {
    return caseItem.evidence.filter((e) => e.status === 'pending').length;
  };

  const getApprovedCount = (caseItem: Case) => {
    return caseItem.evidence.filter((e) => e.status === 'approved').length;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'border-l-4 border-l-[#9E0000]';
      case 'closed':
        return 'border-l-4 border-l-sand/40';
      default:return 'border-l-4 border-l-sand/30';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-[#9E0000] text-white';
      case 'closed':
        return 'bg-sand/20 text-white';
      default:return 'bg-sand/20 text-sand';
    }
  };

  const handleCaseClick = (caseId: string) => {
    goto(`/cases/${caseId}`);
  };
</script>

<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {#if isLoading}
    {#each Array(3) as _}
      <div class="bg-white border-2 border-sand/20 p-6 rounded animate-pulse">
        <div class="h-6 bg-sand/10 rounded mb-3"></div>
        <div class="h-4 bg-sand/10 rounded mb-4 w-1/2"></div>
        <div class="grid grid-cols-2 gap-3">
          <div class="h-16 bg-sand/10 rounded"></div>
          <div class="h-16 bg-sand/10 rounded"></div>
        </div>
      </div>
    {/each}
  {:else if cases.length === 0}
    <div class="col-span-full text-center py-12 bg-white border-2 border-dashed border-sand/20 rounded">
      <p class="text-sand/60 font-mono">No cases found</p>
    </div>
  {:else}
    {#each cases as caseItem (caseItem.id)}
      <button
        onclick={() => handleCaseClick(caseItem.id)}
        class="bg-white border-2 border-sand/20 hover:border-[#9E0000] transition p-6 cursor-pointer rounded text-left {getStatusColor(caseItem.status)}"
      >
        <div class="flex items-start justify-between mb-3">
          <h3 class="text-lg font-bold text-sand flex-1">{caseItem.title}</h3>
          <span class="px-2 py-1 text-xs font-mono rounded {getStatusBadge(caseItem.status)}">
            {caseItem.status.toUpperCase()}
          </span>
        </div>

        <p class="text-xs text-sand/60 font-mono mb-4">
          Updated {new Date(caseItem.updatedAt).toLocaleDateString()}
        </p>

        <div class="grid grid-cols-2 gap-3">
          <div class="bg-[#FFA500] bg-opacity-10 border border-[#FFA500] rounded p-3">
            <p class="text-xs text-sand/60 font-mono">Pending</p>
            <p class="text-2xl font-bold text-[#FFA500]">{getPendingCount(caseItem)}</p>
          </div>
          <div class="bg-[#00AA00] bg-opacity-10 border border-[#00AA00] rounded p-3">
            <p class="text-xs text-sand/60 font-mono">Approved</p>
            <p class="text-2xl font-bold text-[#00AA00]">{getApprovedCount(caseItem)}</p>
          </div>
        </div>
      </button>
    {/each}
  {/if}
</div>

<style>
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  :global(.animate-pulse) {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
</style>
