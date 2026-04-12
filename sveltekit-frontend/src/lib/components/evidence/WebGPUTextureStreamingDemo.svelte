<script lang="ts">
	/**
	 * WebGPU Texture Streaming Demo — NES-Inspired Evidence Visualization
	 *
	 * Demonstrates the texture-streaming.ts WebGPUTextureStreamer class with:
	 * - 2KB RAM constraint (NES-inspired)
	 * - 40KB total memory budget
	 * - Legal document context integration
	 * - Texture atlas + priority-based streaming
	 *
	 * Wired from: lib/webgpu/texture-streaming.ts (previously orphaned)
	 */

	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface WebGPUTextureStreamer {
		initialize(): Promise<boolean>;
		getMemoryStats(): { ram: { used: number; total: number }; total: { used: number; total: number } };
		dispose(): void;
	}

	interface Props {
		width?: number;
		height?: number;
		evidenceItems?: Array<{
			id: string;
			title: string;
			evidenceType: string;
		}>;
	}

	let { width = 800, height = 600, evidenceItems = [] }: Props = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	let initialized = $state(false);
	let memoryStats = $state({ ram: { used: 0, total: 2048 }, total: { used: 0, total: 40960 } });
	let webgpuAvailable = $state(false);
	let errorMessage = $state<string | null>(null);
	let streamer: WebGPUTextureStreamer | null = null;

	// SSR safety - don't run on server
	export const ssr = false;

	onMount(async () => {
		if (!browser) return;

		try {
			// Dynamically import the texture-streaming module
			const module = await import('$lib/webgpu/texture-streaming');
			const { WebGPUTextureStreamer } = module;

			streamer = new WebGPUTextureStreamer();
			const success = await streamer.initialize();

			if (success) {
				initialized = true;
				webgpuAvailable = true;

				// Update memory stats every second
				const interval = setInterval(() => {
					if (streamer) {
						memoryStats = streamer.getMemoryStats();
					}
				}, 1000);

				// Cleanup
				return () => {
					clearInterval(interval);
					if (streamer) {
						streamer.dispose();
					}
				};
			} else {
				errorMessage = 'WebGPU initialization failed - falling back to CPU';
				webgpuAvailable = false;
			}
		} catch (error) {
			console.error('[TextureStreaming] Error:', error);
			errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		}
	});

	const ramPercentage = $derived((memoryStats.ram.used / memoryStats.ram.total) * 100);
	const totalPercentage = $derived((memoryStats.total.used / memoryStats.total.total) * 100);
</script>

<div class="webgpu-texture-demo">
	<!-- Header -->
	<div class="demo-header">
		<div class="demo-header-left">
			<Icon name="cpu" size={20} />
			<div>
				<h3 class="demo-title">WebGPU Texture Streaming</h3>
				<p class="demo-subtitle">NES-Inspired Evidence Texture Management (2KB RAM, 40KB Total)</p>
			</div>
		</div>
		<div class="demo-status">
			{#if initialized}
				<span class="status-badge success">
					<Icon name="check-circle" size={12} />
					WebGPU Active
				</span>
			{:else if errorMessage}
				<span class="status-badge error">
					<Icon name="alert-circle" size={12} />
					CPU Fallback
				</span>
			{:else}
				<span class="status-badge loading">
					<Icon name="loader" size={12} />
					Initializing...
				</span>
			{/if}
		</div>
	</div>

	<!-- Memory Stats -->
	<div class="memory-stats">
		<div class="memory-bar">
			<div class="memory-bar-header">
				<span class="memory-label">
					<Icon name="database" size={12} />
					RAM (Active Textures)
				</span>
				<span class="memory-value">{memoryStats.ram.used} / {memoryStats.ram.total} bytes</span>
			</div>
			<div class="memory-bar-track">
				<div
					class="memory-bar-fill ram"
					style="width: {ramPercentage}%"
				></div>
			</div>
			<span class="memory-percent">{ramPercentage.toFixed(1)}%</span>
		</div>

		<div class="memory-bar">
			<div class="memory-bar-header">
				<span class="memory-label">
					<Icon name="hard-drive" size={12} />
					Total Memory Budget
				</span>
				<span class="memory-value">{memoryStats.total.used} / {memoryStats.total.total} bytes</span>
			</div>
			<div class="memory-bar-track">
				<div
					class="memory-bar-fill total"
					style="width: {totalPercentage}%"
				></div>
			</div>
			<span class="memory-percent">{totalPercentage.toFixed(1)}%</span>
		</div>
	</div>

	<!-- Canvas -->
	<canvas
		bind:this={canvas}
		{width}
		{height}
		class="demo-canvas"
	></canvas>

	<!-- Evidence Items (NES Palette) -->
	{#if evidenceItems.length > 0}
		<div class="evidence-tiles">
			<h4 class="tiles-title">
				<Icon name="image" size={14} />
				Loaded Textures ({evidenceItems.length})
			</h4>
			<div class="tiles-grid">
				{#each evidenceItems.slice(0, 8) as item}
					<div class="evidence-tile">
						<div class="tile-icon">
							<Icon
								name={item.evidenceType === 'image' ? 'image' : item.evidenceType === 'video' ? 'video' : 'file-text'}
								size={16}
							/>
						</div>
						<div class="tile-info">
							<p class="tile-title">{item.title.slice(0, 25)}{item.title.length > 25 ? '...' : ''}</p>
							<p class="tile-type">{item.evidenceType}</p>
						</div>
						<span class="tile-badge">CHR-ROM</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Error Message -->
	{#if errorMessage}
		<div class="error-banner">
			<Icon name="alert-triangle" size={16} />
			<span>{errorMessage}</span>
		</div>
	{/if}

	<!-- Info Panel -->
	<div class="info-panel">
		<h4 class="info-title">
			<Icon name="info" size={14} />
			NES-Inspired Memory Constraints
		</h4>
		<div class="info-grid">
			<div class="info-item">
				<span class="info-label">RAM (Active)</span>
				<span class="info-value">2 KB</span>
			</div>
			<div class="info-item">
				<span class="info-label">CHR-ROM (Patterns)</span>
				<span class="info-value">8 KB</span>
			</div>
			<div class="info-item">
				<span class="info-label">PRG-ROM (Program)</span>
				<span class="info-value">32 KB</span>
			</div>
			<div class="info-item">
				<span class="info-label">Sprite Limit</span>
				<span class="info-value">64</span>
			</div>
			<div class="info-item">
				<span class="info-label">Palette Colors</span>
				<span class="info-value">52</span>
			</div>
			<div class="info-item">
				<span class="info-label">WebGPU</span>
				<span class="info-value">{webgpuAvailable ? 'Yes' : 'No'}</span>
			</div>
		</div>
	</div>
</div>

<style>
	.webgpu-texture-demo {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.demo-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem;
		background: rgba(96, 165, 250, 0.04);
		border: 1px solid rgba(96, 165, 250, 0.12);
		border-radius: 0.5rem;
	}

	.demo-header-left {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.demo-title {
		font-size: 1rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.9);
		margin: 0;
	}

	.demo-subtitle {
		font-size: 0.6875rem;
		color: rgba(212, 199, 163, 0.4);
		margin: 0.125rem 0 0 0;
	}

	.demo-status {
		flex-shrink: 0;
	}

	.status-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.625rem;
		border-radius: 0.375rem;
		font-size: 0.6875rem;
		font-weight: 500;
	}

	.status-badge.success {
		background: rgba(34, 197, 94, 0.1);
		color: rgba(34, 197, 94, 0.9);
		border: 1px solid rgba(34, 197, 94, 0.2);
	}

	.status-badge.error {
		background: rgba(239, 68, 68, 0.1);
		color: rgba(239, 68, 68, 0.9);
		border: 1px solid rgba(239, 68, 68, 0.2);
	}

	.status-badge.loading {
		background: rgba(251, 191, 36, 0.1);
		color: rgba(251, 191, 36, 0.9);
		border: 1px solid rgba(251, 191, 36, 0.2);
	}

	.memory-stats {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.875rem;
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(212, 199, 163, 0.1);
		border-radius: 0.5rem;
	}

	.memory-bar {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.memory-bar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.memory-label {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.6875rem;
		font-weight: 500;
		color: rgba(212, 199, 163, 0.7);
	}

	.memory-value {
		font-size: 0.6875rem;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		color: rgba(212, 199, 163, 0.5);
	}

	.memory-bar-track {
		width: 100%;
		height: 0.5rem;
		background: rgba(0, 0, 0, 0.4);
		border-radius: 0.25rem;
		overflow: hidden;
	}

	.memory-bar-fill {
		height: 100%;
		transition: width 0.3s ease;
		border-radius: 0.25rem;
	}

	.memory-bar-fill.ram {
		background: linear-gradient(90deg, rgba(96, 165, 250, 0.6), rgba(96, 165, 250, 0.9));
	}

	.memory-bar-fill.total {
		background: linear-gradient(90deg, rgba(251, 191, 36, 0.6), rgba(251, 191, 36, 0.9));
	}

	.memory-percent {
		font-size: 0.625rem;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		color: rgba(212, 199, 163, 0.4);
		text-align: right;
	}

	.demo-canvas {
		width: 100%;
		height: auto;
		border: 1px solid rgba(212, 199, 163, 0.15);
		border-radius: 0.5rem;
		background: rgba(0, 0, 0, 0.5);
	}

	.evidence-tiles {
		padding: 0.875rem;
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(212, 199, 163, 0.1);
		border-radius: 0.5rem;
	}

	.tiles-title {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.85);
		margin: 0 0 0.75rem 0;
	}

	.tiles-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.5rem;
	}

	.evidence-tile {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.625rem;
		background: rgba(212, 199, 163, 0.04);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 0.375rem;
		transition: all 0.15s ease;
	}

	.evidence-tile:hover {
		background: rgba(212, 199, 163, 0.08);
		border-color: rgba(212, 199, 163, 0.15);
	}

	.tile-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.375rem;
		background: rgba(96, 165, 250, 0.1);
		color: rgba(96, 165, 250, 0.8);
		flex-shrink: 0;
	}

	.tile-info {
		flex: 1;
		min-width: 0;
	}

	.tile-title {
		font-size: 0.6875rem;
		font-weight: 500;
		color: rgba(212, 199, 163, 0.85);
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tile-type {
		font-size: 0.625rem;
		color: rgba(212, 199, 163, 0.4);
		margin: 0.125rem 0 0 0;
		text-transform: uppercase;
	}

	.tile-badge {
		font-size: 0.5625rem;
		font-weight: 600;
		padding: 0.125rem 0.375rem;
		background: rgba(251, 191, 36, 0.15);
		color: rgba(251, 191, 36, 0.9);
		border-radius: 0.25rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		flex-shrink: 0;
	}

	.error-banner {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.75rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.2);
		border-radius: 0.5rem;
		color: rgba(239, 68, 68, 0.9);
		font-size: 0.75rem;
	}

	.info-panel {
		padding: 0.875rem;
		background: rgba(96, 165, 250, 0.04);
		border: 1px solid rgba(96, 165, 250, 0.12);
		border-radius: 0.5rem;
	}

	.info-title {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.85);
		margin: 0 0 0.75rem 0;
	}

	.info-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
	}

	.info-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.info-label {
		font-size: 0.625rem;
		color: rgba(212, 199, 163, 0.5);
	}

	.info-value {
		font-size: 0.875rem;
		font-weight: 600;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		color: rgba(96, 165, 250, 0.9);
	}
</style>
