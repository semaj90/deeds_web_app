<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import TiptapWithAIAssistant from '$lib/components/editor/TiptapWithAIAssistant.svelte';
	import Button from '$lib/components/ui/Button.svelte';
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

	onMount(async () => {
		await loadReport();
	});

	async function loadReport() {
		loading = true;
		error = null;

		try {
			const res = await fetch(`/api/reports?ids=${reportId}`, { credentials: 'include' });

			if (!res.ok) {
				throw new Error('Failed to load report');
			}

			const data = await res.json();
			const reports = data.data || [];
			const foundReport = reports.find((r: any) => r.id === reportId);

			if (!foundReport) {
				throw new Error('Report not found');
			}

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
				body: JSON.stringify({
					ids: [reportId],
					contentHtml: editorContent,
					title: report.title
				})
			});

			if (!res.ok) {
				throw new Error('Failed to save report');
			}

			lastSaved = new Date();
			isDirty = false;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save report';
			console.error('Save error:', err);
		} finally {
			isSaving = false;
		}
	}

	async function publishReport() {
		if (!confirm('Publish this report? It will be marked as final and shared.')) return;

		isPublishing = true;
		error = null;

		try {
			// First save current content
			await saveReport();

			// Then publish (you'll need to add this endpoint)
			const res = await fetch(`/api/reports/${reportId}/publish`, {
				method: 'POST',
				credentials: 'include'
			});

			if (!res.ok) {
				throw new Error('Failed to publish report');
			}

			report.status = 'published';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to publish report';
		} finally {
			isPublishing = false;
		}
	}

	function handleUpdate(content: string) {
		editorContent = content;
		isDirty = true;
	}

	function handleAutoSave(content: string) {
		editorContent = content;
		// Optionally implement debounced auto-save here
	}

	function formatTime(d: Date) {
		return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="min-h-screen bg-background">
	{#if loading}
		<div class="flex items-center justify-center h-screen">
			<Icon name="loader-2" class="w-8 h-8 animate-spin text-accent" />
			<span class="ml-3 text-neutral-400">Loading report...</span>
		</div>
	{:else if error && !report}
		<div class="flex flex-col items-center justify-center h-screen gap-4">
			<Icon name="alert-triangle" class="w-12 h-12 text-red-400" />
			<div class="text-neutral-300 text-center">
				<h2 class="text-xl font-semibold mb-2">Error Loading Report</h2>
				<p class="text-sm text-neutral-400">{error}</p>
			</div>
			<Button onclick={() => goto('/reports')}>
				<Icon name="arrow-left" class="w-4 h-4 mr-2" />
				Back to Reports
			</Button>
		</div>
	{:else if report}
		<!-- Header Bar -->
		<div class="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur">
			<div class="flex items-center justify-between px-6 py-3">
				<div class="flex items-center gap-4">
					<button
						onclick={() => goto('/reports')}
						class="flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-300 transition-colors"
					>
						<Icon name="arrow-left" class="w-4 h-4" />
						Back
					</button>

					<div class="h-6 w-px bg-neutral-800"></div>

					<div>
						<h1 class="text-lg font-semibold text-neutral-100">
							{report.title}
						</h1>
						<div class="flex items-center gap-2 text-xs text-neutral-400 mt-0.5">
							<span class="px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-300 border border-blue-800/30">
								{(report.type ?? report.metadata?.reportType ?? 'custom').replace('_', ' ')}
							</span>
							{#if lastSaved}
								<span class="flex items-center gap-1 text-green-400">
									<Icon name="check" class="w-3 h-3" />
									Saved {formatTime(lastSaved)}
								</span>
							{:else if isDirty}
								<span class="text-yellow-400">Unsaved changes</span>
							{/if}
							{#if report.status === 'published'}
								<span class="flex items-center gap-1 text-green-400">
									<Icon name="check-circle" class="w-3 h-3" />
									Published
								</span>
							{/if}
						</div>
					</div>
				</div>

				<div class="flex items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						onclick={() => goto(`/reports/${reportId}`)}
						title="Preview"
					>
						<Icon name="eye" class="w-4 h-4" />
					</Button>

					<Button
						variant="outline"
						size="sm"
						onclick={saveReport}
						disabled={isSaving || !isDirty}
						class="gap-2"
					>
						{#if isSaving}
							<Icon name="loader-2" class="w-4 h-4 animate-spin" />
							Saving...
						{:else}
							<Icon name="save" class="w-4 h-4" />
							Save
						{/if}
					</Button>

					{#if report.status !== 'published'}
						<Button
							size="sm"
							onclick={publishReport}
							disabled={isPublishing || isDirty}
							class="gap-2"
						>
							{#if isPublishing}
								<Icon name="loader-2" class="w-4 h-4 animate-spin" />
							{:else}
								<Icon name="upload" class="w-4 h-4" />
							{/if}
							Publish
						</Button>
					{/if}
				</div>
			</div>

			{#if error}
				<div class="px-6 pb-3">
					<div class="rounded-lg border border-red-800/30 bg-red-950/40 p-3 text-red-300 text-sm">
						<div class="flex items-center gap-2">
							<Icon name="alert-triangle" class="w-4 h-4" />
							<span>{error}</span>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Editor -->
		<div class="max-w-5xl mx-auto p-6">
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
