<script lang="ts">
  import DocumentDetails from "$lib/components/legal/DocumentDetails.svelte";
  import { legalDB, type GraphVisualizationData } from '$lib/db/client-db';
  import { DimensionalTensorStore } from '$lib/webgpu/dimensional-tensor-store';
  import { WebGPULegalDocumentGraph } from '$lib/webgpu/legal-document-graph';
// Migrated to $effect
  import { derived, writable } from 'svelte/store';

  // ============================================================================
  // COMPONENT PROPS
  // ============================================================================
  let {
    graphId = 'legal-network-main',
    width = 800,
    height = 600,
    enablePhysics = true,
    enableStreaming = true,
    maxNodes = 10000,
    class: className = ''
  } = $props<{
    graphId?: string,
    width?: number,
    height?: number,
    enablePhysics?: boolean,
    enableStreaming?: boolean,
    maxNodes?: number,
    class?: string
  }>();

  // ============================================================================
  // REACTIVE STORES
  // ============================================================================
  const isInitialized = writable(false);
  const isLoading = writable(false);
  const error = writable<string | null>(null);
  const performanceStats = writable({ fps: 0, frameTime: 0, nodeCount: 0, edgeCount: 0, gpuMemoryUsage: 0 });
  const renderState = writable({
    selectedNode: null as string | null,
    highlightedNodes: new Set<string>(),
    filterType: 'all' as 'all' | 'document' | 'case' | 'entity' | 'precedent',
    cameraPosition: [0, 0, 10] as [number, number, number],
    zoom: 1.0,
    autoRotate: false
  });

  // Document details interaction state
  const documentDetailsState = writable({
    isVisible: false,
    selectedDocumentId: null as string | null,
    nodeInteractionTime: 0,
    cacheHitRate: 0
  });

  // Derived stores
  const canInteract = derived(
    [isInitialized, isLoading, error],
    ([$isInitialized, $isLoading, $error]) => $isInitialized && !$isLoading && !$error
  );

  // ============================================================================
  // WEBGPU & CANVAS MANAGEMENT
  // ============================================================================
  let canvas = $state<HTMLCanvasElement | null>(null);
  let graphEngine: WebGPULegalDocumentGraph | null = null;
  let tensorStore = $state<DimensionalTensorStore | null >(null);
  let animationFrame = $state<number | null >(null);
  let resizeObserver = $state<ResizeObserver | null >(null);

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  $effect(() => {
    (async () => {
      try {
        if (typeof window !== 'undefined' && canvas) {
            await initializeWebGPU();
            await loadGraphData();
            startRenderLoop();
            setupEventListeners();
            isInitialized.set(true);
        }
      } catch (err) {
        console.error('[Graph Viewer] Initialization failed:', err);
        error.set(err instanceof Error ? err.message : 'Unknown error occurred');
      }
    })();
  });

  // TODO: Add as cleanup in $effect: return () => { cleanup() }

  /**
   * Initialize WebGPU graph engine and tensor store
   */
  async function initializeWebGPU(): Promise<void> {
    if (!canvas) { throw new Error('Canvas element not found'); }

    // Resize canvas to match container
    canvas.width = width;
    canvas.height = height;

    // Check WebGPU support
    if (!navigator.gpu) { throw new Error('WebGPU not supported. Please use Chrome Canary or Firefox Nightly.'); }

    // Initialize graph engine
    graphEngine = new WebGPULegalDocumentGraph(canvas, {
        maxNodes,
        maxEdges: maxNodes * 5,
        canvasWidth: width,
        canvasHeight: height,
        enablePhysics,
        renderDistance: 1000,
        lodLevels: 4
    });
    await graphEngine.initialize();

    // Initialize tensor store for advanced memory management
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No WebGPU adapter found');
    const device = await adapter.requestDevice();

    tensorStore = new DimensionalTensorStore(device, {
        documents: maxNodes,
        chunks: 100,
        representations: 8,
        maxLOD: 4
    },
	{
        maxGPUMemory: 256 * 1024 * 1024, // 256MB
        streamingDistance: 100,
        preloadRadius: 50,
        evictionStrategy: 'hybrid'
    });
    console.log('[Graph Viewer] WebGPU initialized successfully');
  }

  /**
   * Load graph data from IndexedDB
   */
  async function loadGraphData(): Promise<void> {
    isLoading.set(true);
    try {
      // Load from database
      await graphEngine?.loadGraphFromDB(graphId);
      // Update performance stats
      if (graphEngine) {
        const stats = graphEngine.getPerformanceStats();
        performanceStats.set(stats);
      }
      console.log(`[Graph Viewer] Loaded graph ${ graphId }`);
    } catch (err) {
      console.error('[Graph Viewer] Failed to load graph data:', err);
      throw new Error('Failed to load graph data from database');
    } finally {
      isLoading.set(false);
    }
  }

  /**
   * Start the render loop
   */
  function startRenderLoop(): void {
    if (!graphEngine) return;

    const updatePerformance = () => {
      if (graphEngine) {
        performanceStats.set(graphEngine.getPerformanceStats());
      }
    }

    // Update performance stats every second
    const perfInterval = setInterval(updatePerformance, 1000);

    // Start WebGPU render loop
    graphEngine.startRenderLoop();

    // Cleanup function
    const cleanup = () => {
        clearInterval(perfInterval);
        if (animationFrame) { cancelAnimationFrame(animationFrame); }
    }
    // Store cleanup reference
    // This is handled in onDestroy at component level, but we need to track interval if we want to clear it
  }

  /**
   * Setup event listeners for interaction
   */
  function setupEventListeners(): void {
    if (!canvas) return;
    let isDragging = false;
    let lastMousePos = { x: 0, y: 0 };

    // Mouse events
    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        lastMousePos = { x: e.clientX, y: e.clientY };
        if(canvas) canvas.style.cursor = 'grabbing';
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const deltaX = e.clientX - lastMousePos.x;
        const deltaY = e.clientY - lastMousePos.y;
        // Update camera position
        renderState.update(state => ({
            ...state,
            cameraPosition: [
                state.cameraPosition[0] - deltaX * 0.01,
                state.cameraPosition[1] + deltaY * 0.01,
                state.cameraPosition[2]
            ]
        }));
        lastMousePos = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('mouseup', (e) => {
        if (isDragging) {
            isDragging = false;
            if(canvas) canvas.style.cursor = 'grab';
        } else {
            // Handle node click when not dragging
            handleNodeClick(e);
        }
    });

    // Wheel events for zoom
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomSpeed = 0.1;
        const delta = e.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;
        renderState.update(state => ({ ...state, zoom: Math.max(0.1, Math.min(10, state.zoom * delta)) }));
    });

    // Touch events for mobile
    let touchStart = { x: 0, y: 0 };
    canvas.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        touchStart = { x: touch.clientX, y: touch.clientY };
    });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const deltaX = touch.clientX - touchStart.x;
        const deltaY = touch.clientY - touchStart.y;
        renderState.update(state => ({
            ...state,
            cameraPosition: [
                state.cameraPosition[0] - deltaX * 0.005,
                state.cameraPosition[1] + deltaY * 0.005,
                state.cameraPosition[2]
            ]
        }));
        touchStart = { x: touch.clientX, y: touch.clientY };
    });

    // Resize observer
    resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
            const { width: newWidth, height: newHeight } = entry.contentRect;
            if (canvas && graphEngine) {
                canvas.width = newWidth;
                canvas.height = newHeight;
                // Update engine configuration
                graphEngine.config.canvasWidth = newWidth;
                graphEngine.config.canvasHeight = newHeight;
            }
        }
    });
    if(canvas.parentElement) resizeObserver.observe(canvas.parentElement);
  }

  // ============================================================================
  // NODE INTERACTION HANDLERS
  // ============================================================================

  /**
   * Handle node clicks - The Hybrid Cache-First Strategy Implementation
   * This is the core of our "Fast Path / Slow Path" architecture
   */
  async function handleNodeClick(event: MouseEvent): Promise<void> {
    if (!graphEngine || !$canInteract || !canvas) return;
    const clickStartTime = performance.now();

    // 1. Convert mouse coordinates to WebGL/WebGPU coordinates
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = (1 - (event.clientY - rect.top) / rect.height) * 2 - 1;

    // 2. Ray casting to find clicked node (simplified for demonstration)
    const clickedNodeId = await findNodeAtPosition(x, y);

    if (clickedNodeId) {
        console.log(`🖱️ Node clicked: ${ clickedNodeId }`);
        // Update visual selection immediately
        renderState.update(state => ({ ...state, selectedNode: clickedNodeId, highlightedNodes: new Set([clickedNodeId]) }));

        // Track interaction timing
        const interactionTime = performance.now() - clickStartTime;
        documentDetailsState.update(state => ({ ...state, selectedDocumentId: clickedNodeId, isVisible: true, nodeInteractionTime: interactionTime }));

        // Visual feedback - highlight the node
        if (graphEngine) {
            await graphEngine.highlightNodes([clickedNodeId]);
        }
        console.log(`⚡ Node selection completed in ${interactionTime.toFixed(2)}ms`);
    }
  }

  /**
   * Find node at specific screen coordinates
   * In production, this would use proper WebGPU ray casting
   */
  async function findNodeAtPosition(x: number, y: number): Promise<string | null> {
    // Simplified node detection - in production this would:
    // 1. Use GPU-based ray casting
    // 2. Check against actual node positions in GPU memory
    // 3. Handle 3D depth testing

    // For demonstration, simulate finding a document node
    const simulatedNodes = [
      'doc-uuid-12345',
      'doc-uuid-67890',
      'case-uuid-11111',
      'precedent-uuid-22222',
      'statute-uuid-33333'
    ];

    // Simple distance-based selection (in production proper 3D ray intersection)
    const threshold = 0.1;
    if (Math.abs(x) < threshold && Math.abs(y) < threshold) {
        // Return a random node for demonstration
        const nodeIndex = Math.floor(Math.random() * simulatedNodes.length);
        return simulatedNodes[nodeIndex];
    }
    return null;
  }

  /**
   * Handle related document visualization updates
   * Called when document details are loaded to update the graph
   */
  async function updateGraphWithRelations(documentId: string, relatedDocs: unknown[]): Promise<void> {
    if (!graphEngine) return;
    try {
        // Extract related document IDs
        const relatedIds = relatedDocs.map((doc: any) => doc.id).filter(id => id !== documentId);

        // Highlight related nodes in the visualization
        const allHighlighted = new Set([documentId, ...relatedIds]);
        renderState.update(state => ({ ...state, highlightedNodes: allHighlighted }));

        // Update WebGPU visualization with new highlights
        await graphEngine.highlightNodes(Array.from(allHighlighted));

        // Animate camera to focus on the cluster
        await animateCameraToCluster([documentId, ...relatedIds]);
        console.log(`🔗 Updated graph visualization with ${relatedIds.length} related documents`);
    } catch (error) {
        console.warn('Failed to update graph with relations:', error);
    }
  }

  /**
   * Animate camera to focus on a cluster of nodes
   */
  async function animateCameraToCluster(nodeIds: string[]): Promise<void> {
    // In production, this would:
    // 1. Calculate the bounding box of the selected nodes
    // 2. Animate the camera to frame them optimally
    // 3. Adjust zoom level for best viewing

    // Simplified animation:
    renderState.update(state => ({
        ...state,
        cameraPosition: [0, 0, 8], // Move closer
        zoom: 1.2 // Slight zoom in
    }));
  }

  /**
   * Close document details modal
   */
  function closeDocumentDetails(): void {
    documentDetailsState.update(state => ({ ...state, isVisible: false, selectedDocumentId: null }));
    // Clear node selection
    renderState.update(state => ({ ...state, selectedNode: null, highlightedNodes: new Set() }));
    // Clear visual highlights
    if (graphEngine) {
        graphEngine.clearHighlights();
    }
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  /**
   * Reset camera to default position
   */
  export function resetCamera(): void {
    renderState.update(state => ({ ...state, cameraPosition: [0, 0, 10], zoom: 1.0 }));
  }

  /**
   * Focus on a specific node
   */
  export function focusOnNode(nodeId: string): void {
    renderState.update(state => ({ ...state, selectedNode: nodeId, highlightedNodes: new Set([nodeId]) }));
  }

  /**
   * Update graph filter
   */
  /* export function setFilter(filterType: typeof $renderState.filterType): void {
    renderState.update(state => ({ ...state, filterType }));
  } */

  /**
   * Export current graph view as image
   */
  export async function exportImage(): Promise<Blob | null> {
    if (!canvas) return null;
    return new Promise((resolve) => {
        canvas?.toBlob((blob) => { resolve(blob) },
	'image/png');
    });
  }

  /**
   * Toggle physics simulation
   */
  export function togglePhysics(): void {
    enablePhysics = !enablePhysics;
    if (graphEngine) {
        graphEngine.config.enablePhysics = enablePhysics;
    }
  }

  /**
   * Save current graph state to database
   */
  export async function saveGraphState(): Promise<void> {
    if (!graphEngine) return;
    try {
        // Get current graph data (this would need implementation in the engine)
        const graphData: GraphVisualizationData = {
            graphId,
            graphType: 'legal-entities',
            nodes: [], // Would get from engine
            edges: [], // Would get from engine
            layout: {
	algorithm: 'force-directed', parameters: {
	dimensions: 3 } },
	cameraPosition: {
	x: $renderState.cameraPosition[0], y: $renderState.cameraPosition[1], z: $renderState.cameraPosition[2]},
	createdAt: new Date(),
            computationTime: 0
        };
        await legalDB.graphVisualizationData.put(graphData);
        console.log('[Graph Viewer] Graph state saved to database');
    } catch (err) {
        console.error('[Graph Viewer] Failed to save graph state:', err);
    }
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================
  function cleanup(): void {
    if (animationFrame) { cancelAnimationFrame(animationFrame); }
    if (resizeObserver) { resizeObserver.disconnect(); }
    if (graphEngine) { graphEngine.dispose(); }
    if (tensorStore) { tensorStore.dispose(); }
  }
</script>

<!-- ============================================================================ -->
<!-- COMPONENT, TEMPLATE -->
<!-- ============================================================================ -->
<div class="legal-graph-viewer {className}" style="width: {width}px; height: {height}px;">
  <!-- Loading State -->
  {#if $isLoading}
    <div class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>Loading legal document network...</p>
    </div>
  {/if}

  <!-- Error State -->
  {#if $error}
    <div class="error-overlay">
      <div class="error-icon">⚠️</div>
      <h3>WebGPU Error</h3>
      <p>{$error}</p>
      <button onclick={() => window.location.reload()}>Reload Page</button>
    </div>
  {/if}

  <!-- WebGPU Canvas -->
  <canvas
    bind:this={canvas}
    class="graph-canvas"
    class:interactive={$canInteract}
    {width}
    {height}
  ></canvas>

  <!-- Performance HUD -->
  {#if $isInitialized && !$error}
    <div class="performance-hud">
      <div class="stat">
        <span class="label">FPS:</span>
        <span class="value">{Math.round($performanceStats.fps)}</span>
      </div>
      <div class="stat">
        <span class="label">Nodes:</span>
        <span class="value">{$performanceStats.nodeCount}</span>
      </div>
      <div class="stat">
        <span class="label">Edges:</span>
        <span class="value">{$performanceStats.edgeCount}</span>
      </div>
      <div class="stat">
        <span class="label">GPU:</span>
        <span class="value">{Math.round($performanceStats.gpuMemoryUsage / 1024 / 1024)}MB</span>
      </div>
    </div>
  {/if}

  <!-- Controls Panel -->
  {#if $canInteract}
    <div class="controls-panel">
      <button onclick={resetCamera} title="Reset Camera"> 🎯 </button>
      <button onclick={togglePhysics} title="Toggle Physics" class:active={enablePhysics}>
        ⚡
      </button>
      <button
        onclick={() => ($renderState.autoRotate = !$renderState.autoRotate)}
        title="Auto Rotate"
        class:active={$renderState.autoRotate}
      >
        🔄
      </button>
      <select bind:value={$renderState.filterType} title="Filter Nodes">
        <option value="all">All Nodes</option>
        <option value="document">Documents</option>
        <option value="case">Cases</option>
        <option value="entity">Entities</option>
        <option value="precedent">Precedents</option>
      </select>
      <button onclick={saveGraphState} title="Save State"> 💾 </button>
      <button
        onclick={async () => {
          const blob = await exportImage();
          if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `legal-graph-${graphId}.png`;
            a.click();
            URL.revokeObjectURL(url);
          }
        }}
        title="Export Image"
      >
        📸
      </button>
    </div>
  {/if}

  <!-- Selected Node Info -->
  {#if $renderState.selectedNode}
    <div class="node-info-panel">
      <h4>Node Information</h4>
      <p><strong>ID:</strong> {$renderState.selectedNode}</p>
      <!-- Additional node details would be populated here -->
    </div>
  {/if}
</div>

<!-- ============================================================================ -->
<!-- DOCUMENT DETAILS MODAL - CACHE-FIRST INTEGRATION -->
<!-- ============================================================================ -->
<DocumentDetails
  documentId={$documentDetailsState.selectedDocumentId || ''}
  isVisible={$documentDetailsState.isVisible}
  onClose={closeDocumentDetails}
  relatedDocumentsLoaded={(event) => {
    // Update graph visualization when related documents are loaded
    if ($documentDetailsState.selectedDocumentId) {
      updateGraphWithRelations(
        $documentDetailsState.selectedDocumentId,
        (event as CustomEvent).detail.relatedDocuments
      );
    }
  }}
/>

<!-- ============================================================================ -->
<!-- STYLES -->
<!-- ============================================================================ -->
<style>
  .legal-graph-viewer {
    position: relative;
	border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 8px;
	overflow: hidden;
    background: linear-gradient(135deg, #0f0f23 0%, #1a1a3a 100%);
  }
  .graph-canvas {
    width: 100%;
	height: 100%;
    outline: none;
  }
  .graph-canvas.interactive {
    cursor: grab;
  }
  .graph-canvas.interactive:active {
    cursor: grabbing;
  }
  .loading-overlay,
  .error-overlay {
    position: absolute;
	top: 0;
    left: 0;
	right: 0;
    bottom: 0;
	display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
	background: rgba(0, 0, 0, 0.8);
    color: white;
    z-index: 10;
  }
  .loading-spinner {
    width: 40px;
	height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top: 3px solid #60a5fa;
    border-radius: 50%;
	animation: spin 1s linear infinite;
    margin-bottom: 16px;
  }
  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
  .error-overlay {
    text-align: center;
  }
  .error-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }
  .error-overlay h3 {
    margin: 0 0 8px 0;
    color: #ef4444;
  }
  .error-overlay button {
    margin-top: 16px;
	padding: 8px 16px;
    background: #3b82f6;
	color: white;
    border: none;
    border-radius: 4px;
	cursor: pointer;
  }
  .performance-hud {
    position: absolute;
	top: 16px;
    right: 16px;
	background: rgba(0, 0, 0, 0.7);
    padding: 12px;
    border-radius: 8px;
	color: #a3a3a3;
    font-size: 12px;
    backdrop-filter: blur(4px);
    pointer-events: none;
  }
  .stat {
    display: flex;
    justify-content: space-between;
	gap: 12px;
    margin-bottom: 4px;
  }
  .stat:last-child {
    margin-bottom: 0;
  }
  .stat .value {
    color: white;
    font-family: monospace;
    font-weight: bold;
  }
  .controls-panel {
    position: absolute;
	bottom: 16px;
    left: 50%;
	transform: translateX(-50%);
    background: rgba(255, 255, 255, 0.1);
    padding: 8px;
    border-radius: 32px;
	display: flex;
    gap: 8px;
    backdrop-filter: blur(8px);
	border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .controls-panel button,
  .controls-panel select {
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: white;
	width: 40px;
    height: 40px;
    border-radius: 50%;
	display: flex;
    align-items: center;
    justify-content: center;
	cursor: pointer;
    transition:all 0.2s;
    font-size: 18px;
  }
  .controls-panel select {
    width: auto;
    border-radius: 20px;
	padding: 0 16px;
    font-size: 14px;
	appearance: none;
  }
  .controls-panel button:hover,
  .controls-panel select:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: translateY(-2px);
  }
  .controls-panel button.active {
    background: #3b82f6;
	color: white;
    border-color: #3b82f6;
    box-shadow: 0 0 12px rgba(59, 130, 246, 0.5);
  }
  .node-info-panel {
    position: absolute;
	top: 16px;
    left: 16px;
	background: rgba(255, 255, 255, 0.95);
    padding: 16px;
    border-radius: 8px;
	width: 280px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    border-left: 4px solid #3b82f6;
    color: #1f2937;
  }
  .node-info-panel h4 {
    margin: 0 0 12px 0;
    font-size: 16px;
	color: #111827;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 8px;
  }
  .node-info-panel p {
    margin: 0 0 8px 0;
    font-size: 14px;
  }
  @keyframes spin {
    100% { transform: rotate(360deg); }
  }
  .error-overlay { text-align: center; }
  .error-icon { font-size: 48px; margin-bottom: 16px; }
  .error-overlay h3 { margin: 0 0 8px 0; color: #ef4444; }
  .error-overlay button { margin-top: 16px;
	padding: 8px 16px; background: #3b82f6;
	color: white; border: none; border-radius: 4px;
	cursor: pointer; }
  .error-overlay button:hover { background: #2563eb; }
  .performance-hud { position: absolute;
	top: 12px; left: 12px;
	background: rgba(0, 0, 0, 0.7); padding: 8px 12px; border-radius: 4px; font-size: 12px;
	color: white; font-family: 'Courier New', monospace; z-index: 5; }
  .stat { display: flex; justify-content: space-between; min-width: 80px; margin-bottom: 2px; }
  .stat:last-child { margin-bottom: 0; }
  .label { opacity: 0.8; }
  .value { font-weight: bold;
	color: #60a5fa;
	}

	.controls-panel {
		position: absolute;
		top: 12px;
		right: 12px;
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		z-index: 5;
	}

	.controls-panel button,
	.controls-panel select {
		padding: 6px 10px;
		background: rgba(0, 0, 0, 0.7);
		color: white;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 4px;
		cursor: pointer;
		font-size: 14px;
		transition:all 0.2s;
	}

	.controls-panel button:hover,
	.controls-panel select:hover {
		background: rgba(0, 0, 0, 0.9);
		border-color: rgba(255, 255, 255, 0.4);
	}

	.controls-panel button.active {
		background: rgba(96, 165, 250, 0.3);
		border-color: #60a5fa;
	}
  .node-info-panel { position: absolute;
	bottom: 12px; left: 12px;
	background: rgba(0, 0, 0, 0.8); color: white, padding: 12px; border-radius: 6px; min-width: 200px; max-width: 300px; z-index: 5 }
  .node-info-panel h4 { margin: 0, 0 8px 0; color: #60a5fa; font-size: 14px}
  .node-info-panel p { margin: 4px 0; font-size: 12px}
  /* Responsive design */ @media (max-width: 768px) { .performance-hud { font-size: 10px}
    .controls-panel { flex-direction: column; align-items: flex-end}
    .controls-panel button, .controls-panel select { padding: 4px 8px; font-size: 12px}
  } </style>






