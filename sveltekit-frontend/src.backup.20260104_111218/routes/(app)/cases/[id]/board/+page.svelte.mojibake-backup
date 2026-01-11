<script lang="ts">
  import { page } from '$app/stores';
  import CanvasBoard from '$lib/components/board/CanvasBoard.svelte';
  import { onMount } from 'svelte';

  interface Evidence {
    id: string;
    title: string;
    classification: 'public' | 'confidential' | 'sealed';
    status: 'pending' | 'approved' | 'locked' | 'rejected';
    type: 'document' | 'image' | 'audio' | 'video';
    boardPosition: { x: number; y: number };
  }

  interface Relationship {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    type: 'mentions' | 'contradicts' | 'supports' | 'references' | 'timeline';
    confidence: number;
  }

  let caseId: string = '';
  let evidence: Evidence[] = $state([]);
  let relationships: Relationship[] = $state([]);
  let isLoading = $state(true);
  let error = $state('');
  let zoomLevel = $state(1);
  let panX = $state(0);
  let panY = $state(0);

  onMount(() => {
    (async () => {
      caseId = $page.params.id;
      await loadEvidenceBoard();
    })();
  });

  const loadEvidenceBoard = async () => {
    try {
      const response = await fetch(`/api/cases/${caseId}/evidence`);
      if (!response.ok) throw new Error('Failed to load evidence board');

      const data = await response.json();
      evidence = data.evidence || [];
      relationships = data.relationships || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load evidence board';
    } finally {
      isLoading = false;
    }
  };

  const handleZoomIn = () => {
    zoomLevel = Math.min(zoomLevel + 0.2, 3);
  };

  const handleZoomOut = () => {
    zoomLevel = Math.max(zoomLevel - 0.2, 0.5);
  };

  const handleResetZoom = () => {
    zoomLevel = 1;
    panX = 0;
    panY = 0;
  };

  const handleSaveLayout = async () => {
    try {
      const response = await fetch(`/api/cases/${caseId}/board/layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evidence: evidence.map((e) => ({
            id: e.id,
            position: e.boardPosition,
          })),
          relationships,
        }),
      });

      if (!response.ok) throw new Error('Failed to save layout');
      error = '';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save layout';
    }
  };
</script>

<div class="min-h-screen bg-[#FAF7F1]">
  <!-- Header -->
  <header class="bg-white border-b-2 border-[#9E0000]">
    <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">EVIDENCE BOARD</h1>
        <p class="text-gray-600 mt-1 font-mono text-sm">Case Investigation Visualization</p>
      </div>
      <div class="flex items-center gap-3">
        <button
          onclick={handleZoomIn}
          class="px-3 py-2 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 font-mono text-sm"
        >
          + ZOOM
        </button>
        <button
          onclick={handleZoomOut}
          class="px-3 py-2 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 font-mono text-sm"
        >
          - ZOOM
        </button>
        <button
          onclick={handleResetZoom}
          class="px-3 py-2 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 font-mono text-sm"
        >
          RESET
        </button>
        <button
          onclick={handleSaveLayout}
          class="px-3 py-2 bg-[#9E0000] text-white rounded hover:bg-[#7a0000] font-mono text-sm"
        >
          SAVE LAYOUT
        </button>
        <a
          href="/dashboard"
          class="px-3 py-2 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 font-mono text-sm"
        >
          BACK
        </a>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="flex-1 p-6">
    {#if error}
      <div class="mb-4 p-4 bg-red-50 border-l-4 border-l-red-600 rounded">
        <p class="text-red-700 font-mono text-sm">{error}</p>
      </div>
    {/if}

    {#if isLoading}
      <div class="text-center py-12 bg-white border-2 border-dashed border-gray-300 rounded">
        <p class="text-gray-600 font-mono">Loading evidence board...</p>
      </div>
    {:else}
      <CanvasBoard
        {evidence}
        {relationships}
        {zoomLevel}
        {panX}
        {panY}
        onupdatePosition={(e) => {
          const idx = evidence.findIndex((ev) => ev.id === e.detail.id);
          if (idx >= 0) {
            evidence[idx].boardPosition = e.detail.position;
          }
        }}
      />
    {/if}
  </main>
</div>

<style>
  :global(body) {
    background-color: #faf7f1;
  }
</style>
