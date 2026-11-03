<script lang="ts">
	import { Dialog } from 'bits-ui';
	import '$lib/styles/evidence-document-modal.css';
	import Icon from '$lib/components/ui/Icon.svelte';
	import TagInput from '$lib/components/ui/TagInput.svelte';
	import DoclingExtractionViewer from './DoclingExtractionViewer.svelte';
	import { formatFileSize, formatDate, getIcon, getTypeLabel } from './evidence-utils.js';

	let {
		evidenceId,
		caseId = null,
		open = $bindable(false),
		onClose = () => {},
		onEdit,
		onAnalyze
	}: {
		evidenceId: string | null;
		caseId?: string | null;
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
	let previewUrl = $derived.by(() => {
		const previewCaseId = doc?.caseId ?? doc?.case_id ?? caseId;
		if (!evidenceId || !previewCaseId) return null;
		const query = new URLSearchParams({ inline: '1', caseId: previewCaseId });
		return `/api/evidence/${encodeURIComponent(evidenceId)}/download?${query}`;
	});
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

	// Direct AI analysis trigger
	let analyzeLoading = $state(false);
	let analyzeQueued  = $state(false);

	// Sync tags when doc loads
	$effect(() => {
		if (doc) tags = (doc.tags ?? (metadata as Record<string, unknown>)?.suggestedTags ?? []) as string[];
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
	let processingDiagnostics = $derived(
		((metadata as Record<string, unknown>)?.processingDiagnostics as { stages?: Record<string, { status: string; detail?: string }>; warnings?: Array<{ stage: string; detail: string; at: string }>; startedAt?: string; completedAt?: string } | undefined) ?? null
	);
	let diagnosticStages = $derived.by(() => Object.entries(processingDiagnostics?.stages ?? {}) as [string, { status: string; detail?: string }][]);
	let diagnosticWarnings = $derived<Array<{ stage: string; detail: string; at: string }>>(processingDiagnostics?.warnings ?? []);

	function statusTone(status: string): 'success' | 'warning' | 'failed' | 'pending' | 'skipped' {
		if (status === 'success') return 'success';
		if (status === 'warning') return 'warning';
		if (status === 'failed') return 'failed';
		if (status === 'pending') return 'pending';
		return 'skipped';
	}

	// Docling extraction viewer
	let showDoclingViewer = $state(false);
	let doclingFileBase64 = $state<string | undefined>(undefined);
	let doclingLoading = $state(false);

	let canRunDocling = $derived(
		(isPdf || isImage) && !!previewUrl
	);

	async function openDoclingViewer() {
		if (!previewUrl) return;
		doclingLoading = true;
		try {
			const res = await fetch(previewUrl);
			if (!res.ok) throw new Error('Failed to fetch file');
			const blob = await res.blob();
			const reader = new FileReader();
			const base64 = await new Promise<string>((resolve) => {
				reader.onload = () => {
					const dataUrl = reader.result as string;
					resolve(dataUrl.split(',')[1]);
				};
				reader.readAsDataURL(blob);
			});
			doclingFileBase64 = base64;
			showDoclingViewer = true;
		} catch (e) {
			console.error('[EvidenceViewModal] Docling fetch error:', e);
		} finally {
			doclingLoading = false;
		}
	}

	async function runAnalysis() {
		if (!evidenceId || analyzeLoading || analyzeQueued) return;
		analyzeLoading = true;
		try {
			const res = await fetch('/api/evidence/analysis', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					evidenceId,
					stages: ['entity_extraction', 'forensics', 'summarization'],
				}),
			});
			if (res.ok) {
				analyzeQueued = true;
				onAnalyze?.(doc);
				// Reload after a short delay to reflect any immediate enrichment
				setTimeout(() => { if (evidenceId) loadDoc(evidenceId); }, 3000);
			}
		} catch { /* non-fatal */ }
		analyzeLoading = false;
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

<Dialog.Root bind:open onOpenChange={(next) => { if (!next) close(); }}>
	<Dialog.Portal>
		<Dialog.Overlay class="evidence-document-modal-backdrop" />
		<Dialog.Content class="evidence-document-modal">
			<!-- Corner Notches and Top Highlight -->
			<span class="hud-notch-tl" aria-hidden="true"></span>
			<span class="hud-notch-tr" aria-hidden="true"></span>
			<span class="hud-notch-bl" aria-hidden="true"></span>
			<span class="hud-notch-br" aria-hidden="true"></span>
			<div class="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#f3d471] to-transparent opacity-80" aria-hidden="true"></div>
			<!-- Type accent strip -->
			<div class="modal-accent-strip" style="background: {accentColor.strip};"></div>

			<!-- Header -->
			<div class="modal-header">
				<div class="modal-title-row">
					<div class="modal-file-icon-wrap" style="background: {accentColor.bg}; border-color: {accentColor.border};">
						<span class="modal-file-icon">{doc ? getIcon(fileType) : '📄'}</span>
					</div>
					<div class="modal-title-text">
						<Dialog.Title class="modal-title">
							{#if isLoading}Loading…{:else if doc}{doc.title || doc.fileName || doc.file_name || 'Untitled'}{:else}Evidence Detail{/if}
						</Dialog.Title>
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
					{#if isImage && previewUrl}
						<div class="preview-wrap">
							<button type="button" class="preview-img-btn" onclick={openLightbox} title="Click to zoom">
								<img src={previewUrl} alt={doc.title ?? 'Evidence'} class="preview-img" />
								<span class="preview-zoom-hint">
									<Icon name="zoom-in" class="w-4 h-4" />
								</span>
							</button>
						</div>
					{:else if isPdf && previewUrl}
						<div class="preview-wrap pdf-embed-wrap">
							<iframe
								src={previewUrl}
								title="PDF Document: {doc.title ?? 'Evidence'}"
								class="pdf-iframe"
							></iframe>
							<div class="pdf-fallback">
								<a href={previewUrl} target="_blank" rel="noopener noreferrer" class="pdf-link">
									<Icon name="external-link" class="w-4 h-4" />
									Open in new tab
								</a>
							</div>
						</div>
					{:else if isVideo && previewUrl}
						<div class="preview-wrap media-wrap">
							<!-- svelte-ignore a11y_media_has_caption -->
							<video
								controls
								preload="metadata"
								class="video-player"
								src={previewUrl}
							>
								<track kind="captions" />
								Your browser does not support video playback.
							</video>
						</div>
					{:else if isAudio && previewUrl}
						<div class="preview-wrap media-wrap audio-wrap">
							<div class="audio-visual">
								<span class="audio-icon">
									<Icon name="music" class="w-8 h-8" />
								</span>
								<span class="audio-filename">{fileName || 'Audio file'}</span>
							</div>
							<audio controls preload="metadata" class="audio-player" src={previewUrl}>
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
								<span>Started {formatDate(processingDiagnostics?.startedAt ?? "")}</span>
								{#if processingDiagnostics?.completedAt}
									<span>Completed {formatDate(processingDiagnostics?.completedAt)}</span>
								{/if}
								<span>{diagnosticWarnings.length} warning{diagnosticWarnings.length !== 1 ? 's' : ''}</span>
							</div>
							<div class="diagnostics-grid">
								{#each diagnosticStages as [stage, record]}
									<div class="diagnostic-card">
										<div class="diagnostic-card-head">
											<span class="diagnostic-stage">{stage.replace(/_/g, ' ')}</span>
											<span class={`diagnostic-badge ${statusTone(record.status)}`}>{record.status}</span>
										</div>
										{#if record.detail}
											<p class="diagnostic-detail">{record.detail}</p>
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
						{#if previewUrl}
							<a
								href={previewUrl}
								download={doc.fileName ?? doc.file_name ?? true}
								class="footer-btn secondary download"
								onclick={close}
							>
								<Icon name="download" class="w-3.5 h-3.5" />
								Download
							</a>
						{/if}
						{#if canRunDocling}
							<button
								type="button"
								class="footer-btn secondary"
								onclick={openDoclingViewer}
								disabled={doclingLoading}
							>
								<Icon name="file-search" class="w-3.5 h-3.5" />
								{doclingLoading ? 'Loading…' : 'Docling Extract'}
							</button>
						{/if}
						<button
							type="button"
							class="footer-btn secondary"
							class:analysis-queued={analyzeQueued}
							onclick={runAnalysis}
							disabled={analyzeLoading || analyzeQueued}
							title={analyzeQueued ? 'Analysis jobs enqueued — results will appear shortly' : 'Run AI analysis (entity extraction, forensics, summarization)'}
						>
							<Icon name={analyzeQueued ? 'check' : 'sparkles'} class="w-3.5 h-3.5" />
							{analyzeLoading ? 'Queuing…' : analyzeQueued ? 'Analysis Queued' : 'Run Analysis'}
						</button>
						{#if onEdit}
							<button type="button" class="footer-btn primary" onclick={() => { onEdit?.(doc.id); close(); }}>
								<Icon name="pencil" class="w-3.5 h-3.5" />
								Edit
							</button>
						{/if}
					</div>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Image Lightbox -->
{#if lightboxOpen && isImage && previewUrl}
	<div
		class="lightbox-backdrop"
		role="dialog"
		aria-modal="true"
		aria-label="Image viewer"
		onclick={(e) => { if (e.target === e.currentTarget) closeLightbox(); }}
		onkeydown={(e) => { if (e.key === 'Escape') closeLightbox(); if (e.key === '+' || e.key === '=') zoomIn(); if (e.key === '-') zoomOut(); if (e.key === '0') resetZoom(); }}
		tabindex="-1"
	>
		<div class="lightbox-toolbar">
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
		<div class="lightbox-img-wrap">
			<img
					src={previewUrl}
				alt={doc?.title ?? 'Evidence'}
				class="lightbox-img"
				style="transform: scale({lightboxScale});"
			/>
		</div>
	</div>
{/if}

<!-- Docling Extraction Viewer -->
<DoclingExtractionViewer
	bind:open={showDoclingViewer}
	evidenceId={evidenceId ?? undefined}
	fileName={fileName}
	fileBase64={doclingFileBase64}
/>
