<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Document {
		id: string;
		filename: string;
		fileSize: number;
		mimeType: string;
		summary: string;
		embeddingModel: string;
		uploadedAt: string;
		metadata?: {
			pageCount?: number;
			language?: string;
			confidence?: number;
		};
	}

	interface Props {
		document: Document;
		onView?: (doc: Document) => void;
		onDelete?: (docId: string) => void;
	}

	let { document, onView, onDelete }: Props = $props();
	let deleting = $state(false);

	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const days = Math.floor(diff / (1000 * 60 * 60 * 24));
		if (days === 0) {
			const hours = Math.floor(diff / (1000 * 60 * 60));
			if (hours === 0) {
				const minutes = Math.floor(diff / (1000 * 60));
				return `${minutes}m ago`;
			}
			return `${hours}h ago`;
		}
		if (days === 1) return 'Yesterday';
		if (days < 7) return `${days}d ago`;
		return date.toLocaleDateString();
	}

	async function handleDelete(e: Event) {
		e.stopPropagation();
		if (!confirm('Delete this document?')) return;
		try {
			deleting = true;
			onDelete?.(document.id);
		} finally {
			deleting = false;
		}
	}

	function handleView(e: Event) {
		e.stopPropagation();
		onView?.(document);
	}
</script>

<div class="doc-card">
	<div class="doc-header">
		<div class="doc-icon">
			<Icon name="file-text" size={20} />
		</div>
		<div class="doc-info">
			<h3 class="doc-name">{document.filename}</h3>
			<span class="doc-size">{formatFileSize(document.fileSize)}</span>
		</div>
	</div>

	<div class="doc-body">
		{#if document.embeddingModel}
			<div class="doc-embedding">
				<Icon name="zap" size={12} />
				<span>{document.embeddingModel}</span>
			</div>
		{/if}

		<p class="doc-summary">{document.summary || 'No summary available'}</p>

		<div class="doc-meta">
			{#if document.metadata?.pageCount}
				<span class="meta-tag">{document.metadata.pageCount} pages</span>
			{/if}
			{#if document.metadata?.language}
				<span class="meta-tag">{document.metadata.language}</span>
			{/if}
			<span class="meta-tag">
				<Icon name="clock" size={10} />
				{formatDate(document.uploadedAt)}
			</span>
		</div>

		{#if document.metadata?.confidence}
			<div class="confidence-section">
				<div class="confidence-header">
					<span>Confidence</span>
					<span>{Math.round(document.metadata.confidence * 100)}%</span>
				</div>
				<div class="confidence-bar">
					<div
						class="confidence-fill"
						style="width: {document.metadata.confidence * 100}%"
					></div>
				</div>
			</div>
		{/if}
	</div>

	<div class="doc-actions">
		<Button onclick={handleView} variant="ghost" size="sm">
			<Icon name="eye" size={14} />
			View
		</Button>
		<Button onclick={handleDelete} variant="ghost" size="sm" disabled={deleting}>
			<Icon name="trash-2" size={14} />
		</Button>
	</div>
</div>

<style>
	.doc-card {
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.5rem;
		background: var(--color-panel-soft, #1c1917);
		overflow: hidden;
		transition: border-color 0.2s;
	}
	.doc-card:hover {
		border-color: var(--color-accent, #a51c30);
	}
	.doc-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}
	.doc-icon {
		padding: 0.375rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 0.375rem;
	}
	.doc-info {
		flex: 1;
		min-width: 0;
	}
	.doc-name {
		font-size: 0.875rem;
		font-weight: 600;
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.doc-size {
		font-size: 0.6875rem;
		opacity: 0.5;
	}
	.doc-body {
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.doc-embedding {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.6875rem;
		font-weight: 600;
		padding: 0.125rem 0.5rem;
		background: rgba(255, 200, 0, 0.08);
		border-radius: 0.25rem;
		width: fit-content;
	}
	.doc-summary {
		font-size: 0.75rem;
		opacity: 0.6;
		margin: 0;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.doc-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}
	.meta-tag {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.6875rem;
		padding: 0.125rem 0.375rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 0.25rem;
		opacity: 0.7;
	}
	.confidence-section {
		padding-top: 0.25rem;
	}
	.confidence-header {
		display: flex;
		justify-content: space-between;
		font-size: 0.6875rem;
		font-weight: 500;
		margin-bottom: 0.25rem;
	}
	.confidence-bar {
		height: 4px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 2px;
		overflow: hidden;
	}
	.confidence-fill {
		height: 100%;
		background: var(--color-accent, #a51c30);
		border-radius: 2px;
		transition: width 0.3s;
	}
	.doc-actions {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
	}
</style>
