<!-- Evidence Canvas Editor — Fabric.js-based canvas for evidence visualization -->
<!-- Session 64: Replaced severely corrupted/doubled 570-line file with clean placeholder -->
<!-- Dependencies: fabric.js (not installed), qdrant-service, rabbitmq-client (excluded) -->
<!-- TODO: Wire to real Fabric.js canvas when dependency is added to project -->
<script lang="ts">
	interface EvidenceItem {
		id: string;
		caseId: string;
		title: string;
		description?: string;
		evidenceType: string;
		fileUrl?: string;
		fileName?: string;
		aiTags?: string[];
	}

	interface Props {
		reportId?: string;
		evidence?: EvidenceItem[];
		width?: number;
		height?: number;
		readOnly?: boolean;
	}

	let {
		reportId = '',
		evidence = [] as EvidenceItem[],
		width = 1400,
		height = 900,
		readOnly = false
	}: Props = $props();

	let canvasElement: HTMLCanvasElement | undefined = $state();
	let isInitialized = $state(false);

	$effect(() => {
		if (canvasElement && !isInitialized) {
			const ctx = canvasElement.getContext('2d');
			if (ctx) {
				ctx.fillStyle = '#f8fafc';
				ctx.fillRect(0, 0, width, height);
				ctx.fillStyle = '#94a3b8';
				ctx.font = '16px system-ui, sans-serif';
				ctx.textAlign = 'center';
				ctx.fillText(
					'Evidence Canvas Editor — Fabric.js integration pending',
					width / 2,
					height / 2 - 20
				);
				ctx.font = '13px system-ui, sans-serif';
				ctx.fillText(
					`${evidence.length} evidence items available | Report: ${reportId || 'none'}`,
					width / 2,
					height / 2 + 10
				);
				if (readOnly) {
					ctx.fillText('(Read-only mode)', width / 2, height / 2 + 35);
				}
				isInitialized = true;
			}
		}
	});
</script>

<div class="canvas-editor">
	<div class="canvas-toolbar">
		<span class="toolbar-title">Evidence Canvas</span>
		<span class="toolbar-info">{evidence.length} items</span>
	</div>
	<div class="canvas-container">
		<canvas bind:this={canvasElement} {width} {height}></canvas>
	</div>
</div>

<style>
	.canvas-editor {
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		overflow: hidden;
		background: white;
	}

	.canvas-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 1rem;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	.toolbar-title {
		font-weight: 600;
		font-size: 0.875rem;
	}

	.toolbar-info {
		font-size: 0.75rem;
		color: #6b7280;
	}

	.canvas-container {
		overflow: auto;
	}

	canvas {
		display: block;
	}
</style>
