<script lang="ts">
	type Tool = 'select' | 'evidence' | 'connection' | 'note' | 'marker';

	let {
		activeTool = $bindable('select'),
		snapOn = $bindable(false),
		canUndo = false,
		canRedo = false,
		onUndo,
		onRedo,
		onZoomIn,
		onZoomOut,
		onFit,
		onExportPNG,
		onExportCSV
	}: {
		activeTool?: Tool;
		snapOn?: boolean;
		canUndo?: boolean;
		canRedo?: boolean;
		onUndo: () => void;
		onRedo: () => void;
		onZoomIn: () => void;
		onZoomOut: () => void;
		onFit: () => void;
		onExportPNG: () => void;
		onExportCSV: () => void;
	} = $props();

	// Inline lucide-style paths: independent of the UnoCSS icon pipeline, which renders blank on this board.
	const ICONS: Record<string, string> = {
		'mouse-pointer-2': '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/>',
		'file-plus': '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/>',
		'git-branch': '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
		'sticky-note': '<path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z"/><path d="M15 3v6h6"/>',
		'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
		undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
		redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
		'zoom-in': '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/>',
		'zoom-out': '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/>',
		maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
		grid: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/>'
	};

	const tools: { id: Tool; label: string; key: string; icon: string }[] = [
		{ id: 'select', label: 'Select', key: 'V', icon: 'mouse-pointer-2' },
		{ id: 'evidence', label: 'Evidence', key: 'E', icon: 'file-plus' },
		{ id: 'connection', label: 'Link', key: 'C', icon: 'git-branch' },
		{ id: 'note', label: 'Note', key: 'N', icon: 'sticky-note' },
		{ id: 'marker', label: 'Marker', key: 'M', icon: 'map-pin' }
	];
</script>

{#snippet ico(name: string)}
	<svg class="bt-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html ICONS[name]}</svg>
{/snippet}

<div class="bt-bar" role="toolbar" aria-label="Board tools" data-testid="board-top-toolbar">
	<div class="bt-group" role="group" aria-label="Tools">
		{#each tools as t (t.id)}
			<button
				class="bt-btn"
				class:active={activeTool === t.id}
				aria-pressed={activeTool === t.id}
				title="{t.label} ({t.key})"
				data-testid="bt-tool-{t.id}"
				onclick={() => (activeTool = t.id)}
			>
				{@render ico(t.icon)}
			</button>
		{/each}
	</div>

	<span class="bt-sep"></span>

	<div class="bt-group" role="group" aria-label="History">
		<button class="bt-btn" title="Undo (Ctrl+Z)" disabled={!canUndo} data-testid="bt-undo" onclick={onUndo}>
			{@render ico("undo")}
		</button>
		<button class="bt-btn" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} data-testid="bt-redo" onclick={onRedo}>
			{@render ico("redo")}
		</button>
	</div>

	<span class="bt-sep"></span>

	<div class="bt-group" role="group" aria-label="View">
		<button class="bt-btn" title="Zoom out" data-testid="bt-zoom-out" onclick={onZoomOut}>
			{@render ico("zoom-out")}
		</button>
		<button class="bt-btn" title="Zoom in" data-testid="bt-zoom-in" onclick={onZoomIn}>
			{@render ico("zoom-in")}
		</button>
		<button class="bt-btn" title="Zoom to fit" data-testid="bt-fit" onclick={onFit}>
			{@render ico("maximize")}
		</button>
		<button
			class="bt-btn"
			class:active={snapOn}
			aria-pressed={snapOn}
			title="Snap to grid"
			data-testid="bt-snap"
			onclick={() => (snapOn = !snapOn)}
		>
			{@render ico("grid")}
		</button>
	</div>

	<span class="bt-sep"></span>

	<div class="bt-group" role="group" aria-label="Export">
		<button class="bt-btn bt-text" title="Export board as PNG" data-testid="bt-export-png" onclick={onExportPNG}>PNG</button>
		<button class="bt-btn bt-text" title="Export nodes and edges as CSV" data-testid="bt-export-csv" onclick={onExportCSV}>CSV</button>
	</div>
</div>

<style>
	.bt-bar {
		position: absolute;
		top: 10px;
		left: 12px;
		z-index: 20;
		max-width: calc(100% - 210px);
		flex-wrap: wrap;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 6px;
		background: rgba(17, 20, 28, 0.92);
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 10px;
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
		backdrop-filter: blur(6px);
	}
	.bt-group {
		display: flex;
		gap: 2px;
	}
	.bt-sep {
		width: 1px;
		height: 20px;
		background: rgba(255, 255, 255, 0.14);
	}
	.bt-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 30px;
		height: 30px;
		padding: 0 6px;
		color: #e8ecf4;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 7px;
		cursor: pointer;
	}
	.bt-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.1);
	}
	.bt-btn:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.bt-btn.active {
		background: rgba(234, 179, 8, 0.22);
		border-color: rgba(234, 179, 8, 0.7);
		color: #fde68a;
	}
	.bt-text {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
	}
	.bt-btn:focus-visible {
		outline: 2px solid #93c5fd;
		outline-offset: 1px;
	}
</style>
