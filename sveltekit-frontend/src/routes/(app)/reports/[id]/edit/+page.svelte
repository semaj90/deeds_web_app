<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import TiptapWithAIAssistant from '$lib/components/editor/TiptapWithAIAssistant.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	let reportId = $derived(page.params.id);

	let report = $state<any>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let isSaving = $state(false);
	let isPublishing = $state(false);
	let lastSaved = $state<Date | null>(null);
	let isDirty = $state(false);

	let editorContent = $state('');

	onMount(async () => { await loadReport(); });

	async function loadReport() {
		loading = true;
		error = null;
		try {
			const res = await fetch(`/api/reports?ids=${reportId}`, { credentials: 'include' });
			if (!res.ok) throw new Error('Failed to load report');
			const data = await res.json();
			const reports = data.data || [];
			const foundReport = reports.find((r: any) => r.id === reportId);
			if (!foundReport) throw new Error('Report not found');
			report = foundReport;
			editorContent = report.content || '<p>Start writing...</p>';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load report';
		} finally {
			loading = false;
		}
	}

	async function saveReport() {
		if (!report) return;
		isSaving = true;
		error = null;
		try {
			const res = await fetch(`/api/reports`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ ids: [reportId], contentHtml: editorContent, title: report.title })
			});
			if (!res.ok) throw new Error('Failed to save report');
			lastSaved = new Date();
			isDirty = false;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save report';
		} finally {
			isSaving = false;
		}
	}

	async function publishReport() {
		if (!confirm('Publish this report? It will be marked as final and shared.')) return;
		isPublishing = true;
		error = null;
		try {
			await saveReport();
			const res = await fetch(`/api/reports/${reportId}/publish`, { method: 'POST', credentials: 'include' });
			if (!res.ok) throw new Error('Failed to publish report');
			report.status = 'published';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to publish report';
		} finally {
			isPublishing = false;
		}
	}

	function handleUpdate(content: string) { editorContent = content; isDirty = true; }
	function handleAutoSave(content: string) { editorContent = content; }

	function formatTime(d: Date) {
		return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="edit-report-page">
	{#if loading}
		<div class="er-loading">
			<Icon name="loader-circle" class="er-spinner" />
			<span>Loading report...</span>
		</div>
	{:else if error && !report}
		<div class="er-error-full">
			<Icon name="triangle-alert" class="er-error-icon" />
			<h2>Error Loading Report</h2>
			<p>{error}</p>
			<button onclick={() => goto('/reports')} class="er-btn secondary">
				<Icon name="arrow-left" />
				Back to Reports
			</button>
		</div>
	{:else if report}
		<!-- Sticky Header Bar -->
		<div class="er-toolbar">
			<div class="er-toolbar-inner">
				<div class="er-toolbar-left">
					<button onclick={() => goto('/reports')} class="er-back-btn">
						<Icon name="arrow-left" />
						Back
					</button>

					<div class="er-divider"></div>

					<div class="er-title-area">
						<h1 class="er-title">{report.title}</h1>
						<div class="er-meta">
							<span class="er-type-badge">
								{(report.type ?? report.metadata?.reportType ?? 'custom').replace('_', ' ')}
							</span>
							{#if lastSaved}
								<span class="er-saved">
									<Icon name="check" />
									Saved {formatTime(lastSaved)}
								</span>
							{:else if isDirty}
								<span class="er-unsaved">Unsaved changes</span>
							{/if}
							{#if report.status === 'published'}
								<span class="er-published">
									<Icon name="circle-check" />
									Published
								</span>
							{/if}
						</div>
					</div>
				</div>

				<div class="er-toolbar-right">
					<button
						onclick={() => goto(`/reports/${reportId}`)}
						title="Preview"
						class="er-icon-btn"
					>
						<Icon name="eye" />
					</button>

					<button
						onclick={saveReport}
						disabled={isSaving || !isDirty}
						class="er-btn secondary"
					>
						{#if isSaving}
							<Icon name="loader-circle" class="animate-spin" />
							Saving...
						{:else}
							<Icon name="save" />
							Save
						{/if}
					</button>

					{#if report.status !== 'published'}
						<button
							onclick={publishReport}
							disabled={isPublishing || isDirty}
							class="er-btn primary"
						>
							{#if isPublishing}
								<Icon name="loader-circle" class="animate-spin" />
							{:else}
								<Icon name="upload" />
							{/if}
							Publish
						</button>
					{/if}
				</div>
			</div>

			{#if error}
				<div class="er-inline-error">
					<Icon name="triangle-alert" />
					<span>{error}</span>
				</div>
			{/if}
		</div>

		<!-- Editor -->
		<div class="er-editor-wrap">
			<TiptapWithAIAssistant
				initialContent={editorContent}
				placeholder="Start writing your {(report.type ?? report.metadata?.reportType ?? 'custom').replace('_', ' ')}..."
				onSave={saveReport}
				onAutoSave={handleAutoSave}
				onUpdate={handleUpdate}
			/>
		</div>
	{/if}
</div>

<style>
	.edit-report-page {
		min-height: 100vh;
		background: #0e0d0b;
		color: #d4c7a3;
		margin: -2.5rem;
		padding: 0 2.5rem;
	}
	.edit-report-page :global(h1), .edit-report-page :global(h2), .edit-report-page :global(h3), .edit-report-page :global(h4), .edit-report-page :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.edit-report-page :global(a) { color: inherit; border-bottom: none; }
	.edit-report-page :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.edit-report-page :global(input), .edit-report-page :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.edit-report-page :global(.panel), .edit-report-page :global(.card), .edit-report-page :global([class*="panel"]) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

	/* ── Loading / Error ── */
	.er-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100vh;
		gap: 0.75rem;
		color: rgba(212, 199, 163, 0.5);
		font-size: 0.85rem;
	}
	:global(.er-spinner) { width: 2rem; height: 2rem; color: rgba(212, 199, 163, 0.4); }
	.er-error-full {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		gap: 1rem;
		text-align: center;
	}
	:global(.er-error-icon) { width: 3rem; height: 3rem; color: rgba(212, 199, 163, 0.3); }
	.er-error-full h2 { font-size: 1.25rem; font-weight: 600; color: rgba(212, 199, 163, 0.8); margin: 0; }
	.er-error-full p { font-size: 0.85rem; color: rgba(212, 199, 163, 0.45); margin: 0; }

	/* ── Toolbar ── */
	.er-toolbar {
		position: sticky;
		top: 0;
		z-index: 10;
		border-bottom: 1px solid rgba(212, 199, 163, 0.08);
		background: rgba(19, 21, 25, 0.95);
		backdrop-filter: blur(8px);
	}
	.er-toolbar-inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1.5rem;
	}
	.er-toolbar-left {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.er-toolbar-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* ── Back button ── */
	.er-back-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.45);
		background: none;
		border: none;
		cursor: pointer;
		transition: color 0.15s;
	}
	.er-back-btn:hover { color: rgba(212, 199, 163, 0.8); }

	.er-divider {
		width: 1px;
		height: 1.5rem;
		background: rgba(212, 199, 163, 0.1);
	}

	/* ── Title area ── */
	.er-title-area { min-width: 0; }
	.er-title {
		font-size: 1rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.95);
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.er-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.125rem;
		font-size: 0.68rem;
	}
	.er-type-badge {
		display: inline-block;
		padding: 0.1rem 0.4rem;
		border-radius: 0.25rem;
		background: rgba(96, 165, 250, 0.12);
		color: rgba(96, 165, 250, 0.9);
		font-weight: 600;
		text-transform: capitalize;
		font-size: 0.6rem;
	}
	.er-saved {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		color: #34d399;
	}
	.er-unsaved { color: rgba(251, 191, 36, 0.7); }
	.er-published {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		color: rgba(96, 165, 250, 0.8);
	}

	/* ── Icon button ── */
	.er-icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.375rem;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid rgba(212, 199, 163, 0.1);
		color: rgba(212, 199, 163, 0.5);
		cursor: pointer;
		transition: all 0.15s;
	}
	.er-icon-btn:hover { border-color: rgba(96, 165, 250, 0.3); color: rgba(212, 199, 163, 0.8); }

	/* ── Buttons ── */
	.er-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		padding: 0.4375rem 0.875rem;
		border-radius: 0.375rem;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
		border: 1px solid;
	}
	.er-btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.er-btn.secondary {
		background: rgba(0, 0, 0, 0.2);
		border-color: rgba(212, 199, 163, 0.15);
		color: rgba(212, 199, 163, 0.7);
	}
	.er-btn.secondary:hover:not(:disabled) { background: rgba(212, 199, 163, 0.06); color: rgba(212, 199, 163, 0.9); }
	.er-btn.primary {
		background: rgba(96, 165, 250, 0.15);
		border-color: rgba(96, 165, 250, 0.4);
		color: rgba(96, 165, 250, 0.95);
	}
	.er-btn.primary:hover:not(:disabled) { background: rgba(96, 165, 250, 0.25); }

	/* ── Inline error ── */
	.er-inline-error {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1.5rem 0.75rem;
		font-size: 0.8rem;
		color: #f87171;
	}

	/* ── Editor ── */
	.er-editor-wrap {
		max-width: 60rem;
		margin: 0 auto;
		padding: 1.5rem;
	}
</style>
