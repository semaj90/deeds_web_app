<!-- Unified Canvas Integration — Combines evidence and drawing canvases -->
<!-- Session 64: Replaced broken imports (EvidenceCanvas, CanvasBoard don't exist) with clean placeholder -->
<script lang="ts">
	interface Props {
		caseId?: string;
		enableEvidenceCanvas?: boolean;
		splitView?: boolean;
		initialMode?: 'evidence' | 'drawing' | 'both';
	}

	let {
		caseId = '',
		enableEvidenceCanvas = true,
		splitView = true,
		initialMode = 'both'
	}: Props = $props();

	let activeMode = $state(initialMode);
</script>

<div class="unified-canvas">
	<div class="canvas-header">
		<h3>Canvas Integration</h3>
		<div class="mode-tabs">
			<button
				class="mode-tab"
				class:active={activeMode === 'evidence'}
				onclick={() => (activeMode = 'evidence')}
			>
				Evidence
			</button>
			<button
				class="mode-tab"
				class:active={activeMode === 'drawing'}
				onclick={() => (activeMode = 'drawing')}
			>
				Drawing
			</button>
			<button
				class="mode-tab"
				class:active={activeMode === 'both'}
				onclick={() => (activeMode = 'both')}
			>
				Split View
			</button>
		</div>
	</div>

	<div class="canvas-body" class:split={activeMode === 'both' && splitView}>
		{#if activeMode === 'evidence' || activeMode === 'both'}
			<div class="canvas-pane">
				<div class="placeholder-canvas">
					<p>Evidence Canvas</p>
					<p class="sub">Case: {caseId || 'none'}</p>
					<p class="sub">Canvas integration pending — requires Fabric.js</p>
				</div>
			</div>
		{/if}
		{#if activeMode === 'drawing' || activeMode === 'both'}
			<div class="canvas-pane">
				<div class="placeholder-canvas">
					<p>Drawing Canvas</p>
					<p class="sub">Freeform drawing and annotation</p>
					<p class="sub">Canvas integration pending — requires Fabric.js</p>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.unified-canvas {
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		overflow: hidden;
		background: white;
	}

	.canvas-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	.canvas-header h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.mode-tabs {
		display: flex;
		gap: 0.25rem;
	}

	.mode-tab {
		padding: 0.375rem 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 0.25rem;
		background: white;
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.mode-tab:hover {
		background: #f3f4f6;
	}

	.mode-tab.active {
		background: #2563eb;
		color: white;
		border-color: #2563eb;
	}

	.canvas-body {
		min-height: 300px;
	}

	.canvas-body.split {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}

	.canvas-pane {
		border-right: 1px solid #e5e7eb;
	}

	.canvas-pane:last-child {
		border-right: none;
	}

	.placeholder-canvas {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 300px;
		color: #6b7280;
		text-align: center;
		padding: 2rem;
	}

	.placeholder-canvas p {
		margin: 0.25rem 0;
		font-weight: 500;
	}

	.placeholder-canvas .sub {
		font-size: 0.875rem;
		font-weight: 400;
		color: #9ca3af;
	}
</style>
