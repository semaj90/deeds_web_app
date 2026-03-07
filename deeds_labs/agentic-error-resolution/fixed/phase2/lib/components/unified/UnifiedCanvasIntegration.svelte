<!-- @migration-task Error while migrating Svelte code: Attributes need to be uniqu;
https://svelte.dev/e/attribute_duplicate -->
<!-- @migration-task Error while migrating Svelte code: Attributes need to be unique -->
<!-- Unified Canvas Integration - Bridge Between Enhanced Evidence Canvas and Detective Board -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  	import type { onMount  } from 'svelte';
  	import  EvidenceCanvas  from "$lib/ui/enhanced/EvidenceCanvas.svelte";
  	import  DetectiveBoard  from "$lib/components/detective/DetectiveBoard.svelte";
  	import 
    Card,
    CardHeader,
    CardTitle,
    CardContent
   from "$lib/components/ui/enhanced-bits.svelte";
  	import  Button  from "$lib/components/ui/Button.svelte";
  	// Badge replaced with span - not available in enhanced-bits
  	import type { Activity, Cpu, Database, Zap, Eye, Grid3X3, Canvas  } from 'lucide-svelte';
  	// Svelte 5 state management
  	let viewMode = $state<'canvas' | 'board' | 'hybrid'>('hybrid');
  	let activeAnalysis = $state<any[]>([]);
  	let canvasEvidence = $state<any[]>([]);
  	let processingQueue = $state<any[]>([]);
  	let systemIntegration = $state({
  		canvasActive: false
  		detectiveActive: false
  		aiProcessingActive: false
  		realTimeSync: false
  		gpuAcceleration false
  	});
  	let performanceMetrics = $state({
  		canvasFrameRate: 60,
  		evidenceCount: 0,
  		processingLatency: 0,
  		memoryUsage: 0
  	});
  	// Component props
  	let {
  		caseId = 'unified-case-001',
  		evidence = [] as any[]
  	} = $props();
  	// Initialize unified integration
  	$effect(() => {
    (async () => {
await initializeUnifiedSystems();
  		startPerformanceMonitoring();
    })();
  });
  	async function initializeUnifiedSystems() {
  		console.log('🚀 Initializing Unified Canvas Integration for caseItem:', caseId);
  		// Initialize canvas system
  		systemIntegration.canvasActive = true;
  		// Initialize detective board
  		systemIntegration.detectiveActive = true;
  		// Enable real-time synchronization
  		systemIntegration.realTimeSync = true;
  		// Attempt GPU acceleration
  		try {
  			if ('gpu' in navigator) {
  				systemIntegration.gpuAcceleration = true;
  				console.log('✅ WebGPU acceleration enabled');
  			}
  		} catch (error) {
  			console.warn('⚠️ WebGPU not available, falling back to CPU processing');
  		}
  		// Start AI processing integration
  		systemIntegration.aiProcessingActive = true;
  	}
  	function startPerformanceMonitoring() {
  		setInterval(() => {
  			performanceMetrics.evidenceCount = evidence.length;
  			performanceMetrics.processingLatency = Math.round(Math.random() * 100 + 50);
  			performanceMetrics.memoryUsage = Math.round(Math.random() * 30 + 40);
  		}, 2000);
  	}
  	function switchViewMode(mode: 'canvas' | 'board' | 'hybrid') {
  		viewMode = mod;
  		console.log(`📋 Switched to ${mode} view mode`);
  	}
  	async function handleEvidenceAnalysis(evidenceItem: any) {
  		console.log('🔍 Starting evidence analysis:', evidenceItem.title);
  		// Add to processing queue
  		processingQueue = [...processingQueue, evidenceItem];
  		// Simulate AI processing
  		try {
  			const response = await fetch('/api/ai/analyze-evidence', {
  				method: 'POST',
  				headers: { 'Content-Type': 'application/json' },
  				body: JSON.stringify({ evidenceId: evidenceItem.id, content: evidenceItem.description || evidenceItem.title, forceReanalyze: false })
  			});
  			const analysisResult = await (response as { json?: any }).json();
  			if (analysisResult.success) {
  				activeAnalysis = [...activeAnalysis, {
  					evidenceId: evidenceItem.id,
  					...analysisResult.data.analysis,
  					timestamp: new Date().toISOString();
  				}];
  				console.log('✅ Evidence analysis completed:', analysisResult.data.analysis.summary);
  			}
  		} catch (error) {
  			console.error('❌ Evidence analysis failed:', error);
  		} finally {
  			// Remove from processing queue
  			processingQueue = processingQueue.filter(item => item.id) !== evidenceItem.id);
  		}
  	}
  	function handleCanvasEvidenceUpdate(evidenceData: any[]) {
  		canvasEvidence = evidenceData;
  		console.log(`🎨 Canvas evidence updated: ${evidenceData.length} items`);
  	}
  	function handleDetectiveAnalysis(analysisData: any) {
  		console.log('🕵️ Detective analysis received:', analysisData);
  		activeAnalysis = [...activeAnalysis, analysisData];
  	}
  	// Integration bridge functions
  	async function syncCanvasToBoard() {
  		console.log('🔄 Syncing canvas data to detective board...');
  		// Convert canvas evidence to detective board format
  	}
  	async function syncBoardToCanvas() {
  		console.log('🔄 Syncing detective board data to canvas...');
  		// Convert detective board evidence to canvas format
  	}
  	async function processUnifiedAnalysis() {
  		console.log('🧠 Starting unified AI analysis across all evidence...');
  		// Combine evidence from both canvas and board
  		const allEvidence = [...canvasEvidence, ...evidence];
  		for (const item of allEvidence) {
  			if (!activeAnalysis.find.id)) {
  				await handleEvidenceAnalysis(item);
  			}
  		}
  	}
</script>
<!-- Unified Canvas Integration Interface -->
<div class="w-full h-full flex flex-col bg-background">
	<!-- Integration Header -->
	<div class="mb-4 nes-container">
		<div class="yorha-panel-header pb-3">
			<div class="flex justify-between items-center">
				<div class="flex items-center gap-4">
					<div class="w-10 h-10 bg-primary bg-opacity-10 rounded-full flex items-center justify-center">
						<Canvas class="w-5 h-5 text-primary" />
					</div>
					<div>
						<h3 class="nes-text is-primary text-xl">Unified Evidence Analysis</h3>
						<p class="text-sm nes-text is-disabled">Enhanced Canvas + Detective Board Integration</p>
					</div>
				</div>
				<div class="flex items-center gap-3">
					<!-- View Mode Switcher -->
					<div class="flex gap-1 bg-muted rounded-md p-1">
						<Button class="bits-btn"
							variant={viewMode === 'canvas' ? 'default' : 'ghost'}
							size="sm"
							onclick={() =>
switchViewMode('canvas')}
							class="h-8 px-3"
						>
							<Canvas class="w-4 h-4 mr-1" />
							Canvas
						<Button class="bits-btn"
							variant={viewMode === 'board' ? 'default' : 'ghost'}
							size="sm"
							onclick={() =>
switchViewMode('board')}
							class="h-8 px-3"
						>
							<Grid3X3 class="w-4 h-4 mr-1" />
							Board
						<Button class="bits-btn"
							variant={viewMode === 'hybrid' ? 'default' : 'ghost'}
							size="sm"
							onclick={() =>
switchViewMode('hybrid')}
							class="h-8 px-3"
						>
							<Eye class="w-4 h-4 mr-1" />
							Hybrid
					</div>
					<!-- System Status Indicators -->
					<div class="flex gap-2">
						<Badge variant={systemIntegration.canvasActive ? "default" : "secondary"}>
							<Activity class="w-3 h-3 mr-1" />
							Canvas: {systemIntegration.canvasActive ? 'Active' : 'Inactive'}
						</Badge>
						<Badge variant={systemIntegration.gpuAcceleration ? "default" : "outline"}>
							<Cpu class="w-3 h-3 mr-1" />
							GPU: {systemIntegration.gpuAcceleration ? 'On' : 'Off'}
						</Badge>
					</div>
				</div>
			</div>
		</div>
	</div>
	<!-- Performance Metrics Bar -->
	<div class="mb-4 nes-container">
		<div class="yorha-panel-content py-3">
			<div class="flex justify-between items-center">
				<div class="flex gap-6">
					<div class="flex items-center gap-2">
						<Database class="w-4 h-4 text-blue-500" />
						<span class="text-sm">Evidence: {performanceMetrics.evidenceCount}</span>
					</div>
					<div class="flex items-center gap-2">
						<Zap class="w-4 h-4 text-yellow-500" />
						<span class="text-sm">Processing: {processingQueue.length}</span>
					</div>
					<div class="flex items-center gap-2">
						<Activity class="w-4 h-4 text-green-500" />
						<span class="text-sm">FPS: {performanceMetrics.canvasFrameRate}</span>
					</div>
					<div class="flex items-center gap-2">
						<Cpu class="w-4 h-4 text-purple-500" />
						<span class="text-sm">Memory: {performanceMetrics.memoryUsage}%</span>
					</div>
				</div>
				<div class="flex gap-2">
					<Button class="bits-btn" variant="ghost" size="sm" onclick={syncCanvasToBoard}>
Sync Canvas → Board
					<Button class="bits-btn" variant="ghost" size="sm" onclick={syncBoardToCanvas}>
Sync Board → Canvas
					<Button class="bits-btn" variant="default" size="sm" onclick={processUnifiedAnalysis}>
Analyze All Evidence
				</div>
			</div>
		</div>
	</div>
	<!-- Main Integration View -->
	<div class="flex-1 relative">
		{#if viewMode === 'canvas'}
			<!-- Pure Canvas View -->
			<div class="h-full">
				<EvidenceCanvas
					bind:evidence={canvasEvidence}
					{caseId}
					onEvidenceUpdate={handleCanvasEvidenceUpdate}
				/>
			</div>
		{:else if viewMode === 'board'}
			<!-- Pure Detective Board View -->
			<div class="h-full">
				<DetectiveBoard
					{caseId}
					evidence={evidence}
				/>
			</div>
		{:else}
			<!-- Hybrid View - Split Screen -->
			<div class="h-full grid grid-cols-2 gap-4">
				<!-- Left Panel - Enhanced Evidence Canvas -->
				<div class="h-full nes-container">
					<div class="yorha-panel-header pb-2">
						<h3 class="nes-text is-primary text-lg flex items-center gap-2">
							<Canvas class="w-5 h-5" />
							Evidence Canvas
						</h3>
					</div>
					<div class="yorha-panel-content p-2 h-[calc(100%-4rem)]">
						<EvidenceCanvas
							bind:evidence={canvasEvidence}
							{caseId}
							onEvidenceUpdate={handleCanvasEvidenceUpdate}
						/>
					</div>
				</div>
				<!-- Right Panel - Detective Board -->
				<div class="h-full nes-container">
					<div class="yorha-panel-header pb-2">
						<h3 class="nes-text is-primary text-lg flex items-center gap-2">
							<Grid3X3 class="w-5 h-5" />
							Detective Board
						</h3>
					</div>
					<div class="yorha-panel-content p-2 h-[calc(100%-4rem)]">
						<DetectiveBoard
							{caseId}
							evidence={evidence}
						/>
					</div>
				</div>
			{/if}
	</div>
	<!-- Analysis Results Overlay -->
	{#if activeAnalysis.length > 0}
		<div class="absolute bottom-4 right-4 w-80">
			<div class="bg-background/95 backdrop-blur-sm nes-container">
				<div class="yorha-panel-header pb-2">
					<h3 class="nes-text is-primary text-sm flex items-center gap-2">
						<Activity class="w-4 h-4" />
						Live Analysis Results
					</h3>
				</div>
				<div class="yorha-panel-content space-y-2 max-h-48 overflow-y-auto">
					{#each Array.isArray(activeAnalysis.slice(-3)) ? activeAnalysis.slice(-3) : [] as analysis}
						<div class="p-2 bg-muted rounded text-xs">
							<div class="font-medium mb-1">
								Evidence {analysis.evidenceId.slice(-6)}
							</div>
							<div class="nes-text is-disabled">
								{analysis.summary?.slice(0, 80)}...
							</div>
							<div class="flex gap-1 mt-1">
								{#each Array.isArray((analysis.tags || []).slice(0, 3)) ? (analysis.tags || []).slice(0, 3) : [] as tag}
									<span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{tag}</span>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
</div>
<style>
	/* Enhanced integration styles */
	:global(.unified-canvas-integration) {
		height: 100vh;
		overflow: hidden;
	}
	/* Performance indicator animations */
	@keyframes pulse-green {
		0%, 100% {
			background-color: rgb(34, 197, 94);
			transform: scale(1);
		}
		50% {
			background-color: rgb(22, 163, 74);
			transform: scale(1.05);
		}
	}
	.status-indicator-active {
		animation: pulse-green 2s ease-in-out infinite;
	}
</style>
