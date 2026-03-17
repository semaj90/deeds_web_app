<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { formatFileSize, formatDate, getIcon } from './evidence-utils.js';

	let {
		evidenceId,
		open = $bindable(false),
		onClose = () => {},
		onEdit,
		onAnalyze
	}: {
		evidenceId: string | null;
		open?: boolean;
		onClose?: () => void;
		onEdit?: (id: string) => void;
		onAnalyze?: (doc: any) => void;
	} = $props();

	let doc = $state<any>(null);
	let isLoading = $state(false);
	let loadError = $state<string | null>(null);

	$effect(() => {
		if (open && evidenceId) {
			loadDoc(evidenceId);
		} else if (!open) {
			// reset after close animation
			setTimeout(() => { doc = null; loadError = null; }, 200);
		}
	});

	async function loadDoc(id: string) {
		isLoading = true;
		loadError = null;
		try {
			const res = await fetch(`/api/evidence/${id}`);
			if (!res.ok) throw new Error(`${res.status}`);
			doc = await res.json();
		} catch (e) {
			loadError = 'Failed to load evidence.';
		} finally {
			isLoading = false;
		}
	}

	function close() {
		open = false;
		onClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}

	// Derived helpers
	let fileType = $derived(doc?.fileType ?? doc?.file_type ?? doc?.mimeType ?? doc?.mime_type ?? '');
	let isImage = $derived(fileType.startsWith('image/'));
	let isPdf = $derived(fileType.includes('pdf'));
	let fileUrl = $derived(doc?.fileUrl ?? doc?.file_url ?? null);
	let summary = $derived(doc?.summary ?? doc?.aiSummary ?? doc?.ai_summary ?? null);
	let entities = $derived(doc?.metadata?.entities ?? doc?.extractedEntities ?? null);
	let tags = $derived<string[]>(doc?.tags ?? []);
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- Backdrop -->
	<div
		class="modal-backdrop"
		role="presentation"
		onclick={(e) => { if (e.target === e.currentTarget) close(); }}
	>
		<!-- Modal panel -->
		<div class="modal-panel" role="dialog" aria-modal="true" aria-label="Evidence Detail">
			<!-- Header -->
			<div class="modal-header">
				<div class="modal-title-row">
					<span class="modal-file-icon">{doc ? getIcon(fileType) : '📄'}</span>
					<div class="modal-title-text">
						<h2 class="modal-title">
							{#if isLoading}Loading…{:else if doc}{doc.title || doc.fileName || doc.file_name || 'Untitled'}{:else}Evidence Detail{/if}
						</h2>
						{#if doc}
							<span class="modal-subtitle">
								{formatFileSize(doc.fileSize ?? doc.file_size ?? 0)}
								{#if doc.caseId ?? doc.case_id}&nbsp;&middot; Linked to case{/if}
							</span>
						{/if}
					</div>
				</div>
				<button type="button" class="modal-close" onclick={close} aria-label="Close">
					<Icon name="x" class="w-4 h-4" />
				</button>
			</div>

			<!-- Body -->
			<div class="modal-body">
				{#if isLoading}
					<div class="modal-loading">
						<div class="spinner"></div>
						<span>Loading evidence…</span>
					</div>
				{:else if loadError}
					<div class="modal-error">
						<Icon name="alert-circle" class="w-5 h-5" />
						<span>{loadError}</span>
					</div>
				{:else if doc}
					<!-- File preview (images) -->
					{#if isImage && fileUrl}
						<div class="preview-wrap">
							<img src={fileUrl} alt={doc.title ?? 'Evidence'} class="preview-img" />
						</div>
					{:else if isPdf && fileUrl}
						<div class="preview-wrap pdf-wrap">
							<a href={fileUrl} target="_blank" rel="noopener noreferrer" class="pdf-link">
								<Icon name="external-link" class="w-4 h-4" />
								Open PDF
							</a>
						</div>
					{/if}

					<!-- Core fields -->
					<div class="fields-grid">
						{#if doc.description}
							<div class="field full-width">
								<span class="field-label">Description</span>
								<p class="field-value">{doc.description}</p>
							</div>
						{/if}

						<div class="field">
							<span class="field-label">Type</span>
							<span class="field-value">{fileType || doc.type || 'Unknown'}</span>
						</div>

						<div class="field">
							<span class="field-label">Uploaded</span>
							<span class="field-value">{formatDate(doc.createdAt ?? doc.created_at)}</span>
						</div>

						{#if doc.source}
							<div class="field">
								<span class="field-label">Source</span>
								<span class="field-value">{doc.source}</span>
							</div>
						{/if}

						{#if doc.status ?? doc.processingStatus ?? doc.documentStatus}
							<div class="field">
								<span class="field-label">Status</span>
								<span class="field-badge">{doc.status ?? doc.processingStatus ?? doc.documentStatus}</span>
							</div>
						{/if}

						{#if doc.evidenceNumber ?? doc.evidence_number}
							<div class="field">
								<span class="field-label">Evidence #</span>
								<span class="field-value mono">{doc.evidenceNumber ?? doc.evidence_number}</span>
							</div>
						{/if}
					</div>

					<!-- Summary / AI analysis -->
					{#if summary}
						<div class="section">
							<h3 class="section-title">
								<Icon name="sparkles" class="w-3.5 h-3.5" />
								AI Summary
							</h3>
							<p class="section-body">{summary}</p>
						</div>
					{/if}

					<!-- Extracted entities -->
					{#if entities && Array.isArray(entities) && entities.length > 0}
						<div class="section">
							<h3 class="section-title">
								<Icon name="tag" class="w-3.5 h-3.5" />
								Entities
							</h3>
							<div class="entity-list">
								{#each entities.slice(0, 20) as ent}
									<span class="entity-chip">{ent.value ?? ent.text ?? ent}</span>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Tags -->
					{#if tags.length > 0}
						<div class="section">
							<h3 class="section-title">
								<Icon name="hash" class="w-3.5 h-3.5" />
								Tags
							</h3>
							<div class="entity-list">
								{#each tags as tag}
									<span class="tag-chip">#{tag}</span>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Extracted text preview -->
					{#if doc.extractedText ?? doc.extracted_text ?? doc.content}
						<div class="section">
							<h3 class="section-title">
								<Icon name="file-text" class="w-3.5 h-3.5" />
								Extracted Text
							</h3>
							<pre class="text-preview">{(doc.extractedText ?? doc.extracted_text ?? doc.content ?? '').slice(0, 800)}{(doc.extractedText ?? doc.extracted_text ?? doc.content ?? '').length > 800 ? '\n…' : ''}</pre>
						</div>
					{/if}
				{/if}
			</div>

			<!-- Footer -->
			{#if doc && !isLoading}
				<div class="modal-footer">
					<button type="button" class="footer-btn ghost" onclick={close}>Close</button>
					<div class="footer-actions">
						{#if fileUrl}
							<a
								href={fileUrl}
								download={doc.fileName ?? doc.file_name ?? true}
								class="footer-btn secondary"
								onclick={close}
							>
								<Icon name="download" class="w-3.5 h-3.5" />
								Download
							</a>
						{/if}
						{#if onAnalyze}
							<button type="button" class="footer-btn secondary" onclick={() => { onAnalyze?.(doc); close(); }}>
								<Icon name="sparkles" class="w-3.5 h-3.5" />
								Analyze
							</button>
						{/if}
						{#if onEdit}
							<button type="button" class="footer-btn primary" onclick={() => { onEdit?.(doc.id); close(); }}>
								<Icon name="pencil" class="w-3.5 h-3.5" />
								Edit
							</button>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(2px);
		padding: 1rem;
		animation: fadeIn 0.15s ease;
	}
	@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

	.modal-panel {
		width: 100%;
		max-width: 680px;
		max-height: 90vh;
		background: #131519;
		border: 1px solid rgba(212, 199, 163, 0.12);
		border-radius: 12px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		animation: slideUp 0.18s ease;
	}
	@keyframes slideUp { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

	/* Header */
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid rgba(212, 199, 163, 0.08);
		flex-shrink: 0;
	}
	.modal-title-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.modal-file-icon {
		font-size: 1.5rem;
		line-height: 1;
	}
	.modal-title {
		font-size: 0.95rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.9);
		margin: 0;
	}
	.modal-subtitle {
		font-size: 0.75rem;
		color: rgba(212, 199, 163, 0.4);
		display: block;
		margin-top: 0.125rem;
	}
	.modal-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 6px;
		background: transparent;
		border: none;
		color: rgba(212, 199, 163, 0.4);
		cursor: pointer;
		transition: all 0.15s;
		flex-shrink: 0;
	}
	.modal-close:hover {
		background: rgba(212, 199, 163, 0.08);
		color: rgba(212, 199, 163, 0.8);
	}

	/* Body */
	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.modal-loading, .modal-error {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 3rem;
		color: rgba(212, 199, 163, 0.4);
		font-size: 0.875rem;
	}
	.modal-error { color: #f87171; }
	.spinner {
		width: 20px;
		height: 20px;
		border: 2px solid rgba(212, 199, 163, 0.2);
		border-top-color: rgba(212, 199, 163, 0.6);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	/* File preview */
	.preview-wrap {
		border-radius: 8px;
		overflow: hidden;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(212, 199, 163, 0.08);
	}
	.preview-img {
		width: 100%;
		max-height: 280px;
		object-fit: contain;
		display: block;
	}
	.pdf-wrap { padding: 1rem; }
	.pdf-link {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8rem;
		color: #60a5fa;
		text-decoration: none;
	}
	.pdf-link:hover { text-decoration: underline; }

	/* Fields grid */
	.fields-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	.field { display: flex; flex-direction: column; gap: 0.25rem; }
	.field.full-width { grid-column: 1 / -1; }
	.field-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgba(212, 199, 163, 0.35);
		font-weight: 600;
	}
	.field-value {
		font-size: 0.82rem;
		color: rgba(212, 199, 163, 0.75);
		line-height: 1.5;
		margin: 0;
	}
	.field-value.mono { font-family: monospace; }
	.field-badge {
		display: inline-block;
		font-size: 0.7rem;
		padding: 0.125rem 0.5rem;
		border-radius: 20px;
		background: rgba(96, 165, 250, 0.1);
		border: 1px solid rgba(96, 165, 250, 0.2);
		color: #93c5fd;
		text-transform: capitalize;
	}

	/* Sections */
	.section {
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(212, 199, 163, 0.06);
		border-radius: 8px;
		padding: 0.875rem;
	}
	.section-title {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgba(212, 199, 163, 0.45);
		margin: 0 0 0.625rem;
	}
	.section-body {
		font-size: 0.82rem;
		color: rgba(212, 199, 163, 0.7);
		line-height: 1.6;
		margin: 0;
		white-space: pre-wrap;
	}

	/* Entities / tags */
	.entity-list { display: flex; flex-wrap: wrap; gap: 0.375rem; }
	.entity-chip {
		font-size: 0.7rem;
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
		background: rgba(168, 85, 247, 0.08);
		border: 1px solid rgba(168, 85, 247, 0.18);
		color: #c4b5fd;
	}
	.tag-chip {
		font-size: 0.7rem;
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
		background: rgba(96, 165, 250, 0.08);
		border: 1px solid rgba(96, 165, 250, 0.18);
		color: #93c5fd;
	}

	/* Text preview */
	.text-preview {
		font-family: 'Courier New', monospace;
		font-size: 0.72rem;
		line-height: 1.5;
		color: rgba(212, 199, 163, 0.55);
		white-space: pre-wrap;
		word-break: break-word;
		margin: 0;
		max-height: 180px;
		overflow-y: auto;
	}

	/* Footer */
	.modal-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem 1.25rem;
		border-top: 1px solid rgba(212, 199, 163, 0.08);
		flex-shrink: 0;
	}
	.footer-actions { display: flex; gap: 0.5rem; }
	.footer-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.4rem 0.875rem;
		border-radius: 6px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
		border: none;
	}
	.footer-btn.ghost {
		background: transparent;
		color: rgba(212, 199, 163, 0.5);
		border: 1px solid rgba(212, 199, 163, 0.12);
	}
	.footer-btn.ghost:hover {
		background: rgba(212, 199, 163, 0.06);
		color: rgba(212, 199, 163, 0.8);
	}
	.footer-btn.secondary {
		background: rgba(168, 85, 247, 0.1);
		border: 1px solid rgba(168, 85, 247, 0.2);
		color: #c4b5fd;
	}
	.footer-btn.secondary:hover {
		background: rgba(168, 85, 247, 0.2);
	}
	.footer-btn.primary {
		background: rgba(96, 165, 250, 0.12);
		border: 1px solid rgba(96, 165, 250, 0.25);
		color: #93c5fd;
	}
	.footer-btn.primary:hover {
		background: rgba(96, 165, 250, 0.22);
	}
</style>
