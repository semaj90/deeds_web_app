<script lang="ts">
	import { Dialog, ScrollArea } from 'bits-ui';
	import { fade } from 'svelte/transition';
	import Icon from '$lib/components/ui/Icon.svelte';

	type DoclingBlock = {
		type: 'paragraph' | 'heading' | 'table' | 'list' | 'equation' | 'image' | 'transcription' | 'other';
		text: string;
		page: number;
		bbox?: [number, number, number, number];
	};

	type ExtractionResult = {
		fullText: string;
		blocks: DoclingBlock[];
		pageCount: number;
		processingTimeMs: number;
		method: string;
	};

	let {
		open = $bindable(false),
		evidenceId,
		fileName,
		fileBase64,
	}: {
		open?: boolean;
		evidenceId?: string;
		fileName: string;
		fileBase64?: string;
	} = $props();

	let result = $state<ExtractionResult | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let activeView = $state<'blocks' | 'text' | 'raw'>('blocks');
	let filterPage = $state<number | null>(null);
	let filterType = $state<string | null>(null);

	const filteredBlocks = $derived.by(() => {
		if (!result?.blocks) return [];
		let blocks = result.blocks;
		if (filterPage !== null) blocks = blocks.filter((b) => b.page === filterPage);
		if (filterType) blocks = blocks.filter((b) => b.type === filterType);
		return blocks;
	});

	const uniquePages = $derived(
		result?.blocks ? [...new Set(result.blocks.map((b) => b.page))].sort((a, b) => a - b) : []
	);

	const uniqueTypes = $derived(
		result?.blocks ? [...new Set(result.blocks.map((b) => b.type))].sort() : []
	);

	const blockTypeStyles: Record<string, { label: string; color: string }> = {
		heading: { label: 'Heading', color: 'rgba(96, 165, 250, 0.9)' },
		paragraph: { label: 'Paragraph', color: 'rgba(212, 199, 163, 0.7)' },
		table: { label: 'Table', color: 'rgba(52, 211, 153, 0.9)' },
		list: { label: 'List', color: 'rgba(251, 191, 36, 0.9)' },
		equation: { label: 'Equation', color: 'rgba(167, 139, 250, 0.9)' },
		image: { label: 'Image', color: 'rgba(244, 114, 182, 0.9)' },
		other: { label: 'Other', color: 'rgba(212, 199, 163, 0.4)' },
	};

	async function runExtraction() {
		if (!fileBase64) {
			error = 'No file data available for extraction';
			return;
		}
		loading = true;
		error = null;
		result = null;

		try {
			const res = await fetch('/api/evidence/extract-docling', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fileBase64, fileName }),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({ error: 'Request failed' }));
				throw new Error(data.error || `HTTP ${res.status}`);
			}

			result = await res.json();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Extraction failed';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (open && !result && !loading && fileBase64) {
			runExtraction();
		}
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay forceMount>
			{#snippet child({ props, open: isOpen })}
				{#if isOpen}
					<div {...props} class="dev-overlay" transition:fade={{ duration: 150 }}></div>
				{/if}
			{/snippet}
		</Dialog.Overlay>
		<Dialog.Content forceMount>
			{#snippet child({ props, open: isOpen })}
				{#if isOpen}
					<div {...props} class="dev-modal" transition:fade={{ duration: 150 }}>
						<!-- Header -->
						<div class="dev-header">
							<div class="dev-header-left">
								<Icon name="file-search" class="dev-header-icon" />
								<div>
									<Dialog.Title class="dev-title">Granite-Docling Extraction</Dialog.Title>
									<Dialog.Description class="dev-subtitle">
										{fileName}
										{#if result}
											<span class="dev-meta">
												{result.blocks.length} blocks
												| {result.pageCount} page{result.pageCount !== 1 ? 's' : ''}
												| {result.processingTimeMs}ms
												| {result.method}
											</span>
										{/if}
									</Dialog.Description>
								</div>
							</div>
							<Dialog.Close class="dev-close-btn">
								<Icon name="x" />
							</Dialog.Close>
						</div>

						<!-- Toolbar -->
						{#if result}
							<div class="dev-toolbar">
								<div class="dev-tab-group">
									{#each [['blocks', 'Blocks'], ['text', 'Full Text'], ['raw', 'Summary']] as [view, label]}
										<button
											class="dev-tab"
											class:active={activeView === view}
											onclick={() => (activeView = view as 'blocks' | 'text' | 'raw')}
										>
											{label}
										</button>
									{/each}
								</div>

								{#if activeView === 'blocks'}
									<div class="dev-filters">
										<select
											class="dev-filter-select"
											onchange={(e) => {
												const v = (e.target as HTMLSelectElement).value;
												filterPage = v ? Number(v) : null;
											}}
										>
											<option value="">All pages</option>
											{#each uniquePages as p}
												<option value={String(p)}>Page {p}</option>
											{/each}
										</select>
										<select
											class="dev-filter-select"
											onchange={(e) => {
												const v = (e.target as HTMLSelectElement).value;
												filterType = v || null;
											}}
										>
											<option value="">All types</option>
											{#each uniqueTypes as t}
												<option value={t}>{blockTypeStyles[t]?.label ?? t}</option>
											{/each}
										</select>
										<span class="dev-count">{filteredBlocks.length} blocks</span>
									</div>
								{/if}
							</div>
						{/if}

						<!-- Content -->
						<ScrollArea.Root type="hover" class="dev-scroll-root">
							<ScrollArea.Viewport class="dev-scroll-viewport">
								<div class="dev-body">
									{#if loading}
										<div class="dev-loading">
											<div class="dev-spinner"></div>
											<span>Running Granite-Docling extraction...</span>
											<span class="dev-loading-hint">IBM 258M VLM analyzing document structure</span>
										</div>
									{:else if error}
										<div class="dev-error">
											<Icon name="alert-circle" />
											<span>{error}</span>
											<button class="dev-retry-btn" onclick={runExtraction}>Retry</button>
										</div>
									{:else if result}
										{#if activeView === 'blocks'}
											<div class="dev-blocks">
												{#each filteredBlocks as block, i}
													{@const style = blockTypeStyles[block.type] ?? blockTypeStyles.other}
													<div class="dev-block">
														<div class="dev-block-header">
															<span
																class="dev-block-type"
																style:color={style.color}
																style:border-color={style.color}
															>
																{style.label}
															</span>
															<span class="dev-block-page">p.{block.page}</span>
															{#if block.bbox}
																<span class="dev-block-bbox" title="Bounding box: [{block.bbox.join(', ')}]">
																	[{block.bbox.join(',')}]
																</span>
															{/if}
														</div>
														<div class="dev-block-text">{block.text}</div>
													</div>
												{/each}
											</div>
										{:else if activeView === 'text'}
											<pre class="dev-fulltext">{result.fullText}</pre>
										{:else}
											<div class="dev-summary">
												<div class="dev-summary-grid">
													<div class="dev-summary-stat">
														<span class="dev-stat-label">Total Blocks</span>
														<span class="dev-stat-value">{result.blocks.length}</span>
													</div>
													<div class="dev-summary-stat">
														<span class="dev-stat-label">Pages</span>
														<span class="dev-stat-value">{result.pageCount}</span>
													</div>
													<div class="dev-summary-stat">
														<span class="dev-stat-label">Characters</span>
														<span class="dev-stat-value">{result.fullText.length.toLocaleString()}</span>
													</div>
													<div class="dev-summary-stat">
														<span class="dev-stat-label">Processing</span>
														<span class="dev-stat-value">{result.processingTimeMs}ms</span>
													</div>
												</div>
												<h3 class="dev-summary-heading">Block Type Distribution</h3>
												<div class="dev-type-list">
													{#each uniqueTypes as t}
														{@const style = blockTypeStyles[t] ?? blockTypeStyles.other}
														{@const count = result.blocks.filter((b) => b.type === t).length}
														<div class="dev-type-row">
															<span class="dev-type-dot" style:background={style.color}></span>
															<span class="dev-type-label">{style.label}</span>
															<span class="dev-type-count">{count}</span>
															<div class="dev-type-bar-bg">
																<div
																	class="dev-type-bar-fill"
																	style:width="{Math.round((count / result.blocks.length) * 100)}%"
																	style:background={style.color}
																></div>
															</div>
														</div>
													{/each}
												</div>
											</div>
										{/if}
									{/if}
								</div>
							</ScrollArea.Viewport>
							<ScrollArea.Scrollbar orientation="vertical" class="dev-scrollbar">
								<ScrollArea.Thumb class="dev-scrollbar-thumb" />
							</ScrollArea.Scrollbar>
						</ScrollArea.Root>
					</div>
				{/if}
			{/snippet}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/* ── Overlay ── */
	.dev-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.65);
		z-index: 999;
	}

	/* ── Modal ── */
	.dev-modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 1000;
		width: min(90vw, 56rem);
		height: min(85vh, 48rem);
		display: flex;
		flex-direction: column;
		background: var(--t-panel, #1a1916);
		border: 1px solid color-mix(in srgb, var(--t-border) 30%, transparent);
		border-radius: 0.75rem;
		overflow: hidden;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
	}

	/* ── Header ── */
	.dev-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem 1.25rem;
		border-bottom: 1px solid color-mix(in srgb, var(--t-border) 20%, transparent);
		flex-shrink: 0;
	}
	.dev-header-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	:global(.dev-header-icon) {
		color: rgba(96, 165, 250, 0.7);
		width: 1.25rem;
		height: 1.25rem;
	}
	:global(.dev-title) {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--t-text, rgba(212, 199, 163, 0.9));
		margin: 0;
	}
	:global(.dev-subtitle) {
		font-size: 0.7rem;
		color: color-mix(in srgb, var(--t-text) 50%, transparent);
		margin: 0.125rem 0 0;
	}
	.dev-meta {
		display: inline-block;
		margin-left: 0.5rem;
		padding-left: 0.5rem;
		border-left: 1px solid color-mix(in srgb, var(--t-border) 30%, transparent);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 0.625rem;
		color: color-mix(in srgb, var(--t-text) 35%, transparent);
	}
	.dev-close-btn {
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		border-radius: 0.375rem;
		color: color-mix(in srgb, var(--t-text) 40%, transparent);
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.dev-close-btn:hover {
		background: color-mix(in srgb, var(--t-text) 8%, transparent);
		color: var(--t-text, rgba(212, 199, 163, 0.9));
	}

	/* ── Toolbar ── */
	.dev-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 1.25rem;
		border-bottom: 1px solid color-mix(in srgb, var(--t-border) 15%, transparent);
		flex-shrink: 0;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.dev-tab-group {
		display: flex;
		gap: 0.125rem;
	}
	.dev-tab {
		padding: 0.375rem 0.625rem;
		font-size: 0.7rem;
		font-weight: 500;
		background: none;
		border: none;
		border-radius: 0.375rem;
		color: color-mix(in srgb, var(--t-text) 40%, transparent);
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.dev-tab:hover {
		background: color-mix(in srgb, var(--t-text) 6%, transparent);
		color: color-mix(in srgb, var(--t-text) 70%, transparent);
	}
	.dev-tab.active {
		background: color-mix(in srgb, var(--t-text) 8%, transparent);
		color: var(--t-text, rgba(212, 199, 163, 0.9));
	}
	.dev-filters {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.dev-filter-select {
		padding: 0.25rem 0.5rem;
		font-size: 0.65rem;
		background: color-mix(in srgb, var(--t-text) 4%, transparent);
		border: 1px solid color-mix(in srgb, var(--t-border) 25%, transparent);
		border-radius: 0.375rem;
		color: color-mix(in srgb, var(--t-text) 60%, transparent);
	}
	.dev-filter-select:focus {
		outline: none;
		border-color: rgba(96, 165, 250, 0.4);
	}
	.dev-count {
		font-size: 0.6rem;
		color: color-mix(in srgb, var(--t-text) 30%, transparent);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
	}

	/* ── Scroll area ── */
	:global(.dev-scroll-root) { flex: 1; overflow: hidden; }
	:global(.dev-scroll-viewport) { height: 100%; }
	:global(.dev-scrollbar) {
		width: 6px;
		padding: 2px;
	}
	:global(.dev-scrollbar-thumb) {
		background: color-mix(in srgb, var(--t-text) 15%, transparent);
		border-radius: 3px;
	}

	/* ── Body ── */
	.dev-body { padding: 1rem 1.25rem; }

	/* ── Loading ── */
	.dev-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 4rem;
		color: color-mix(in srgb, var(--t-text) 50%, transparent);
		font-size: 0.85rem;
	}
	.dev-loading-hint {
		font-size: 0.7rem;
		color: color-mix(in srgb, var(--t-text) 30%, transparent);
	}
	.dev-spinner {
		width: 2rem;
		height: 2rem;
		border: 2px solid color-mix(in srgb, var(--t-border) 30%, transparent);
		border-top-color: rgba(96, 165, 250, 0.6);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	/* ── Error ── */
	.dev-error {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 3rem;
		color: #f87171;
		font-size: 0.85rem;
	}
	.dev-retry-btn {
		padding: 0.375rem 0.75rem;
		font-size: 0.75rem;
		background: rgba(248, 113, 113, 0.1);
		border: 1px solid rgba(248, 113, 113, 0.3);
		border-radius: 0.375rem;
		color: #f87171;
		cursor: pointer;
	}
	.dev-retry-btn:hover { background: rgba(248, 113, 113, 0.2); }

	/* ── Blocks view ── */
	.dev-blocks {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.dev-block {
		padding: 0.75rem;
		background: color-mix(in srgb, var(--t-text) 3%, transparent);
		border: 1px solid color-mix(in srgb, var(--t-border) 15%, transparent);
		border-radius: 0.5rem;
	}
	.dev-block-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.375rem;
	}
	.dev-block-type {
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.125rem 0.375rem;
		border: 1px solid;
		border-radius: 0.25rem;
	}
	.dev-block-page {
		font-size: 0.6rem;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		color: color-mix(in srgb, var(--t-text) 30%, transparent);
	}
	.dev-block-bbox {
		font-size: 0.55rem;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		color: color-mix(in srgb, var(--t-text) 20%, transparent);
	}
	.dev-block-text {
		font-size: 0.8rem;
		line-height: 1.6;
		color: color-mix(in srgb, var(--t-text) 80%, transparent);
		white-space: pre-wrap;
		word-break: break-word;
	}

	/* ── Full text view ── */
	.dev-fulltext {
		font-size: 0.78rem;
		line-height: 1.7;
		color: color-mix(in srgb, var(--t-text) 75%, transparent);
		white-space: pre-wrap;
		word-break: break-word;
		margin: 0;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
	}

	/* ── Summary view ── */
	.dev-summary-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}
	.dev-summary-stat {
		padding: 0.75rem;
		background: color-mix(in srgb, var(--t-text) 3%, transparent);
		border: 1px solid color-mix(in srgb, var(--t-border) 15%, transparent);
		border-radius: 0.5rem;
		text-align: center;
	}
	.dev-stat-label {
		display: block;
		font-size: 0.6rem;
		color: color-mix(in srgb, var(--t-text) 35%, transparent);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-bottom: 0.25rem;
	}
	.dev-stat-value {
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--t-text, rgba(212, 199, 163, 0.9));
		font-family: 'JetBrains Mono', ui-monospace, monospace;
	}
	.dev-summary-heading {
		font-size: 0.75rem;
		font-weight: 600;
		color: color-mix(in srgb, var(--t-text) 60%, transparent);
		margin: 0 0 0.75rem;
	}
	.dev-type-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.dev-type-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.dev-type-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.dev-type-label {
		font-size: 0.75rem;
		color: color-mix(in srgb, var(--t-text) 60%, transparent);
		min-width: 5rem;
	}
	.dev-type-count {
		font-size: 0.7rem;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		color: color-mix(in srgb, var(--t-text) 40%, transparent);
		min-width: 2rem;
	}
	.dev-type-bar-bg {
		flex: 1;
		height: 0.375rem;
		background: color-mix(in srgb, var(--t-text) 5%, transparent);
		border-radius: 0.25rem;
		overflow: hidden;
	}
	.dev-type-bar-fill {
		height: 100%;
		border-radius: 0.25rem;
		transition: width 0.3s ease;
	}
</style>
