<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { fade } from 'svelte/transition';
	import { goto, invalidateAll } from '$app/navigation';
	import TiptapWithAIAssistant from '$lib/components/editor/TiptapWithAIAssistant.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	const { data } = $props();
	const caseData = $derived(data?.caseData);
	const reports = $derived(data?.reports ?? []);

	let showResumeModal = $state(false);
	let selectedReport = $state<any>(null);
	let showEditor = $state(false);
	let editorContent = $state('');
	let editorTitle = $state('');
	let isSaving = $state(false);
	let isGenerating = $state(false);
	let isExporting = $state(false);
	let isPublishing = $state(false);

	function openResume(report: any) {
		selectedReport = report;
		showResumeModal = true;
	}

	function openEditor(report?: any) {
		if (report) {
			selectedReport = report;
			editorContent = report.content || '';
			editorTitle = report.title || 'Untitled Report';
		} else {
			selectedReport = null;
			editorContent = '';
			editorTitle = 'Untitled Report';
		}
		showResumeModal = false;
		showEditor = true;
	}

	async function generateChargingMemo() {
		if (!caseData?.id) return;

		isGenerating = true;
		try {
			const res = await fetch('/api/reports/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ caseId: caseData.id, type: 'charging_memo' }),
				signal: AbortSignal.timeout(120_000)
			});
			const responseData = await res.json();

			if (responseData.success && responseData.report) {
				selectedReport = responseData.report;
				editorContent = responseData.report.content || '';
				editorTitle = responseData.report.title || 'Charging Memo';
				showEditor = true;
			}
		} catch (error) {
			console.error('Failed to generate charging memo:', error);
		} finally {
			isGenerating = false;
		}
	}

	async function saveReport() {
		isSaving = true;
		try {
			if (selectedReport?.id) {
				const res = await fetch('/api/reports/save', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						reportId: selectedReport.id,
						title: editorTitle,
						contentHtml: editorContent
					}),
					signal: AbortSignal.timeout(30_000)
				});
				const responseData = await res.json();
				if (responseData.success) {
					selectedReport = responseData.report;
				}
			} else {
				const res = await fetch('/api/reports', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						caseId: caseData?.id,
						title: editorTitle,
						contentHtml: editorContent,
						status: 'draft'
					}),
					signal: AbortSignal.timeout(30_000)
				});
				const responseData = await res.json();
				if (responseData.success && responseData.data) {
					selectedReport = responseData.data;
				}
			}
			await invalidateAll();
		} catch (error) {
			console.error('Failed to save report:', error);
		} finally {
			isSaving = false;
		}
	}

	async function exportReport(format: 'html' | 'pdf' = 'html') {
		if (!selectedReport?.id) return;
		isExporting = true;
		try {
			const res = await fetch(`/api/reports/${selectedReport.id}/export?format=${format}`, { signal: AbortSignal.timeout(30_000) });
			if (res.ok) {
				const blob = await res.blob();
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `${selectedReport.title || 'report'}.${format}`;
				a.click();
				URL.revokeObjectURL(url);
			}
		} catch (error) {
			console.error('Failed to export report:', error);
		} finally {
			isExporting = false;
		}
	}

	async function publishReport() {
		if (!selectedReport?.id) return;
		isPublishing = true;
		try {
			const res = await fetch(`/api/reports/${selectedReport.id}/publish`, {
				method: 'POST',
				signal: AbortSignal.timeout(30_000)
			});
			const responseData = await res.json();
			if (responseData.success) {
				selectedReport = { ...selectedReport, status: 'published' };
				await invalidateAll();
			}
		} catch (error) {
			console.error('Failed to publish report:', error);
		} finally {
			isPublishing = false;
		}
	}

	async function deleteReport(reportId: string) {
		if (!confirm('Are you sure you want to delete this report?')) return;
		try {
			const res = await fetch('/api/reports', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids: [reportId] }),
				signal: AbortSignal.timeout(30_000)
			});
			if (res.ok) {
				showResumeModal = false;
				await invalidateAll();
			}
		} catch (error) {
			console.error('Failed to delete report:', error);
		}
	}

	function closeEditor() {
		showEditor = false;
		selectedReport = null;
		editorContent = '';
		editorTitle = '';
	}

	function formatDate(dateStr: string | null | undefined): string {
		if (!dateStr) return '—';
		try {
			return new Date(dateStr).toLocaleDateString('en-US', {
				month: 'short', day: 'numeric', year: 'numeric'
			});
		} catch { return '—'; }
	}
</script>

<section class="cr-page">
	<div class="cr-header">
		<h2 class="cr-section-title">Reports</h2>
		<div class="cr-actions">
			<button
				class="cr-pill-btn"
				onclick={generateChargingMemo}
				disabled={isGenerating}
			>
				{isGenerating ? 'Generating...' : 'Generate Charging Memo'}
			</button>
			<button
				class="cr-pill-btn"
				onclick={() => openEditor()}
			>
				New Draft
			</button>
		</div>
	</div>

	<div class="cr-list-panel">
		{#if reports?.length}
			{#each reports as report (report.id)}
				<button
					type="button"
					class="cr-report-row"
					onclick={() => openResume(report)}
				>
					<div class="cr-report-info">
						<span class="cr-report-title">
							{report.title ?? 'Untitled report'}
						</span>
						<span class="cr-report-meta">
							{(report.type ?? (report.metadata as any)?.reportType ?? report.status ?? 'Draft').replace('_', ' ')} &bull; Updated {formatDate(String(report.updatedAt ?? report.createdAt ?? ''))}
						</span>
					</div>
					<span class="cr-resume-tag">Resume</span>
				</button>
			{/each}
		{:else}
			<div class="cr-empty">
				No reports created for this case yet.
			</div>
		{/if}
	</div>

	<!-- Resume Modal (bits-ui Dialog) -->
	<Dialog.Root bind:open={showResumeModal}>
		<Dialog.Portal>
			<Dialog.Overlay class="cr-overlay" />
			<Dialog.Content class="cr-dialog-center">
				<div class="cr-modal cr-modal-sm">
					<header class="cr-modal-header">
						<div>
							<Dialog.Title class="cr-modal-label">
								Resume Draft
							</Dialog.Title>
							<Dialog.Description class="cr-modal-title">
								{selectedReport?.title ?? 'Untitled report'}
							</Dialog.Description>
						</div>
						<Dialog.Close class="cr-close-btn">
							Close
						</Dialog.Close>
					</header>

					<div class="cr-preview-box">
						{@html selectedReport?.content
							? selectedReport.content.slice(0, 500) + (selectedReport.content.length > 500 ? '...' : '')
							: '<p class="cr-no-content">No content yet.</p>'}
					</div>

					<footer class="cr-modal-footer">
						<button
							class="cr-pill-btn danger"
							onclick={() => selectedReport?.id && deleteReport(selectedReport.id)}
						>
							Delete
						</button>
						<div class="cr-footer-right">
							<Dialog.Close class="cr-pill-btn neutral">
								Cancel
							</Dialog.Close>
							<button
								class="cr-pill-btn primary"
								onclick={() => openEditor(selectedReport)}
							>
								Open in Editor
							</button>
						</div>
					</footer>
				</div>
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>

	<!-- Editor Modal (bits-ui Dialog) -->
	<Dialog.Root bind:open={showEditor}>
		<Dialog.Portal>
			<Dialog.Overlay class="cr-overlay" />
			<Dialog.Content class="cr-dialog-center">
				<div class="cr-modal cr-modal-editor">
					<header class="cr-editor-header">
						<div class="cr-editor-title-area">
							<Dialog.Title class="cr-modal-label">
								{selectedReport ? 'Edit Report' : 'New Report'}
							</Dialog.Title>
							<input
								type="text"
								class="cr-title-input"
								bind:value={editorTitle}
								placeholder="Report Title"
							/>
						</div>
						<div class="cr-editor-actions">
							{#if selectedReport?.id}
								<button
									class="cr-pill-btn neutral"
									onclick={() => exportReport('html')}
									disabled={isExporting}
								>
									<Icon name="download" size={12} />
									{isExporting ? 'Exporting...' : 'Export'}
								</button>
								<button
									class="cr-pill-btn success"
									onclick={publishReport}
									disabled={isPublishing || selectedReport?.status === 'published'}
								>
									<Icon name="send" size={12} />
									{isPublishing ? 'Publishing...' : selectedReport?.status === 'published' ? 'Published' : 'Publish'}
								</button>
							{/if}
							<Dialog.Close class="cr-pill-btn neutral">
								Cancel
							</Dialog.Close>
							<button
								class="cr-pill-btn primary"
								onclick={saveReport}
								disabled={isSaving}
							>
								{isSaving ? 'Saving...' : 'Save'}
							</button>
						</div>
					</header>

					<Dialog.Description class="sr-only">
						Edit the report content using the rich text editor below.
					</Dialog.Description>

					<div class="cr-editor-body">
						<TiptapWithAIAssistant
							initialContent={editorContent}
							placeholder="Start writing your report..."
							onUpdate={(html) => {
								editorContent = html;
							}}
						/>
					</div>
				</div>
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
</section>

<style>
	.cr-page {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* ── Header ── */
	.cr-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.cr-section-title {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.25em;
		color: rgba(212, 199, 163, 0.4);
		margin: 0;
		font-weight: 600;
	}
	.cr-actions {
		display: flex;
		gap: 0.5rem;
	}

	/* ── Pill buttons ── */
	.cr-pill-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.7rem;
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
		border: 1px solid rgba(196, 117, 43, 0.5);
		background: transparent;
		color: rgba(212, 199, 163, 0.8);
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
		font-weight: 500;
	}
	.cr-pill-btn:hover:not(:disabled) {
		background: rgba(196, 117, 43, 0.1);
	}
	.cr-pill-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.cr-pill-btn.primary {
		border-color: rgba(196, 117, 43, 0.7);
		background: rgba(196, 117, 43, 0.1);
	}
	.cr-pill-btn.primary:hover:not(:disabled) {
		background: rgba(196, 117, 43, 0.2);
	}
	.cr-pill-btn.neutral {
		border-color: rgba(212, 199, 163, 0.15);
		color: rgba(212, 199, 163, 0.6);
	}
	.cr-pill-btn.neutral:hover {
		background: rgba(212, 199, 163, 0.06);
	}
	.cr-pill-btn.danger {
		border-color: rgba(220, 38, 38, 0.5);
		color: rgba(248, 113, 113, 0.9);
	}
	.cr-pill-btn.danger:hover {
		background: rgba(220, 38, 38, 0.1);
	}
	.cr-pill-btn.success {
		border-color: rgba(34, 197, 94, 0.5);
		color: rgba(74, 222, 128, 0.9);
	}
	.cr-pill-btn.success:hover:not(:disabled) {
		background: rgba(34, 197, 94, 0.1);
	}

	/* ── Report list ── */
	.cr-list-panel {
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 1rem;
		background: rgba(0, 0, 0, 0.25);
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.cr-report-row {
		width: 100%;
		text-align: left;
		padding: 0.5rem 0.75rem;
		border-radius: 0.75rem;
		border: 1px solid rgba(212, 199, 163, 0.06);
		background: transparent;
		color: inherit;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		font-size: 0.85rem;
		transition: border-color 0.15s, background 0.15s;
	}
	.cr-report-row:hover {
		border-color: rgba(196, 117, 43, 0.5);
		background: rgba(212, 199, 163, 0.03);
	}
	.cr-report-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}
	.cr-report-title {
		font-weight: 600;
		color: rgba(212, 199, 163, 0.9);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cr-report-meta {
		font-size: 0.7rem;
		color: rgba(212, 199, 163, 0.4);
	}
	.cr-resume-tag {
		font-size: 0.6rem;
		letter-spacing: 0.25em;
		text-transform: uppercase;
		color: rgba(196, 117, 43, 0.8);
		flex-shrink: 0;
	}
	.cr-empty {
		font-size: 0.75rem;
		color: rgba(212, 199, 163, 0.35);
		padding: 0.5rem;
	}

	/* ── Dialog overlay + center ── */
	:global(.cr-overlay) {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 50;
	}
	:global(.cr-dialog-center) {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	/* ── Modal panels ── */
	.cr-modal {
		width: 100%;
		border: 1px solid rgba(196, 117, 43, 0.35);
		border-radius: 1.5rem;
		background: rgba(19, 21, 25, 0.97);
		box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5), 0 0 40px rgba(196, 117, 43, 0.08);
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.cr-modal-sm {
		max-width: 36rem;
	}
	.cr-modal-editor {
		max-width: 80rem;
		height: 90vh;
		padding: 1.5rem;
	}

	/* ── Modal header ── */
	.cr-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	:global(.cr-modal-label) {
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.35em;
		color: rgba(196, 117, 43, 0.8);
		margin: 0;
	}
	:global(.cr-modal-title) {
		font-size: 0.875rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.9);
		margin: 0;
	}
	:global(.cr-close-btn) {
		font-size: 0.7rem;
		padding: 0.25rem 0.5rem;
		border-radius: 9999px;
		border: 1px solid rgba(212, 199, 163, 0.15);
		background: transparent;
		color: rgba(212, 199, 163, 0.5);
		cursor: pointer;
	}
	:global(.cr-close-btn:hover) {
		background: rgba(212, 199, 163, 0.06);
	}

	/* ── Preview box ── */
	.cr-preview-box {
		font-size: 0.75rem;
		color: rgba(212, 199, 163, 0.7);
		max-height: 16rem;
		overflow: auto;
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 1rem;
		padding: 0.75rem;
		background: rgba(0, 0, 0, 0.25);
	}
	:global(.cr-no-content) {
		color: rgba(212, 199, 163, 0.35);
	}

	/* ── Modal footer ── */
	.cr-modal-footer {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.cr-footer-right {
		display: flex;
		gap: 0.5rem;
	}

	/* ── Editor modal ── */
	.cr-editor-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-shrink: 0;
	}
	.cr-editor-title-area {
		flex: 1;
		min-width: 0;
	}
	.cr-title-input {
		width: 100%;
		font-size: 1.1rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.9);
		background: transparent;
		border: none;
		border-bottom: 1px solid rgba(212, 199, 163, 0.15);
		outline: none;
		padding: 0.25rem 0;
		transition: border-color 0.15s;
	}
	.cr-title-input:focus {
		border-bottom-color: rgba(196, 117, 43, 0.5);
	}
	.cr-editor-actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}
	.cr-editor-body {
		flex: 1;
		overflow: auto;
		min-height: 0;
	}

	/* ── Screen reader only ── */
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		border: 0;
	}
</style>
