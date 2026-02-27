<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import DocumentCard from './DocumentCard.svelte';

	interface Document {
		id: string;
		filename: string;
		fileSize: number;
		mimeType: string;
		summary: string;
		embeddingModel: string;
		uploadedAt: string;
		chunks?: number;
		status?: string;
		tags?: string[];
		contentHash?: string;
		metadata?: {
			pageCount?: number;
			language?: string;
			confidence?: number;
		};
	}

	let documents = $state<Document[]>([]);
	let loading = $state(true);
	let searchQuery = $state('');
	let viewMode = $state<'grid' | 'list'>('grid');
	let selectedDocument = $state<Document | null>(null);
	let error = $state<string | null>(null);

	let filteredDocuments = $derived.by(() => {
		if (!searchQuery.trim()) return documents;
		const query = searchQuery.toLowerCase();
		return documents.filter(
			(doc) =>
				doc.filename.toLowerCase().includes(query) ||
				doc.summary?.toLowerCase().includes(query) ||
				doc.embeddingModel?.toLowerCase().includes(query)
		);
	});

	$effect(() => {
		loadDocuments();
	});

	async function loadDocuments() {
		loading = true;
		error = null;
		try {
			const response = await fetch('/api/rag/documents', {
				signal: AbortSignal.timeout(5000)
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const raw = await response.json();
			documents = (Array.isArray(raw) ? raw : raw.documents ?? []).map(
				(d: Record<string, unknown>) => ({
					...d,
					embeddingModel: (d.embeddingModel as string) ?? ''
				})
			) as Document[];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load documents';
			documents = [];
		} finally {
			loading = false;
		}
	}

	function handleViewDocument(doc: Document) {
		selectedDocument = doc;
	}

	async function handleDeleteDocument(docId: string) {
		try {
			const response = await fetch(`/api/rag/documents/${docId}`, { method: 'DELETE' });
			if (response.ok) {
				documents = documents.filter((d) => d.id !== docId);
			}
		} catch (e) {
			console.error('Failed to delete document:', e);
		}
	}
</script>

<div class="rag-doc-grid">
	<div class="grid-header">
		<div class="grid-title">
			<Icon name="file-stack" size={16} />
			<h3>RAG Documents</h3>
			<span class="doc-count">{documents.length}</span>
		</div>
		<div class="grid-controls">
			<div class="search-wrapper">
				<Icon name="search" size={14} />
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search documents..."
					class="search-input"
				/>
				{#if searchQuery}
					<button class="clear-btn" onclick={() => (searchQuery = '')}>
						<Icon name="x" size={12} />
					</button>
				{/if}
			</div>
			<div class="view-toggle">
				<button
					class="toggle-btn"
					class:active={viewMode === 'grid'}
					onclick={() => (viewMode = 'grid')}
				>
					<Icon name="grid-2x2" size={14} />
				</button>
				<button
					class="toggle-btn"
					class:active={viewMode === 'list'}
					onclick={() => (viewMode = 'list')}
				>
					<Icon name="list" size={14} />
				</button>
			</div>
			<Button variant="ghost" size="sm" onclick={loadDocuments} disabled={loading}>
				<Icon name="refresh-cw" size={12} />
			</Button>
		</div>
	</div>

	{#if loading}
		<p class="status-msg">Loading documents...</p>
	{:else if error}
		<p class="error-msg">{error}</p>
	{:else if filteredDocuments.length === 0}
		<div class="empty-state">
			<Icon name="upload" size={24} />
			<span>{searchQuery ? 'No documents match your search' : 'No documents uploaded yet'}</span>
		</div>
	{:else if viewMode === 'grid'}
		<div class="doc-grid">
			{#each filteredDocuments as doc (doc.id)}
				<DocumentCard
					document={doc}
					onView={handleViewDocument}
					onDelete={handleDeleteDocument}
				/>
			{/each}
		</div>
	{:else}
		<div class="doc-list">
			{#each filteredDocuments as doc (doc.id)}
				<div class="list-item">
					<Icon name="file-text" size={14} />
					<span class="list-name">{doc.filename}</span>
					<span class="list-model">{doc.embeddingModel}</span>
					<span class="list-summary">{doc.summary || 'No summary'}</span>
					<div class="list-actions">
						<Button variant="ghost" size="sm" onclick={() => handleViewDocument(doc)}>
							View
						</Button>
						<Button variant="ghost" size="sm" onclick={() => handleDeleteDocument(doc.id)}>
							Delete
						</Button>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	{#if filteredDocuments.length > 0}
		<div class="grid-footer">
			Showing {filteredDocuments.length} of {documents.length} documents
		</div>
	{/if}

	{#if selectedDocument}
		<div class="doc-detail-overlay" onclick={() => (selectedDocument = null)} onkeydown={(e) => { if (e.key === 'Escape') selectedDocument = null; }} role="presentation" tabindex="-1">
			<div class="doc-detail" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
				<div class="detail-header">
					<h3>{selectedDocument.filename}</h3>
					<button class="close-btn" onclick={() => (selectedDocument = null)}>
						<Icon name="x" size={16} />
					</button>
				</div>
				<div class="detail-body">
					<div class="detail-row">
						<span class="detail-label">Model</span>
						<span>{selectedDocument.embeddingModel}</span>
					</div>
					<div class="detail-row">
						<span class="detail-label">MIME</span>
						<span>{selectedDocument.mimeType}</span>
					</div>
					{#if selectedDocument.chunks}
						<div class="detail-row">
							<span class="detail-label">Chunks</span>
							<span>{selectedDocument.chunks}</span>
						</div>
					{/if}
					{#if selectedDocument.metadata?.pageCount}
						<div class="detail-row">
							<span class="detail-label">Pages</span>
							<span>{selectedDocument.metadata.pageCount}</span>
						</div>
					{/if}
					<div class="detail-row">
						<span class="detail-label">Summary</span>
						<p class="detail-summary">{selectedDocument.summary || 'No summary'}</p>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.rag-doc-grid {
		padding: 0.75rem;
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.5rem;
		background: var(--color-panel-soft, #1c1917);
	}
	.grid-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
	}
	.grid-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.grid-title h3 {
		font-size: 0.875rem;
		font-weight: 600;
		margin: 0;
	}
	.doc-count {
		font-size: 0.6875rem;
		padding: 0.125rem 0.375rem;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 0.25rem;
		opacity: 0.6;
	}
	.grid-controls {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.search-wrapper {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.375rem;
		background: rgba(255, 255, 255, 0.03);
	}
	.search-input {
		border: none;
		background: transparent;
		font-size: 0.75rem;
		color: inherit;
		outline: none;
		width: 140px;
	}
	.clear-btn {
		background: none;
		border: none;
		cursor: pointer;
		opacity: 0.5;
		color: inherit;
		padding: 0;
	}
	.view-toggle {
		display: flex;
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.375rem;
		overflow: hidden;
	}
	.toggle-btn {
		padding: 0.25rem 0.5rem;
		background: transparent;
		border: none;
		cursor: pointer;
		opacity: 0.5;
		color: inherit;
	}
	.toggle-btn.active {
		background: rgba(255, 255, 255, 0.08);
		opacity: 1;
	}
	.status-msg {
		font-size: 0.8125rem;
		opacity: 0.5;
		margin: 0;
		text-align: center;
		padding: 2rem;
	}
	.error-msg {
		font-size: 0.8125rem;
		color: var(--color-danger, #ef4444);
		margin: 0;
		text-align: center;
		padding: 2rem;
	}
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 2rem;
		opacity: 0.5;
		font-size: 0.8125rem;
	}
	.doc-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 0.75rem;
	}
	.doc-list {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	.list-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		border-radius: 0.375rem;
		background: rgba(255, 255, 255, 0.03);
		font-size: 0.8125rem;
	}
	.list-name {
		font-weight: 500;
		min-width: 120px;
	}
	.list-model {
		font-size: 0.6875rem;
		opacity: 0.5;
		min-width: 80px;
	}
	.list-summary {
		flex: 1;
		font-size: 0.75rem;
		opacity: 0.5;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.list-actions {
		display: flex;
		gap: 0.25rem;
	}
	.grid-footer {
		text-align: center;
		font-size: 0.6875rem;
		opacity: 0.4;
		padding-top: 0.5rem;
		margin-top: 0.75rem;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
	}
	.doc-detail-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 50;
	}
	.doc-detail {
		background: var(--color-panel, #292524);
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.5rem;
		max-width: 480px;
		width: 90%;
		max-height: 80vh;
		overflow-y: auto;
	}
	.detail-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}
	.detail-header h3 {
		font-size: 0.875rem;
		font-weight: 600;
		margin: 0;
	}
	.close-btn {
		background: none;
		border: none;
		cursor: pointer;
		opacity: 0.5;
		color: inherit;
		padding: 0.25rem;
	}
	.detail-body {
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.detail-row {
		display: flex;
		gap: 0.5rem;
		font-size: 0.8125rem;
	}
	.detail-label {
		font-weight: 500;
		min-width: 60px;
		opacity: 0.6;
	}
	.detail-summary {
		margin: 0;
		font-size: 0.75rem;
		opacity: 0.7;
		line-height: 1.4;
	}
</style>
