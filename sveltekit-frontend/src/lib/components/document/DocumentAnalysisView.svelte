<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		evidenceId: string;
	}

	let { evidenceId }: Props = $props();

	interface Chunk {
		text: string;
		chunkIndex: number;
	}

	interface Entity {
		type: string;
		text: string;
		label?: string;
	}

	interface Citation {
		text: string;
		type: string;
	}

	interface ACEAnalysis {
		summary: string;
		confidence: number;
		tags: string[];
		claims?: string[];
	}

	interface DocumentAnalysis {
		evidenceId: string;
		title: string;
		fileName: string;
		fileSize: number;
		processingStatus: string;
		extractedText: string | null;
		textLength: number;
		pageCount: number;
		chunks: Chunk[];
		entities: Entity[];
		aceAnalysis: ACEAnalysis | null;
		citations: Citation[];
		keyTerms: string[];
		createdAt: string;
	}

	let loading = $state(true);
	let error = $state<string | null>(null);
	let analysis = $state<DocumentAnalysis | null>(null);
	let activeTab = $state<'text' | 'analysis' | 'citations' | 'entities'>('text');
	let searchQuery = $state('');

	onMount(async () => {
		try {
			const response = await fetch(`/api/document/analysis/${evidenceId}`);
			if (!response.ok) {
				throw new Error('Failed to load document analysis');
			}
			analysis = await response.json();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	});

	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function highlightText(text: string, query: string): string {
		if (!query || !text) return text;
		const regex = new RegExp(`(${query})`, 'gi');
		return text.replace(regex, '<mark>$1</mark>');
	}
</script>

<div class="document-analysis-view">
	{#if loading}
		<div class="loading-state">
			<Icon name="loader-circle" class="animate-spin text-accent" />
			<p class="text-sm text-neutral-400 mt-2">Loading document analysis...</p>
		</div>
	{:else if error}
		<div class="error-state">
			<Icon name="alert-circle" class="text-danger" />
			<p class="text-sm text-danger mt-2">{error}</p>
		</div>
	{:else if analysis}
		<!-- Header -->
		<div class="analysis-header">
			<div class="flex items-center gap-2">
				<Icon name="file-text" class="text-accent" />
				<h1 class="text-xl font-semibold">{analysis.title}</h1>
			</div>
			<div class="metadata-row">
				<span class="metadata-item">
					<Icon name="file" class="text-neutral-400" />
					{analysis.fileName}
				</span>
				<span class="metadata-item">
					<Icon name="hard-drive" class="text-neutral-400" />
					{formatFileSize(analysis.fileSize)}
				</span>
				{#if analysis.pageCount > 0}
					<span class="metadata-item">
						<Icon name="book-open" class="text-neutral-400" />
						{analysis.pageCount} pages
					</span>
				{/if}
				<span class="metadata-item status-{analysis.processingStatus}">
					<Icon name="check-circle" />
					{analysis.processingStatus}
				</span>
			</div>
		</div>

		<!-- Tabs -->
		<div class="tabs-container">
			<button type="button" class="tab" class:active={activeTab === 'text'} onclick={() => (activeTab = 'text')}>
				<Icon name="file-text" />
				Full Text
			</button>
			<button type="button" class="tab" class:active={activeTab === 'analysis'} onclick={() => (activeTab = 'analysis')}>
				<Icon name="brain" />
				Analysis
			</button>
			<button type="button" class="tab" class:active={activeTab === 'citations'} onclick={() => (activeTab = 'citations')}>
				<Icon name="scale" />
				Citations ({analysis.citations.length})
			</button>
			<button type="button" class="tab" class:active={activeTab === 'entities'} onclick={() => (activeTab = 'entities')}>
				<Icon name="tag" />
				Entities ({analysis.entities.length})
			</button>
		</div>

		<!-- Tab Content -->
		<div class="tab-content">
			{#if activeTab === 'text'}
				<div class="text-panel">
					{#if analysis.extractedText}
						<div class="search-bar">
							<Icon name="search" />
							<input type="text" placeholder="Search..." bind:value={searchQuery} class="search-input" />
						</div>
						<div class="extracted-text">
							{#if searchQuery}
								{@html highlightText(analysis.extractedText, searchQuery)}
							{:else}
								{analysis.extractedText}
							{/if}
						</div>
					{:else}
						<div class="empty-state">
							<Icon name="file-x" />
							<p class="text-sm mt-2">No text extracted</p>
						</div>
					{/if}
				</div>
			{:else if activeTab === 'analysis'}
				<div class="analysis-panel">
					{#if analysis.aceAnalysis}
						<div class="ace-section">
							<h3><Icon name="file-text" /> Summary</h3>
							<p>{analysis.aceAnalysis.summary}</p>
						</div>
						<div class="ace-section">
							<h3><Icon name="tags" /> Tags</h3>
							<div class="tags-list">
								{#each analysis.aceAnalysis.tags as tag}
									<span class="tag">{tag}</span>
								{/each}
							</div>
						</div>
					{:else}
						<div class="empty-state">
							<Icon name="brain-x" />
							<p class="text-sm mt-2">No analysis available</p>
						</div>
					{/if}
				</div>
			{:else if activeTab === 'citations'}
				<div class="citations-panel">
					{#if analysis.citations.length > 0}
						<div class="citations-list">
							{#each analysis.citations as citation}
								<div class="citation-item">
									<Icon name="scale" />
									<span>{citation.text}</span>
								</div>
							{/each}
						</div>
					{:else}
						<div class="empty-state">
							<Icon name="scale-x" />
							<p class="text-sm mt-2">No citations found</p>
						</div>
					{/if}
				</div>
			{:else if activeTab === 'entities'}
				<div class="entities-panel">
					{#if analysis.entities.length > 0}
						<div class="entities-list">
							{#each analysis.entities as entity}
								<div class="entity-item">
									<span class="entity-type">{entity.type}</span>
									<span>"{entity.text}"</span>
								</div>
							{/each}
						</div>
					{:else}
						<div class="empty-state">
							<Icon name="tag-x" />
							<p class="text-sm mt-2">No entities extracted</p>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.document-analysis-view {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		height: 100%;
	}

	.loading-state,
	.error-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
	}

	.analysis-header {
		background: var(--t-panel);
		border: 1px solid var(--t-border);
		border-radius: 0.5rem;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.metadata-row {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		font-size: 0.875rem;
		color: var(--t-text-secondary);
	}

	.metadata-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.status-complete {
		color: var(--t-success);
	}

	.tabs-container {
		display: flex;
		gap: 0.5rem;
		border-bottom: 1px solid var(--t-border);
		padding-bottom: 0.5rem;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border: none;
		background: transparent;
		color: var(--t-text-secondary);
		cursor: pointer;
		border-radius: 0.375rem;
		transition: all 0.2s;
	}

	.tab:hover {
		background: var(--t-panel-soft);
	}

	.tab.active {
		background: var(--t-accent-soft);
		color: var(--t-accent);
	}

	.tab-content {
		flex: 1;
		overflow-y: auto;
		background: var(--t-panel);
		border: 1px solid var(--t-border);
		border-radius: 0.5rem;
		padding: 1.5rem;
	}

	.search-bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: var(--t-bg);
		border: 1px solid var(--t-border);
		border-radius: 0.375rem;
		margin-bottom: 1rem;
	}

	.search-input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		color: var(--t-text);
	}

	.extracted-text {
		line-height: 1.8;
		white-space: pre-wrap;
		color: var(--t-text);
		padding: 1.5rem;
		background: var(--t-bg);
		border-radius: 0.5rem;
	}

	.extracted-text :global(mark) {
		background: var(--t-accent-soft);
		color: var(--t-accent);
	}

	.ace-section {
		margin-bottom: 1.5rem;
	}

	.ace-section h3 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
	}

	.tags-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.tag {
		padding: 0.25rem 0.75rem;
		background: var(--t-accent-soft);
		color: var(--t-accent);
		border-radius: 9999px;
		font-size: 0.875rem;
	}

	.citations-list,
	.entities-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.citation-item,
	.entity-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: var(--t-bg);
		border: 1px solid var(--t-border);
		border-radius: 0.375rem;
	}

	.entity-type {
		padding: 0.25rem 0.5rem;
		background: var(--t-accent-soft);
		color: var(--t-accent);
		border-radius: 0.25rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
	}
</style>
