<!-- Recursive Evidence Visualization — Hierarchical evidence chain viewer -->
<!-- Session 64: Replaced corrupted fabric.js/worker-based version with clean placeholder -->
<!-- Dependencies: fabric.js (not installed), evidence-stores (excluded), Web Worker -->
<!-- TODO: Wire to real Fabric.js canvas + evidence hierarchy API when deps available -->
<script lang="ts">
	interface Props {
		caseId: string;
		width?: number;
		height?: number;
		enableInteraction?: boolean;
		showMetrics?: boolean;
	}

	let {
		caseId,
		width = 1200,
		height = 800,
		enableInteraction = true,
		showMetrics = false
	}: Props = $props();

	let canvasElement: HTMLCanvasElement | undefined = $state();
	let layoutMode = $state<'tree' | 'radial' | 'force'>('tree');
	let isProcessing = $state(false);
	let nodeCount = $state(0);

	$effect(() => {
		if (canvasElement) {
			renderPlaceholder();
		}
	});

	function renderPlaceholder() {
		if (!canvasElement) return;
		const ctx = canvasElement.getContext('2d');
		if (!ctx) return;

		ctx.fillStyle = '#f8fafc';
		ctx.fillRect(0, 0, width, height);

		ctx.strokeStyle = '#d1d5db';
		ctx.lineWidth = 2;

		drawNode(ctx, width / 2, 80, 'Root Evidence', '#3b82f6');

		drawNode(ctx, width / 3, 200, 'Related Doc 1', '#10b981');
		drawNode(ctx, (2 * width) / 3, 200, 'Related Doc 2', '#10b981');
		drawLine(ctx, width / 2, 110, width / 3, 170);
		drawLine(ctx, width / 2, 110, (2 * width) / 3, 170);

		drawNode(ctx, width / 4, 320, 'Citation', '#f59e0b');
		drawNode(ctx, width / 3 + 50, 320, 'Entity', '#f59e0b');
		drawLine(ctx, width / 3, 230, width / 4, 290);
		drawLine(ctx, width / 3, 230, width / 3 + 50, 290);

		ctx.fillStyle = '#94a3b8';
		ctx.font = '14px system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText(`Case: ${caseId} | Layout: ${layoutMode}`, width / 2, height - 60);
		ctx.font = '12px system-ui, sans-serif';
		ctx.fillText(
			'Recursive evidence visualization — Fabric.js integration pending',
			width / 2,
			height - 35
		);
	}

	function drawNode(
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		label: string,
		color: string
	) {
		ctx.fillStyle = color + '20';
		ctx.strokeStyle = color;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.roundRect(x - 60, y - 20, 120, 40, 8);
		ctx.fill();
		ctx.stroke();

		ctx.fillStyle = '#1f2937';
		ctx.font = '12px system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText(label, x, y + 4);
	}

	function drawLine(
		ctx: CanvasRenderingContext2D,
		x1: number,
		y1: number,
		x2: number,
		y2: number
	) {
		ctx.strokeStyle = '#d1d5db';
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.stroke();
	}

	function switchLayout(mode: 'tree' | 'radial' | 'force') {
		layoutMode = mode;
		renderPlaceholder();
	}
</script>

<div class="recursive-viz">
	<div class="viz-controls">
		<div class="control-group">
			<label for="layout-select">Layout:</label>
			<select
				id="layout-select"
				bind:value={layoutMode}
				onchange={() => switchLayout(layoutMode)}
			>
				<option value="tree">Tree</option>
				<option value="radial">Radial</option>
				<option value="force">Force-Directed</option>
			</select>
		</div>

		{#if showMetrics}
			<div class="metrics">
				<span>Nodes: {nodeCount}</span>
				<span>Mode: {layoutMode}</span>
			</div>
		{/if}
	</div>

	{#if isProcessing}
		<div class="processing-overlay">
			<div class="spinner"></div>
			<p>Processing evidence hierarchy...</p>
		</div>
	{/if}

	<div class="canvas-container">
		<canvas bind:this={canvasElement} {width} {height}></canvas>
	</div>
</div>

<style>
	.recursive-viz {
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		overflow: hidden;
		background: white;
		position: relative;
	}

	.viz-controls {
		display: flex;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
		align-items: center;
		flex-wrap: wrap;
	}

	.control-group {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.control-group label {
		font-weight: 500;
		font-size: 0.875rem;
		color: #374151;
	}

	.control-group select {
		padding: 0.375rem 0.5rem;
		border: 1px solid #d1d5db;
		border-radius: 0.25rem;
		background: white;
		font-size: 0.875rem;
	}

	.metrics {
		display: flex;
		gap: 1rem;
		font-size: 0.75rem;
		color: #6b7280;
		margin-left: auto;
	}

	.processing-overlay {
		position: absolute;
		inset: 0;
		background: rgba(255, 255, 255, 0.9);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		z-index: 10;
	}

	.spinner {
		width: 2.5rem;
		height: 2.5rem;
		border: 3px solid #e5e7eb;
		border-top-color: #3b82f6;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 0.75rem;
	}

	.processing-overlay p {
		color: #6b7280;
		font-size: 0.875rem;
	}

	.canvas-container {
		overflow: auto;
	}

	canvas {
		display: block;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>