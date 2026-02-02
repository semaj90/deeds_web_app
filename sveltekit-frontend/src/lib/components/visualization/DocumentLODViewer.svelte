<script lang="ts">
  // Migrated to $effect
  import { LoadingButton } from '$lib/headless';
  import Badge from "$lib/components/ui/badge/Badge.svelte";
  import { Card, CardContent } from "$lib/components/ui/card";
  import ZoomIn from 'lucide-svelte/icons/zoom-in';
  import ZoomOut from 'lucide-svelte/icons/zoom-out';
  import RotateCw from 'lucide-svelte/icons/rotate-cw';
  import FileText from 'lucide-svelte/icons/file-text';
  import Layers from 'lucide-svelte/icons/layers';
  import Download from 'lucide-svelte/icons/download';
  import Eye from 'lucide-svelte/icons/eye';
  import Navigation from 'lucide-svelte/icons/navigation';

  // Types
  interface DocumentPage {
    pageNumber: number;
	textContent: string;
    annotations: Annotation[];
	currentLOD: number;
  }

  interface Annotation {
    id: string;
	type: 'highlight' | 'note' | 'redaction';
    bounds: {
	x: number, y: number, width: number, height: number };
    content: string;
  }

  let {
    documentId = '',
    initialPage = 1,
    onPageChange = (page: number) => {}
  } = $props();

  // State
  let currentPage = $state(initialPage);
  let totalPages = $state(0);
  let zoomLevel = $state(1.0);
  let isLoading = $state(true);
  let currentLOD = $state(1); // 0=High, 1=Med, 2=Low

  // Mock loading
  $effect(() => {

    setTimeout(() => {
      totalPages = 5;
      isLoading = false;
    },
	1000);
  
});

  function handleZoom(delta: number) {
    zoomLevel = Math.max(0.5, Math.min(3.0, zoomLevel + delta));
  }

  function handleRotate() {
    // Rotation logic
  }
</script>

<Card class="document-lod-viewer w-full">
  <div class="toolbar flex items-center justify-between p-2 border-b bg-muted/20">
    <div class="left-controls flex gap-2">
       <LoadingButton onclick={() => handleZoom(0.1)} variant="ghost" size="sm">
         <ZoomIn class="w-4 h-4" />
       </LoadingButton>
       <LoadingButton onclick={() => handleZoom(-0.1)} variant="ghost" size="sm">
         <ZoomOut class="w-4 h-4" />
       </LoadingButton>
       <span class="text-xs self-center px-2">{Math.round(zoomLevel * 100)}%</span>
    </div>

    <div class="center-controls flex items-center gap-2">
      <FileText class="w-4 h-4" />
      <span class="text-sm font-medium">Page {currentPage} of {totalPages || '?'}</span>
    </div>

    <div class="right-controls flex gap-2">
      <LoadingButton onclick={handleRotate} variant="ghost" size="sm">
        <RotateCw class="w-4 h-4" />
      </LoadingButton>
      <Badge variant="outline">LOD {currentLOD}</Badge>
    </div>
  </div>

  <CardContent class="p-0 min-h-[500px] flex items-center justify-center bg-slate-100 dark:bg-slate-900 overflow-hidden relative">
    {#if isLoading}
      <div class="flex flex-col items-center gap-2">
        <div class="nes-progress is-primary w-48 h-4"></div>
        <span class="text-xs text-muted-foreground">Loading Document LOD...</span>
      </div>
    {:else}
      <div
        class="document-page shadow-lg bg-white transition-transform duration-200"
        style="width: 600px;
	height: 800px; transform: scale({zoomLevel}); transform-origin: center top;"
      >
        <!-- Page Content Placeholder -->
        <div class="p-8 text-black opacity-20">
          {#each Array(20) as _}
             <div class="h-2 bg-black mb-4 w-full"></div>
             <div class="h-2 bg-black mb-4 w-3/4"></div>
          {/each}
        </div>
      </div>
    {/if}
  </CardContent>
</Card>
