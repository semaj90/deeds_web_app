<script lang="ts">
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { enhance } from '$app/forms';

	let { data } = $props();

	let reports = $derived(data.reports ?? []);
	let selectedReport = $state<(typeof reports)[0] | null>(null);
	let showDeleteConfirm = $state(false);
	let deleteReportId = $state<string | null>(null);
	let deleting = $state(false);

	function selectReport(report: (typeof reports)[0]) {
		selectedReport = report;
		showDeleteConfirm = false;
	}

	function confirmDelete(reportId: string) {
		deleteReportId = reportId;
		showDeleteConfirm = true;
	}

	function cancelDelete() {
		showDeleteConfirm = false;
		deleteReportId = null;
	}

	function formatDate(dateStr: string | Date): string {
		const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
		return d.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function truncateQuery(query: string, maxLength = 60): string {
		return query.length > maxLength ? query.slice(0, maxLength) + '...' : query;
	}

	async function downloadMarkdown() {
		if (!selectedReport) return;

		const markdown = selectedReport.markdownContent || '';
		const blob = new Blob([markdown], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `deep-research-${selectedReport.id.slice(0, 8)}.md`;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function downloadJSON() {
		if (!selectedReport) return;

		const data = {
			id: selectedReport.id,
			query: selectedReport.query,
			reportType: selectedReport.reportType,
			modelUsed: selectedReport.modelUsed,
			content: selectedReport.markdownContent,
			citations: selectedReport.citations,
			recommendations: selectedReport.recommendations,
			metadata: selectedReport.metadata,
			createdAt: selectedReport.createdAt,
			updatedAt: selectedReport.updatedAt
		};

		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `deep-research-${selectedReport.id.slice(0, 8)}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="deep-research-page">
	<div class="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur">
		<div class="flex items-center justify-between px-6 py-4">
			<div>
				<h1 class="text-2xl font-bold text-neutral-100">Deep Research</h1>
				<p class="text-sm text-neutral-400 mt-1">Saved research reports from Gemma4</p>
			</div>
			<Button
				onclick={() => goto('/command-center')}
				class="gap-2"
			>
				<Icon name="plus" class="w-4 h-4" />
				New Research
			</Button>
		</div>
	</div>

	<div class="flex h-[calc(100vh-120px)]">
		<!-- Reports List -->
		<div class="w-80 border-r border-neutral-800 overflow-y-auto bg-neutral-900/50">
			{#if reports.length === 0}
				<div class="p-6 text-center">
					<Icon name="file-question" class="w-12 h-12 mx-auto text-neutral-500 mb-3" />
					<p class="text-neutral-400">No research reports yet</p>
					<p class="text-xs text-neutral-500 mt-2">Run a deep research query to create one</p>
				</div>
			{:else}
				<div class="divide-y divide-neutral-800">
					{#each reports as report (report.id)}
						<button
							onclick={() => selectReport(report)}
							class="w-full text-left px-4 py-3 hover:bg-neutral-800/50 transition-colors {selectedReport?.id === report.id ? 'bg-neutral-800 border-l-2 border-accent' : 'border-l-2 border-transparent'}"
						>
							<div class="text-sm font-medium text-neutral-100 truncate">
								{truncateQuery(report.query)}
							</div>
							<div class="text-xs text-neutral-500 mt-1">
								{formatDate(report.createdAt)}
							</div>
							<div class="text-xs text-neutral-400 mt-1">
								{report.reportType} • {report.modelUsed}
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Report View -->
		<div class="flex-1 overflow-y-auto">
			{#if !selectedReport}
				<div class="h-full flex items-center justify-center">
					<div class="text-center">
						<Icon name="file-text" class="w-16 h-16 mx-auto text-neutral-600 mb-4" />
						<p class="text-neutral-400">Select a report to view details</p>
					</div>
				</div>
			{:else}
				<!-- Header Bar -->
				<div class="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur px-8 py-4">
					<div class="flex items-center justify-between">
						<div>
							<h2 class="text-xl font-bold text-neutral-100">Research Report</h2>
							<div class="flex items-center gap-2 mt-2 flex-wrap">
								<span class="text-xs px-2 py-1 rounded bg-blue-900/30 text-blue-300 border border-blue-800/30">
									{selectedReport.reportType}
								</span>
								<span class="text-xs px-2 py-1 rounded bg-neutral-700/50 text-neutral-300 border border-neutral-600/30">
									{selectedReport.modelUsed}
								</span>
								<span class="text-xs text-neutral-400">
									{formatDate(selectedReport.createdAt)}
								</span>
							</div>
						</div>

						<div class="flex items-center gap-2">
							<div class="relative group">
								<Button
									variant="outline"
									size="sm"
									class="gap-2"
								>
									<Icon name="download" class="w-4 h-4" />
									Export
									<Icon name="chevron-down" class="w-3 h-3" />
								</Button>

								<div class="absolute right-0 top-full mt-1 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl z-10 min-w-[160px] hidden group-hover:block">
									<button
										onclick={downloadMarkdown}
										class="w-full text-left px-3 py-2 text-sm hover:bg-neutral-800 flex items-center gap-2 border-b border-neutral-800/50"
									>
										<Icon name="file-text" class="w-4 h-4" />
										Markdown
									</button>
									<button
										onclick={downloadJSON}
										class="w-full text-left px-3 py-2 text-sm hover:bg-neutral-800 flex items-center gap-2"
									>
										<Icon name="braces" class="w-4 h-4" />
										JSON
									</button>
								</div>
							</div>

							<Button
								variant="danger"
								size="sm"
								onclick={() => confirmDelete(selectedReport.id)}
								class="gap-2"
							>
								<Icon name="trash-2" class="w-4 h-4" />
								Delete
							</Button>
						</div>
					</div>
				</div>

				<!-- Content -->
				<div class="max-w-4xl mx-auto p-8">
					<!-- Query -->
					<div class="mb-8 p-4 bg-neutral-800/30 rounded border border-neutral-700/50">
						<h3 class="text-sm font-semibold text-neutral-300 mb-2">Query</h3>
						<p class="text-neutral-100">{selectedReport.query}</p>
					</div>

					<!-- Main Content -->
					<article class="prose prose-invert prose-lg max-w-none mb-8">
						{@html selectedReport.markdownContent || '<p class="text-neutral-400">No content</p>'}
					</article>

					<!-- Citations -->
					{#if selectedReport.citations}
						<div class="mt-8 pt-8 border-t border-neutral-800">
							<h3 class="text-lg font-semibold text-neutral-200 mb-4">Citations</h3>
							<div class="space-y-2">
								{#if Array.isArray(selectedReport.citations)}
									{#each selectedReport.citations as citation}
										<div class="p-3 bg-neutral-800/20 rounded text-sm text-neutral-300">
											{citation.text || citation}
										</div>
									{/each}
								{:else if typeof selectedReport.citations === 'object'}
									<pre class="bg-neutral-900 p-3 rounded text-xs overflow-auto">{JSON.stringify(selectedReport.citations, null, 2)}</pre>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Recommendations -->
					{#if selectedReport.recommendations}
						<div class="mt-8 pt-8 border-t border-neutral-800">
							<h3 class="text-lg font-semibold text-neutral-200 mb-4">Recommendations</h3>
							<div class="space-y-2">
								{#if Array.isArray(selectedReport.recommendations)}
									{#each selectedReport.recommendations as rec}
										<div class="p-3 bg-green-900/20 rounded text-sm text-green-300">
											{rec.text || rec}
										</div>
									{/each}
								{:else if typeof selectedReport.recommendations === 'object'}
									<pre class="bg-neutral-900 p-3 rounded text-xs overflow-auto">{JSON.stringify(selectedReport.recommendations, null, 2)}</pre>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Metadata -->
					{#if selectedReport.metadata}
						<div class="mt-8 pt-8 border-t border-neutral-800">
							<h3 class="text-sm font-semibold text-neutral-400 mb-3">Metadata</h3>
							<div class="grid grid-cols-2 gap-3 text-xs">
								{#each Object.entries(selectedReport.metadata) as [key, value]}
									<div class="bg-neutral-800/20 p-2 rounded">
										<span class="text-neutral-400">{key}:</span>
										<span class="text-neutral-200 ml-1">{typeof value === 'string' ? value : JSON.stringify(value)}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>

				<!-- Delete Confirmation Modal -->
				{#if showDeleteConfirm && deleteReportId === selectedReport.id}
					<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
						<div class="bg-neutral-900 border border-neutral-800 rounded-lg p-6 max-w-sm">
							<h3 class="text-lg font-semibold text-neutral-100 mb-2">Delete Report?</h3>
							<p class="text-sm text-neutral-400 mb-6">
								This will permanently delete this research report. This action cannot be undone.
							</p>
							<div class="flex gap-3 justify-end">
								<Button
									variant="outline"
									size="sm"
									onclick={cancelDelete}
								>
									Cancel
								</Button>
								<form
									method="POST"
									action="?/delete"
									use:enhance={() => {
										deleting = true;
										return async ({ update }) => {
											deleting = false;
											showDeleteConfirm = false;
											selectedReport = null;
											await update();
										};
									}}
									class="contents"
								>
									<input type="hidden" name="reportId" value={selectedReport.id} />
									<Button
										variant="danger"
										size="sm"
										disabled={deleting}
										type="submit"
									>
										{deleting ? 'Deleting...' : 'Delete'}
									</Button>
								</form>
							</div>
						</div>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	.deep-research-page {
		min-height: 100vh;
		background: #0e0d0b;
		color: #d4c7a3;
	}

	:global(.prose) {
		color: #e5e7eb;
	}

	:global(.prose h1) {
		color: #f9fafb;
		font-weight: 700;
		margin-top: 1em;
		margin-bottom: 0.5em;
	}

	:global(.prose h2) {
		color: #f3f4f6;
		font-weight: 600;
		margin-top: 0.75em;
		margin-bottom: 0.5em;
	}

	:global(.prose h3) {
		color: #e5e7eb;
		margin-top: 0.5em;
		margin-bottom: 0.25em;
	}

	:global(.prose p) {
		margin-top: 0.75em;
		margin-bottom: 0.75em;
		line-height: 1.6;
	}

	:global(.prose ul, .prose ol) {
		margin-top: 0.75em;
		margin-bottom: 0.75em;
	}

	:global(.prose li) {
		margin-top: 0.25em;
		margin-bottom: 0.25em;
	}

	:global(.prose strong) {
		color: #f9fafb;
		font-weight: 600;
	}

	:global(.prose a) {
		color: #60a5fa;
		text-decoration: underline;
	}

	:global(.prose a:hover) {
		color: #93c5fd;
	}

	:global(.prose code) {
		background: #1f2937;
		padding: 0.15em 0.4em;
		border-radius: 3px;
		font-size: 0.9em;
		color: #f0f0f0;
	}

	:global(.prose pre) {
		background: #1f2937;
		padding: 1em;
		border-radius: 6px;
		overflow-x: auto;
	}

	:global(.prose pre code) {
		background: none;
		padding: 0;
		color: #d1d5db;
	}
</style>
