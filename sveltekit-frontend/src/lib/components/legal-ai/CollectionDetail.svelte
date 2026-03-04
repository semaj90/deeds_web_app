<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Citation {
		id: string;
		caseId?: string;
		documentId?: string;
		pageNumber?: number;
		createdAt?: string;
		addedAt?: string;
		quotedText?: string;
		citationType?: string;
		relevanceScore?: number;
		formattedCitation?: string;
		isKeyAuthority?: boolean;
	}

	interface Collection {
		id: string;
		name: string;
		description?: string;
		color?: string;
		isPublic: boolean;
		citationCount?: number;
		createdAt: string;
		updatedAt?: string;
	}

	interface Props {
		collection: Collection;
		ondeleted?: (id: string) => void;
		onback?: () => void;
	}

	let { collection, ondeleted, onback }: Props = $props();
	let citations: Citation[] = $state([]);
	let isLoading = $state(true);
	let error: string | null = $state(null);
	let exportFormat = $state<string | null>(null);
	let isExporting = $state(false);

	$effect(() => {
		loadCitations();
	});

	async function loadCitations() {
		isLoading = true;
		error = null;
		try {
			const res = await fetch(`/api/citations/collections/${collection.id}`);
			if (!res.ok) {
				error = `Failed to load citations (${res.status})`;
				return;
			}
			const data = await res.json();
			citations = data.citations ?? [];
		} catch (err) {
			error = err instanceof Error ? err.message : 'An error occurred';
		} finally {
			isLoading = false;
		}
	}

	async function removeCitation(citationId: string) {
		if (!confirm('Remove this citation from the collection?')) return;
		try {
			const res = await fetch(`/api/citations/collections/${collection.id}/citations`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ citationId }),
			});
			if (res.ok) {
				citations = citations.filter((c) => c.id !== citationId);
			} else {
				alert('Failed to remove citation');
			}
		} catch (err) {
			console.error('Error removing citation:', err);
			alert('Error removing citation');
		}
	}

	async function deleteCollection() {
		if (!confirm(`Delete "${collection.name}"? This cannot be undone.`)) return;
		try {
			const res = await fetch(`/api/citations/collections/${collection.id}`, {
				method: 'DELETE',
			});
			if (res.ok) {
				ondeleted?.(collection.id);
			} else {
				alert('Failed to delete collection');
			}
		} catch (err) {
			console.error('Error deleting collection:', err);
			alert('Error deleting collection');
		}
	}

	async function exportCollection(format: string) {
		isExporting = true;
		try {
			const res = await fetch(
				`/api/citations/collections/${collection.id}/export?format=${format}`
			);
			if (!res.ok) {
				alert(`Export failed (${res.status})`);
				return;
			}
			const blob = await res.blob();
			const ext = format === 'markdown' ? 'md' : format;
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${collection.name.replace(/\s+/g, '-').toLowerCase()}.${ext}`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (err) {
			console.error('Export error:', err);
			alert('Export failed');
		} finally {
			isExporting = false;
			exportFormat = null;
		}
	}

	function relevanceBadge(score: number | undefined): string {
		if (!score) return 'low';
		if (score >= 0.8) return 'high';
		if (score >= 0.5) return 'medium';
		return 'low';
	}
</script>

<div class="collection-detail">
	<div class="detail-header">
		<div class="header-left">
			{#if onback}
				<button class="btn-back" onclick={onback}>
					<Icon name="arrow-left" size={16} />
					Back
				</button>
			{/if}
			<h2>
				{#if collection.color}
					<span class="color-dot" style="background:{collection.color}"></span>
				{/if}
				{collection.name}
			</h2>
			{#if collection.description}
				<p class="description">{collection.description}</p>
			{/if}
			<div class="meta">
				<span>{citations.length} citation{citations.length !== 1 ? 's' : ''}</span>
				<span class="visibility-badge">
					<Icon name={collection.isPublic ? 'globe' : 'lock'} size={14} />
					{collection.isPublic ? 'Public' : 'Private'}
				</span>
			</div>
		</div>

		<div class="header-actions">
			<div class="export-group">
				<Button onclick={() => (exportFormat = exportFormat ? null : 'html')}>
					<Icon name="download" size={14} />
					Export
				</Button>
				{#if exportFormat !== null}
					<div class="export-dropdown">
						<button onclick={() => exportCollection('html')}>HTML</button>
						<button onclick={() => exportCollection('markdown')}>Markdown</button>
						<button onclick={() => exportCollection('json')}>JSON</button>
					</div>
				{/if}
			</div>
			<Button onclick={deleteCollection}>
				<Icon name="trash-2" size={14} />
				Delete
			</Button>
		</div>
	</div>

	<div class="citations-section">
		{#if isLoading}
			<div class="state-message">
				<div class="spinner"></div>
				<p>Loading citations...</p>
			</div>
		{:else if error}
			<div class="state-message error-state">
				<Icon name="alert-circle" size={24} />
				<p>{error}</p>
				<Button onclick={loadCitations}>Retry</Button>
			</div>
		{:else if citations.length === 0}
			<div class="state-message">
				<Icon name="file-text" size={24} />
				<p>No citations in this collection yet</p>
			</div>
		{:else}
			<div class="citations-list">
				{#each citations as citation (citation.id)}
					<div class="citation-item">
						<div class="citation-content">
							{#if citation.formattedCitation}
								<div class="formatted">{citation.formattedCitation}</div>
							{/if}
							{#if citation.quotedText}
								<div class="quoted-text">"{citation.quotedText}"</div>
							{/if}
							<div class="citation-meta">
								{#if citation.citationType}
									<span class="type-badge">{citation.citationType}</span>
								{/if}
								{#if citation.relevanceScore}
									<span
										class="relevance-badge relevance-{relevanceBadge(citation.relevanceScore)}"
									>
										{Math.round(citation.relevanceScore * 100)}%
									</span>
								{/if}
								{#if citation.isKeyAuthority}
									<span class="key-authority">
										<Icon name="star" size={12} />
										Key Authority
									</span>
								{/if}
								{#if citation.pageNumber}
									<span class="page-ref">p. {citation.pageNumber}</span>
								{/if}
							</div>
						</div>
						<button
							class="btn-remove"
							onclick={() => removeCitation(citation.id)}
							title="Remove from collection"
						>
							<Icon name="x" size={14} />
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.collection-detail {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 1.5rem;
		background-color: var(--panel, #1c1917);
		border: 1px solid var(--sand-dark, #44403c);
		border-radius: 8px;
	}

	.detail-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--sand-dark, #44403c);
	}

	.header-left {
		flex: 1;
	}

	.btn-back {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		background: none;
		border: none;
		color: var(--accent, #8b2332);
		cursor: pointer;
		font-size: 0.85rem;
		padding: 0;
		margin-bottom: 0.5rem;
	}
	.btn-back:hover {
		text-decoration: underline;
	}

	.header-left h2 {
		margin: 0;
		font-size: 1.4rem;
		color: var(--sand, #d6d3d1);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.color-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		display: inline-block;
		flex-shrink: 0;
	}

	.description {
		margin: 0.5rem 0 0 0;
		color: var(--sand-dark, #a8a29e);
		font-size: 0.9rem;
		line-height: 1.4;
	}

	.meta {
		display: flex;
		gap: 1rem;
		margin-top: 0.75rem;
		font-size: 0.8rem;
		color: var(--sand-dark, #a8a29e);
	}

	.visibility-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}

	.header-actions {
		display: flex;
		gap: 0.5rem;
		align-items: flex-start;
	}

	.export-group {
		position: relative;
	}

	.export-dropdown {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 4px;
		background: var(--panel, #1c1917);
		border: 1px solid var(--sand-dark, #44403c);
		border-radius: 6px;
		z-index: 10;
		min-width: 120px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.export-dropdown button {
		display: block;
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: none;
		border: none;
		color: var(--sand, #d6d3d1);
		text-align: left;
		cursor: pointer;
		font-size: 0.85rem;
	}
	.export-dropdown button:hover {
		background-color: var(--sand-dark, #44403c);
	}

	.citations-section {
		min-height: 150px;
	}

	.state-message {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 150px;
		gap: 0.75rem;
		color: var(--sand-dark, #a8a29e);
	}

	.error-state {
		color: var(--danger, #ef4444);
	}

	.spinner {
		width: 28px;
		height: 28px;
		border: 3px solid var(--sand-dark, #44403c);
		border-top-color: var(--accent, #8b2332);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.citations-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.citation-item {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.75rem;
		background-color: var(--panel-soft, #292524);
		border: 1px solid var(--sand-dark, #44403c);
		border-radius: 6px;
		transition: border-color 0.2s;
	}
	.citation-item:hover {
		border-color: var(--accent, #8b2332);
	}

	.citation-content {
		flex: 1;
		min-width: 0;
	}

	.formatted {
		font-size: 0.9rem;
		color: var(--sand, #d6d3d1);
		font-weight: 500;
		margin-bottom: 0.35rem;
	}

	.quoted-text {
		font-size: 0.8rem;
		color: var(--sand-dark, #a8a29e);
		font-style: italic;
		line-height: 1.4;
		margin-bottom: 0.4rem;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.citation-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
	}

	.type-badge {
		font-size: 0.7rem;
		padding: 2px 6px;
		background-color: var(--sand-dark, #44403c);
		color: var(--sand, #d6d3d1);
		border-radius: 3px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.relevance-badge {
		font-size: 0.7rem;
		padding: 2px 6px;
		border-radius: 3px;
		font-weight: 600;
	}
	.relevance-high {
		background-color: rgba(34, 197, 94, 0.2);
		color: #4ade80;
	}
	.relevance-medium {
		background-color: rgba(234, 179, 8, 0.2);
		color: #facc15;
	}
	.relevance-low {
		background-color: rgba(239, 68, 68, 0.2);
		color: #f87171;
	}

	.key-authority {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		font-size: 0.7rem;
		padding: 2px 6px;
		background-color: rgba(234, 179, 8, 0.15);
		color: #facc15;
		border-radius: 3px;
	}

	.page-ref {
		font-size: 0.7rem;
		color: var(--sand-dark, #a8a29e);
	}

	.btn-remove {
		flex-shrink: 0;
		background: none;
		border: none;
		color: var(--sand-dark, #a8a29e);
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 4px;
		transition: all 0.2s;
	}
	.btn-remove:hover {
		color: #ef4444;
		background-color: rgba(239, 68, 68, 0.15);
	}
</style>
