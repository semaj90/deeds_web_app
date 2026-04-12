<script lang="ts">
	import { onMount } from 'svelte';
	import { WebGPUPalaceCore } from '$lib/gpu/webgpu-palace-core.js';
	import { legalCompressor } from '$lib/gpu/webgpu-palace-compression.js';
	import type { ComputeBackend } from '$lib/gpu/webgpu-palace-core.js';

	// Disable SSR - WebGPU visualization requires browser environment
	export const ssr = false;

	let canvas: HTMLCanvasElement | undefined = $state();
	let palace: WebGPUPalaceCore | null = $state(null);
	let backend: ComputeBackend = $state('cpu');
	let isInitialized = $state(false);
	let error = $state<string | null>(null);
	let fps = $state(0);
	let frameCount = 0;
	let lastFpsUpdate = 0;

	// Sample text for compression demo
	let sampleText = $state('The plaintiff filed a motion for summary judgment pursuant to the statute of limitations. The defendant sought discovery regarding evidence of breach of contract.');
	let compressedText = $state('');
	let compressionRatio = $state(0);

	onMount(() => {
		if (!canvas) return;

		let animationId: number;

		const init = async () => {
			try {
				palace = new WebGPUPalaceCore(canvas, {
					renderDistance: 100,
					powerPreference: 'high-performance',
					forceLayoutEnabled: true
				});

				backend = await palace.initialize();
				isInitialized = true;

				// Start render loop
				const render = (time: number) => {
					if (palace?.isGPUReady) {
						palace.render();

						// Update FPS counter
						frameCount++;
						if (time - lastFpsUpdate > 1000) {
							fps = Math.round(frameCount * 1000 / (time - lastFpsUpdate));
							frameCount = 0;
							lastFpsUpdate = time;
						}
					}
					animationId = requestAnimationFrame(render);
				};
				animationId = requestAnimationFrame(render);
			} catch (e) {
				error = e instanceof Error ? e.message : 'Failed to initialize WebGPU';
				console.error('[WebGPU Demo]', e);
			}
		};

		init();

		// Cleanup
		return () => {
			if (animationId) cancelAnimationFrame(animationId);
			palace?.dispose();
		};
	});

	function compressText() {
		compressedText = legalCompressor.compress(sampleText);
		const data = legalCompressor.getCompressionData(sampleText);
		compressionRatio = data.compressionRatio;
	}

	function decompressText() {
		const decompressed = legalCompressor.decompress(compressedText);
		alert(`Decompressed:\n\n${decompressed}`);
	}
</script>

<div class="demo-container">
	<header class="demo-header">
		<h1>WebGPU Memory Palace Demo</h1>
		<p>3D legal knowledge visualization with GPU-accelerated rendering + 7-bit compression</p>
	</header>

	<div class="demo-content">
		<!-- WebGPU Canvas -->
		<div class="canvas-section">
			<div class="canvas-wrapper">
				<canvas
					bind:this={canvas}
					width={800}
					height={500}
					class="webgpu-canvas"
				></canvas>

				{#if !isInitialized}
					<div class="overlay loading">
						<span>Initializing WebGPU...</span>
					</div>
				{:else if error}
					<div class="overlay error">
						<span>⚠️ {error}</span>
						<p class="fallback-note">WebGPU not available - using CPU fallback</p>
					</div>
				{/if}
			</div>

			<div class="stats-bar">
				<div class="stat">
					<span class="label">Backend:</span>
					<span class="value" class:webgpu={backend === 'webgpu'} class:cpu={backend === 'cpu'}>
						{backend.toUpperCase()}
					</span>
				</div>
				<div class="stat">
					<span class="label">FPS:</span>
					<span class="value">{fps}</span>
				</div>
				<div class="stat">
					<span class="label">Rooms:</span>
					<span class="value">{palace?.rooms.length ?? 0}</span>
				</div>
			</div>
		</div>

		<!-- Compression Demo -->
		<div class="compression-section">
			<h2>7-Bit Legal Text Compression</h2>
			<p class="section-desc">
				Compress legal terminology using a 7-bit dictionary (127:1 theoretical ratio)
			</p>

			<div class="compression-demo">
				<div class="input-group">
					<label for="sample-text">Original Text</label>
					<textarea
						id="sample-text"
						bind:value={sampleText}
						rows={4}
						placeholder="Enter legal text to compress..."
					></textarea>
					<div class="text-stats">
						<span>{sampleText.length} characters</span>
					</div>
				</div>

				<div class="compression-controls">
					<button onclick={compressText} class="btn-primary">
						Compress Text
					</button>
					{#if compressedText}
						<button onclick={decompressText} class="btn-secondary">
							Decompress
						</button>
					{/if}
				</div>

				{#if compressedText}
					<div class="compression-result">
						<div class="result-header">
							<h3>Compressed Output</h3>
							<div class="compression-ratio">
								Ratio: <strong>{compressionRatio.toFixed(2)}:1</strong>
							</div>
						</div>
						<div class="compressed-text">
							<code>{compressedText}</code>
						</div>
						<div class="compression-stats">
							<span>Compressed: {compressedText.length} bytes</span>
							<span>Savings: {((1 - compressedText.length / sampleText.length) * 100).toFixed(1)}%</span>
							<span>Dictionary: {legalCompressor.getDictionarySize()} terms</span>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Features -->
		<div class="features-section">
			<h2>Features Demonstrated</h2>
			<div class="features-grid">
				<div class="feature-card">
					<div class="feature-icon">🎮</div>
					<h3>WebGPU Rendering</h3>
					<p>GPU-accelerated 3D visualization with WGSL shaders. 10-100× faster than WebGL.</p>
				</div>
				<div class="feature-card">
					<div class="feature-icon">🧠</div>
					<h3>Memory Palace</h3>
					<p>Cognitive spatial memory technique with practice area rooms (Contracts, Litigation, Evidence).</p>
				</div>
				<div class="feature-card">
					<div class="feature-icon">📦</div>
					<h3>7-Bit Compression</h3>
					<p>Legal term dictionary compression. 65 legal terms + 28 common words mapped to 0-127.</p>
				</div>
				<div class="feature-card">
					<div class="feature-icon">⚡</div>
					<h3>Auto Fallback</h3>
					<p>Graceful degradation: WebGPU → WebGL → CPU based on browser support.</p>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.demo-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
		font-family: 'Source Sans 3', sans-serif;
	}

	.demo-header {
		margin-bottom: 2rem;
		border-bottom: 3px solid var(--accent);
		padding-bottom: 1rem;
	}

	.demo-header h1 {
		margin: 0;
		font-size: 1.75rem;
		color: var(--sand);
	}

	.demo-header p {
		margin: 0.5rem 0 0;
		color: var(--sand-dark);
		font-size: 0.95rem;
	}

	.demo-content {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	/* Canvas Section */
	.canvas-section {
		background: var(--panel);
		border: 2px solid var(--panel-soft);
		border-radius: 8px;
		padding: 1.5rem;
	}

	.canvas-wrapper {
		position: relative;
		border-radius: 4px;
		overflow: hidden;
		background: #0a0a0f;
	}

	.webgpu-canvas {
		display: block;
		width: 100%;
		height: auto;
	}

	.overlay {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.8);
		color: white;
		font-size: 1.1rem;
		gap: 0.5rem;
	}

	.overlay.loading {
		background: rgba(0, 0, 0, 0.9);
	}

	.overlay.error {
		background: rgba(139, 0, 0, 0.9);
	}

	.fallback-note {
		font-size: 0.85rem;
		opacity: 0.8;
		margin: 0;
	}

	.stats-bar {
		display: flex;
		gap: 2rem;
		margin-top: 1rem;
		padding: 0.75rem 1rem;
		background: var(--panel-soft);
		border-radius: 4px;
		font-size: 0.9rem;
	}

	.stat {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.stat .label {
		color: var(--sand-dark);
		font-weight: 600;
	}

	.stat .value {
		font-family: monospace;
		font-weight: 700;
	}

	.stat .value.webgpu {
		color: #4caf50;
	}

	.stat .value.cpu {
		color: #ff9800;
	}

	/* Compression Section */
	.compression-section {
		background: var(--panel);
		border: 2px solid var(--panel-soft);
		border-radius: 8px;
		padding: 1.5rem;
	}

	.compression-section h2 {
		margin: 0 0 0.5rem;
		font-size: 1.25rem;
		color: var(--sand);
	}

	.section-desc {
		margin: 0 0 1.5rem;
		color: var(--sand-dark);
		font-size: 0.9rem;
	}

	.compression-demo {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.input-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.input-group label {
		font-weight: 600;
		font-size: 0.9rem;
		color: var(--sand);
	}

	.input-group textarea {
		padding: 0.75rem;
		border: 2px solid var(--panel-soft);
		border-radius: 4px;
		background: var(--panel-soft);
		color: var(--sand);
		font-family: 'Source Code Pro', monospace;
		font-size: 0.9rem;
		resize: vertical;
	}

	.text-stats {
		font-size: 0.85rem;
		color: var(--sand-dark);
	}

	.compression-controls {
		display: flex;
		gap: 0.75rem;
	}

	.btn-primary,
	.btn-secondary {
		padding: 0.6rem 1.5rem;
		border: none;
		border-radius: 4px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-primary {
		background: var(--accent);
		color: white;
	}

	.btn-primary:hover {
		background: var(--accent-soft);
	}

	.btn-secondary {
		background: var(--panel-soft);
		color: var(--sand);
	}

	.btn-secondary:hover {
		background: var(--sand-dark);
		color: white;
	}

	.compression-result {
		background: var(--panel-soft);
		border: 1px solid var(--sand-dark);
		border-radius: 4px;
		padding: 1rem;
	}

	.result-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.result-header h3 {
		margin: 0;
		font-size: 1rem;
		color: var(--sand);
	}

	.compression-ratio {
		font-size: 0.9rem;
		color: var(--sand-dark);
	}

	.compression-ratio strong {
		color: #4caf50;
		font-size: 1.1rem;
	}

	.compressed-text {
		background: #0a0a0f;
		padding: 0.75rem;
		border-radius: 4px;
		margin-bottom: 0.75rem;
		overflow-x: auto;
	}

	.compressed-text code {
		color: #4caf50;
		font-family: 'Source Code Pro', monospace;
		font-size: 0.85rem;
		word-break: break-all;
	}

	.compression-stats {
		display: flex;
		gap: 1.5rem;
		font-size: 0.85rem;
		color: var(--sand-dark);
	}

	/* Features Section */
	.features-section {
		margin-top: 1rem;
	}

	.features-section h2 {
		margin: 0 0 1.5rem;
		font-size: 1.25rem;
		color: var(--sand);
	}

	.features-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1rem;
	}

	.feature-card {
		background: var(--panel);
		border: 2px solid var(--panel-soft);
		border-radius: 8px;
		padding: 1.25rem;
		transition: transform 0.2s, border-color 0.2s;
	}

	.feature-card:hover {
		transform: translateY(-2px);
		border-color: var(--accent);
	}

	.feature-icon {
		font-size: 2rem;
		margin-bottom: 0.75rem;
	}

	.feature-card h3 {
		margin: 0 0 0.5rem;
		font-size: 1rem;
		color: var(--sand);
	}

	.feature-card p {
		margin: 0;
		font-size: 0.85rem;
		color: var(--sand-dark);
		line-height: 1.5;
	}
</style>
