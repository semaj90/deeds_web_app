<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import TagInput from '$lib/components/ui/TagInput.svelte';
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
	let fileName = $derived(doc?.fileName ?? doc?.file_name ?? '');
	let isImage = $derived(fileType.startsWith('image/'));
	let isPdf = $derived(fileType.includes('pdf'));
	let isAudio = $derived(fileType.startsWith('audio/'));
	let isVideo = $derived(fileType.startsWith('video/'));
	let isText = $derived(fileType === 'text/plain' || fileType === 'text/csv' || fileName.endsWith('.txt') || fileName.endsWith('.csv'));
	let isMarkdown = $derived(fileType === 'text/markdown' || fileName.endsWith('.md'));
	let fileUrl = $derived(doc?.fileUrl ?? doc?.file_url ?? null);
	let metadata = $derived.by(() => {
		const value = doc?.metadata;
		if (!value) return {};
		if (typeof value === 'string') {
			try {
				return JSON.parse(value);
			} catch {
				return {};
			}
		}
		return value;
	});
	let summary = $derived(doc?.summary ?? doc?.aiSummary ?? doc?.ai_summary ?? null);
	let entities = $derived(metadata?.entities ?? doc?.extractedEntities ?? null);
	let tags = $state<string[]>([]);
	let tagsSaving = $state(false);

	// Sync tags when doc loads
	$effect(() => {
		if (doc) tags = (doc.tags ?? (metadata as any)?.suggestedTags ?? []) as string[];
	});

	async function saveTags(newTags: string[]) {
		if (!evidenceId || tagsSaving) return;
		tagsSaving = true;
		try {
			const res = await fetch(`/api/evidence/${evidenceId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tags: newTags }),
			});
			if (!res.ok) console.error('[EvidenceViewModal] Tag save failed:', res.status);
		} catch (e) {
			console.error('[EvidenceViewModal] Tag save error:', e);
		} finally {
			tagsSaving = false;
		}
	}
	let status = $derived(doc?.status ?? doc?.processingStatus ?? doc?.documentStatus ?? '');
	let processingDiagnostics = $derived((metadata as any)?.processingDiagnostics ?? null);
	let diagnosticStages = $derived.by(() => Object.entries((processingDiagnostics as any)?.stages ?? {}));
	let diagnosticWarnings = $derived<Array<{ stage: string; detail: string; at: string }>>((processingDiagnostics as any)?.warnings ?? []);

	function statusTone(status: string): 'success' | 'warning' | 'failed' | 'pending' | 'skipped' {
		if (status === 'success') return 'success';
		if (status === 'warning') return 'warning';
		if (status === 'failed') return 'failed';
		if (status === 'pending') return 'pending';
		return 'skipped';
	}

	// Image lightbox
	let lightboxOpen = $state(false);
	let lightboxScale = $state(1);

	function openLightbox() { lightboxOpen = true; lightboxScale = 1; }
	function closeLightbox() { lightboxOpen = false; }
	function zoomIn() { lightboxScale = Math.min(lightboxScale + 0.25, 4); }
	function zoomOut() { lightboxScale = Math.max(lightboxScale - 0.25, 0.25); }
	function resetZoom() { lightboxScale = 1; }

	// File-type color accent
	let accentColor = $derived.by(() => {
		const ft = fileType.toLowerCase();
		if (ft.includes('pdf')) return { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)', text: '#f87171', strip: '#ef4444' };
		if (ft.startsWith('image/')) return { bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.3)', text: '#c4b5fd', strip: '#a855f7' };
		if (ft.startsWith('audio/')) return { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', text: '#fbbf24', strip: '#f59e0b' };
		if (ft.startsWith('video/')) return { bg: 'rgba(236, 72, 153, 0.12)', border: 'rgba(236, 72, 153, 0.3)', text: '#f472b6', strip: '#ec4899' };
		if (ft.includes('markdown') || fileName.endsWith('.md')) return { bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.3)', text: '#7dd3fc', strip: '#38bdf8' };
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
					<!-- File preview (images with lightbox) -->
					{#if isImage && fileUrl}
						<div class="preview-wrap">
							<button type="button" class="preview-img-btn" onclick={openLightbox} title="Click to zoom">
								<img src={fileUrl} alt={doc.title ?? 'Evidence'} class="preview-img" />
								<span class="preview-zoom-hint">
									<Icon name="zoom-in" class="w-4 h-4" />
								</span>
							</button>
						</div>
					{:else if isPdf && fileUrl}
						<div class="preview-wrap pdf-embed-wrap">
							<iframe
								src={fileUrl}
								title="PDF Document: {doc.title ?? 'Evidence'}"
								class="pdf-iframe"
							></iframe>
							<div class="pdf-fallback">
								<a href={fileUrl} target="_blank" rel="noopener noreferrer" class="pdf-link">
									<Icon name="external-link" class="w-4 h-4" />
									Open in new tab
								</a>
							</div>
						</div>
					{:else if isVideo && fileUrl}
						<div class="preview-wrap media-wrap">
							<!-- svelte-ignore a11y_media_has_caption -->
							<video
								controls
								preload="metadata"
								class="video-player"
								src={fileUrl}
							>
								<track kind="captions" />
								Your browser does not support video playback.
							</video>
						</div>
					{:else if isAudio && fileUrl}
						<div class="preview-wrap media-wrap audio-wrap">
							<div class="audio-visual">
								<span class="audio-icon">
									<Icon name="music" class="w-8 h-8" />
								</span>
								<span class="audio-filename">{fileName || 'Audio file'}</span>
							</div>
							<audio controls preload="metadata" class="audio-player" src={fileUrl}>
								Your browser does not support audio playback.
							</audio>
						</div>
					{:else if isMarkdown}
						{@const rawText = doc.extractedText ?? doc.extracted_text ?? doc.content ?? ''}
						{#if rawText}
							<div class="preview-wrap markdown-wrap">
								<div class="markdown-header">
									<Icon name="file-text" class="w-3.5 h-3.5" />
									<span>Markdown</span>
								</div>
								<div class="markdown-body">
									{@html rawText
										.replace(/^### (.+)$/gm, '<h3>$1</h3>')
										.replace(/^## (.+)$/gm, '<h2>$1</h2>')
										.replace(/^# (.+)$/gm, '<h1>$1</h1>')
										.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
										.replace(/\*(.+?)\*/g, '<em>$1</em>')
										.replace(/`(.+?)`/g, '<code>$1</code>')
										.replace(/^- (.+)$/gm, '<li>$1</li>')
										.replace(/\n/g, '<br />')
									}
								</div>
							</div>
						{/if}
					{:else if isText}
						{@const rawText = doc.extractedText ?? doc.extracted_text ?? doc.content ?? ''}
						{#if rawText}
							<div class="preview-wrap text-file-wrap">
								<div class="text-file-header">
									<Icon name="file-text" class="w-3.5 h-3.5" />
									<span>{fileName || 'Text file'}</span>
									<span class="text-file-lines">{rawText.split('\n').length} lines</span>
								</div>
								<pre class="text-file-content">{rawText.slice(0, 5000)}{rawText.length > 5000 ? '\n… (truncated)' : ''}</pre>
							</div>
						{/if}
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

					{#if processingDiagnostics && diagnosticStages.length > 0}
						<div class="section diagnostics-section">
							<h3 class="section-title">
								<Icon name="activity" class="w-3.5 h-3.5" />
								Processing Diagnostics
							</h3>
							<div class="diagnostics-meta">
								<span>Started {formatDate((processingDiagnostics as any).startedAt)}</span>
								{#if (processingDiagnostics as any).completedAt}
									<span>Completed {formatDate((processingDiagnostics as any).completedAt)}</span>
								{/if}
								<span>{diagnosticWarnings.length} warning{diagnosticWarnings.length !== 1 ? 's' : ''}</span>
							</div>
							<div class="diagnostics-grid">
								{#each diagnosticStages as [stage, record]}
									<div class="diagnostic-card">
										<div class="diagnostic-card-head">
											<span class="diagnostic-stage">{stage.replace(/_/g, ' ')}</span>
											<span class={`diagnostic-badge ${statusTone((record as any).status)}`}>{(record as any).status}</span>
										</div>
										{#if (record as any).detail}
											<p class="diagnostic-detail">{(record as any).detail}</p>
										{/if}
									</div>
								{/each}
							</div>
							{#if diagnosticWarnings.length > 0}
								<div class="diagnostic-warning-list">
									{#each diagnosticWarnings as warning}
										<div class="diagnostic-warning-item">
											<strong>{warning.stage.replace(/_/g, ' ')}</strong>
											<span>{warning.detail}</span>
										</div>
									{/each}
								</div>
							{/if}
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

					<!-- Tags (editable) -->
						<div class="section">
							<h3 class="section-title">
								<Icon name="hash" class="w-3.5 h-3.5" />
								Tags
								{#if tagsSaving}<span class="saving-indicator">saving…</span>{/if}
							</h3>
							<TagInput bind:tags={tags} onchange={saveTags} placeholder="Add tag (Enter to save)…" />
						</div>

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

<!-- Image Lightbox -->
{#if lightboxOpen && isImage && fileUrl}
	<div
		class="lightbox-backdrop"
		role="dialog"
		aria-modal="true"
		aria-label="Image viewer"
		onclick={closeLightbox}
		onkeydown={(e) => { if (e.key === 'Escape') closeLightbox(); if (e.key === '+' || e.key === '=') zoomIn(); if (e.key === '-') zoomOut(); if (e.key === '0') resetZoom(); }}
		tabindex="-1"
	>
		<div class="lightbox-toolbar" onclick={(e) => e.stopPropagation()}>
			<button type="button" class="lb-btn" onclick={zoomOut} title="Zoom out (-)">
				<Icon name="zoom-out" class="w-4 h-4" />
			</button>
			<span class="lb-zoom-label">{Math.round(lightboxScale * 100)}%</span>
			<button type="button" class="lb-btn" onclick={zoomIn} title="Zoom in (+)">
				<Icon name="zoom-in" class="w-4 h-4" />
			</button>
			<button type="button" class="lb-btn" onclick={resetZoom} title="Reset (0)">
				<Icon name="maximize-2" class="w-4 h-4" />
			</button>
			<button type="button" class="lb-btn lb-close" onclick={closeLightbox} title="Close (Esc)">
				<Icon name="x" class="w-4 h-4" />
			</button>
		</div>
		<div class="lightbox-img-wrap" onclick={(e) => e.stopPropagation()}>
			<img
				src={fileUrl}
				alt={doc?.title ?? 'Evidence'}
				class="lightbox-img"
				style="transform: scale({lightboxScale});"
			/>
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
		max-width: 960px;
		max-height: 92vh;
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
	.preview-img-btn {
		position: relative;
		display: block;
		width: 100%;
		background: none;
		border: none;
		padding: 0;
		cursor: zoom-in;
	}
	.preview-img {
		width: 100%;
		max-height: 520px;
		object-fit: contain;
		display: block;
	}
	.preview-zoom-hint {
		position: absolute;
		bottom: 8px;
		right: 8px;
		background: rgba(0, 0, 0, 0.6);
		border-radius: 6px;
		padding: 4px 6px;
		color: rgba(212, 199, 163, 0.7);
		opacity: 0;
		transition: opacity 0.15s;
	}
	.preview-img-btn:hover .preview-zoom-hint { opacity: 1; }

	/* Embedded PDF viewer */
	.pdf-embed-wrap {
		display: flex;
		flex-direction: column;
	}
	.pdf-iframe {
		width: 100%;
		height: 560px;
		border: none;
		border-radius: 10px 10px 0 0;
		background: #1a1a1a;
	}
	.pdf-fallback {
		padding: 0.5rem 1rem;
		border-top: 1px solid rgba(212, 199, 163, 0.06);
		text-align: right;
	}
	.pdf-link {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		color: #60a5fa;
		text-decoration: none;
	}
	.pdf-link:hover { text-decoration: underline; }

	/* Video player */
	.media-wrap {
		display: flex;
		flex-direction: column;
	}
	.video-player {
		width: 100%;
		max-height: 520px;
		border-radius: 10px;
		background: #000;
		outline: none;
	}

	/* Audio player */
	.audio-wrap {
		padding: 1.5rem;
		gap: 1rem;
		align-items: center;
	}
	.audio-visual {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem 0;
	}
	.audio-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		border-radius: 14px;
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid rgba(245, 158, 11, 0.2);
		color: #fbbf24;
	}
	.audio-filename {
		font-size: 0.78rem;
		color: rgba(212, 199, 163, 0.6);
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.audio-player {
		width: 100%;
		height: 40px;
		border-radius: 8px;
		outline: none;
	}

	/* Markdown viewer */
	.markdown-wrap {
		display: flex;
		flex-direction: column;
	}
	.markdown-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: rgba(212, 199, 163, 0.45);
		border-bottom: 1px solid rgba(212, 199, 163, 0.06);
	}
	.markdown-body {
		padding: 1rem;
		font-size: 0.82rem;
		line-height: 1.7;
		color: rgba(212, 199, 163, 0.75);
		max-height: 400px;
		overflow-y: auto;
	}
	.markdown-body :global(h1) { font-size: 1.3rem; font-weight: 700; color: rgba(212, 199, 163, 0.9); margin: 0.75rem 0 0.5rem; }
	.markdown-body :global(h2) { font-size: 1.1rem; font-weight: 600; color: rgba(212, 199, 163, 0.85); margin: 0.6rem 0 0.4rem; }
	.markdown-body :global(h3) { font-size: 0.95rem; font-weight: 600; color: rgba(212, 199, 163, 0.8); margin: 0.5rem 0 0.3rem; }
	.markdown-body :global(code) {
		font-family: 'JetBrains Mono', 'Courier New', monospace;
		font-size: 0.78rem;
		padding: 0.12rem 0.35rem;
		border-radius: 4px;
		background: rgba(212, 199, 163, 0.06);
		color: #7dd3fc;
	}
	.markdown-body :global(strong) { font-weight: 600; color: rgba(212, 199, 163, 0.88); }
	.markdown-body :global(li) { margin-left: 1rem; list-style: disc; }

	/* Text file viewer */
	.text-file-wrap {
		display: flex;
		flex-direction: column;
	}
	.text-file-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		font-size: 0.72rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.45);
		border-bottom: 1px solid rgba(212, 199, 163, 0.06);
	}
	.text-file-lines {
		margin-left: auto;
		font-weight: 400;
		color: rgba(212, 199, 163, 0.3);
	}
	.text-file-content {
		font-family: 'JetBrains Mono', 'Courier New', monospace;
		font-size: 0.72rem;
		line-height: 1.55;
		color: rgba(212, 199, 163, 0.6);
		white-space: pre-wrap;
		word-break: break-word;
		margin: 0;
		padding: 1rem;
		max-height: 400px;
		overflow-y: auto;
	}

	/* Image Lightbox */
	.lightbox-backdrop {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: rgba(0, 0, 0, 0.92);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		animation: fadeIn 0.15s ease;
	}
	.lightbox-toolbar {
		position: absolute;
		top: 12px;
		right: 12px;
		display: flex;
		align-items: center;
		gap: 4px;
		background: rgba(30, 30, 32, 0.85);
		border: 1px solid rgba(212, 199, 163, 0.15);
		border-radius: 8px;
		padding: 4px 6px;
		z-index: 101;
	}
	.lb-btn {
		background: none;
		border: none;
		color: rgba(212, 199, 163, 0.6);
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		display: flex;
		align-items: center;
	}
	.lb-btn:hover { color: rgba(212, 199, 163, 0.9); background: rgba(255, 255, 255, 0.06); }
	.lb-close:hover { color: #f87171; }
	.lb-zoom-label {
		font-size: 11px;
		font-family: monospace;
		color: rgba(212, 199, 163, 0.5);
		min-width: 36px;
		text-align: center;
	}
	.lightbox-img-wrap {
		overflow: auto;
		max-width: 95vw;
		max-height: 90vh;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.lightbox-img {
		max-width: none;
		max-height: none;
		transition: transform 0.15s ease;
		cursor: grab;
		border-radius: 4px;
	}

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
	.diagnostics-section {
		border-color: rgba(96, 165, 250, 0.16);
		background: linear-gradient(135deg, rgba(96, 165, 250, 0.04) 0%, rgba(59, 130, 246, 0.02) 100%);
	}
	.diagnostics-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin-bottom: 0.75rem;
		font-size: 0.72rem;
		color: rgba(212, 199, 163, 0.45);
	}
	.diagnostics-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 0.65rem;
	}
	.diagnostic-card {
		padding: 0.75rem;
		border-radius: 8px;
		background: rgba(0, 0, 0, 0.18);
		border: 1px solid rgba(212, 199, 163, 0.08);
	}
	.diagnostic-card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.4rem;
	}
	.diagnostic-stage {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: capitalize;
		color: rgba(212, 199, 163, 0.72);
	}
	.diagnostic-badge {
		display: inline-flex;
		padding: 0.12rem 0.45rem;
		border-radius: 999px;
		font-size: 0.62rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border: 1px solid transparent;
	}
	.diagnostic-badge.success {
		background: rgba(34, 197, 94, 0.1);
		border-color: rgba(34, 197, 94, 0.2);
		color: #4ade80;
	}
	.diagnostic-badge.warning {
		background: rgba(245, 158, 11, 0.1);
		border-color: rgba(245, 158, 11, 0.2);
		color: #fbbf24;
	}
	.diagnostic-badge.failed {
		background: rgba(239, 68, 68, 0.1);
		border-color: rgba(239, 68, 68, 0.2);
		color: #f87171;
	}
	.diagnostic-badge.pending {
		background: rgba(96, 165, 250, 0.1);
		border-color: rgba(96, 165, 250, 0.2);
		color: #93c5fd;
	}
	.diagnostic-badge.skipped {
		background: rgba(212, 199, 163, 0.06);
		border-color: rgba(212, 199, 163, 0.12);
		color: rgba(212, 199, 163, 0.55);
	}
	.diagnostic-detail {
		margin: 0;
		font-size: 0.74rem;
		line-height: 1.45;
		color: rgba(212, 199, 163, 0.58);
	}
	.diagnostic-warning-list {
		margin-top: 0.8rem;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.diagnostic-warning-item {
		display: flex;
		flex-direction: column;
		gap: 0.12rem;
		padding: 0.6rem 0.7rem;
		border-radius: 8px;
		background: rgba(245, 158, 11, 0.08);
		border: 1px solid rgba(245, 158, 11, 0.16);
		font-size: 0.72rem;
		color: rgba(251, 191, 36, 0.9);
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
	.saving-indicator {
		font-size: 0.6rem;
		color: rgba(96, 165, 250, 0.6);
		font-weight: 400;
		margin-left: 0.5rem;
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
