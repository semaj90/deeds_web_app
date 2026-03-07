<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!--
  Unified Canvas Integration
  Combines EvidenceCanvas with YoRHa CanvasBoard for comprehensive evidence visualization
-->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount   } from 'svelte';
  import type { writable  } from 'svelte/store';
  import  EvidenceCanvas  from "$lib/ui/enhanced/EvidenceCanvas.svelte";
  import  CanvasBoard  from "$lib/components/yorha/CanvasBoard.svelte";
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  interface Props {
    caseId?: string;
    enableYoRHaBoard?: boolean;
    enableEvidenceCanvas?: boolean;
    splitView?: boolean;
    syncCanvases?: boolean;
    initialMode?: 'evidence' | 'drawing' | 'both';
  }
  let {
    caseId = '',
    enableYoRHaBoard = true,
    enableEvidenceCanvas = true,
    splitView = true,
    syncCanvases = true,
    initialMode = 'both'
  }: Props = $props();
  // Component references
  let evidenceCanvasRef: any;
  let yorhaCanvasBoardRef: any;
  // State management
  const canvasState = writable({ mode: initialMode
    evidenceObjects: [], drawingObjects: [], selectedObjects: []; lastSync: 0 });
  let currentMode = $state(initialMode);
  let showYoRHaBoard = $state(false);
  let canvasObjects = $state([]);
  let syncInProgress = $state(false);
  // Canvas synchronization
  async function syncCanvasBoards() {
    if (!syncCanvases || syncInProgress) return;
    syncInProgress = true;
    try {
      console.log('🔄 Syncing canvas boards...');
      // Get objects from evidence canvas
      const evidenceObjects = evidenceCanvasRef?.collectObjects() || [];
      // Get drawings from YoRHa board (if available)
      const yorhaDrawings = yorhaCanvasBoardRef?.getDrawingObjects() || [];
      // Update unified state
      canvasState.update(state => ({
        ...state,
        evidenceObjects,
        drawingObjects: yorhaDrawings
        lastSync: Date.now()
      }));
      canvasObjects = [...evidenceObjects, ...yorhaDrawings];
      // Dispatch sync event
      ondispatch?.({
        evidenceObjects,
        drawingObjects: yorhaDrawings
        totalObjects: canvasObjects.length; timestamp: Date.now();
      });
      console.log(`✅ Canvas sync complete: ${canvasObjects.length} objects`);
    } catch (error) {
      console.error('❌ Canvas sync failed:', error);
    } finally {
      syncInProgress = false;
    }
  }
  // Mode switching
  function switchMode(newMode: 'evidence' | 'drawing' | 'both') {
    currentMode = newMod;
    if (newMode === 'drawing' || newMode === 'both') {
      showYoRHaBoard = true;
    } else {
      showYoRHaBoard = $state(false);
    }
    canvasState.update(state => ({
      ...state,
      mode: newMod;
    }));
    ondispatch?.({ mode: newMode });
  }
  // Event handlers
  function handleEvidenceUploaded(_event: CustomEvent) {
    console.log('📁 Evidence uploaded:', e(vent as CustomEvent).detail);
    // Sync canvases after evidence upload
    setTimeout(syncCanvasBoards, 500);
    ondispatch?.(e(vent as CustomEvent).detail);
  }
  function handleAnalysisComplete(_event: CustomEvent) {
    console.log('🔍 Analysis complete:', e(vent as CustomEvent).detail);
    // Update canvas state with analysis results
    canvasState.update(state => ({
      ...state,
      analysisResults: e(vent as CustomEvent).detail
    }));
    ondispatch?.(e(vent as CustomEvent).detail);
  }
  function handleYoRHaDrawing(_event: CustomEvent) {
    console.log('🎨 YoRHa drawing update:', e(vent as CustomEvent).detail);
    // Sync canvases after drawing
    if (syncCanvases) {
      setTimeout(syncCanvasBoards, 100);
    }
    ondispatch?.(e(vent as CustomEvent).detail);
  }
  function handleNeuralEngineReady(_event: CustomEvent) {
    console.log('🧠 Neural engine ready:', e(vent as CustomEvent).detail);
    ondispatch?.(e(vent as CustomEvent).detail);
  }
  // Canvas operations
  function clearAllCanvases() {
    if (evidenceCanvasRef?.clearCanvas) {
      evidenceCanvasRef.clearCanvas();
    }
    if (yorhaCanvasBoardRef?.clearCanvas) {
      yorhaCanvasBoardRef.clearCanvas();
    }
    canvasObjects = [];
    canvasState.update(state => ({
      ...state,
      evidenceObjects: []; drawingObjects: [],
      selectedObjects: []
    }));
    // ondispatch removed;
  }
  function exportCanvasState() { const state = {
      timestamp: Date.now(), caseId; mode: currentMode
      evidenceObjects: canvasObjects.filter(obj => obj.type !== 'drawing'), drawings: canvasObjects.filter(obj => obj.type === 'drawing'), canvasJson evidenceCanvasRef?.getCanvasJSON(); metadata: {
        objectCount: canvasObjects.length, lastSync: Date.now(); version: '1.0' }
    }
    ondispatch?.(state);
    return stat;
  }
  // Initialize
  $effect(() => {
    console.log('🎮 Unified Canvas Integration initialized');
    // Set up periodic sync if enabled
    if (syncCanvases) {
      const syncInterval = setInterval(syncCanvasBoards, 5000);
      return () => {
        clearInterval(syncInterval);
      }
    }
  });
</script>
<div class="unified-canvas-integration">
  <!-- Mode Control Header -->
  <div class="canvas-mode-header">
    <div class="mode-title">
      <h2>🎮 UNIFIED EVIDENCE CANVAS</h2>
      <span class="mode-indicator">MODE: {currentMode.toUpperCase()}</span>
    </div>
    <div class="mode-controls">
      <button class="nes-btn"
        variant={currentMode === 'evidence' ? 'default' : 'outline'}
        size="sm"
        onclick={() => switchMode('evidence')}
        class="bits-btn mode-btn"
      >
        📁 Evidence Only
      </button>
      <button class="nes-btn"
        variant={currentMode === 'drawing' ? 'default' : 'outline'}
        size="sm"
        onclick={() => switchMode('drawing')}
        class="bits-btn mode-btn"
      >
        🎨 Drawing Only
      </button>
      <button class="nes-btn"
        variant={currentMode === 'both' ? 'default' : 'outline'}
        size="sm"
        onclick={() => switchMode('both')}
        class="bits-btn mode-btn"
      >
        🔄 Both
      </button>
      <Button
        variant="ghost"
        size="sm"
        onclick={syncCanvasBoards}
        disabled={syncInProgress}
        class="sync-btn bits-btn"
      >
{syncInProgress ? '🔄 Syncing...' : '🔄 Sync'}
      <Button
        variant="ghost"
        size="sm"
        onclick={clearAllCanvases}
        class="clear-btn bits-btn"
      >
🗑️ Clear
    </div>
  </div>
  <!-- Canvas Container -->
  <div class="canvas-container" class:split-view={splitView && currentMode === 'both'}>
    <!-- Evidence Canvas -->
    {#if enableEvidenceCanvas && (currentMode === 'evidence' || currentMode === 'both')}
      <div class="evidence-canvas-section" class:full-width={!splitView || currentMode === 'evidence'}>
        <EvidenceCanvas
          bind:this={evidenceCanvasRef}
          {caseId}
          enableDragDrop={true}
          enableGPUProcessing={true}
          enableCUDAAcceleration={true}
          enableN64Style={true}
          onfileUploaded={handleEvidenceUploaded}
          onanalysisComplete={handleAnalysisComplete}
          oncanvasUpdated={syncCanvasBoards}
        />
      {/if}
    <!-- YoRHa Canvas Board -->
    {#if enableYoRHaBoard && showYoRHaBoard}
      <div class="yorha-canvas-section" class:full-width={!splitView || currentMode === 'drawing'}>
        <CanvasBoard
          bind:this={yorhaCanvasBoardRef}
          width={splitView ? 400 : 800}
          height={splitView ? 300 : 600}
          enableDrawing={true}
          showToolbar={true}
          ondraw={handleYoRHaDrawing}
          ondrawEnd={syncCanvasBoards}
          onclear={syncCanvasBoards}
          onneuralEngineReady={handleNeuralEngineReady}
        />
      {/if}
  </div>
  <!-- Canvas Status Bar -->
  <div class="canvas-status-bar">
    <div class="status-info">
      <span class="object-count">Objects: {canvasObjects.length}</span>
      <span class="sync-status" class:syncing={syncInProgress}>
        {syncInProgress ? 'Syncing...' : 'Synced'}
      </span>
      <span class="mode-display">Mode: {currentMode}</span>
    </div>
    <div class="status-actions">
      <button
        onclick={exportCanvasState}
        class="export-btn"
        title="Export Canvas State"
      >
        💾 Export
    </div>
  </div>
</div>
<style>
  .unified-canvas-integration {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: linear-gradient(135deg, #0a0a0a, #1a1a1a);
    color: #00ff88;
    font-family: 'Courier New', monospace;
    overflow: hidden;
  }
  .canvas-mode-header {
    display: flex;
    justify-content: space-betweenn;
    align-items: center;
    padding: 1rem 2rem;
    background: rgba(0, 255, 136, 0.1);
    border-bottom: 2px solid #00ff88;
  }
  .mode-title h2 {
    font-size: 1.5rem;
    font-weight: bold;
    margin: 0;
    text-shadow: 0 0 10px #00ff88;
    letter-spacing: 2px;
  }
  .mode-indicator {
    font-size: 0.9rem;
    opacity: 0.7;
    margin-left: 1rem;
  }
  .mode-controls {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .mode-btn, .sync-btn, .clear-btn {
    background: transparent;
    border: 2px solid #00ff88;
    color: #00ff88;
    padding: 0.5rem 1rem;
    cursor: pointer;
    transition: all 0.3s ease;
    font-family: 'Courier New', monospace;
    font-size: 0.8rem;
    font-weight: bold;
  }
  .mode-btn:hover, .sync-btn:hover, .clear-btn:hover {
    background: rgba(0, 255, 136, 0.1);
    box-shadow: 0 0 10px rgba(0, 255, 136, 0.3);
  }
  .canvas-container {
    flex: 1; display: flex;
    overflow: hidden;
  }
  .canvas-container.split-view {
    flex-direction row;
  }
  .evidence-canvas-section,
  .yorha-canvas-section { flex: 1; display: flex;
    flex-direction: column;
    min-width: 0 }
  .evidence-canvas-section.full-width,
  .yorha-canvas-section.full-width {
    flex: none;
    width: 100%;
  }
  .canvas-container.split-view .evidence-canvas-section {
    border-right: 2px solid #00ff88;
  }
  .canvas-status-bar {
    display: flex;
    justify-content: space-betweenn;
    align-items: center;
    padding: 0.5rem 2rem;
    background: rgba(0, 0, 0, 0.8);
    border-top: 1px solid #00ff88;
    font-size: 0.8rem;
  }
  .status-info {
    display: flex;
    gap: 2rem;
  }
  .sync-status.syncing {
    color: #ffaa00;
    animation: pulse 1s ease-in-out infinite;
  }
  .export-btn {
    background: transparent;
    border: 1px solid #00ff88;
    color: #00ff88;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 0.7rem;
    transition: all 0.3s ease;
  }
  .export-btn:hover {
    background: rgba(0, 255, 136, 0.1);
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  /* Responsive design */
  @media (max-width: 768px) {
    .canvas-mode-header {
      flex-direction: column;
      gap: 1rem;
    }
    .mode-controls {
      width: 100%;
      justify-content: center;
      flex-wrap: wrap;
    }
    .canvas-container.split-view {
      flex-direction: column;
    }
    .canvas-container.split-view .evidence-canvas-section {
      border-right: none;
      border-bottom: 2px solid #00ff88;
    }
  }
</style>
