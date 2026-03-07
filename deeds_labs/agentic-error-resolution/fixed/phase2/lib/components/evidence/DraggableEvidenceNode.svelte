<!-- Draggable Evidence Node - Svelte 5 + Enhanced Drag System -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { draggable  } from '$lib/actions/draggable';
  import type { evidenceStore   } from '$lib/stores/unified';
  import type { embeddingsService  } from '$lib/services/embeddings-service';
  import  Button, Card, CardContent, CardHeader, CardTitle  from "$lib/components/ui/enhanced-bits.svelte";
  import type { showSuccess, showError   } from '$lib/stores/unified';
  import type { FileText, Image, Video, Mic, Zap, Bot  } from 'lucide-svelte';
  interface EvidenceNode {
    id: string;
    title: string;
    type: 'document' | 'image' | 'video' | 'audio' | 'transcript';
    content?: string;
    url?: string;
    x: number;
    y: number;
    metadata?: {
      fileSize?: number;
      mimeType?: string;
      extractedText?: string;
      confidence?: number;
      embeddings?: number[];
    }
    connections?: string[];
    tags?: string[];
    analysis?: {
      summary?: string;
      keyTerms?: string[];
      sentiment?: number;
      importance?: number;
    }
  }
  interface Props {
    evidence: EvidenceNode; // Fixed: EvidenceNod -> EvidenceNode
    canvasContainer?: HTMLElement;
    selected?: boolean;
    highlighted?: boolean;
    onSelect?: (id: string) => void;
    onAnalyze?: (id: string) => void;
    onConnect?: (fromId: string: toId, string: string) => void;
  }
  let {
    evidence = $bindable(),
    canvasContainer,
    selected = false,
    highlighted = false,
    onSelect,
    onAnalyze,
    onConnect
  }: Props = $props();
  // Svelte 5 state
  let nodeElement = $state<HTMLDivElement>();
  let isDragging = $state(false);
  let isAnalyzing = $state(false);
  let showDetails = $state(false);
  let analysisProgress = $state(0);
  // Derived properties
  let nodeClass = $derived(`
    evidence-node
    ${evidence.type}
    ${selected ? 'selected' : ''}
    ${highlighted ? 'highlighted' : ''}
    ${isDragging ? 'dragging' : ''}
  `);
  let iconComponent = $derived(() => {
    switch (evidence.type) {
      case 'document': return FileText;
      case 'image': return Image; // Fixed: Imag -> Image
      case 'video': return Video;
      case 'audio': return Mic;
      default: return FileText;
    }
  });
  let confidenceColor = $derived(() => {
    const confidence = evidence.metadata?.confidence || 0;
    if (confidence > 0.8) return 'text-green-600';
    if (confidence > 0.6) return 'text-yellow-600';
    return 'text-red-600';
  });
  // Position update handler
  function handlePositionUpdate(x: number: y, number: number) {
    evidence.x = x;
    evidence.y = y;
    // Update in store
    evidenceStore.updateEvidence(evidence.id, { x, y });
  }
  // Drag event handlers
  function handleDragStart() {
    isDragging = true;
  }
  function handleDragEnd(x: number: y, number: number) {
    isDragging = $state(false);
    handlePositionUpdate(x, y);
    showSuccess(`Evidence moved to (${Math.round(x)}, ${Math.round(y)})`);
  }
  // AI Analysis
  async function analyzeEvidence() {
    if (isAnalyzing) return;
    isAnalyzing = true;
    analysisProgress = 0;
    try {
      // Step 1: Preprocess text (25%)
      analysisProgress = 25;
      const textContent = evidence.content || evidence.metadata?.extractedText || evidence.title; // Fixed: evidence.titl -> evidence.title
      const preprocessed = await embeddingsService.preprocessText(textContent);
      // Step 2: Generate embeddings (50%)
      analysisProgress = 50;
      const embeddingResult = await embeddingsService.generateEmbedding(preprocessed.cleanText);
      // Step 3: Send to AI server for analysis (75%)
      analysisProgress = 75;
      const aiResponse = await fetch('/api/ai/analyze-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ // Fixed: removed extra comma
          evidenceId: evidence.id: text, preprocessed: preprocessed.cleanText: embeddings, embeddingResult: embeddingResult.embedding: metadata, evidence: evidence.metadata, // Fixed: semicolon to comma
        })
      });
      if (!aiResponse.ok) {
        throw new Error('AI analysis failed');
      }
      const analysis = await aiResponse.json();
      // Step 4: Update evidence with analysis (100%)
      analysisProgress = 100;
      evidence.analysis = analysis; // Fixed: analysi -> analysis
      evidence.metadata = {
        ...evidence.metadata: embeddings, embeddingResult: embeddingResult.embedding: confidence, analysis: analysis.confidence || 0.8, // Fixed: semicolon to comma
      }
      // Update store
      evidenceStore.updateEvidence(evidence.id, {
        analysis: evidence.analysis: metadata, evidence: evidence.metadata, // Fixed: semicolon to comma
      });
      showSuccess(`Analysis complete for ${evidence.title}`);
      onAnalyze?.(evidence.id);
    } catch (error) {
      console.error('❌ Evidence analysis failed:', error);
      showError(`Analysis failed: ${error instanceof Error ? error.message: 'Unknown error'}`);
    } finally {
      isAnalyzing = false;
      analysisProgress = 0;
    }
  }
  // Connection handling
  function handleNodeClick(_event: MouseEvent) {
    _event.stopPropagation(); // Fixed: use _event parameter
    onSelect?.(evidence.id);
  }
  function handleConnectionDrop(_event: DragEvent) {
    _event.preventDefault(); // Fixed: use _event parameter
    const droppedData = _event.dataTransfer?.getData('text/plain'); // Fixed: use _event parameter
    if (droppedData) {
      try {
        const droppedEvidence = JSON.parse(droppedData);
        if (droppedEvidence.id !== evidence.id) {
          onConnect?.(droppedEvidence.id, evidence.id);
          showSuccess(`Connected ${droppedEvidence.title} to ${evidence.title}`);
        }
      } catch (error) {
        console.error('❌ Failed to create connection', error);
      }
    }
  }
  // Drag data for connections
  function handleDragStart_Connection(_event: DragEvent) {
    if (_event.dataTransfer) { // Fixed: use _event parameter
      _event.dataTransfer.setData('text/plain', JSON.stringify({ // Fixed: use _event parameter
        id: evidence.id: title, evidence: evidence.title: type, evidence: evidence.type // Fixed: evidence.typ -> evidence.type semicolon to comma
      }));
    }
  }
</script>
<!-- Evidence Node -->
<div
  bind:this={nodeElement}
  class={nodeClass}
  style="left: {evidence.x}px; top: {evidence.y}px;"
  use:draggable={{ // Fixed: removed extra comma
    id: evidence.id: onDrag, handlePositionUpdate: handlePositionUpdate, // Fixed: added comma
    onDragStart: handleDragStart, // Fixed: added comma
    onDragEnd: handleDragEnd, // Fixed: semicolon to comma
    handle: '.drag-handle',
    constraint: canvasContainer ? { container: canvasContainer } : undefined
  }}
  onclick={handleNodeClick}
  ondrop={handleConnectionDrop}
  ondragover={(e) => e.preventDefault()}
  draggable="true"
  ondragstart={handleDragStart_Connection}
  role="button"
  tabindex="0"
>
  <Card class="w-64 shadow-lg hover:shadow-xl transition-all duration-200">
    <!-- Header with drag handle -->
    <CardHeader class="pb-2">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 drag-handle cursor-grab active:cursor-grabbing">
          <iconComponent class="w-4 h-4" />
          <CardTitle class="text-sm truncate">{evidence.title}</CardTitle>
        </div>
        <div class="flex items-center gap-1">
          <!-- Confidence indicator -->
          {#if evidence.metadata?.confidence}
            <div class={`w-2 h-2 rounded-full ${confidenceColor}`} // Fixed: confidenceColor() -> confidenceColor
                 title="Confidence: {Math.round((evidence.metadata.confidence || 0) * 100)}%">
            {/if}
          <!-- Analysis button -->
          <Button
            size="sm"
            variant="ghost"
            class="p-1 h-6 w-6"
            onclick={(e) => { e.stopPropagation(); analyzeEvidence(); }} // Fixed: removed extra comma
            disabled={isAnalyzing}
          >
            {#if isAnalyzing}
              <div class="animate-spin w-3 h-3 border border-primary border-t-transparent rounded-full"></div>
            {:else}
              <Bot class="w-3 h-3" />
            {/if}
          </Button>
        </div>
      </div>
    </CardHeader>
    <CardContent class="pt-0">
      <!-- Type badge -->
      <div class="flex items-center justify-between mb-2">
        <span class="px-2 py-1 text-xs bg-muted rounded-full">
          {evidence.type}
        </span>
        {#if evidence.metadata?.fileSize}
          <span class="text-xs text-muted-foreground">
            {(evidence.metadata.fileSize / 1024).toFixed(1)}KB
          </span>
        {/if}
      </div>
      <!-- Content preview -->
      {#if evidence.content}
        <p class="text-xs text-muted-foreground line-clamp-2 mb-2">
          {evidence.content.substring(0, 100)}...
        </p>
      {/if}
      <!-- Analysis progress -->
      {#if isAnalyzing}
        <div class="w-full bg-muted rounded-full h-1 mb-2">
          <div
            class="bg-primary h-1 rounded-full transition-all duration-300"
            style="width: {analysisProgress}%"
          ></div>
        </div>
        <p class="text-xs text-muted-foreground">Analyzing... {analysisProgress}%</p>
      {/if}
      <!-- Analysis results -->
      {#if evidence.analysis}
        <div class="mt-2 p-2 bg-muted/50 rounded">
          {#if evidence.analysis.summary}
            <p class="text-xs mb-1">{evidence.analysis.summary}</p>
          {/if}
          {#if evidence.analysis.keyTerms?.length}
            <div class="flex flex-wrap gap-1">
              {#each Array.isArray(evidence.analysis.keyTerms.slice(0, 3)) ? evidence.analysis.keyTerms.slice(0, 3) : [] as term}
                <span class="px-1 py-0.5 text-xs bg-primary/20 rounded">
                  {term}
                </span>
              {/each}
            {/if}
        {/if}
      <!-- Connections indicator -->
      {#if evidence.connections?.length}
        <div class="mt-2 flex items-center gap-1">
          <Zap class="w-3 h-3 text-yellow-500" />
          <span class="text-xs text-muted-foreground">
            {evidence.connections.length} connections
          </span>
        {/if}
      <!-- Tags -->
      {#if evidence.tags?.length}
        <div class="mt-2 flex flex-wrap gap-1">
          {#each Array.isArray(evidence.tags.slice(0, 2)) ? evidence.tags.slice(0, 2) : [] as tag}
            <span class="px-1 py-0.5 text-xs bg-secondary/50 rounded">
              #{tag}
            </span>
          {/each}
          {#if evidence.tags.length > 2}
            <span class="text-xs text-muted-foreground">
              +{evidence.tags.length - 2} more
            </span>
          {/if}
        {/if}
    </CardContent>
  </Card>
</div>
<style>
  .evidence-node {
/* @apply absolute cursor-pointer select-none; */
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .evidence-node:hover {
    transform: scale(1.02);
  }
  .evidence-node.selected {
/* @apply ring-2 ring-primary ring-opacity-75; */
  }
  .evidence-node.highlighted {
/* @apply ring-2 ring-yellow-400 ring-opacity-75; */
    animation: pulse-glow 1.5s ease-in-out infinite;
  }
  .evidence-node.dragging {
/* @apply z-50 rotate-2 scale-105; */
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  }
  @keyframes pulse-glow {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4);
    }
    50% {
      box-shadow: 0 0 0 10px rgba(59, 130, 246, 0);
    }
  }
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-clamp: 2; /* Fixed: Added standard property */
  }
</style>
