<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { formatFileSize, formatDate, getIcon, getTypeLabel } from './evidence-utils.js';

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
	let status = $derived(doc?.status ?? doc?.processingStatus ?? doc?.documentStatus ?? '');

	// File-type color accent
	let accentColor = $derived.by(() => {
		const ft = fileType.toLowerCase();
		if (ft.includes('pdf')) return { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)', text: '#f87171', strip: '#ef4444' };
		if (ft.startsWith('image/')) return { bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.3)', text: '#c4b5fd', strip: '#a855f7' };
		if (ft.includes('word') || ft.includes('text') || ft.includes('document')) return { bg: 'rgba(96, 165, 250, 0.12)', border: 'rgba(96, 165, 250, 0.3)', text: '#93c5fd', strip: '#60a5fa' };
		if (ft.includes('sheet') || ft.includes('csv') || ft.includes('excel')) return { bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.3)', text: '#4ade80', strip: '#22c55e' };
		return { bg: 'rgba(212, 199, 163, 0.08)', border: 'rgba(212, 199, 163, 0.15)', text: 'rgba(212, 199, 163, 0.7)', strip: 'rgba(212, 199, 163, 0.3)' };
	});
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
			<!-- Type accent strip -->
			<div class="modal-accent-strip" style="background: {accentColor.strip};"></div>

			<!-- Header -->
			<div class="modal-header">
				<div class="modal-title-row">
					<div class="modal-file-icon-wrap" style="background: {accentColor.bg}; border-color: {accentColor.border};">
						<span class="modal-file-icon">{doc ? getIcon(fileType) : '📄'}</span>
					</div>
					<div class="modal-title-text">
						<h2 class="modal-title">
							{#if isLoading}Loading…{:else if doc}{doc.title || doc.fileName || doc.file_name || 'Untitled'}{:else}Evidence Detail{/if}
						</h2>
						{#if doc}
							<div class="modal-subtitle-row">
								<span class="modal-type-badge" style="background: {accentColor.bg}; border-color: {accentColor.border}; color: {accentColor.text};">
									{getTypeLabel(fileType)}
								</span>
								<span class="modal-subtitle">
									{formatFileSize(doc.fileSize ?? doc.file_size ?? 0)}
								</span>
								{#if doc.caseId ?? doc.case_id}
									<span class="modal-case-badge">
										<Icon name="link" class="w-3 h-3" />
										Linked
									</span>
								{/if}
								{#if status}
									<span class="modal-status-badge">{status}</span>
								{/if}
							</div>
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
					<div class="modal-skeleton">
						<div class="skel-line skel-w-60"></div>
						<div class="skel-row">
							<div class="skel-box"></div>
							<div class="skel-box"></div>
						</div>
						<div class="skel-line skel-w-80"></div>
						<div class="skel-line skel-w-40"></div>
						<div class="skel-block"></div>
					</div>
				{:else if loadError}
					<div class="modal-error">
						<Icon name="circle-alert" class="w-5 h-5" />
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
					<div class="fields-card">
						{#if doc.description}
							<div class="field full-width">
								<span class="field-label">
									<Icon name="align-left" class="w-3 h-3" />
									Description
								</span>
								<p class="field-value">{doc.description}</p>
							</div>
						{/if}

						<div class="field">
							<span class="field-label">
								<Icon name="file" class="w-3 h-3" />
								Type
							</span>
							<span class="field-value">{fileType || doc.type || 'Unknown'}</span>
						</div>

						<div class="field">
							<span class="field-label">
								<Icon name="calendar" class="w-3 h-3" />
								Uploaded
							</span>
							<span class="field-value">{formatDate(doc.createdAt ?? doc.created_at)}</span>
						</div>

						{#if doc.source}
							<div class="field">
								<span class="field-label">
									<Icon name="database" class="w-3 h-3" />
									Source
								</span>
								<span class="field-value">{doc.source}</span>
							</div>
						{/if}

						{#if status}
							<div class="field">
								<span class="field-label">
									<Icon name="activity" class="w-3 h-3" />
									Status
								</span>
								<span class="field-badge">{status}</span>
							</div>
						{/if}

						{#if doc.evidenceNumber ?? doc.evidence_number}
							<div class="field">
								<span class="field-label">
									<Icon name="shield" class="w-3 h-3" />
									Evidence #
								</span>
								<span class="field-value mono">{doc.evidenceNumber ?? doc.evidence_number}</span>
							</div>
						{/if}
					</div>

					<!-- Summary / AI analysis -->
					{#if summary}
						<div class="section ai-section">
							<h3 class="section-title">
								<span class="ai-icon-wrap">
									<Icon name="sparkles" class="w-3.5 h-3.5" />
								</span>
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
					<button type="button" class="footer-btn ghost" onclick={close}>
						<Icon name="x" class="w-3.5 h-3.5" />
						Close
					</button>
					<div class="footer-actions">
						{#if fileUrl}
							<a
								href={fileUrl}
								download={doc.fileName ?? doc.file_name ?? true}
								class="footer-btn secondary download"
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
		backdrop-filter: blur(4px);
		padding: 1rem;
		animation: fadeIn 0.15s ease;
	}
	@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

	.modal-panel {
		width: 100%;
		max-width: 680px;
		max-height: 90vh;
		background: #131519;
		border: 1px solid rgba(212, 199, 163, 0.1);
		border-radius: 14px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		animation: slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
		box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.03);
	}
	@keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

	/* Type accent strip */
	.modal-accent-strip {
		height: 3px;
		flex-shrink: 0;
	}

	/* Header */
	.modal-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 1.125rem 1.25rem;
		border-bottom: 1px solid rgba(212, 199, 163, 0.06);
		flex-shrink: 0;
		gap: 0.75rem;
	}
	.modal-title-row {
		display: flex;
		align-items: flex-start;
		gap: 0.875rem;
		min-width: 0;
	}
	.modal-file-icon-wrap {
		width: 42px;
		height: 42px;
		border-radius: 10px;
		border: 1px solid;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.modal-file-icon {
		font-size: 1.35rem;
		line-height: 1;
	}
	.modal-title-text {
		min-width: 0;
	}
	.modal-title {
		font-size: 0.95rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.92);
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.modal-subtitle-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.375rem;
		flex-wrap: wrap;
	}
	.modal-type-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		border: 1px solid;
	}
	.modal-subtitle {
		font-size: 0.75rem;
		color: rgba(212, 199, 163, 0.4);
	}
	.modal-case-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
		font-size: 0.65rem;
		font-weight: 600;
		background: rgba(34, 197, 94, 0.1);
		border: 1px solid rgba(34, 197, 94, 0.2);
		color: #4ade80;
	}
	.modal-status-badge {
		display: inline-flex;
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
		font-size: 0.65rem;
		font-weight: 600;
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid rgba(245, 158, 11, 0.2);
		color: #fbbf24;
		text-transform: capitalize;
	}
	.modal-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		border-radius: 8px;
		background: transparent;
		border: 1px solid rgba(212, 199, 163, 0.06);
		color: rgba(212, 199, 163, 0.35);
		cursor: pointer;
		transition: all 0.15s;
		flex-shrink: 0;
	}
	.modal-close:hover {
		background: rgba(212, 199, 163, 0.06);
		border-color: rgba(212, 199, 163, 0.12);
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

	/* Skeleton loading */
	.modal-skeleton {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem 0;
	}
	.skel-line, .skel-box, .skel-block {
		background: linear-gradient(90deg, rgba(212, 199, 163, 0.04) 25%, rgba(212, 199, 163, 0.08) 50%, rgba(212, 199, 163, 0.04) 75%);
		background-size: 200% 100%;
		animation: shimmer 1.5s ease infinite;
		border-radius: 6px;
	}
	.skel-line {
		height: 12px;
	}
	.skel-w-60 { width: 60%; }
	.skel-w-80 { width: 80%; }
	.skel-w-40 { width: 40%; }
	.skel-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	.skel-box {
		height: 52px;
	}
	.skel-block {
		height: 80px;
	}
	@keyframes shimmer {
		0% { background-position: 200% 0; }
		100% { background-position: -200% 0; }
	}

	.modal-error {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 3rem;
		color: #f87171;
		font-size: 0.875rem;
	}

	/* File preview */
	.preview-wrap {
		border-radius: 10px;
		overflow: hidden;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(212, 199, 163, 0.06);
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

	/* Fields card */
	.fields-card {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(212, 199, 163, 0.06);
		border-radius: 10px;
		padding: 1rem;
	}
	.field { display: flex; flex-direction: column; gap: 0.3rem; }
	.field.full-width { grid-column: 1 / -1; }
	.field-label {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: rgba(212, 199, 163, 0.35);
		font-weight: 600;
	}
	.field-value {
		font-size: 0.82rem;
		color: rgba(212, 199, 163, 0.75);
		line-height: 1.5;
		margin: 0;
	}
	.field-value.mono {
		font-family: 'JetBrains Mono', 'Courier New', monospace;
		font-size: 0.78rem;
		letter-spacing: 0.03em;
	}
	.field-badge {
		display: inline-block;
		font-size: 0.68rem;
		padding: 0.15rem 0.5rem;
		border-radius: 20px;
		background: rgba(96, 165, 250, 0.1);
		border: 1px solid rgba(96, 165, 250, 0.2);
		color: #93c5fd;
		text-transform: capitalize;
		width: fit-content;
	}

	/* Sections */
	.section {
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(212, 199, 163, 0.06);
		border-radius: 10px;
		padding: 0.875rem 1rem;
	}
	.ai-section {
		border-color: rgba(168, 85, 247, 0.15);
		background: linear-gradient(135deg, rgba(168, 85, 247, 0.04) 0%, rgba(96, 165, 250, 0.03) 100%);
	}
	.section-title {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: rgba(212, 199, 163, 0.45);
		margin: 0 0 0.625rem;
	}
	.ai-icon-wrap {
		display: inline-flex;
		color: #a78bfa;
	}
	.section-body {
		font-size: 0.82rem;
		color: rgba(212, 199, 163, 0.7);
		line-height: 1.65;
		margin: 0;
		white-space: pre-wrap;
	}

	/* Entities / tags */
	.entity-list { display: flex; flex-wrap: wrap; gap: 0.375rem; }
	.entity-chip {
		font-size: 0.68rem;
		padding: 0.2rem 0.6rem;
		border-radius: 6px;
		background: rgba(168, 85, 247, 0.08);
		border: 1px solid rgba(168, 85, 247, 0.18);
		color: #c4b5fd;
	}
	.tag-chip {
		font-size: 0.68rem;
		padding: 0.2rem 0.6rem;
		border-radius: 6px;
		background: rgba(96, 165, 250, 0.08);
		border: 1px solid rgba(96, 165, 250, 0.18);
		color: #93c5fd;
		font-weight: 500;
	}

	/* Text preview */
	.text-preview {
		font-family: 'JetBrains Mono', 'Courier New', monospace;
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
		border-top: 1px solid rgba(212, 199, 163, 0.06);
		flex-shrink: 0;
		background: rgba(0, 0, 0, 0.15);
	}
	.footer-actions { display: flex; gap: 0.5rem; }
	.footer-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.45rem 0.9rem;
		border-radius: 8px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
		border: none;
		text-decoration: none;
	}
	.footer-btn.ghost {
		background: transparent;
		color: rgba(212, 199, 163, 0.45);
		border: 1px solid rgba(212, 199, 163, 0.08);
	}
	.footer-btn.ghost:hover {
		background: rgba(212, 199, 163, 0.06);
		border-color: rgba(212, 199, 163, 0.15);
		color: rgba(212, 199, 163, 0.8);
	}
	.footer-btn.secondary {
		background: rgba(168, 85, 247, 0.1);
		border: 1px solid rgba(168, 85, 247, 0.2);
		color: #c4b5fd;
	}
	.footer-btn.secondary:hover {
		background: rgba(168, 85, 247, 0.2);
		border-color: rgba(168, 85, 247, 0.3);
	}
	.footer-btn.secondary.download {
		background: rgba(34, 197, 94, 0.1);
		border: 1px solid rgba(34, 197, 94, 0.2);
		color: #4ade80;
	}
	.footer-btn.secondary.download:hover {
		background: rgba(34, 197, 94, 0.2);
		border-color: rgba(34, 197, 94, 0.3);
	}
	.footer-btn.primary {
		background: rgba(96, 165, 250, 0.15);
		border: 1px solid rgba(96, 165, 250, 0.25);
		color: #93c5fd;
	}
	.footer-btn.primary:hover {
		background: rgba(96, 165, 250, 0.25);
		border-color: rgba(96, 165, 250, 0.35);
	}
</style>
