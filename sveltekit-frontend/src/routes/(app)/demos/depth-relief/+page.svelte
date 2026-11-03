<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import DepthReliefViewer, { type ViewerStatus } from '$lib/components/evidence/DepthReliefViewer.svelte';
	import { makeSampleReliefPair } from '$lib/components/evidence/relief-sample.js';

	let imageUrl = $state<string | null>(null);
	let depthUrl = $state<string | null>(null);
	let relief = $state(0.85);
	let discontinuity = $state(0.17);
	let invertDepth = $state(false);
	let quality = $state<'auto' | 'high' | 'medium' | 'low'>('auto');
	let backend = $state<'auto' | 'webgpu' | 'webgl'>('auto');
	let status = $state<ViewerStatus | null>(null);

	let customImage = $state('');
	let customDepth = $state('');
	let urlError = $state('');

	let revokeSample: (() => void) | null = null;

	async function makeSample() {
		const pair = await makeSampleReliefPair();
		revokeSample = pair.revoke;
		imageUrl = pair.imageUrl;
		depthUrl = pair.depthUrl;
	}

	// Same-origin, blob: and data: only, so a pasted URL cannot make the page fetch arbitrary hosts.
	function allowed(u: string) {
		if (u.startsWith('blob:') || u.startsWith('data:image/')) return true;
		try {
			return new URL(u, location.origin).origin === location.origin;
		} catch {
			return false;
		}
	}
	function loadCustom() {
		urlError = '';
		if (!customImage || !customDepth) { urlError = 'Enter both an image URL and its depth map URL.'; return; }
		if (!allowed(customImage) || !allowed(customDepth)) { urlError = 'Only same-origin, blob: or data:image URLs are allowed.'; return; }
		imageUrl = customImage;
		depthUrl = customDepth;
	}

	onMount(() => {
		void makeSample();
		return () => revokeSample?.();
	});
</script>

<svelte:head><title>Depth Relief Viewer</title></svelte:head>

<main class="page">
	<header>
		<h1><Icon name="yorha-evidence" size={22} /> Depth Relief Viewer</h1>
		<p>
			Image + depth map to a textured 2.5D surface. WebGPU first, WebGL2 fallback, flat image last; quality tier follows the GPU
			vendor and mesh detail follows camera distance (scroll to zoom).
		</p>
	</header>

	<section class="controls" aria-label="Viewer controls">
		<label>Relief {relief.toFixed(2)}<input type="range" min="0.1" max="1.5" step="0.05" bind:value={relief} /></label>
		<label>Edge cut {discontinuity.toFixed(2)}<input type="range" min="0.05" max="0.5" step="0.01" bind:value={discontinuity} /></label>
		<label class="row"><input type="checkbox" bind:checked={invertDepth} /> Invert depth</label>
		<label>Backend
			<select bind:value={backend} data-testid="sel-backend">
				<option value="auto">Auto</option><option value="webgpu">WebGPU</option><option value="webgl">WebGL2</option>
			</select>
		</label>
		<label>Quality
			<select bind:value={quality} data-testid="sel-quality">
				<option value="auto">Auto (by GPU)</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
			</select>
		</label>
	</section>

	<section class="relief-stage">
		{#if imageUrl && depthUrl}
			{#key `${imageUrl}|${depthUrl}|${relief}|${discontinuity}|${invertDepth}|${quality}|${backend}`}
				<DepthReliefViewer {imageUrl} {depthUrl} {relief} {discontinuity} {invertDepth} {quality} {backend} onStatus={(s) => (status = s)} />
			{/key}
		{:else}
			<p class="wait">Generating sample…</p>
		{/if}
	</section>

	<section class="status" data-testid="relief-status">
		<Icon name="yorha-ai-assistant" size={18} />
		{#if status}
			Backend <b>{status.backend}</b> · GPU <b>{status.vendor}</b> · tier <b>{status.tier}</b> · LOD <b>{status.lod}</b> · {status.vertices.toLocaleString()} vertices
		{:else}
			Waiting for renderer…
		{/if}
	</section>

	<section class="custom">
		<h2>Your own evidence image</h2>
		<p>Needs the original image and its depth map from the same frame (same size and aspect).</p>
		<input placeholder="/path/to/image.png (same-origin)" bind:value={customImage} />
		<input placeholder="/path/to/depth.png (same-origin)" bind:value={customDepth} />
		<button type="button" onclick={loadCustom}>Load</button>
		{#if urlError}<p class="err" role="alert"><Icon name="yorha-warning" size={14} /> {urlError}</p>{/if}
	</section>
</main>

<style>
	.page { max-width: 1000px; margin: 0 auto; padding: 20px 16px 40px; color: #e5ebf6; background: #0a0f1a; min-height: 100%; }
	h1 { display: flex; align-items: center; gap: 8px; font-size: 22px; margin: 0 0 6px; letter-spacing: 0.04em; }
	h2 { font-size: 14px; margin: 18px 0 4px; }
	p { margin: 0 0 10px; font-size: 13px; opacity: 0.8; }
	.controls { display: flex; flex-wrap: wrap; gap: 14px 20px; align-items: end; margin: 12px 0; font-size: 12px; }
	.controls label { display: grid; gap: 4px; }
	.controls .row { display: flex; align-items: center; gap: 6px; }
	select, input:not([type='range']):not([type='checkbox']) { background: #131c2e; color: #fff; border: 1px solid rgba(125, 211, 252, 0.35); border-radius: 6px; padding: 6px 8px; }
	.relief-stage { display: block; width: 100%; height: 460px; }
	.wait { padding: 20px; }
	.status { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 8px 12px; font-size: 12px; border: 1px solid rgba(197, 154, 43, 0.5); border-radius: 8px; background: #0f1626; }
	.custom { display: grid; gap: 8px; max-width: 560px; }
	button { width: fit-content; cursor: pointer; background: #1b2940; color: #fff; border: 1px solid #c59a2b; padding: 7px 14px; border-radius: 8px; }
	.err { color: #ffc4c4; display: flex; align-items: center; gap: 6px; }
	@media (max-width: 640px) { .relief-stage { height: 360px; } }
</style>
