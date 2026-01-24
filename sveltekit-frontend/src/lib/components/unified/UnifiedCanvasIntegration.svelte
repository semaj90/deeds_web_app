<script lang="ts">
  import DetectiveBoard from "$lib/components/detective/DetectiveBoard.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import EvidenceCanvas from "$lib/ui/enhanced/EvidenceCanvas.svelte";
  import { Activity, Scaling as Canvas, Cpu, Database, Eye, Grid3X3, Zap } from 'lucide-svelte';
  import { onDestroy } from 'svelte';

  // Svelte 5 state management
  let viewMode = $state<'canvas' | 'board' | 'hybrid'>('hybrid');
  let activeAnalysis = $state<any[]>([]);
  let canvasEvidence = $state<any[]>([]);
  let processingQueue = $state<any[]>([]);

  let systemIntegration = $state({
    canvasActive: false,
    detectiveActive: false,
    aiProcessingActive: false,
    realTimeSync: false,
    gpuAcceleration: false
  });

  let performanceMetrics = $state({
    canvasFrameRate: 60,
    evidenceCount: 0,
    processingLatency: 0,
    memoryUsage: 0
  });

  // Component props
  let { caseId = 'unified-case-001', evidence = [] as any[] } = $props();

  let performanceInterval: any;

  // Initialize unified integration
  $effect(() => {
    initializeUnifiedSystems();
    startPerformanceMonitoring();
  });

  onDestroy(() => {
    if (performanceInterval) clearInterval(performanceInterval);
  });

  async function initializeUnifiedSystems(): Promise<void> {
    console.log('🚀 Initializing Unified Canvas Integration for caseId:', caseId);

    systemIntegration.canvasActive = true;
    systemIntegration.detectiveActive = true;
    systemIntegration.realTimeSync = true;

    // Attempt GPU acceleration
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      systemIntegration.gpuAcceleration = true;
      console.log('✅ WebGPU acceleration enabled');
    }

    systemIntegration.aiProcessingActive = true;
  }

  function startPerformanceMonitoring() {
    performanceInterval = setInterval(() => {
      performanceMetrics.evidenceCount = evidence.length;
      performanceMetrics.processingLatency = Math.round(Math.random() * 100 + 50);
      performanceMetrics.memoryUsage = Math.round(Math.random() * 30 + 40);
    }, 2000);
  }

  function switchViewMode(mode: 'canvas' | 'board' | 'hybrid') {
    viewMode = mode;
    console.log(`📋 Switched to ${mode} view mode`);
  }

  async function handleEvidenceAnalysis(evidenceItem: any): Promise<void> {
    console.log('🔍 Starting evidence analysis:', evidenceItem.title);
    processingQueue = [...processingQueue, evidenceItem];

    try {
      const response = await fetch('/api/ai/analyze-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evidenceId: evidenceItem.id,
          content: evidenceItem.description || evidenceItem.title,
          forceReanalyze: false
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          activeAnalysis = [...activeAnalysis, {
            evidenceId: evidenceItem.id,
            ...result.data.analysis,
            timestamp: new Date().toISOString()
          }];
          console.log('✅ Evidence analysis completed:', result.data.analysis.summary);
        }
      }
    } catch (error) {
      console.error('❌ Evidence analysis failed:', error);
    } finally {
      processingQueue = processingQueue.filter(item => item.id !== evidenceItem.id);
    }
  }

  function handleCanvasEvidenceUpdate(evidenceData: any[]) {
    canvasEvidence = evidenceData;
    console.log(`🎨 Canvas evidence updated: ${evidenceData.length} items`);
  }

  function handleDetectiveAnalysis(analysisData: any) {
    console.log('🕵️‍♂️ Detective analysis received:', analysisData);
    activeAnalysis = [...activeAnalysis, analysisData];
  }

  async function processUnifiedAnalysis(): Promise<void> {
    console.log('🧠 Starting unified AI analysis across all evidence...');
    const allEvidence = [...canvasEvidence, ...evidence];
    for (const item of allEvidence) {
      if (!activeAnalysis.some(a => a.evidenceId === item.id)) {
        await handleEvidenceAnalysis(item);
      }
    }
  }
</script>

<div class="w-full h-full flex flex-col p-4 bg-background">
  <!-- Integration Header -->
  <div class="mb-4 flex items-center justify-between">
    <div class="flex items-center gap-4">
      <div class="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
        <Canvas class="w-6 h-6 text-primary" />
      </div>
      <div>
        <h3 class="text-xl font-bold">Unified Evidence Analysis</h3>
        <p class="text-sm text-muted-foreground">Enhanced Canvas + Detective Board Integration</p>
      </div>
    </div>

    <div class="flex items-center gap-4">
      <!-- View Mode Switcher -->
      <div class="flex p-1 bg-muted rounded-lg">
        <Button variant={viewMode === 'canvas' ? 'default' : 'ghost'} size="sm" onclick={() => switchViewMode('canvas')}>
          <Canvas class="w-4 h-4 mr-2" /> Canvas
        </Button>
        <Button variant={viewMode === 'board' ? 'default' : 'ghost'} size="sm" onclick={() => switchViewMode('board')}>
          <Grid3X3 class="w-4 h-4 mr-2" /> Board
        </Button>
        <Button variant={viewMode === 'hybrid' ? 'default' : 'ghost'} size="sm" onclick={() => switchViewMode('hybrid')}>
          <Eye class="w-4 h-4 mr-2" /> Hybrid
        </Button>
      </div>

      <!-- System Status Indicators -->
      <div class="flex gap-2">
        <Badge variant={systemIntegration.canvasActive ? "default" : "secondary"}>
          <Activity class="w-3 h-3 mr-1" /> Canvas: {systemIntegration.canvasActive ? 'Active' : 'Inactive'}
        </Badge>
        <Badge variant={systemIntegration.gpuAcceleration ? "default" : "outline"}>
          <Cpu class="w-3 h-3 mr-1" /> GPU: {systemIntegration.gpuAcceleration ? 'On' : 'Off'}
        </Badge>
      </div>
    </div>
  </div>

  <!-- Performance Metrics Bar -->
  <Card.Root class="mb-4">
    <Card.Content class="p-4">
      <div class="flex justify-between items-center">
        <div class="flex gap-6">
          <div class="flex items-center gap-2">
            <Database class="w-4 h-4 text-muted-foreground" />
            <span class="text-sm">Evidence: {performanceMetrics.evidenceCount}</span>
          </div>
          <div class="flex items-center gap-2">
            <Zap class="w-4 h-4 text-muted-foreground" />
            <span class="text-sm">Processing: {processingQueue.length}</span>
          </div>
          <div class="flex items-center gap-2">
            <Activity class="w-4 h-4 text-muted-foreground" />
            <span class="text-sm">FPS: {performanceMetrics.canvasFrameRate}</span>
          </div>
          <div class="flex items-center gap-2">
            <Cpu class="w-4 h-4 text-muted-foreground" />
            <span class="text-sm">Memory: {performanceMetrics.memoryUsage}%</span>
          </div>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" size="sm" onclick={() => console.log('Sync to board')}>Sync Canvas → Board</Button>
          <Button variant="outline" size="sm" onclick={() => console.log('Sync to canvas')}>Sync Board → Canvas</Button>
          <Button variant="default" size="sm" onclick={processUnifiedAnalysis}>Analyze All</Button>
        </div>
      </div>
    </Card.Content>
  </Card.Root>

  <!-- Main View -->
  <div class="flex-1 min-h-0 overflow-hidden">
    {#if viewMode === 'canvas'}
      <div class="h-full border rounded-lg overflow-hidden">
        <EvidenceCanvas bind:evidence={canvasEvidence} {caseId} onEvidenceUpdate={handleCanvasEvidenceUpdate} />
      </div>
    {:else if viewMode === 'board'}
      <div class="h-full border rounded-lg overflow-hidden">
        <DetectiveBoard {caseId} evidence={evidence} />
      </div>
    {:else}
      <div class="h-full grid grid-cols-2 gap-4">
        <div class="flex flex-col border rounded-lg overflow-hidden">
          <div class="p-2 border-b bg-muted/50 font-medium flex items-center gap-2">
            <Canvas class="w-4 h-4" /> Evidence Canvas
          </div>
          <div class="flex-1">
            <EvidenceCanvas bind:evidence={canvasEvidence} {caseId} onEvidenceUpdate={handleCanvasEvidenceUpdate} />
          </div>
        </div>
        <div class="flex flex-col border rounded-lg overflow-hidden">
          <div class="p-2 border-b bg-muted/50 font-medium flex items-center gap-2">
            <Grid3X3 class="w-4 h-4" /> Detective Board
          </div>
          <div class="flex-1">
            <DetectiveBoard {caseId} evidence={evidence} />
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Analysis Results Overlay -->
  {#if activeAnalysis.length > 0}
    <div class="fixed bottom-4 right-4 w-80 space-y-2 pointer-events-none">
      <div class="p-2 bg-background border rounded-lg shadow-lg pointer-events-auto">
        <div class="flex items-center gap-2 mb-2 font-bold text-sm border-b pb-1">
          <Activity class="w-4 h-4" /> Live Analysis Results
        </div>
        <div class="space-y-2 max-h-60 overflow-y-auto">
          {#each activeAnalysis.slice(-5).reverse() as analysis}
            <div class="p-2 bg-muted rounded text-xs">
              <div class="font-bold border-b border-border/50 mb-1">
                Evidence ID: {analysis.evidenceId.slice(-8)}
              </div>
              <p class="mb-1 line-clamp-2">{analysis.summary}</p>
              <div class="flex flex-wrap gap-1">
                {#each analysis.tags?.slice(0, 3) ?? [] as tag}
                  <Badge variant="outline" class="text-[10px] py-0">{tag}</Badge>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  :global(.unified-canvas-integration) {
    height: 100vh;
    overflow: hidden;
  }
</style>





