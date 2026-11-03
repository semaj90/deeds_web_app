<script lang="ts">
	import { Dialog } from 'bits-ui';
	import DepthReliefViewer, { type DepthSourceMode, type AnnotationScreenPositions } from './DepthReliefViewer.svelte';
	import { analyzeStoredEvidenceImage, requestEvidenceUpscale } from './evidence-image-tools.js';

	let {
		open = $bindable(false),
		imageUrl,
		depthUrl = null,
		evidenceId = null,
		title = 'Evidence',
		embedded = false
	}: { open?: boolean; imageUrl: string | null; depthUrl?: string | null; evidenceId?: string | null; title?: string; embedded?: boolean } = $props();

	// Upscaled result replaces the source for the relief view (blob URL, never persisted).
	let upscaledUrl = $state<string | null>(null);
	let upscaleInfo = $state('');
	let analysisText = $state('');
	let busy = $state<'' | 'analyze' | 'upscale'>('');
	let actionError = $state('');
	const effectiveUrl = $derived(upscaledUrl ?? imageUrl);
	type EvidenceMarker = { id: string; number: number; x: number; y: number; label: string; note: string };
	let toolMode = $state<'orbit' | 'marker'>('orbit');
	let markerMotion = $state(true);
	let markers = $state<EvidenceMarker[]>([]);
	let selectedMarkerId = $state<string | null>(null);
	let markerScreenPositions = $state<Record<string, { left: number; top: number }>>({});
	let draggingMarkerId = $state<string | null>(null);
	// What the relief is actually built from. Never describe a brightness guess as stored depth.
	let depthMode = $state<DepthSourceMode>('DEPTH_UNAVAILABLE');
	const depthLabel = $derived(
		depthMode === 'STORED_MONOCULAR_DEPTH'
			? 'Relief from a stored monocular depth estimate bound to this source file. Derived 2.5D, not a measurement.'
			: depthMode === 'BRIGHTNESS_PREVIEW'
				? 'Preview only: depth is guessed from image brightness, not stored or measured. Treat it as a visual aid.'
				: 'Depth unavailable; the image is shown flat.'
	);
	// Bumped on close/reset so a late analyze/upscale response cannot land in a closed or different viewer.
	let actionToken = 0;
	const selectedMarker = $derived(markers.find((marker) => marker.id === selectedMarkerId) ?? null);

	function addMarker(x: number, y: number, place?: (marker: EvidenceMarker) => void) {
		const number = markers.reduce((max, marker) => Math.max(max, marker.number), 0) + 1;
		const marker: EvidenceMarker = {
			id: crypto.randomUUID(),
			number,
			x,
			y,
			label: `Marker ${number}`,
			note: ''
		};
		markers = [...markers, marker];
		selectedMarkerId = marker.id;
		place?.(marker);
	}

	function updateSelectedMarker(field: 'label' | 'note', value: string) {
		if (!selectedMarkerId) return;
		markers = markers.map((marker) => marker.id === selectedMarkerId ? { ...marker, [field]: value } : marker);
	}

	/** Targeted delete: removes exactly the marker with this id, whichever one is selected. */
	function removeMarker(id: string) {
		if (!markers.some((marker) => marker.id === id)) return;
		markers = markers.filter((marker) => marker.id !== id);
		if (selectedMarkerId === id) selectedMarkerId = markers.at(-1)?.id ?? null;
		markerScreenPositions = Object.fromEntries(Object.entries(markerScreenPositions).filter(([markerId]) => markerId !== id));
	}

	/** Undo the most recent marker (history-style), distinct from removing a selected one. */
	function undoMarker() {
		const last = markers.at(-1);
		if (last) removeMarker(last.id);
	}

	function clearMarkers() {
		markers = [];
		selectedMarkerId = null;
		markerScreenPositions = {};
	}

	function chooseMarkerTool(mode: 'orbit' | 'marker') {
		toolMode = mode;
	}

	function startMarkerDrag(event: PointerEvent, markerId: string) {
		event.preventDefault();
		event.stopPropagation();
		selectedMarkerId = markerId;
		draggingMarkerId = markerId;
		(event.currentTarget as HTMLButtonElement).setPointerCapture(event.pointerId);
	}

	function stopMarkerDrag() {
		draggingMarkerId = null;
	}

	function handleDepthSource(mode: DepthSourceMode) {
		depthMode = mode;
	}

	function handleViewerLoadState(state: 'loading' | 'ready' | 'error') {
		status = state;
	}

	function handleViewerShortcut(key: 'marker' | 'orbit' | 'delete' | 'deselect') {
		if (key === 'marker') chooseMarkerTool('marker');
		else if (key === 'orbit') chooseMarkerTool('orbit');
		else if (key === 'delete' && selectedMarkerId) removeMarker(selectedMarkerId);
		else if (key === 'deselect') selectedMarkerId = null;
	}

	function handleMarkerMove(id: string, x: number, y: number) {
		markers = markers.map((marker) => marker.id === id ? { ...marker, x, y } : marker);
	}

	function resetResults() {
		actionToken++;
		depthMode = 'DEPTH_UNAVAILABLE';
		status = 'idle';
		if (upscaledUrl) URL.revokeObjectURL(upscaledUrl);
		upscaledUrl = null;
		upscaleInfo = '';
		analysisText = '';
		actionError = '';
		busy = '';
		clearMarkers();
		toolMode = 'orbit';
		draggingMarkerId = null;
	}

	$effect(() => {
		if (!open) resetResults();
	});

	async function runAnalyze() {
		if (!evidenceId || busy) return;
		busy = 'analyze';
		const token = actionToken;
		actionError = '';
		try {
			const result = await analyzeStoredEvidenceImage(evidenceId);
			if (token !== actionToken) return; // viewer closed or reset while waiting
			analysisText = result.analysis.summary || 'Analysis finished with no summary.';
		} catch (error) {
			actionError = error instanceof Error && error.message.includes('VLM not in VISION mode')
				? 'Vision model is not in VISION mode. Start it from the VS Code task, then retry.'
				: error instanceof Error ? error.message : 'Analysis request failed.';
		} finally {
			if (token === actionToken) busy = '';
		}
	}

	async function runUpscale(scale: 2 | 4) {
		if (!evidenceId || busy) return;
		busy = 'upscale';
		const token = actionToken;
		actionError = '';
		try {
			const { blob, dimensions } = await requestEvidenceUpscale(evidenceId, scale);
			if (token !== actionToken) return; // no blob URL for a closed or reset viewer
			if (upscaledUrl) URL.revokeObjectURL(upscaledUrl);
			upscaledUrl = URL.createObjectURL(blob);
			upscaleInfo = `${dimensions ?? 'dimensions not reported'} (Lanczos resampling, no added detail)`;
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Upscale request failed.';
		} finally {
			if (token === actionToken) busy = '';
		}
	}

	let depthScale = $state(0.35);
	let wire = $state(false);
	let status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
</script>

{#snippet reliefWorkspace()}
			<div class="e3d-annotation-bar" role="toolbar" aria-label="Image annotation tools">
				<div class="e3d-tool-group" aria-label="Canvas tools">
					<button class="e3d-btn" aria-label="Orbit" class:active={toolMode === 'orbit'} aria-pressed={toolMode === 'orbit'} title="Orbit and inspect the relief (O)" onclick={() => chooseMarkerTool('orbit')}>Orbit <kbd aria-hidden="true">O</kbd></button>
					<button class="e3d-btn" aria-label="Place marker" class:active={toolMode === 'marker'} aria-pressed={toolMode === 'marker'} title="Place a pin on the relief (M)" onclick={() => chooseMarkerTool('marker')}>＋ Place marker <kbd aria-hidden="true">M</kbd></button>
				</div>
				<span class="e3d-marker-count" aria-live="polite"><span class="e3d-count-dot"></span>{markers.length} {markers.length === 1 ? 'marker' : 'markers'} <span>· temporary</span></span>
				<div class="e3d-tool-group" aria-label="Marker history">
					<button class="e3d-btn" disabled={markers.length === 0} title="Remove the most recently placed pin" onclick={undoMarker}>Undo</button>
					<button class="e3d-btn" disabled={markers.length === 0} title="Clear all temporary pins" onclick={clearMarkers}>Clear pins</button>
				</div>
				<button class="e3d-btn e3d-motion-toggle" aria-label="Animate marker pins" aria-pressed={markerMotion} title="Toggle the marker pulse animation" onclick={() => (markerMotion = !markerMotion)}>
					{markerMotion ? 'Pin motion on' : 'Pin motion off'}
				</button>
				{#if toolMode === 'marker'}<span class="e3d-instruction" aria-live="polite">Click surface to pin · Enter to place · drag a pin to reposition · Del removes selection</span>{/if}
			</div>
			<div class="e3d-stage" data-status={status}>
				{#if selectedMarker}
					<div class="e3d-marker-editor" aria-label="Selected marker details">
						<label>Marker {selectedMarker.number}<input aria-label="Marker label" value={selectedMarker.label} oninput={(event) => updateSelectedMarker('label', (event.currentTarget as HTMLInputElement).value)} /></label>
						<label>Note<input aria-label="Marker note" value={selectedMarker.note} oninput={(event) => updateSelectedMarker('note', (event.currentTarget as HTMLInputElement).value)} /></label>
						<button class="e3d-btn" data-testid="e3d-remove-marker" onclick={() => removeMarker(selectedMarker.id)}>Remove</button>
					</div>
				{/if}
				<div class="e3d-marker-overlay" aria-label="Image source markers">
					{#each markers as marker (marker.id)}
						{#if markerScreenPositions[marker.id]}
							<button
								class="e3d-pin-label"
								class:selected={selectedMarkerId === marker.id}
								class:motion-disabled={!markerMotion}
								style={`left:${markerScreenPositions[marker.id].left}%;top:${markerScreenPositions[marker.id].top}%;`}
								aria-label={`Select ${marker.label || `Marker ${marker.number}`}`}
								aria-pressed={selectedMarkerId === marker.id}
				title={`${marker.note || marker.label} · drag to reposition`}
				onpointerdown={(event) => startMarkerDrag(event, marker.id)}
				onpointerup={stopMarkerDrag}
				onpointercancel={stopMarkerDrag}
								onclick={() => (selectedMarkerId = marker.id)}
							>{marker.number}</button>
						{/if}
					{/each}
				</div>
				{#if effectiveUrl}
					{#key `${effectiveUrl}:${depthUrl ?? ''}`}
						<DepthReliefViewer
							imageUrl={effectiveUrl}
							{depthUrl}
							relief={depthScale}
							wireframe={wire}
							showToolbar={false}
							annotations={markers.map(({ id, x, y }) => ({ id, x, y }))}
							placementEnabled={toolMode === 'marker'}
							draggingAnnotationId={draggingMarkerId}
							onDepthSource={handleDepthSource}
							onLoadState={handleViewerLoadState}
							onAnnotationPositions={(positions: AnnotationScreenPositions) => (markerScreenPositions = positions)}
							onPlaceAnnotation={(x: number, y: number) => addMarker(x, y)}
							onMoveAnnotation={handleMarkerMove}
							onToolShortcut={handleViewerShortcut}
						/>
					{/key}
				{/if}
				{#if status === 'loading'}<p class="e3d-msg">Building relief…</p>{/if}
			</div>

			<footer class="e3d-foot">
				<label>
					Depth
					<input type="range" min="0" max="0.8" step="0.01" bind:value={depthScale} />
				</label>
				<label class="e3d-check">
					<input type="checkbox" bind:checked={wire} /> Wireframe
				</label>
				{#if evidenceId}
					<button class="e3d-btn" data-testid="e3d-analyze" disabled={!!busy} onclick={runAnalyze}>
						{busy === 'analyze' ? 'Analyzing…' : 'Analyze image'}
					</button>
					<button class="e3d-btn" data-testid="e3d-upscale-2" disabled={!!busy} onclick={() => runUpscale(2)}>
						{busy === 'upscale' ? 'Upscaling…' : 'Upscale 2x'}
					</button>
					<button class="e3d-btn" data-testid="e3d-upscale-4" disabled={!!busy} onclick={() => runUpscale(4)}>
						Upscale 4x
					</button>
				{/if}
			</footer>
			{#if actionError}<p class="e3d-result e3d-err" data-testid="e3d-error">{actionError}</p>{/if}
			{#if upscaleInfo}<p class="e3d-result" data-testid="e3d-upscale-info">Upscaled to {upscaleInfo}</p>{/if}
			{#if analysisText}<p class="e3d-result" data-testid="e3d-analysis"><strong>AI suggestion · review required · not a finding.</strong> {analysisText}</p>{/if}
		{/snippet}

		{#if embedded}
			<section class="e3d-content e3d-embedded" aria-label="Evidence relief workspace">
				<header class="e3d-head">
					<h2 class="e3d-title">{title}</h2>
					<p class="e3d-sub">{depthLabel}</p>
				</header>
				{@render reliefWorkspace()}
			</section>
		{:else}
			<Dialog.Root bind:open>
				<Dialog.Portal>
					<Dialog.Overlay class="e3d-overlay" />
					<Dialog.Content class="e3d-content">
						<header class="e3d-head">
							<Dialog.Title class="e3d-title">{title}</Dialog.Title>
							<Dialog.Description class="e3d-sub">{depthLabel}</Dialog.Description>
							<Dialog.Close class="e3d-close" aria-label="Close">×</Dialog.Close>
						</header>
						{@render reliefWorkspace()}
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
		{/if}

<style>
	:global(.e3d-overlay) {
		position: fixed;
		inset: 0;
		background: rgba(6, 8, 14, 0.72);
		backdrop-filter: blur(3px);
		z-index: 80;
	}
	:global(.e3d-content) {
		position: fixed;
		z-index: 81;
		inset: 5vh 5vw;
		max-width: 1100px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		background: #0c0f16;
		color: #e8ecf4;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 12px;
		overflow: hidden;
	}
	:global(.e3d-content.e3d-embedded) {
		position: relative;
		inset: auto;
		z-index: auto;
		width: 100%;
		height: 100%;
		max-width: none;
		margin: 0;
		border-radius: 8px;
	}
	.e3d-head {
		position: relative;
		padding: 14px 52px 10px 18px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}
	:global(.e3d-title) {
		font-size: 15px;
		font-weight: 600;
		letter-spacing: 0.04em;
	}
	:global(.e3d-sub) {
		font-size: 11px;
		opacity: 0.55;
		margin-top: 2px;
	}
	:global(.e3d-close) {
		position: absolute;
		top: 8px;
		right: 12px;
		font-size: 24px;
		line-height: 1;
		background: none;
		border: 0;
		color: inherit;
		cursor: pointer;
	}
	.e3d-stage {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		background: radial-gradient(ellipse at center, #1a2030 0%, #07090e 100%);
	}
	.e3d-annotation-bar {
		position: relative;
		z-index: 5;
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		flex: 0 0 auto;
		min-height: 54px;
		padding: 8px 14px;
		border-bottom: 1px solid rgba(212, 199, 163, 0.2);
		background: linear-gradient(180deg, rgba(31, 36, 47, 0.98), rgba(18, 22, 31, 0.98));
		box-shadow: 0 5px 18px rgba(0, 0, 0, 0.22);
	}
	.e3d-tool-group {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px;
		border: 1px solid rgba(255, 255, 255, 0.09);
		border-radius: 9px;
		background: rgba(3, 7, 13, 0.38);
	}
	.e3d-annotation-bar .e3d-btn {
		min-height: 32px;
		padding: 6px 10px;
		border-color: transparent;
		border-radius: 6px;
		background: transparent;
		white-space: nowrap;
	}
	.e3d-annotation-bar .e3d-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.12);
	}
	.e3d-annotation-bar .e3d-btn.active {
		color: #fff4d1;
		border-color: rgba(232, 194, 92, 0.52);
		background: linear-gradient(180deg, rgba(154, 116, 33, 0.42), rgba(103, 76, 22, 0.34));
		box-shadow: inset 0 1px rgba(255, 244, 209, 0.12), 0 1px 5px rgba(0, 0, 0, 0.2);
	}
	.e3d-annotation-bar .e3d-tool-group[aria-label="Marker history"] .e3d-btn {
		color: #c7ccd6;
	}
	.e3d-motion-toggle[aria-pressed="true"] { color: #f0d58a; border-color: rgba(212, 181, 104, 0.3); }
	.e3d-motion-toggle[aria-pressed="false"] { color: #aeb5c2; }
	.e3d-marker-editor {
		position: absolute;
		left: 12px;
		bottom: 12px;
		z-index: 4;
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		padding: 8px 14px;
		max-width: calc(100% - 24px);
		border: 1px solid rgba(212, 199, 163, 0.22);
		border-radius: 10px;
		background: rgba(10, 15, 24, 0.9);
		backdrop-filter: blur(12px);
	}
	.e3d-annotation-bar .active,
	.e3d-pin-label.selected {
		border-color: #7ee7ff;
		box-shadow: 0 0 0 2px rgba(126, 231, 255, 0.24), 0 0 18px rgba(126, 231, 255, 0.36);
	}
	.e3d-marker-count,
	.e3d-instruction {
		font-size: 11px;
		color: #c8b991;
	}
	.e3d-marker-count { display: inline-flex; align-items: center; gap: 7px; min-height: 30px; padding: 0 11px; border: 1px solid rgba(212, 199, 163, 0.16); border-radius: 999px; background: rgba(255, 255, 255, 0.045); font-variant-numeric: tabular-nums; }
	.e3d-marker-count > span:last-child { opacity: 0.65; }
	.e3d-count-dot { width: 7px; height: 7px; border-radius: 50%; background: #c59e2b; box-shadow: 0 0 9px rgba(197, 158, 43, 0.75); }
	kbd { display: inline-grid; min-width: 17px; height: 17px; place-items: center; padding: 0 4px; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 4px; background: rgba(0, 0, 0, 0.2); color: #e6d8b7; font: 10px ui-monospace, monospace; }
	.e3d-instruction {
		margin-left: auto;
		padding: 6px 10px;
		border: 1px solid rgba(197, 158, 43, 0.3);
		border-radius: 7px;
		background: rgba(197, 158, 43, 0.09);
		line-height: 1.35;
	}
	.e3d-marker-editor {
		background: #171d28;
	}
	.e3d-marker-editor label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11px;
		color: #c8b991;
	}
	.e3d-marker-editor input {
		width: min(240px, 24vw);
		padding: 5px 8px;
		color: #f2ead7;
		background: #0b1018;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 5px;
	}
	.e3d-marker-overlay {
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
		overflow: hidden;
	}
	.e3d-pin-label {
		position: absolute;
		width: 34px;
		height: 34px;
		transform: translate(-50%, calc(-100% - 14px));
		border: 1px solid #f4d477;
		border-radius: 50%;
		color: #fff8df;
		background: radial-gradient(circle at 35% 28%, #735829, #241e14 72%);
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
		pointer-events: auto;
		box-shadow: 0 0 0 3px rgba(240, 200, 94, 0.18), 0 0 18px rgba(240, 200, 94, 0.42), inset 0 0 0 2px rgba(240, 200, 94, 0.28);
		animation: evidence-pin-pulse 2.4s ease-in-out infinite;
	}
	.e3d-pin-label.motion-disabled { animation: none; }
	.e3d-pin-label::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 100%;
		width: 2px;
		height: 15px;
		transform: translateX(-50%);
		background: linear-gradient(#f4d477, rgba(244, 212, 119, 0.18));
		filter: drop-shadow(0 0 3px rgba(240, 200, 94, 0.7));
	}
	.e3d-pin-label::before {
		content: '';
		position: absolute;
		left: 50%;
		bottom: -19px;
		width: 8px;
		height: 8px;
		transform: translateX(-50%);
		border: 1px solid rgba(255, 242, 199, 0.95);
		border-radius: 50%;
		background: #f4d477;
		box-shadow: 0 0 9px rgba(240, 200, 94, 0.85);
	}
	@keyframes evidence-pin-pulse {
		0%, 100% { box-shadow: 0 0 0 3px rgba(240, 200, 94, 0.18), 0 0 18px rgba(240, 200, 94, 0.32), inset 0 0 0 2px rgba(240, 200, 94, 0.28); }
		50% { box-shadow: 0 0 0 8px rgba(240, 200, 94, 0), 0 0 22px rgba(240, 200, 94, 0.52), inset 0 0 0 2px rgba(240, 200, 94, 0.4); }
	}
	@media (prefers-reduced-motion: reduce) {
		.e3d-pin-label { animation: none; }
	}
	.e3d-stage :global(canvas) {
		width: 100%;
		height: 100%;
		display: block;
		cursor: grab;
	}
	.e3d-msg {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-size: 13px;
		opacity: 0.7;
		pointer-events: none;
	}
	.e3d-foot {
		display: flex;
		align-items: center;
		gap: 18px;
		padding: 10px 18px;
		font-size: 12px;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}
	.e3d-foot label {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.e3d-btn {
		padding: 4px 10px;
		font-size: 12px;
		color: inherit;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.18);
		border-radius: 6px;
		cursor: pointer;
		transition: background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
	}
	.e3d-btn:hover:not(:disabled) { background: rgba(197, 158, 43, 0.16); border-color: rgba(212, 199, 163, 0.5); }
	.e3d-btn:active:not(:disabled) { transform: translateY(1px); }
	.e3d-btn:focus-visible, .e3d-pin-label:focus-visible { outline: 2px solid #7ee7ff; outline-offset: 2px; }
	.e3d-btn:disabled { opacity: 0.4; cursor: not-allowed; }
	@media (max-width: 680px) {
		.e3d-annotation-bar { gap: 7px; padding: 7px 9px; }
		.e3d-tool-group { gap: 2px; }
		.e3d-annotation-bar .e3d-btn { padding-inline: 8px; }
		.e3d-instruction { flex-basis: 100%; margin-left: 0; }
		.e3d-marker-count { margin-left: auto; }
		.e3d-foot { flex-wrap: wrap; gap: 10px; }
	}
	.e3d-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.e3d-result {
		margin: 0;
		padding: 8px 18px 12px;
		font-size: 12px;
		max-height: 120px;
		overflow: auto;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}
	.e3d-err {
		color: #ff9b9b;
	}
</style>
