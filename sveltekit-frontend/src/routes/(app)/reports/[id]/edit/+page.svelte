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

<div class="min-h-screen bg-neutral-100 text-neutral-900">
	{#if loading}
		<div class="flex items-center justify-center h-screen">
			<Icon name="loader-circle" class="h-8 w-8 animate-spin text-neutral-700" />
			<span class="ml-3 text-neutral-600">Loading report...</span>
		</div>
	{:else if error && !report}
		<div class="flex flex-col items-center justify-center h-screen gap-4">
			<Icon name="triangle-alert" class="h-12 w-12 text-neutral-600" />
			<div class="text-center text-neutral-800">
				<h2 class="text-xl font-semibold mb-2">Error Loading Report</h2>
				<p class="text-sm text-neutral-600">{error}</p>
			</div>
			<button
				onclick={() => goto('/reports')}
				class="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 transition hover:border-neutral-400 hover:bg-neutral-50"
			>
				<Icon name="arrow-left" class="w-4 h-4 mr-2" />
				Back to Reports
			</button>
		</div>
	{:else if report}
		<!-- Header Bar -->
		<div class="sticky top-0 z-10 border-b border-neutral-300 bg-white/95 backdrop-blur">
			<div class="flex items-center justify-between px-6 py-3">
				<div class="flex items-center gap-4">
					<button
						onclick={() => goto('/reports')}
						class="flex items-center gap-1 text-sm text-neutral-600 transition-colors hover:text-neutral-900"
					>
						<Icon name="arrow-left" class="w-4 h-4" />
						Back
					</button>

					<div class="h-6 w-px bg-neutral-300"></div>

					<div>
						<h1 class="text-lg font-semibold text-neutral-950">
							{report.title}
						</h1>
						<div class="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
							<span class="rounded border border-neutral-900 bg-neutral-900 px-1.5 py-0.5 text-white">
								{(report.type ?? report.metadata?.reportType ?? 'custom').replace('_', ' ')}
							</span>
							{#if lastSaved}
								<span class="flex items-center gap-1 text-neutral-700">
									<Icon name="check" class="w-3 h-3" />
									Saved {formatTime(lastSaved)}
								</span>
							{:else if isDirty}
								<span class="text-neutral-700">Unsaved changes</span>
							{/if}
							{#if report.status === 'published'}
								<span class="flex items-center gap-1 text-neutral-800">
									<Icon name="circle-check" class="w-3 h-3" />
									Published
								</span>
							{/if}
						</div>
					</div>
				</div>

				<div class="flex items-center gap-2">
					<button
						onclick={() => goto(`/reports/${reportId}`)}
						title="Preview"
						class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 transition hover:border-neutral-400 hover:bg-neutral-50 hover:text-neutral-900"
					>
						<Icon name="eye" class="w-4 h-4" />
					</button>

					<button
						onclick={saveReport}
						disabled={isSaving || !isDirty}
						class="inline-flex items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 transition hover:border-neutral-400 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if isSaving}
							<Icon name="loader-circle" class="w-4 h-4 animate-spin" />
							Saving...
						{:else}
							<Icon name="save" class="w-4 h-4" />
							Save
						{/if}
					</button>

					{#if report.status !== 'published'}
						<button
							onclick={publishReport}
							disabled={isPublishing || isDirty}
							class="inline-flex items-center justify-center gap-2 rounded-md border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
						>
							{#if isPublishing}
								<Icon name="loader-circle" class="w-4 h-4 animate-spin" />
							{:else}
								<Icon name="upload" class="w-4 h-4" />
							{/if}
							Publish
						</button>
					{/if}
				</div>
			</div>

			{#if error}
				<div class="px-6 pb-3">
					<div class="rounded-lg border border-neutral-300 bg-white p-3 text-sm text-neutral-800 shadow-sm">
						<div class="flex items-center gap-2">
							<Icon name="triangle-alert" class="w-4 h-4" />
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
