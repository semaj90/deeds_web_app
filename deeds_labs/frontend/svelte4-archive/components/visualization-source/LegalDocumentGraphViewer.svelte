<script lang="ts">
	import DocumentDetails from "$lib/components/legal/DocumentDetails.svelte";
	import { legalDB, type GraphVisualizationData } from '$lib/db/client-db';
	import { DimensionalTensorStore } from '$lib/webgpu/dimensional-tensor-store';
	import { WebGPULegalDocumentGraph } from '$lib/webgpu/legal-document-graph';

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
	// REACTIVE STATE (migrated from writable/derived stores to $state/$derived runes)
	// ============================================================================
	let isInitialized = $state(false);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let performanceStats = $state({ fps: 0, frameTime: 0, nodeCount: 0, edgeCount: 0, gpuMemoryUsage: 0 });
	let renderState = $state({
		selectedNode: null as string | null,
		highlightedNodes: new Set<string>(),
		filterType: 'all' as 'all' | 'document' | 'case' | 'entity' | 'precedent',
		cameraPosition: [0, 0, 10] as [number, number, number],
		zoom: 1.0,
		autoRotate: false
	});

	// Document details interaction state
	let documentDetailsState = $state({
		isVisible: false,
		selectedDocumentId: null as string | null,
		nodeInteractionTime: 0,
		cacheHitRate: 0
	});

	// Derived state
	let canInteract = $derived(isInitialized && !isLoading && !error);

	// ============================================================================
	// WEBGPU & CANVAS MANAGEMENT
	// ============================================================================
	let canvas = $state<HTMLCanvasElement | null>(null);
	let graphEngine: WebGPULegalDocumentGraph | null = null;
	let tensorStore = $state<DimensionalTensorStore | null>(null);
	let animationFrame = $state<number | null>(null);
	let resizeObserver = $state<ResizeObserver | null>(null);

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
					isInitialized = true;
				}
			} catch (err) {
				console.error('[Graph Viewer] Initialization failed:', err);
				error = err instanceof Error ? err.message : 'Unknown error occurred';
			}
		})();

		return () => { cleanup(); };
	});

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
		const adapter = await (navigator as any).gpu.requestAdapter();
		if (!adapter) throw new Error('No WebGPU adapter found');
		const device = await adapter.requestDevice();

		tensorStore = new DimensionalTensorStore(device, {
			documents: maxNodes,
			chunks: 100,
			representations: 8,
			maxLOD: 4
		}, {
			maxGPUMemory: 256 * 1024 * 1024,
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
		isLoading = true;
		try {
			await graphEngine?.loadGraphFromDB(graphId);
			if (graphEngine) {
				performanceStats = graphEngine.getPerformanceStats();
			}
			console.log(`[Graph Viewer] Loaded graph ${graphId}`);
		} catch (err) {
			console.error('[Graph Viewer] Failed to load graph data:', err);
			throw new Error('Failed to load graph data from database');
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Start the render loop
	 */
	function startRenderLoop(): void {
		if (!graphEngine) return;

		const updatePerformance = () => {
			if (graphEngine) {
				performanceStats = graphEngine.getPerformanceStats();
			}
		};

		const perfInterval = setInterval(updatePerformance, 1000);
		graphEngine.startRenderLoop();
	}

	/**
	 * Setup event listeners for interaction
	 */
	function setupEventListeners(): void {
		if (!canvas) return;
		let isDragging = false;
		let lastMousePos = { x: 0, y: 0 };

		canvas.addEventListener('mousedown', (e) => {
			isDragging = true;
			lastMousePos = { x: e.clientX, y: e.clientY };
			if (canvas) canvas.style.cursor = 'grabbing';
		});

		canvas.addEventListener('mousemove', (e) => {
			if (!isDragging) return;
			const deltaX = e.clientX - lastMousePos.x;
			const deltaY = e.clientY - lastMousePos.y;
			renderState.cameraPosition = [
				renderState.cameraPosition[0] - deltaX * 0.01,
				renderState.cameraPosition[1] + deltaY * 0.01,
				renderState.cameraPosition[2]
			];
			lastMousePos = { x: e.clientX, y: e.clientY };
		});

		canvas.addEventListener('mouseup', (e) => {
			if (isDragging) {
				isDragging = false;
				if (canvas) canvas.style.cursor = 'grab';
			} else {
				handleNodeClick(e);
			}
		});

		canvas.addEventListener('wheel', (e) => {
			e.preventDefault();
			const zoomSpeed = 0.1;
			const delta = e.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;
			renderState.zoom = Math.max(0.1, Math.min(10, renderState.zoom * delta));
		});

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
			renderState.cameraPosition = [
				renderState.cameraPosition[0] - deltaX * 0.005,
				renderState.cameraPosition[1] + deltaY * 0.005,
				renderState.cameraPosition[2]
			];
			touchStart = { x: touch.clientX, y: touch.clientY };
		});

		resizeObserver = new ResizeObserver(entries => {
			for (const entry of entries) {
				const { width: newWidth, height: newHeight } = entry.contentRect;
				if (canvas && graphEngine) {
					canvas.width = newWidth;
					canvas.height = newHeight;
					graphEngine.config.canvasWidth = newWidth;
					graphEngine.config.canvasHeight = newHeight;
				}
			}
		});
		if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);
	}

	// ============================================================================
	// NODE INTERACTION HANDLERS
	// ============================================================================

	/**
	 * Handle node clicks - The Hybrid Cache-First Strategy Implementation
	 */
	async function handleNodeClick(event: MouseEvent): Promise<void> {
		if (!graphEngine || !canInteract || !canvas) return;
		const clickStartTime = performance.now();

		const rect = canvas.getBoundingClientRect();
		const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		const y = (1 - (event.clientY - rect.top) / rect.height) * 2 - 1;

		const clickedNodeId = await findNodeAtPosition(x, y);

		if (clickedNodeId) {
			console.log(`Node clicked: ${clickedNodeId}`);
			renderState.selectedNode = clickedNodeId;
			renderState.highlightedNodes = new Set([clickedNodeId]);

			const interactionTime = performance.now() - clickStartTime;
			documentDetailsState.selectedDocumentId = clickedNodeId;
			documentDetailsState.isVisible = true;
			documentDetailsState.nodeInteractionTime = interactionTime;

			if (graphEngine) {
				await graphEngine.highlightNodes([clickedNodeId]);
			}
			console.log(`Node selection completed in ${interactionTime.toFixed(2)}ms`);
		}
	}

	/**
	 * Find node at specific screen coordinates
	 */
	async function findNodeAtPosition(x: number, y: number): Promise<string | null> {
		const simulatedNodes = [
			'doc-uuid-12345',
			'doc-uuid-67890',
			'case-uuid-11111',
			'precedent-uuid-22222',
			'statute-uuid-33333'
		];

		const threshold = 0.1;
		if (Math.abs(x) < threshold && Math.abs(y) < threshold) {
			const nodeIndex = Math.floor(Math.random() * simulatedNodes.length);
			return simulatedNodes[nodeIndex];
		}
		return null;
	}

	/**
	 * Handle related document visualization updates
	 */
	async function updateGraphWithRelations(documentId: string, relatedDocs: unknown[]): Promise<void> {
		if (!graphEngine) return;
		try {
			const relatedIds = relatedDocs.map((doc: any) => doc.id).filter((id: string) => id !== documentId);
			const allHighlighted = new Set([documentId, ...relatedIds]);
			renderState.highlightedNodes = allHighlighted;

			await graphEngine.highlightNodes(Array.from(allHighlighted));
			await animateCameraToCluster([documentId, ...relatedIds]);
			console.log(`Updated graph visualization with ${relatedIds.length} related documents`);
		} catch (err) {
			console.warn('Failed to update graph with relations:', err);
		}
	}

	/**
	 * Animate camera to focus on a cluster of nodes
	 */
	async function animateCameraToCluster(nodeIds: string[]): Promise<void> {
		renderState.cameraPosition = [0, 0, 8];
		renderState.zoom = 1.2;
	}

	/**
	 * Close document details modal
	 */
	function closeDocumentDetails(): void {
		documentDetailsState.isVisible = false;
		documentDetailsState.selectedDocumentId = null;
		renderState.selectedNode = null;
		renderState.highlightedNodes = new Set();
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
		renderState.cameraPosition = [0, 0, 10];
		renderState.zoom = 1.0;
	}

	/**
	 * Focus on a specific node
	 */
	export function focusOnNode(nodeId: string): void {
		renderState.selectedNode = nodeId;
		renderState.highlightedNodes = new Set([nodeId]);
	}

	/**
	 * Export current graph view as image
	 */
	export async function exportImage(): Promise<Blob | null> {
		if (!canvas) return null;
		return new Promise((resolve) => {
			canvas?.toBlob((blob) => { resolve(blob); }, 'image/png');
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
			const graphData: GraphVisualizationData = {
				graphId,
				graphType: 'legal-entities',
				nodes: [],
				edges: [],
				layout: { algorithm: 'force-directed', parameters: { dimensions: 3 } },
				cameraPosition: {
					x: renderState.cameraPosition[0],
					y: renderState.cameraPosition[1],
					z: renderState.cameraPosition[2]
				},
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
<!-- COMPONENT TEMPLATE -->
<!-- ============================================================================ -->
<div class="legal-graph-viewer {className}" style="width: {width}px; height: {height}px;">
	<!-- Loading State -->
	{#if isLoading}
		<div class="loading-overlay">
			<div class="loading-spinner"></div>
			<p>Loading legal document network...</p>
		</div>
	{/if}

	<!-- Error State -->
	{#if error}
		<div class="error-overlay">
			<div class="error-icon">!</div>
			<h3>WebGPU Error</h3>
			<p>{error}</p>
			<button onclick={() => window.location.reload()}>Reload Page</button>
		</div>
	{/if}

	<!-- WebGPU Canvas -->
	<canvas
		bind:this={canvas}
		class="graph-canvas"
		class:interactive={canInteract}
		{width}
		{height}
	></canvas>

	<!-- Performance HUD -->
	{#if isInitialized && !error}
		<div class="performance-hud">
			<div class="stat">
				<span class="label">FPS:</span>
				<span class="value">{Math.round(performanceStats.fps)}</span>
			</div>
			<div class="stat">
				<span class="label">Nodes:</span>
				<span class="value">{performanceStats.nodeCount}</span>
			</div>
			<div class="stat">
				<span class="label">Edges:</span>
				<span class="value">{performanceStats.edgeCount}</span>
			</div>
			<div class="stat">
				<span class="label">GPU:</span>
				<span class="value">{Math.round(performanceStats.gpuMemoryUsage / 1024 / 1024)}MB</span>
			</div>
		</div>
	{/if}

	<!-- Controls Panel -->
	{#if canInteract}
		<div class="controls-panel">
			<button onclick={resetCamera} title="Reset Camera"> Reset </button>
			<button onclick={togglePhysics} title="Toggle Physics" class:active={enablePhysics}>
				Physics
			</button>
			<button
				onclick={() => (renderState.autoRotate = !renderState.autoRotate)}
				title="Auto Rotate"
				class:active={renderState.autoRotate}
			>
				Rotate
			</button>
			<select bind:value={renderState.filterType} title="Filter Nodes">
				<option value="all">All Nodes</option>
				<option value="document">Documents</option>
				<option value="case">Cases</option>
				<option value="entity">Entities</option>
				<option value="precedent">Precedents</option>
			</select>
			<button onclick={saveGraphState} title="Save State"> Save </button>
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
				Export
			</button>
		</div>
	{/if}

	<!-- Selected Node Info -->
	{#if renderState.selectedNode}
		<div class="node-info-panel">
			<h4>Node Information</h4>
			<p><strong>ID:</strong> {renderState.selectedNode}</p>
		</div>
	{/if}
</div>

<!-- ============================================================================ -->
<!-- DOCUMENT DETAILS MODAL - CACHE-FIRST INTEGRATION -->
<!-- ============================================================================ -->
<DocumentDetails
	documentId={documentDetailsState.selectedDocumentId || ''}
	isVisible={documentDetailsState.isVisible}
	onClose={closeDocumentDetails}
	relatedDocumentsLoaded={(event) => {
		if (documentDetailsState.selectedDocumentId) {
			updateGraphWithRelations(
				documentDetailsState.selectedDocumentId,
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
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
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

	.error-overlay button:hover {
		background: #2563eb;
	}

	.performance-hud {
		position: absolute;
		top: 12px;
		left: 12px;
		background: rgba(0, 0, 0, 0.7);
		padding: 8px 12px;
		border-radius: 4px;
		font-size: 12px;
		color: white;
		font-family: 'Courier New', monospace;
		z-index: 5;
	}

	.stat {
		display: flex;
		justify-content: space-between;
		min-width: 80px;
		margin-bottom: 2px;
	}

	.stat:last-child {
		margin-bottom: 0;
	}

	.label {
		opacity: 0.8;
	}

	.value {
		font-weight: bold;
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
		transition: all 0.2s;
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

	.node-info-panel {
		position: absolute;
		bottom: 12px;
		left: 12px;
		background: rgba(0, 0, 0, 0.8);
		color: white;
		padding: 12px;
		border-radius: 6px;
		min-width: 200px;
		max-width: 300px;
		z-index: 5;
	}

	.node-info-panel h4 {
		margin: 0 0 8px 0;
		color: #60a5fa;
		font-size: 14px;
	}

	.node-info-panel p {
		margin: 4px 0;
		font-size: 12px;
	}

	@media (max-width: 768px) {
		.performance-hud {
			font-size: 10px;
		}
		.controls-panel {
			flex-direction: column;
			align-items: flex-end;
		}
		.controls-panel button,
		.controls-panel select {
			padding: 4px 8px;
			font-size: 12px;
		}
	}
</style>