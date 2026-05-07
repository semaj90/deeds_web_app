<script lang="ts">
	import type { PageData } from './$types';
	import Icon from '$lib/components/ui/Icon.svelte';
	import KeyboardShortcutsHelp from '$lib/components/analysis/KeyboardShortcutsHelp.svelte';
	import AnalysisToast from '$lib/components/analysis/AnalysisToast.svelte';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	interface DocumentAnalysisData {
		extractedText: string | null;
		textLength: number;
		pageCount: number;
		entities: Array<{ type: string; text: string; label?: string }>;
		aceAnalysis: {
			summary: string;
			confidence: number;
			tags: string[];
		} | null;
		citations: Array<{ text: string; type: string }>;
		keyTerms: string[];
	}

	let loading = $state(true);
	let error = $state<string | null>(null);
	let analysis = $state<DocumentAnalysisData | null>(null);
	let activePanel = $state<'text' | 'analysis' | 'citations' | 'entities'>('text');
	let searchQuery = $state('');
	let fontSize = $state(16);
	let showSidebar = $state(true);
	let showHelp = $state(false);
	let toastComponent: { toast: any } | null = $state(null);

	// Load analysis data
	$effect(() => {
		if (data.evidenceId) {
			loadAnalysis();
		}
	});

	async function loadAnalysis() {
		try {
			loading = true;
			const response = await fetch(`/api/document/analysis/${data.evidenceId}`, { signal: AbortSignal.timeout(30_000) });
			if (!response.ok) throw new Error('Failed to load analysis');
			analysis = await response.json();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	function highlightText(text: string, query: string): string {
		if (!query || !text) return text;
		const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
		return text.replace(regex, '<mark>$1</mark>');
	}

	function handleClose() {
		goto('/evidence');
	}

	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function handleExport() {
		if (!analysis) return;

		const exportData = {
			title: data.title,
			evidenceId: data.evidenceId,
			exportDate: new Date().toISOString(),
			extractedText: analysis.extractedText,
			textLength: analysis.textLength,
			pageCount: analysis.pageCount,
			entities: analysis.entities,
			citations: analysis.citations,
			keyTerms: analysis.keyTerms,
			aceAnalysis: analysis.aceAnalysis
		};

		const blob = new Blob([JSON.stringify(exportData, null, 2)], {
			type: 'application/json'
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		const filename = `document-analysis-${data.evidenceId}-${new Date().toISOString().split('T')[0]}.json`;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);

		// Show success toast
		toastComponent?.toast.success(`Exported ${filename}`);
	}

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text).then(() => {
			toastComponent?.toast.success('Copied to clipboard');
		}).catch(() => {
			toastComponent?.toast.error('Failed to copy');
		});
	}

	let searchInputRef = $state<HTMLInputElement | null>(null);

	function handleKeydown(e: KeyboardEvent) {
		const tag = (e.target as HTMLElement)?.tagName;
		const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

		// ESC to close (or close help/search if open)
		if (e.key === 'Escape' && !isInput) {
			e.preventDefault();
			if (showHelp) {
				showHelp = false;
			} else if (searchQuery) {
				searchQuery = '';
			} else {
				handleClose();
			}
		}

		// ? to toggle help
		if (e.key === '?' && !isInput) {
			e.preventDefault();
			showHelp = !showHelp;
		}

		// Ctrl+F to focus search
		if (e.ctrlKey && e.key === 'f') {
			e.preventDefault();
			searchInputRef?.focus();
		}

		// Ctrl+E to export
		if (e.ctrlKey && e.key === 'e') {
			e.preventDefault();
			handleExport();
		}

		// Ctrl+B to toggle sidebar
		if (e.ctrlKey && e.key === 'b') {
			e.preventDefault();
			showSidebar = !showSidebar;
		}

		// Ctrl + Plus/Minus to adjust font size
		if (e.ctrlKey && (e.key === '+' || e.key === '=')) {
			e.preventDefault();
			fontSize = Math.min(24, fontSize + 2);
		}
		if (e.ctrlKey && e.key === '-') {
			e.preventDefault();
			fontSize = Math.max(12, fontSize - 2);
		}

		// Number keys 1-4 to switch sidebar panels
		if (!e.ctrlKey && !e.altKey && !e.shiftKey && !isInput) {
			if (e.key === '1') activePanel = 'text';
			if (e.key === '2') activePanel = 'analysis';
			if (e.key === '3') activePanel = 'citations';
			if (e.key === '4') activePanel = 'entities';
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
	<title>{data.title || 'Document Analysis'} | Legal AI</title>
</svelte:head>

<!-- Professional Document Editor Layout -->
<div class="document-editor">
	<!-- Top Toolbar -->
	<div class="toolbar">
		<div class="toolbar-left">
			<button type="button" class="tool-btn tool-btn-close" onclick={handleClose} title="Close (ESC)">
				<Icon name="x" />
			</button>
			<div class="toolbar-divider"></div>
			<div class="toolbar-title">
				<Icon name="file-text" />
				<span>{data.title || 'Document Analysis'}</span>
			</div>
		</div>

		<div class="toolbar-center">
			{#if analysis}
				<div class="document-metadata">
					{#if analysis.pageCount > 0}
						<span class="meta-chip">
							<Icon name="book-open" />
							{analysis.pageCount} pages
						</span>
					{/if}
					<span class="meta-chip">
						<Icon name="type" />
						{analysis.textLength.toLocaleString()} characters
					</span>
					{#if analysis.entities.length > 0}
						<span class="meta-chip">
							<Icon name="tag" />
							{analysis.entities.length} entities
						</span>
					{/if}
				</div>
			{/if}
		</div>

		<div class="toolbar-right">
			<button
				type="button"
				class="tool-btn"
				onclick={() => (fontSize = Math.max(12, fontSize - 2))}
				title="Decrease font size"
			>
				<Icon name="zoom-out" />
			</button>
			<span class="font-size-display">{fontSize}px</span>
			<button
				type="button"
				class="tool-btn"
				onclick={() => (fontSize = Math.min(24, fontSize + 2))}
				title="Increase font size"
			>
				<Icon name="zoom-in" />
			</button>
			<div class="toolbar-divider"></div>
			<button
				type="button"
				class="tool-btn"
				class:active={showSidebar}
				onclick={() => (showSidebar = !showSidebar)}
				title="Toggle sidebar (Ctrl+B)"
			>
				<Icon name="panel-right" />
			</button>
			<div class="keyboard-hint">Ctrl+B</div>
			<div class="toolbar-divider"></div>
			<button type="button" class="tool-btn" onclick={handleExport} disabled={!analysis} title="Export (Ctrl+E)">
				<Icon name="download" />
			</button>
			<div class="keyboard-hint">Ctrl+E</div>
		</div>
	</div>

	{#if loading}
		<div class="loading-state">
			<Icon name="loader-circle" class="animate-spin" />
			<p>Loading document analysis...</p>
		</div>
	{:else if error || data.loadError}
		<div class="error-state">
			<Icon name="alert-circle" />
			<p>{error || data.loadError}</p>
			<button type="button" class="btn-primary" onclick={handleClose}>
				Back to Evidence
			</button>
		</div>
	{:else}
		<!-- Main Content Area -->
		<div class="content-area">
			<!-- Document Viewer (Center) -->
			<div class="document-viewer">
				<!-- Search Bar -->
				<div class="search-bar">
					<Icon name="search" />
					<input
						type="text"
						placeholder="Search document... (Ctrl+F)"
						bind:value={searchQuery}
						bind:this={searchInputRef}
						class="search-input"
					/>
					{#if searchQuery}
						<button type="button" class="clear-search" onclick={() => (searchQuery = '')}>
							<Icon name="x" />
						</button>
					{:else}
						<div class="keyboard-hint">Ctrl+F</div>
					{/if}
				</div>

				<!-- Document Content -->
				<div class="document-content" style="font-size: {fontSize}px;">
					{#if analysis?.extractedText}
						<div class="document-text">
							{#if searchQuery}
								{@html highlightText(analysis.extractedText, searchQuery)}
							{:else}
								{analysis.extractedText}
							{/if}
						</div>
					{:else}
						<div class="empty-state">
							<Icon name="file-x" />
							<p>No text extracted from document</p>
						</div>
					{/if}
				</div>
			</div>

			<!-- Right Sidebar (Analysis Panels) -->
			{#if showSidebar}
				<div class="sidebar">
					<!-- Panel Tabs -->
					<div class="sidebar-tabs">
						<button
							type="button"
							class="sidebar-tab"
							class:active={activePanel === 'text'}
							onclick={() => (activePanel = 'text')}
						>
							<Icon name="info" />
							Info
						</button>
						<button
							type="button"
							class="sidebar-tab"
							class:active={activePanel === 'analysis'}
							onclick={() => (activePanel = 'analysis')}
						>
							<Icon name="brain" />
							Analysis
						</button>
						<button
							type="button"
							class="sidebar-tab"
							class:active={activePanel === 'citations'}
							onclick={() => (activePanel = 'citations')}
						>
							<Icon name="scale" />
							Citations
							{#if analysis && analysis.citations.length > 0}
								<span class="badge">{analysis.citations.length}</span>
							{/if}
						</button>
						<button
							type="button"
							class="sidebar-tab"
							class:active={activePanel === 'entities'}
							onclick={() => (activePanel = 'entities')}
						>
							<Icon name="tag" />
							Entities
							{#if analysis && analysis.entities.length > 0}
								<span class="badge">{analysis.entities.length}</span>
							{/if}
						</button>
					</div>

					<!-- Panel Content -->
					<div class="sidebar-content">
						{#if activePanel === 'text'}
							<div class="sidebar-panel">
								<h3><Icon name="info" /> Document Info</h3>
								<div class="info-list">
									{#if analysis}
										<div class="info-item">
											<span class="info-label">Pages</span>
											<span class="info-value">{analysis.pageCount || 'N/A'}</span>
										</div>
										<div class="info-item">
											<span class="info-label">Characters</span>
											<span class="info-value">{analysis.textLength.toLocaleString()}</span>
										</div>
										<div class="info-item">
											<span class="info-label">Entities</span>
											<span class="info-value">{analysis.entities.length}</span>
										</div>
										<div class="info-item">
											<span class="info-label">Citations</span>
											<span class="info-value">{analysis.citations.length}</span>
										</div>
										<div class="info-item">
											<span class="info-label">Key Terms</span>
											<span class="info-value">{analysis.keyTerms.length}</span>
										</div>
									{/if}
								</div>
							</div>
						{:else if activePanel === 'analysis'}
							<div class="sidebar-panel">
								{#if analysis?.aceAnalysis}
									<h3><Icon name="brain" /> AI Analysis</h3>
									<div class="analysis-content">
										<div class="analysis-section">
											<h4>Summary</h4>
											<p class="summary-text">{analysis.aceAnalysis.summary}</p>
										</div>
										{#if analysis.aceAnalysis.confidence}
											<div class="analysis-section">
												<h4>Confidence</h4>
												<div class="confidence-bar">
													<div class="confidence-fill" style="width: {analysis.aceAnalysis.confidence * 100}%"></div>
													<span class="confidence-value">{Math.round(analysis.aceAnalysis.confidence * 100)}%</span>
												</div>
											</div>
										{/if}
										{#if analysis.aceAnalysis.tags.length > 0}
											<div class="analysis-section">
												<h4>Tags</h4>
												<div class="tags-list">
													{#each analysis.aceAnalysis.tags as tag}
														<span class="tag">{tag}</span>
													{/each}
												</div>
											</div>
										{/if}
									</div>
								{:else}
									<div class="empty-panel">
										<Icon name="brain" />
										<p>No analysis available</p>
									</div>
								{/if}
							</div>
						{:else if activePanel === 'citations'}
							<div class="sidebar-panel">
								<h3><Icon name="scale" /> Legal Citations</h3>
								{#if analysis && analysis.citations.length > 0}
									<div class="citations-list">
										{#each analysis.citations as citation}
											<div class="citation-item">
												<div class="citation-type">{citation.type}</div>
												<div class="citation-text">{citation.text}</div>
											</div>
										{/each}
									</div>
								{:else}
									<div class="empty-panel">
										<Icon name="scale-off" />
										<p>No citations found</p>
									</div>
								{/if}
							</div>
						{:else if activePanel === 'entities'}
							<div class="sidebar-panel">
								<h3><Icon name="tag" /> Extracted Entities</h3>
								{#if analysis && analysis.entities.length > 0}
									<div class="entities-list">
										{#each analysis.entities as entity}
											<div class="entity-item">
												<span class="entity-type">{entity.type}</span>
												<span class="entity-text">"{entity.text}"</span>
											</div>
										{/each}
									</div>
								{:else}
									<div class="empty-panel">
										<Icon name="tag-off" />
										<p>No entities extracted</p>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.document-editor {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: var(--t-bg);
		color: var(--t-text);
	}

	/* ═══ Toolbar ═══ */
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 52px;
		padding: 0 0.75rem;
		background: var(--t-panel);
		border-bottom: 1px solid var(--t-border);
		flex-shrink: 0;
	}

	.toolbar-left,
	.toolbar-center,
	.toolbar-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.toolbar-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--t-text);
	}

	.toolbar-divider {
		width: 1px;
		height: 24px;
		background: var(--t-border);
		margin: 0 0.25rem;
	}

	.tool-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 0.375rem;
		background: transparent;
		border: none;
		color: var(--t-text-secondary);
		cursor: pointer;
		transition: all 0.2s;
	}

	.tool-btn:hover {
		background: var(--t-panel-soft);
		color: var(--t-text);
	}

	.tool-btn.active {
		background: var(--t-accent-soft);
		color: var(--t-accent);
	}

	.tool-btn-close:hover {
		background: var(--t-danger);
		color: white;
	}

	.document-metadata {
		display: flex;
		gap: 0.75rem;
	}

	.meta-chip {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		background: var(--t-panel-soft);
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--t-text-secondary);
	}

	.font-size-display {
		font-size: 0.75rem;
		font-family: monospace;
		color: var(--t-text-secondary);
		min-width: 40px;
		text-align: center;
	}

	.keyboard-hint {
		font-size: 0.65rem;
		font-family: monospace;
		color: var(--t-text-secondary);
		opacity: 0.6;
		padding: 0.125rem 0.375rem;
		background: var(--t-bg);
		border-radius: 0.25rem;
		border: 1px solid var(--t-border);
	}

	.tool-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* ═══ Content Area ═══ */
	.content-area {
		display: flex;
		flex: 1;
		overflow: hidden;
	}

	/* ═══ Document Viewer (Center) ═══ */
	.document-viewer {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: white;
		color: #1a1a1a;
	}

	.search-bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1.5rem;
		background: var(--t-panel);
		border-bottom: 1px solid var(--t-border);
		color: var(--t-text);
	}

	.search-input {
		flex: 1;
		background: var(--t-bg);
		border: 1px solid var(--t-border);
		border-radius: 0.375rem;
		padding: 0.5rem 0.75rem;
		color: var(--t-text);
		font-size: 0.875rem;
	}

	.search-input:focus {
		outline: 2px solid var(--t-accent);
		outline-offset: 0;
	}

	.clear-search {
		background: transparent;
		border: none;
		color: var(--t-text-secondary);
		cursor: pointer;
		padding: 0.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.clear-search:hover {
		color: var(--t-text);
	}

	.document-content {
		flex: 1;
		overflow-y: auto;
		padding: 3rem;
		max-width: 900px;
		margin: 0 auto;
		width: 100%;
	}

	.document-text {
		line-height: 1.8;
		white-space: pre-wrap;
		font-family: 'Georgia', 'Times New Roman', serif;
	}

	.document-text :global(mark) {
		background: #ffeb3b;
		color: #000;
		padding: 0.125rem 0.25rem;
		border-radius: 0.125rem;
	}

	/* ═══ Sidebar (Right) ═══ */
	.sidebar {
		width: 320px;
		background: var(--t-panel);
		border-left: 1px solid var(--t-border);
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}

	.sidebar-tabs {
		display: flex;
		background: var(--t-bg);
		border-bottom: 1px solid var(--t-border);
		padding: 0.25rem;
		gap: 0.25rem;
	}

	.sidebar-tab {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		padding: 0.5rem 0.75rem;
		background: transparent;
		border: none;
		border-radius: 0.375rem;
		color: var(--t-text-secondary);
		cursor: pointer;
		transition: all 0.2s;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.sidebar-tab:hover {
		background: var(--t-panel-soft);
		color: var(--t-text);
	}

	.sidebar-tab.active {
		background: var(--t-panel);
		color: var(--t-accent);
	}

	.sidebar-content {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
	}

	.sidebar-panel h3 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		font-weight: 700;
		margin-bottom: 1.5rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--t-text);
	}

	/* Info Panel */
	.info-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.info-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem;
		background: var(--t-bg);
		border-radius: 0.375rem;
	}

	.info-label {
		font-size: 0.875rem;
		color: var(--t-text-secondary);
	}

	.info-value {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--t-text);
	}

	/* Analysis Panel */
	.analysis-content {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.analysis-section h4 {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.75rem;
		color: var(--t-text-secondary);
	}

	.summary-text {
		font-size: 0.875rem;
		line-height: 1.6;
		color: var(--t-text-secondary);
	}

	.confidence-bar {
		position: relative;
		height: 32px;
		background: var(--t-bg);
		border-radius: 0.375rem;
		overflow: hidden;
	}

	.confidence-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--t-accent-soft), var(--t-accent));
		transition: width 0.5s ease;
	}

	.confidence-value {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-weight: 700;
		font-size: 0.875rem;
		color: var(--t-text);
	}

	.tags-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.tag {
		padding: 0.375rem 0.75rem;
		background: var(--t-accent-soft);
		color: var(--t-accent);
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	/* Citations Panel */
	.citations-list,
	.entities-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.citation-item,
	.entity-item {
		padding: 0.75rem;
		background: var(--t-bg);
		border-radius: 0.375rem;
		border: 1px solid var(--t-border);
	}

	.citation-type,
	.entity-type {
		display: inline-block;
		padding: 0.125rem 0.5rem;
		background: var(--t-accent-soft);
		color: var(--t-accent);
		border-radius: 0.25rem;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.5rem;
	}

	.citation-text,
	.entity-text {
		font-size: 0.875rem;
		color: var(--t-text-secondary);
		line-height: 1.5;
	}

	/* States */
	.loading-state,
	.error-state,
	.empty-state,
	.empty-panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 200px;
		gap: 1rem;
		color: var(--t-text-secondary);
	}

	.badge {
		padding: 0.125rem 0.375rem;
		background: var(--t-accent-soft);
		color: var(--t-accent);
		border-radius: 999px;
		font-size: 0.65rem;
		font-weight: 700;
	}
</style>

<!-- Help Panel -->
<KeyboardShortcutsHelp bind:open={showHelp} type="document" />

<!-- Toast Notifications -->
<AnalysisToast bind:this={toastComponent} />
