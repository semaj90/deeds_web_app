<script lang="ts">
  import { embeddingsService } from '$lib/services/embeddings-service';
  import { evidenceStore } from '$lib/stores/unified';
  import { toastStore } from '$lib/stores/unified/toast-store';
  import Bot from 'lucide-svelte/icons/bot';
  import FileText from 'lucide-svelte/icons/file-text';
  import ImageIcon from 'lucide-svelte/icons/image';
  import Mic from 'lucide-svelte/icons/mic';
  import Video from 'lucide-svelte/icons/video';
  import Zap from 'lucide-svelte/icons/zap';
  import type { ComponentType } from 'svelte';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

  interface EvidenceNode { id: string;, title: string;
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
    };
    connections?: string[];
    tags?: string[];
    analysis?: {
      summary?: string;
      keyTerms?: string[];
      sentiment?: number;
      importance?: number;
    };
  }

  interface Props {
    evidence: EvidenceNode;
    canvasContainer?: HTMLElement;
    selected?: boolean;
    highlighted?: boolean;
    onSelect?: (id: string) => void;
    onAnalyze?: (id: string) => void;
    onConnect?: (fromId: string, toId: string) => void;
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

  let isDragging = $state(false);
  let isAnalyzing = $state(false);
  let analysisProgress = $state(0);
  let dragStartPos = $state({ x: 0, y: 0 });

  let nodeClass = $derived(
    `evidence-node ${evidence.type} ${selected ? 'selected' : ''} ${highlighted ? 'highlighted' : ''} ${isDragging ? 'dragging' : ''}`
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const iconMap: Record<string, ComponentType<any>> = {
    document: FileText,
    image: ImageIcon,
    video: Video,
    audio: Mic,
    transcript: FileText
  };

  let IconComponent = $derived(iconMap[evidence.type] || FileText);

  let confidenceColor = $derived(() => {
    const confidence = evidence.metadata?.confidence ?? 0;
    if (confidence > 0.8) return 'text-green-600';
    if (confidence > 0.6) return 'text-yellow-600';
    return 'text-red-600';
  });

  function handlePositionUpdate(x: number, y: number) {
    evidence.x = x;
    evidence.y = y;
    // Note: evidenceStore.updateEvidence may not exist - handle gracefully
    if (typeof evidenceStore === 'object' && 'update' in evidenceStore) {
      evidenceStore.update((state) => {
        const items = state.items.map((item) =>
          item.id === evidence.id ? { ...item, x, y } : item
        );
        return { ...state, items };
      });
    }
  }

  function handleDragStart() {
    isDragging = true;
  }

  function handleDragEnd(x: number, y: number) {
    isDragging = false;
    handlePositionUpdate(x, y);
    toastStore.success(`Evidence moved to (${Math.round(x)},
	${Math.round(y)})`);
  }

  async function analyzeEvidence(): Promise<void> {
    if (isAnalyzing) return;
    isAnalyzing = true;
    analysisProgress = 0;

    try {
      analysisProgress = 25;
      const textContent = evidence.content || evidence.metadata?.extractedText || evidence.title;
      const preprocessed = await embeddingsService.preprocessText(textContent);

      analysisProgress = 50;
      const embeddingResult = await embeddingsService.generateEmbedding(preprocessed.cleanText);

      analysisProgress = 75;
      const aiResponse = await fetch('/api/ai/analyze-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
, evidenceId: evidence.id,
          text: preprocessed.cleanText,
          embeddings: embeddingResult.embedding,
          metadata: evidence.metadata
        })
      });

      if (!aiResponse.ok) {
        throw new Error('AI analysis failed');
      }

      const analysis = await aiResponse.json();

      analysisProgress = 100;
      evidence.analysis = analysis;
      evidence.metadata = {
        ...evidence.metadata,
        embeddings: embeddingResult.embedding,
        confidence: analysis.confidence || 0.8
      };

      // Update store if available
      if (typeof evidenceStore === 'object' && 'update' in evidenceStore) {
        evidenceStore.update((state) => {
          const items = state.items.map((item) =>
            item.id === evidence.id
              ? { ...item, analysis: evidence.analysis, metadata: evidence.metadata }
              : item
          );
          return { ...state, items };
        });
      }

      toastStore.success(`Analysis complete for ${evidence.title}`);
      onAnalyze?.(evidence.id);
    } catch (error) {
      console.error('Evidence analysis failed:', error);
      toastStore.error(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      isAnalyzing = false;
      analysisProgress = 0;
    }
  }

  function handleNodeClick(event: MouseEvent) {
    event.stopPropagation();
    onSelect?.(evidence.id);
  }

  function handleConnectionDrop(event: DragEvent) {
    event.preventDefault();
    const droppedData = event.dataTransfer?.getData('text/plain');
    if (droppedData) {
      try {
        const droppedEvidence = JSON.parse(droppedData);
        if (droppedEvidence.id !== evidence.id) {
          onConnect?.(droppedEvidence.id, evidence.id);
          showSuccess(`Connected ${droppedEvidence.title} to ${evidence.title}`);
        }
      } catch (error) {
        console.error('Failed to create connection', error);
      }
    }
  }

  function handleDragStartConnection(event: DragEvent) {
    if (event.dataTransfer) {
      event.dataTransfer.setData(
        'text/plain',
        JSON.stringify({
          id: evidence.id,
          title: evidence.title,
          type: evidence.type
        })
      );
    }
  }
</script>

<div
  class={nodeClass}
  style="left: {evidence.x}px; top: {evidence.y}px;"
  onclick={handleNodeClick}
  ondrop={handleConnectionDrop}
  ondragover={(e) => e.preventDefault()}
  draggable="true"
  ondragstart={handleDragStartConnection}
  role="button"
  tabindex="0"
  onkeydown={(e) => e.key === 'Enter' && onSelect?.(evidence.id)}
  onmousedown={(e) => {
    if ((e.target as HTMLElement).closest('.drag-handle')) {
      handleDragStart();
      dragStartPos = { x: e.clientX - evidence.x, y: e.clientY - evidence.y };
    }
  }}
  onmousemove={(e) => {
    if (isDragging) {
      handlePositionUpdate(e.clientX - dragStartPos.x, e.clientY - dragStartPos.y);
    }
  }}
  onmouseup={() => {
    if (isDragging) {
      handleDragEnd(evidence.x, evidence.y);
    }
  }}
  onmouseleave={() => {
    if (isDragging) {
      handleDragEnd(evidence.x, evidence.y);
    }
  }}
>
  <div class="w-64 bg-white rounded-lg shadow-lg hover:shadow-xl transition-all border">
    <!-- Header with drag handle -->
    <div class="flex items-center justify-between p-3 border-b bg-gray-50">
      <div class="flex items-center gap-2 drag-handle cursor-grab">
        <IconComponent class="w-4 h-4" />
        <span class="text-sm font-medium truncate">{evidence.title}</span>
      </div>

      <div class="flex items-center gap-1">
        {#if evidence.metadata?.confidence}
          <div
            class="w-2 h-2 rounded-full {confidenceColor()}"
            title="Confidence: {Math.round((evidence.metadata.confidence || 0) * 100)}%"
          ></div>
        {/if}
        <button
          class="p-1 h-6 w-6 rounded hover:bg-gray-200 flex items-center justify-center"
          onclick={(e) => {
            e.stopPropagation();
            analyzeEvidence();
          }}
          disabled={isAnalyzing}
          aria-label="Analyze evidence"
        >
          {#if isAnalyzing}
            <div class="animate-spin w-3 h-3 border border-blue-500 border-t-transparent rounded-full"></div>
          {:else}
            <Bot class="w-3 h-3" />
          {/if}
        </button>
      </div>
    </div>

    <div class="p-3 space-y-2">
      <!-- Type badge -->
      <div class="flex items-center justify-between">
        <span class="px-2 py-1 text-xs bg-gray-100 rounded">
          {evidence.type}
        </span>
        {#if evidence.metadata?.fileSize}
          <span class="text-xs text-gray-500">
            {(evidence.metadata.fileSize / 1024).toFixed(1)}KB
          </span>
        {/if}
      </div>

      <!-- Content preview -->
      {#if evidence.content}
        <p class="text-xs text-gray-600 line-clamp-2">
          {evidence.content.substring(0, 100)}...
        </p>
      {/if}

      <!-- Analysis progress -->
      {#if isAnalyzing}
        <div class="space-y-1">
          <div class="w-full bg-gray-200 rounded-full h-1">
            <div
              class="bg-blue-500 h-1 rounded-full transition-all duration-300"
              style="width: {analysisProgress}%"
            ></div>
          </div>
          <p class="text-xs text-gray-500">Analyzing... {analysisProgress}%</p>
        </div>
      {/if}

      <!-- Analysis results -->
      {#if evidence.analysis}
        <div class="p-2 bg-gray-50 rounded text-xs space-y-1">
          {#if evidence.analysis.summary}
            <p class="text-gray-700">{evidence.analysis.summary}</p>
          {/if}
          {#if evidence.analysis.keyTerms?.length}
            <div class="flex flex-wrap gap-1">
              {#each evidence.analysis.keyTerms.slice(0, 3) as term}
                <span class="px-1 py-0.5 bg-blue-100 text-blue-700 rounded">{term}</span>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Connections indicator -->
      {#if evidence.connections?.length}
        <div class="flex items-center gap-1 text-xs text-gray-500">
          <Zap class="w-3 h-3" />
          <span>{evidence.connections.length} connections</span>
        </div>
      {/if}

      <!-- Tags -->
      {#if evidence.tags?.length}
        <div class="flex flex-wrap gap-1">
          {#each evidence.tags.slice(0, 2) as tag}
            <span class="px-1 py-0.5 text-xs bg-gray-200 rounded">#{tag}</span>
          {/each}
          {#if evidence.tags.length > 2}
            <span class="text-xs text-gray-500">+{evidence.tags.length - 2} more</span>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .evidence-node { position: absolute;, cursor: pointer;
    user-select: none;
	transition:transform 0.2s ease, box-shadow 0.2s ease;
  }

  .evidence-node:hover {
    transform: scale(1.02);
  }

  .evidence-node.selected {
    outline: 2px solid rgb(59 130 246);
    outline-offset: 2px;
  }

  .evidence-node.highlighted {
    outline: 2px solid rgb(250 204 21);
    outline-offset: 2px;
	animation: pulse-glow 1.5s ease-in-out infinite;
  }

  .evidence-node.dragging {
    z-index: 50;
	transform: rotate(2deg) scale(1.05);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  }

  @keyframes pulse-glow {
    0%,
    100% {
      box-shadow: 0 0 0 rgba(59, 130, 246, 0.4);
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
    line-clamp: 2;
  }
</style>
