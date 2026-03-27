<script lang="ts">
	import { onMount } from 'svelte';

	let {
		documentId,
		initialPage = 1,
		onPageChange,
	}: {
		documentId: string;
		initialPage?: number;
		onPageChange?: (page: number) => void;
	} = $props();

	// State
	let container: HTMLDivElement;
	let canvas = $state<HTMLCanvasElement>();
	let loadError = $state<string | null>(null);
	let loading = $state(true);
	let currentPage = $state(1);
	let totalPages = $state(0);
	let scale = $state(1.2);
	let rendering = $state(false);

	// pdfjs internals — not reactive, just mutable refs
	let pdfDoc: import('pdfjs-dist').PDFDocumentProxy | null = null;
	let renderTask: import('pdfjs-dist').RenderTask | null = null;

	const pdfUrl = $derived(`/api/library/documents/${documentId}/pdf`);

	// Sync currentPage when initialPage prop changes
	$effect(() => {
		currentPage = initialPage;
	});

	onMount(async () => {
		try {
			const pdfjsLib = await import('pdfjs-dist');
			pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

			const loadingTask = pdfjsLib.getDocument({
				url: pdfUrl,
				withCredentials: true,
			});
			pdfDoc = await loadingTask.promise;
			totalPages = pdfDoc.numPages;
			loading = false;
			await renderPage(currentPage);
		} catch (err) {
			loading = false;
			loadError = err instanceof Error ? err.message : 'Failed to load PDF';
		}
	});

	async function renderPage(pageNum: number) {
		if (!pdfDoc || !canvas) return;
		if (rendering) {
			renderTask?.cancel();
		}
		rendering = true;

		const page = await pdfDoc.getPage(pageNum);
		const viewport = page.getViewport({ scale });
		const ctx = canvas.getContext('2d')!;

		canvas.width = viewport.width;
		canvas.height = viewport.height;

		renderTask = page.render({ canvasContext: ctx, viewport });
		try {
			await renderTask.promise;
		} catch (err: unknown) {
			// RenderingCancelledException is expected when switching pages rapidly
			if (
				err instanceof Error &&
				!err.message.includes('Rendering cancelled')
			) {
				console.error('[PDFViewer] render error:', err);
			}
		} finally {
			rendering = false;
		}
	}

	async function goToPage(num: number) {
		const clamped = Math.max(1, Math.min(num, totalPages));
		currentPage = clamped;
		onPageChange?.(clamped);
		await renderPage(clamped);
	}

	async function setScale(newScale: number) {
		scale = Math.max(0.5, Math.min(3.0, newScale));
		await renderPage(currentPage);
	}

	// Keyboard navigation
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goToPage(currentPage + 1);
		if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goToPage(currentPage - 1);
	}

	let pageInputValue = $derived(String(currentPage));

	function handlePageInput(e: Event) {
		const val = parseInt((e.target as HTMLInputElement).value, 10);
		if (!isNaN(val)) goToPage(val);
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="pv-root"
	bind:this={container}
	tabindex="0"
	onkeydown={handleKeydown}
>
	<!-- Toolbar -->
	{#if !loadError}
		<div class="pv-toolbar">
			<div class="pv-nav">
				<button
					class="pv-nav-btn"
					disabled={currentPage <= 1 || loading}
					onclick={() => goToPage(currentPage - 1)}
					title="Previous page"
				>‹</button>
				<span class="pv-page-indicator">
					<input
						class="pv-page-input"
						type="number"
						min="1"
						max={totalPages}
						value={pageInputValue}
						onchange={handlePageInput}
						disabled={loading || totalPages === 0}
					/>
					<span class="pv-page-sep">/ {totalPages}</span>
				</span>
				<button
					class="pv-nav-btn"
					disabled={currentPage >= totalPages || loading}
					onclick={() => goToPage(currentPage + 1)}
					title="Next page"
				>›</button>
			</div>

			<div class="pv-zoom">
				<button
					class="pv-zoom-btn"
					onclick={() => setScale(scale - 0.2)}
					disabled={scale <= 0.5 || rendering}
					title="Zoom out"
				>−</button>
				<span class="pv-zoom-label">{Math.round(scale * 100)}%</span>
				<button
					class="pv-zoom-btn"
					onclick={() => setScale(scale + 0.2)}
					disabled={scale >= 3.0 || rendering}
					title="Zoom in"
				>+</button>
				<button
					class="pv-zoom-btn"
					onclick={() => setScale(1.2)}
					title="Reset zoom"
				>↺</button>
			</div>

			<a
				href={pdfUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="pv-open-btn"
				title="Open PDF in new tab"
			>
				Open PDF ↗
			</a>
		</div>
	{/if}

	<!-- Canvas area -->
	<div class="pv-canvas-wrap">
		{#if loading}
			<div class="pv-loading">
				<div class="pv-spinner"></div>
				<span>Loading PDF…</span>
			</div>
		{:else if loadError}
			<div class="pv-error">
				<p class="pv-error-headline">Could not load PDF</p>
				<p class="pv-error-detail">{loadError}</p>
				<a href={pdfUrl} target="_blank" rel="noopener noreferrer" class="pv-open-btn pv-open-btn-lg">
					Try opening directly ↗
				</a>
			</div>
		{:else}
			{#if rendering}
				<div class="pv-render-overlay">Rendering…</div>
			{/if}
			<canvas bind:this={canvas} class="pv-canvas"></canvas>
		{/if}
	</div>
</div>

<style>
	.pv-root {
		display: flex;
		flex-direction: column;
		height: 100%;
		outline: none;
		background: var(--t-bg, #1a1916);
	}

	/* ── Toolbar ── */
	.pv-toolbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		background: var(--t-panel, #232220);
		border-bottom: 1px solid color-mix(in srgb, var(--t-border) 30%, transparent);
		flex-shrink: 0;
		flex-wrap: wrap;
	}

	.pv-nav {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.pv-nav-btn, .pv-zoom-btn {
		width: 2rem;
		height: 2rem;
		background: color-mix(in srgb, var(--t-text) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--t-border) 40%, transparent);
		border-radius: 4px;
		color: color-mix(in srgb, var(--t-text) 80%, transparent);
		font-size: 1.1rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.15s;
	}
	.pv-nav-btn:hover:not(:disabled), .pv-zoom-btn:hover:not(:disabled) {
		background: color-mix(in srgb, var(--t-text) 15%, transparent);
	}
	.pv-nav-btn:disabled, .pv-zoom-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.pv-page-indicator {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		color: var(--t-text-muted, rgba(212, 199, 163, 0.7));
		font-size: 0.85rem;
	}

	.pv-page-input {
		width: 3.5rem;
		height: 1.75rem;
		background: color-mix(in srgb, var(--t-text) 6%, transparent);
		border: 1px solid color-mix(in srgb, var(--t-border) 50%, transparent);
		border-radius: 4px;
		color: var(--t-text, rgba(212, 199, 163, 0.9));
		font-size: 0.85rem;
		text-align: center;
		padding: 0 0.25rem;
	}
	.pv-page-input:focus {
		outline: none;
		border-color: var(--t-accent, rgba(212, 199, 163, 0.5));
	}
	.pv-page-sep {
		color: color-mix(in srgb, var(--t-text) 45%, transparent);
	}

	.pv-zoom {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-left: 0.5rem;
	}
	.pv-zoom-label {
		font-size: 0.8rem;
		color: color-mix(in srgb, var(--t-text) 60%, transparent);
		min-width: 3rem;
		text-align: center;
	}

	.pv-open-btn {
		margin-left: auto;
		font-size: 0.78rem;
		color: color-mix(in srgb, var(--t-text) 55%, transparent);
		text-decoration: none;
		border: 1px solid color-mix(in srgb, var(--t-border) 40%, transparent);
		border-radius: 4px;
		padding: 0.25rem 0.6rem;
		transition: color 0.15s, border-color 0.15s;
	}
	.pv-open-btn:hover {
		color: var(--t-text, rgba(212, 199, 163, 0.9));
		border-color: color-mix(in srgb, var(--t-border) 70%, transparent);
	}

	/* ── Canvas area ── */
	.pv-canvas-wrap {
		flex: 1;
		overflow: auto;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 1.5rem;
		position: relative;
	}

	.pv-canvas {
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
		display: block;
		max-width: 100%;
	}

	.pv-render-overlay {
		position: absolute;
		top: 1rem;
		right: 1rem;
		font-size: 0.75rem;
		color: color-mix(in srgb, var(--t-text) 45%, transparent);
	}

	/* ── Loading / error ── */
	.pv-loading, .pv-error {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 3rem;
		color: var(--t-text-muted, rgba(212, 199, 163, 0.6));
		font-size: 0.9rem;
	}

	.pv-spinner {
		width: 2rem;
		height: 2rem;
		border: 2px solid color-mix(in srgb, var(--t-border) 40%, transparent);
		border-top-color: color-mix(in srgb, var(--t-text) 60%, transparent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	.pv-error-headline {
		font-weight: 600;
		color: var(--t-text, rgba(212, 199, 163, 0.8));
	}
	.pv-error-detail {
		font-size: 0.8rem;
		opacity: 0.7;
		text-align: center;
	}
	.pv-open-btn-lg {
		margin-left: 0;
		font-size: 0.9rem;
		padding: 0.4rem 0.9rem;
	}
</style>
