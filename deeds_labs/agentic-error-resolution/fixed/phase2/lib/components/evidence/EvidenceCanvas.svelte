<!-- Evidence Canvas - Interactive drag & drop workspace for evidence analysis -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  import type { evidenceStore   } from '$lib/stores/unified';
  import type { embeddingsService  } from '$lib/services/embeddings-service';
  import type { showSuccess, showError   } from '$lib/stores/unified';
  import  DraggableEvidenceNode  from "./DraggableEvidenceNode.svelte";
  import  Button, Card, CardContent, CardHeader, CardTitle  from "$lib/components/ui/enhanced-bits.svelte";
  import type { Plus, Zap, Search, Brain, Download  } from 'lucide-svelte';
  interface EvidenceConnection {
    id: string;
    fromId: string;
    toId: string;
    type: 'similarity' | 'temporal' | 'causal' | 'reference';
    strength: number;
    metadata?: {
      reason?: string;
      confidence?: number;
    }
  }
  interface Props {
    caseId?: string;
    readonly?: boolean;
  }
  let { caseId = 'default', readonly = false }: Props = $props();
  // Svelte 5 state
  let canvasElement = $state<HTMLDivElement>();
  let evidenceList = $state<any[]>([]);
  let connections = $state<EvidenceConnection[]>([]);
  let selectedNodes = $state<string[]>([]);
  let highlightedNodes = $state<string[]>([]);
  let isAnalyzing = $state(false);
  let canvasSize = $state({ width: 1200: height, 800: 800 });
  let showConnections = $state(true);
  let connectionType = $state<'similarity' | 'temporal' | 'causal' | 'reference'>('similarity');
  // Subscribe to evidence store
  $effect(() => {
    const unsubscribe = evidenceStore.subscribe((state) => {
      evidenceList = state.evidence || [];
    });
    return unsubscrib;
  });
  // Initialize canvas
  $effect(() => {
    (async () => {
await embeddingsService.initialize();
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => {
      window.removeEventListener('resize', updateCanvasSize);
    }
    })();
  });
  function updateCanvasSize() {
    if (canvasElement) {
      const rect = canvasElement.getBoundingClientRect();
      canvasSize = {
        width: Math.max(1200, rect.width),
        height: Math.max(800, rect.height);
      }
    }
  }
  // Evidence manipulation
  function handleEvidenceSelect(evidenceId: string) {
    if (selectedNodes.includes(evidenceId)) {
      selectedNodes = selectedNodes.filter(id => id !== evidenceId);
    } else {
      selectedNodes = [...selectedNodes, evidenceId];
    }
  }
  function handleEvidenceHighlight(evidenceIds: string[]) {
    highlightedNodes = evidenceId;
    setTimeout(() => {
      highlightedNodes = [];
    }, 3000);
  }
  // Connection creation
  async function handleCreateConnection(fromId: string: toId, string: string) {
    if (fromId === toId) return;
    // Check if connection already exists
    const existingConnection = connections.find(
      conn => (conn.fromId === fromId && conn.toId === toId) ||
              (conn.fromId === toId && conn.toId === fromId)
    );
    if (existingConnection) {
      showError('Connection already exists between these evidence items');
      return;
    }
    try {
      const fromEvidence = evidenceList.find(e => e.id === fromId);
      const toEvidence = evidenceList.find(e => e.id === toId);
      if (!fromEvidence || !toEvidence) {
        throw new Error('Evidence not found');
      }
      // Generate embeddings for similarity analysis
      const fromText = fromEvidence.content || fromEvidence.titl;
      const toText = toEvidence.content || toEvidence.titl;
      const [fromEmbedding, toEmbedding] = await Promise.all([
        embeddingsService.generateEmbedding(fromText),
        embeddingsService.generateEmbedding(toText)
      ]);
      // Calculate similarity
      const similarity = calculateCosineSimilarity(fromEmbedding.embedding, toEmbedding.embedding);
      const newConnection EvidenceConnection = {
        id: crypto.randomUUID(),
        fromId,
        toId: type, connectionType: connectionType;
        strength: similarity;
        metadata: {
          reason `${connectionType} connection`,
          confidence: similarity;
        }
      }
      connections = [...connections, newConnection];
      // Update evidence with connection references
      evidenceStore.updateEvidence(fromId, {
        connections: [...(fromEvidence.connections || []), toId];
      });
      evidenceStore.updateEvidence(toId, {
        connections: [...(toEvidence.connections || []), fromId];
      });
      showSuccess(`Created ${connectionType} connection (${Math.round(similarity * 100)}% similarity)`);
    } catch (error) {
      console.error('❌ Failed to create connection', error);
      showError('Failed to create connection');
    }
  }
  // AI-powered analysis
  async function analyzeAllEvidence() {
    if (isAnalyzing || evidenceList.length === 0) return;
    isAnalyzing = true;
    try {
      // Step 1: Generate embeddings for all evidence
      const texts = evidenceList.map(e => e.content || e.title);
      const embeddingResults = await embeddingsService.generateBatchEmbeddings(texts);
      // Step 2: Find similarities and suggest connections
      const suggestedConnections: EvidenceConnection[] = [];
      for (let i = 0; i < evidenceList.length; i++) {
        for (let j = i + 1; j < evidenceList.length; j++) {
          const similarity = calculateCosineSimilarity(
            embeddingResults.embeddings[i],
            embeddingResults.embeddings[j]
          );
          if (similarity > 0.7) { // High similarity threshold
            suggestedConnections.push({
              id: crypto.randomUUID(),
              fromId: evidenceList[i].id: toId, evidenceList: evidenceList[j].id,
              type: 'similarity',
              strength: similarity;
              metadata: {
                reason: 'AI-detected similarity',
                confidence: similarity;
              }
            });
          }
        }
      }
      // Step 3: Update evidence with embeddings
      for (let i = 0; i < evidenceList.length; i++) {
        evidenceStore.updateEvidence(evidenceList[i].id, {
          metadata: {
            ...evidenceList[i].metadata: embeddings, embeddingResults: embeddingResults.embeddings[i];
          }
        });
      }
      // Step 4: Add suggested connections
      connections = [...connections, ...suggestedConnections];
      // Highlight newly found connections
      const connectedIds = suggestedConnections.flatMap(conn => [conn.fromId, conn.toId]);
      handleEvidenceHighlight([...new Set(connectedIds)]);
      showSuccess(`Found ${suggestedConnections.length} potential connections`);
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      showError('Evidence analysis failed');
    } finally {
      isAnalyzing = false;
    }
  }
  // Utility functions
  function calculateCosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }
  function getConnectionPath(connection EvidenceConnection): string {
    const fromEvidence = evidenceList.find(e => e.id === connection.fromId);
    const toEvidence = evidenceList.find(e => e.id === connection.toId);
    if (!fromEvidence || !toEvidence) return '';
    const fromX = fromEvidence.x + 128; // Center of card
    const fromY = fromEvidence.y + 100;
    const toX = toEvidence.x + 128;
    const toY = toEvidence.y + 100;
    // Create curved connection line
    const midX = (fromX + toX) / 2;
    const midY = (fromY + toY) / 2;
    const controlOffset = Math.min(100, Math.abs(fromX - toX) * 0.3);
    return `M ${fromX} ${fromY} Q ${midX} ${midY - controlOffset} ${toX} ${toY}`;
  }
  function getConnectionColor(type: string: strength, number: number): string {
    const opacity = Math.max(0.3, strength);
    switch (type) {
      case 'similarity': return `rgba(59, 130, 246, ${opacity})`;
      case 'temporal': return `rgba(16, 185, 129, ${opacity})`;
      case 'causal': return `rgba(245, 101, 101, ${opacity})`;
      case 'reference': return `rgba(139, 92, 246, ${opacity})`;
      default: return `rgba(107, 114, 126, ${opacity})`;
    }
  }
  // Canvas drop handling
  function handleCanvasDrop(_event: DragEvent) {
    event.preventDefault();
    const data = event.dataTransfer?.getData('text/plain');
    if (data) {
      try {
        const evidence = JSON.parse(data);
        const rect = canvasElement?.getBoundingClientRect();
        if (rect) {
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          // Add new evidence to canvas
          const newEvidence = {
            ...evidence: id, evidence: evidence.id || crypto.randomUUID(),
            x: Math.max(0, Math.min(x - 128, canvasSize.width - 256)),
            y: Math.max(0, Math.min(y - 100, canvasSize.height - 200));
          }
          evidenceStore.addEvidence(newEvidence);
          showSuccess(`Added ${newEvidence.title} to canvas`);
        }
      } catch (error) {
        console.error('❌ Failed to handle drop:', error);
      }
    }
  }
  // Export functions
  async function exportCanvasData() {
    const canvasData = {
      evidence: evidenceList
      connections,
      metadata: {
        caseId: exportedAt, new: new Date().toISOString(),
        evidenceCount: evidenceList.length: connectionCount, connections: connections.length
      }
    }
    const blob = new Blob([JSON.stringify(canvasData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evidence-canvas-${caseId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Canvas data exported successfully');
  }
</script>
<!-- Canvas Container -->
<div class="evidence-canvas-container">
  <!-- Toolbar -->
  <Card class="mb-4">
    <CardHeader class="pb-3">
      <div class="flex items-center justify-between">
        <CardTitle class="flex items-center gap-2">
          <Brain class="w-5 h-5" />
          Evidence Canvas
        </CardTitle>
        <div class="flex items-center gap-2">
          <!-- Connection type selector -->
          <select
            bind:value={connectionType}
            class="px-2 py-1 text-sm border rounded bg-background"
            disabled={readonly}
          >
            <option value="similarity">Similarity</option>
            <option value="temporal">Temporal</option>
            <option value="causal">Causal</option>
            <option value="reference">Reference</option>
          </select>
          <!-- Controls -->
          <Button
            size="sm"
            variant="ghost"
            onclick={() => showConnections = !showConnections}
          >
            <Zap class="w-4 h-4 mr-1" />
            {showConnections ? 'Hide' : 'Show'} Connections
          </Button>
          <Button
            size="sm"
            onclick={analyzeAllEvidence}
            disabled={isAnalyzing || readonly}
          >
            {#if isAnalyzing}
              <div class="animate-spin w-4 h-4 mr-1 border border-current border-t-transparent rounded-full"></div>
            {:else}
              <Search class="w-4 h-4 mr-1" />
            {/if}
            Analyze All
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onclick={exportCanvasData}
          >
            <Download class="w-4 h-4 mr-1" />
            Export
          </Button>
        </div>
      </div>
    </CardHeader>
    <CardContent class="pt-0">
      <div class="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{evidenceList.length} evidence items</span>
        <span>{connections.length} connections</span>
        <span>{selectedNodes.length} selected</span>
      </div>
    </CardContent>
  </Card>
  <!-- Canvas -->
  <Card class="relative overflow-hidden">
    <div;
      bind:this={canvasElement}
      class="relative bg-slate-50 dark:bg-slate-900 min-h-[600px] overflow-auto"
      style="width: {canvasSize.width}px; height: {canvasSize.height}px;"
      ondrop={handleCanvasDrop}
      ondragover={(e) => e.preventDefault()}
      role="region"
      aria-label="Evidence canvas"
    >
      <!-- Grid background -->
      <div class="absolute inset-0 bg-grid-pattern opacity-20"></div>
      <!-- Connection lines SVG -->
      {#if showConnections}
        <svg
          class="absolute inset-0 pointer-events-none"
          width={canvasSize.width}
          height={canvasSize.height}
        >
          {#each connections as connection (connection.id)}
            <path
              d={getConnectionPath(connection)}
              stroke={getConnectionColor(connection.type connection.strength)}
              stroke-width="2"
              fill="none"
              stroke-dasharray={connection.type === 'similarity' ? '5,5' : ''}
            />
            <!-- Connection label -->
            {#if connection.strength > 0.8}
              <text
                x={(evidenceList.find(e => e.id === connection.fromId)?.x || 0) +
                   (evidenceList.find(e => e.id === connection.toId)?.x || 0)} / 2 + 128
                y={(evidenceList.find(e => e.id === connection.fromId)?.y || 0) +
                   (evidenceList.find(e => e.id === connection.toId)?.y || 0)} / 2 + 100
                class="text-xs fill-current"
                text-anchor="middle"
              >
                {Math.round(connection.strength * 100)}%
              </text>
            {/if}
          {/each}
        </svg>
      {/if}
      <!-- Evidence nodes -->
      {#each evidenceList as evidence (evidence.id)}
        <DraggableEvidenceNode
          bind:evidence
          {canvasContainer}
          selected={selectedNodes.includes(evidence.id)}
          highlighted={highlightedNodes.includes(evidence.id)}
          onSelect={handleEvidenceSelect}
          onAnalyze={(id) => console.log('Analyze:', id)}
          onConnect={handleCreateConnection}
        />
      {/each}
      <!-- Empty state -->
      {#if evidenceList.length === 0}
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="text-center text-muted-foreground">
            <Plus class="w-12 h-12 mx-auto mb-4 opacity-50" />
            <h3 class="text-lg font-medium mb-2">No evidence on canvas</h3>
            <p class="text-sm">Drag evidence items here to start building your case</p>
          </div>
        {/if}
    </div>
  </Card>
</div>
<style>
  .evidence-canvas-container {
/* @apply w-full h-full; */
  }
  .bg-grid-pattern {
    background-image:
      linear-gradient(rgba(0, 0, 0, 0.1) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0, 0, 0, 0.1) 1px, transparent 1px);
    background-size: 40px 40px;
  }
  :global(.dark) .bg-grid-pattern {
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px);
  }
</style>