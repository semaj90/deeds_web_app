<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { browser } from '$app/environment';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import { analyzeStoredEvidenceImage, requestEvidenceUpscale } from './evidence-image-tools.js';
	import { buildReliefGrid, heightAt, resampleDepth, sampleDepthGrid, type ReliefGrid } from './relief-grid.js';

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
	let markers = $state<EvidenceMarker[]>([]);
	let selectedMarkerId = $state<string | null>(null);
	let markerScreenPositions = $state<Record<string, { left: number; top: number }>>({});
	let clearScenePins: (() => void) | null = null;
	let applySelectedMarker: ((id: string | null) => void) | null = null;
	let applyToolMode: ((mode: 'orbit' | 'marker') => void) | null = null;
	let placeSceneMarker: ((clientX: number, clientY: number) => void) | null = null;
	let moveScenePin: ((id: string, clientX: number, clientY: number) => void) | null = null;
	let draggingMarkerId = $state<string | null>(null);
	// What the relief is actually built from. Never describe a brightness guess as stored depth.
	type DepthMode = 'STORED_MONOCULAR_DEPTH' | 'BRIGHTNESS_PREVIEW' | 'DEPTH_UNAVAILABLE';
	let depthMode = $state<DepthMode>('DEPTH_UNAVAILABLE');
	const depthLabel = $derived(
		depthMode === 'STORED_MONOCULAR_DEPTH'
			? 'Relief from a stored monocular depth estimate bound to this source file. Derived 2.5D, not a measurement.'
			: depthMode === 'BRIGHTNESS_PREVIEW'
				? 'Preview only: depth is guessed from image brightness, not stored or measured. Treat it as a visual aid.'
				: 'Depth unavailable; the image is shown flat.'
	);
	let webglFailed = $state(false);
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
		removeScenePin?.(id);
	}

	/** Undo the most recent marker (history-style), distinct from removing a selected one. */
	function undoMarker() {
		const last = markers.at(-1);
		if (last) removeMarker(last.id);
	}

	let removeScenePin: ((id: string) => void) | null = null;

	function clearMarkers() {
		markers = [];
		selectedMarkerId = null;
		markerScreenPositions = {};
		clearScenePins?.();
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

	function dragMarker(event: PointerEvent) {
		if (!draggingMarkerId) return;
		event.preventDefault();
		moveScenePin?.(draggingMarkerId, event.clientX, event.clientY);
	}

	function stopMarkerDrag() {
		draggingMarkerId = null;
	}

	function handleStageClick(event: MouseEvent) {
		if (toolMode !== 'marker' || event.button !== 0) return;
		event.preventDefault();
		placeSceneMarker?.(event.clientX, event.clientY);
	}

	function resetResults() {
		actionToken++;
		depthMode = 'DEPTH_UNAVAILABLE';
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

	let host = $state<HTMLDivElement | null>(null);
	let depthScale = $state(0.35);
	let wire = $state(false);
	let status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let note = $state('');

	// Handles updated live without rebuilding the scene.
	let applyScale: ((v: number) => void) | null = null;
	let applyWire: ((v: boolean) => void) | null = null;

	$effect(() => applyScale?.(depthScale));
	$effect(() => applyWire?.(wire));
	$effect(() => applySelectedMarker?.(selectedMarkerId));
	$effect(() => applyToolMode?.(toolMode));

	/** Smooth pseudo-depth from luminance. Heavy blur keeps it a surface, not noise. */
	function buildDepth(img: HTMLImageElement): HTMLCanvasElement {
		const w = 256;
		const h = Math.max(16, Math.round((256 * img.naturalHeight) / img.naturalWidth));
		const c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		const ctx = c.getContext('2d')!;
		ctx.filter = 'grayscale(1) blur(6px) contrast(1.15)';
		ctx.drawImage(img, 0, 0, w, h);
		ctx.filter = 'none';
		// Gentle radial falloff so edges recede and the subject reads as a relief.
		const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.75);
		g.addColorStop(0, 'rgba(255,255,255,0.18)');
		g.addColorStop(1, 'rgba(0,0,0,0.45)');
		ctx.globalCompositeOperation = 'overlay';
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, w, h);
		return c;
	}

	function loadImage(url: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => resolve(img);
			img.onerror = () => reject(new Error('image load failed'));
			img.src = url;
		});
	}

	$effect(() => {
		if (!browser || !open || !host || !effectiveUrl) return;
		const el = host;
		const url = effectiveUrl;
		let disposed = false;
		let raf = 0;
		status = 'loading';
		note = '';

		let renderer: THREE.WebGLRenderer;
		try {
			renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		} catch {
			webglFailed = true;
			status = 'error';
			note = 'WebGL is unavailable; showing the flat evidence image instead.';
			return;
		}
		webglFailed = false;
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		el.appendChild(renderer.domElement);
		const onContextLost = (event: Event) => {
			event.preventDefault();
			if (disposed) return;
			webglFailed = true;
			status = 'error';
			note = 'The GPU context was lost; close and reopen the viewer.';
		};
		renderer.domElement.addEventListener('webglcontextlost', onContextLost);
		let surface: { mesh: THREE.Mesh; grid: ReliefGrid; W: number; H: number } | null = null;
		let currentScale = 0;
		/** World position of a marker: ON the displaced surface at image coords (u,v), nudged out along +z. */
		function pinWorldPosition(u: number, v: number): THREE.Vector3 {
			if (!surface) return new THREE.Vector3();
			const z = heightAt(surface.grid, u, v, currentScale) + 0.02;
			return surface.mesh.localToWorld(new THREE.Vector3((u - 0.5) * surface.W, (0.5 - v) * surface.H, z));
		}
		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
		camera.position.set(0, 0, 3.2);

		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.enablePan = false;
		controls.minDistance = 1.8;
		controls.maxDistance = 5;
		controls.minPolarAngle = Math.PI * 0.3;
		controls.maxPolarAngle = Math.PI * 0.7;
		controls.minAzimuthAngle = -Math.PI * 0.35;
		controls.maxAzimuthAngle = Math.PI * 0.35;
		const disposables: { dispose(): void }[] = [renderer, controls];
		applyToolMode = (mode) => {
			controls.enabled = mode === 'orbit';
			renderer.domElement.style.cursor = mode === 'marker' ? 'crosshair' : 'grab';
		};
		applyToolMode(toolMode);

		const raycaster = new THREE.Raycaster();
		const pointer = new THREE.Vector2();
		const pinGeometry = new THREE.TorusGeometry(0.04, 0.006, 8, 28);
		const pinDotGeometry = new THREE.SphereGeometry(0.012, 12, 8);
		const pinGroups = new Map<string, { group: THREE.Group; ring: THREE.Mesh; ringMaterial: THREE.MeshBasicMaterial; u: number; v: number }>();
		const goldPinMaterial = new THREE.MeshBasicMaterial({ color: 0xc59e2b, transparent: true, opacity: 0.95, depthTest: false });
		const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xfff6df, depthTest: false });
		disposables.push(pinGeometry, pinDotGeometry, goldPinMaterial, dotMaterial);

		function createPin(marker: EvidenceMarker, mesh: THREE.Mesh, width: number, height: number) {
			if (pinGroups.has(marker.id)) return;
			const group = new THREE.Group();
			const ringMaterial = goldPinMaterial.clone();
			const ring = new THREE.Mesh(pinGeometry, ringMaterial);
			ring.renderOrder = 10;
			if (marker.id === selectedMarkerId) {
				ringMaterial.color.set(0x7ee7ff);
				ring.scale.setScalar(1.2);
			}
			const dot = new THREE.Mesh(pinDotGeometry, dotMaterial);
			dot.renderOrder = 11;
			group.add(ring, dot);
			group.position.copy(pinWorldPosition(marker.x, marker.y));
			scene.add(group);
			pinGroups.set(marker.id, { group, ring, ringMaterial, u: marker.x, v: marker.y });
		}
		clearScenePins = () => {
			for (const { group, ringMaterial } of pinGroups.values()) {
				scene.remove(group);
				ringMaterial.dispose();
			}
			pinGroups.clear();
		};
		removeScenePin = (id) => {
			const pin = pinGroups.get(id);
			if (!pin) return;
			scene.remove(pin.group);
			pin.ringMaterial.dispose();
			pinGroups.delete(id);
		};
		applySelectedMarker = (id) => {
			for (const [markerId, pin] of pinGroups) {
				pin.ringMaterial.color.set(markerId === id ? 0x7ee7ff : 0xc59e2b);
				pin.ring.scale.setScalar(markerId === id ? 1.2 : 1);
			}
		};

		scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.1));
		const key = new THREE.DirectionalLight(0xfff2dd, 1.6);
		key.position.set(-2, 2.5, 3);
		scene.add(key);

		function resize() {
			const w = el.clientWidth || 1;
			const h = el.clientHeight || 1;
			renderer.setSize(w, h, false);
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
		}
		const ro = new ResizeObserver(resize);
		ro.observe(el);
		resize();

		(async () => {
			try {
				const img = await loadImage(url);
				if (disposed) return;
				const aspect = img.naturalWidth / img.naturalHeight;
				const W = aspect >= 1 ? 2 : 2 * aspect;
				const H = aspect >= 1 ? 2 / aspect : 2;

				const tex = new THREE.Texture(img);
				tex.colorSpace = THREE.SRGBColorSpace;
				tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
				tex.needsUpdate = true;

				const cols = 160;
				const rows = Math.max(2, Math.round(cols / aspect));
				let samples: Float32Array | null = null;
				let mode: DepthMode = 'DEPTH_UNAVAILABLE';
				if (depthUrl) {
					try {
						const sourceBoundDepth = await loadImage(depthUrl);
						if (disposed) { tex.dispose(); return; }
						const depthAspect = sourceBoundDepth.naturalWidth / sourceBoundDepth.naturalHeight;
						if (Math.abs(depthAspect - aspect) > 0.015) throw new Error('Depth map aspect does not match source image');
						samples = sampleDepthGrid(sourceBoundDepth, cols, rows);
						mode = 'STORED_MONOCULAR_DEPTH';
						note = 'Source-revision-bound monocular depth · derived 2.5D, not measured 3D.';
					} catch {
						note = 'Source-bound depth map unavailable; showing estimated visual relief.';
					}
				}
				if (disposed) { tex.dispose(); return; }
				if (!samples) {
					if (!depthUrl) note = 'No source-bound depth map; relief is estimated from image brightness.';
					try {
						samples = sampleDepthGrid(buildDepth(img), cols, rows);
						mode = 'BRIGHTNESS_PREVIEW';
					} catch {
						note = 'Pixel access unavailable; depth relief is disabled.';
					}
				}
				depthMode = mode;
				const flat = !samples;
				const fineDepth = samples ?? new Float32Array((cols + 1) * (rows + 1)).fill(0.5);
				currentScale = flat ? 0 : depthScale;

				// One CPU-displaced geometry is rendered, lit AND raycast, so markers/picking match the visible surface.
				const grid = buildReliefGrid(W, H, cols, rows, fineDepth);
				grid.apply(currentScale);
				const mat = new THREE.MeshStandardMaterial({
					map: tex,
					roughness: 0.85,
					metalness: 0.0,
					side: THREE.DoubleSide
				});
				const mesh = new THREE.Mesh(grid.geometry, mat);
				scene.add(mesh);
				surface = { mesh, grid, W, H };
				for (const marker of markers) createPin(marker, mesh, W, H);
				placeSceneMarker = (clientX, clientY) => {
					const rect = renderer.domElement.getBoundingClientRect();
					pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
					raycaster.setFromCamera(pointer, camera);
					const hit = raycaster.intersectObject(mesh, false)[0];
					if (!hit) return;
					const local = mesh.worldToLocal(hit.point.clone());
					const x = THREE.MathUtils.clamp(local.x / W + 0.5, 0, 1);
					const y = THREE.MathUtils.clamp(0.5 - local.y / H, 0, 1);
					addMarker(x, y, (marker) => createPin(marker, mesh, W, H));
				};
				moveScenePin = (id, clientX, clientY) => {
					const rect = renderer.domElement.getBoundingClientRect();
					pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
					raycaster.setFromCamera(pointer, camera);
					const hit = raycaster.intersectObject(mesh, false)[0];
					if (!hit) return;
					const local = mesh.worldToLocal(hit.point.clone());
					const x = THREE.MathUtils.clamp(local.x / W + 0.5, 0, 1);
					const y = THREE.MathUtils.clamp(0.5 - local.y / H, 0, 1);
					markers = markers.map((marker) => marker.id === id ? { ...marker, x, y } : marker);
					const pin = pinGroups.get(id);
					if (pin) { pin.u = x; pin.v = y; pin.group.position.copy(pinWorldPosition(x, y)); }
				};

				// Thin coarse wireframe overlay (lines, not dots) displaced by the same map.
				const wcols = 18;
				const wrows = Math.max(2, Math.round(wcols / aspect));
				const wgrid = buildReliefGrid(W, H, wcols, wrows, resampleDepth(fineDepth, cols, rows, wcols, wrows), 0.004);
				wgrid.apply(currentScale);
				const wmat = new THREE.MeshStandardMaterial({
					color: 0x000000,
					emissive: 0xe8f4ff,
					wireframe: true,
					transparent: true,
					opacity: 0.22
				});
				const wmesh = new THREE.Mesh(wgrid.geometry, wmat);
				wmesh.visible = wire;
				scene.add(wmesh);

				disposables.push(grid.geometry, mat, wgrid.geometry, wmat, tex);

				applyScale = (v) => {
					currentScale = flat ? 0 : v;
					grid.apply(currentScale);
					wgrid.apply(currentScale);
					for (const pin of pinGroups.values()) pin.group.position.copy(pinWorldPosition(pin.u, pin.v));
				};
				applyWire = (v) => (wmesh.visible = v);
				status = 'ready';

				let screenUpdateTick = 0;
				const tick = () => {
					if (disposed) return;
					controls.update();
					renderer.render(scene, camera);
					if (pinGroups.size && ++screenUpdateTick % 2 === 0) {
						const positions: Record<string, { left: number; top: number }> = {};
						for (const [id, pin] of pinGroups) {
							const projected = pin.group.position.clone().project(camera);
							if (projected.z >= -1 && projected.z <= 1) {
								positions[id] = { left: ((projected.x + 1) / 2) * 100, top: ((1 - projected.y) / 2) * 100 };
							}
						}
						markerScreenPositions = positions;
					}
					raf = requestAnimationFrame(tick);
				};
				tick();
			} catch {
				if (!disposed) status = 'error';
			}
		})();

		return () => {
			disposed = true;
			cancelAnimationFrame(raf);
			renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
			ro.disconnect();
			applyScale = null;
			applyWire = null;
			clearScenePins?.();
			clearScenePins = null;
			removeScenePin = null;
			applySelectedMarker = null;
			applyToolMode = null;
			placeSceneMarker = null;
			moveScenePin = null;
			disposables.forEach((d) => d.dispose());
			renderer.domElement.remove();
			status = 'idle';
		};
	});
</script>

{#snippet reliefWorkspace()}
			<div class="e3d-annotation-bar" role="toolbar" aria-label="Image annotation tools">
				<button class="e3d-btn" class:active={toolMode === 'orbit'} aria-pressed={toolMode === 'orbit'} onclick={() => chooseMarkerTool('orbit')}>Orbit image</button>
				<button class="e3d-btn" class:active={toolMode === 'marker'} aria-pressed={toolMode === 'marker'} onclick={() => chooseMarkerTool('marker')}>Place marker</button>
				<span class="e3d-marker-count">{markers.length} markers · temporary</span>
				<button class="e3d-btn" disabled={markers.length === 0} onclick={undoMarker}>Undo marker</button>
				<button class="e3d-btn" disabled={markers.length === 0} onclick={clearMarkers}>Clear all</button>
			</div>
			{#if toolMode === 'marker'}<p class="e3d-instruction" aria-live="polite">Click the image to place a source marker.</p>{/if}
			{#if selectedMarker}
				<div class="e3d-marker-editor" aria-label="Selected marker details">
					<label>Marker {selectedMarker.number}<input aria-label="Marker label" value={selectedMarker.label} oninput={(event) => updateSelectedMarker('label', (event.currentTarget as HTMLInputElement).value)} /></label>
					<label>Note<input aria-label="Marker note" value={selectedMarker.note} oninput={(event) => updateSelectedMarker('note', (event.currentTarget as HTMLInputElement).value)} /></label>
					<button class="e3d-btn" data-testid="e3d-remove-marker" onclick={() => removeMarker(selectedMarker.id)}>Remove</button>
				</div>
			{/if}

			<div class="e3d-stage" bind:this={host} data-status={status} onclick={handleStageClick}>
				<div class="e3d-marker-overlay" aria-label="Image source markers">
					{#each markers as marker (marker.id)}
						{#if markerScreenPositions[marker.id]}
							<button
								class="e3d-pin-label"
								class:selected={selectedMarkerId === marker.id}
								style={`left:${markerScreenPositions[marker.id].left}%;top:${markerScreenPositions[marker.id].top}%;`}
								aria-label={`Select ${marker.label || `Marker ${marker.number}`}`}
								aria-pressed={selectedMarkerId === marker.id}
				title={`${marker.note || marker.label} · drag to reposition`}
				onpointerdown={(event) => startMarkerDrag(event, marker.id)}
				onpointermove={dragMarker}
				onpointerup={stopMarkerDrag}
				onpointercancel={stopMarkerDrag}
								onclick={() => (selectedMarkerId = marker.id)}
							>{marker.number}</button>
						{/if}
					{/each}
				</div>
				{#if status === 'loading'}<p class="e3d-msg">Building relief…</p>{/if}
				{#if webglFailed && effectiveUrl}<img class="e3d-flat" src={effectiveUrl} alt="Evidence (flat view; 3D relief unavailable)" />{/if}
				{#if status === 'error'}<p class="e3d-msg">{webglFailed ? note : 'Could not load this image.'}</p>{/if}
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
				{#if note}<span class="e3d-note">{note}</span>{/if}
			</footer>
			{#if actionError}<p class="e3d-result e3d-err" data-testid="e3d-error">{actionError}</p>{/if}
			{#if upscaleInfo}<p class="e3d-result" data-testid="e3d-upscale-info">Upscaled to {upscaleInfo}</p>{/if}
			{#if analysisText}<p class="e3d-result" data-testid="e3d-analysis"><strong>AI suggestion · review required · not a finding.</strong> {analysisText}</p>{/if}
		{/snippet}

		{#if embedded}
			<section class="e3d-content e3d-embedded" role="region" aria-label="Evidence relief workspace">
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
		background: radial-gradient(ellipse at center, #1a2030 0%, #07090e 100%);
	}
	.e3d-annotation-bar,
	.e3d-marker-editor {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		padding: 8px 14px;
		background: #111722;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
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
	.e3d-instruction {
		margin: 0;
		padding: 5px 16px;
		background: #171d28;
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
		width: 28px;
		height: 28px;
		transform: translate(-50%, -50%);
		border: 1px solid #f0c85e;
		border-radius: 50%;
		color: #111722;
		background: #f0c85e;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
		pointer-events: auto;
		animation: evidence-pin-pulse 2.2s ease-in-out infinite;
	}
	@keyframes evidence-pin-pulse {
		0%, 100% { box-shadow: 0 0 0 0 rgba(240, 200, 94, 0.42); }
		50% { box-shadow: 0 0 0 7px rgba(240, 200, 94, 0); }
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
	.e3d-flat { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
	.e3d-note {
		opacity: 0.55;
		margin-left: auto;
	}
</style>
