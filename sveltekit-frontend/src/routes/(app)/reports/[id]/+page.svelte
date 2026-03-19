<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	let reportId = $derived(page.params.id);

	let report = $state<any>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

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
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load report';
		} finally {
			loading = false;
		}
	}

	let showExportMenu = $state(false);

	async function exportReport(format: 'pdf' | 'html' | 'markdown' | 'json') {
		try {
			const res = await fetch(`/api/reports/${reportId}/export?format=${format}`);

			if (format === 'pdf' && res.status === 501) {
				// PDF not yet implemented - show HTML fallback
				const data = await res.json();
				if (confirm('PDF export requires additional setup. Download as HTML instead?')) {
					await exportReport('html');
				}
				return;
			}

			if (!res.ok) {
				throw new Error('Export failed');
			}

			// Download the file
			const blob = await res.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${report?.title || 'report'}.${format}`;
			a.click();
			window.URL.revokeObjectURL(url);

			showExportMenu = false;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Export failed';
			console.error('Export failed:', err);
		}
	}

	function formatDate(dateStr: string | Date): string {
		const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
		return d.toLocaleDateString('en-US', {
			month: 'long',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="report-view-page">
	{#if loading}
		<div class="flex items-center justify-center h-screen">
			<Icon name="loader-circle" class="w-8 h-8 animate-spin text-accent" />
			<span class="ml-3 text-neutral-400">Loading report...</span>
		</div>
	{:else if error}
		<div class="flex flex-col items-center justify-center h-screen gap-4">
			<Icon name="triangle-alert" class="w-12 h-12 text-red-400" />
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
			<div class="flex items-center justify-between px-6 py-4">
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
						<div class="flex items-center gap-2 mb-1">
							<h1 class="text-xl font-bold text-neutral-100">
								{report.title}
							</h1>
							{#if report.status === 'published'}
								<span class="px-2 py-0.5 text-xs rounded bg-green-900/30 text-green-300 border border-green-800/30">
									Published
								</span>
							{/if}
						</div>
						<div class="flex items-center gap-3 text-xs text-neutral-400">
							<span class="px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-300 border border-blue-800/30">
								{(report.type ?? report.metadata?.reportType ?? 'custom').replace('_', ' ')}
							</span>
							<span>Created {formatDate(report.createdAt)}</span>
							{#if report.updatedAt && new Date(report.updatedAt).getTime() !== new Date(report.createdAt).getTime()}
								<span>Updated {formatDate(report.updatedAt)}</span>
							{/if}
						</div>
					</div>
				</div>

				<div class="flex items-center gap-2">
					<div class="relative">
						<Button
							variant="outline"
							size="sm"
							onclick={() => showExportMenu = !showExportMenu}
							class="gap-2"
						>
							<Icon name="download" class="w-4 h-4" />
							Export
							<Icon name="chevron-down" class="w-3 h-3" />
						</Button>

						{#if showExportMenu}
							<div class="absolute right-0 top-full mt-1 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl z-10 min-w-[160px]">
								<button
									onclick={() => exportReport('html')}
									class="w-full text-left px-3 py-2 text-sm hover:bg-neutral-800 flex items-center gap-2 border-b border-neutral-800/50"
								>
									<Icon name="file-code" class="w-4 h-4" />
									HTML
								</button>
								<button
									onclick={() => exportReport('markdown')}
									class="w-full text-left px-3 py-2 text-sm hover:bg-neutral-800 flex items-center gap-2 border-b border-neutral-800/50"
								>
									<Icon name="file-text" class="w-4 h-4" />
									Markdown
								</button>
								<button
									onclick={() => exportReport('json')}
									class="w-full text-left px-3 py-2 text-sm hover:bg-neutral-800 flex items-center gap-2 border-b border-neutral-800/50"
								>
									<Icon name="braces" class="w-4 h-4" />
									JSON
								</button>
								<button
									onclick={() => exportReport('pdf')}
									class="w-full text-left px-3 py-2 text-sm hover:bg-neutral-800 flex items-center gap-2"
								>
									<Icon name="file" class="w-4 h-4" />
									PDF (Print)
								</button>
							</div>
						{/if}
					</div>

					<Button
						size="sm"
						onclick={() => goto(`/reports/${reportId}/edit`)}
						class="gap-2"
					>
						<Icon name="pencil" class="w-4 h-4" />
						Edit
					</Button>
				</div>
			</div>
		</div>

		<!-- Report Content -->
		<div class="max-w-4xl mx-auto p-8">
			<article class="prose prose-invert prose-lg max-w-none">
				{@html report.content || '<p class="text-neutral-500">No content yet.</p>'}
			</article>
		</div>
	{/if}
</div>

<style>
	.report-view-page {
		min-height: 100vh;
		background: #0e0d0b;
		color: #d4c7a3;
		margin: -2.5rem;
		padding: 0 2.5rem;
	}
	.report-view-page :global(h1), .report-view-page :global(h2), .report-view-page :global(h3), .report-view-page :global(h4), .report-view-page :global(p) { color: inherit; text-transform: none; letter-spacing: normal; }
	.report-view-page :global(a) { color: inherit; border-bottom: none; }
	.report-view-page :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.report-view-page :global(input), .report-view-page :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.report-view-page :global(.panel), .report-view-page :global(.card), .report-view-page :global([class*="panel"]) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

	:global(.prose) {
		color: #e5e7eb;
	}
	:global(.prose h1) {
		color: #f9fafb;
		font-weight: 700;
		margin-top: 2em;
		margin-bottom: 1em;
	}
	:global(.prose h2) {
		color: #f3f4f6;
		font-weight: 600;
		margin-top: 1.5em;
		margin-bottom: 0.75em;
	}
	:global(.prose h3) {
		color: #e5e7eb;
		margin-top: 1.25em;
		margin-bottom: 0.5em;
	}
	:global(.prose p) {
		margin-top: 1em;
		margin-bottom: 1em;
		line-height: 1.75;
	}
	:global(.prose ul, .prose ol) {
		margin-top: 1em;
		margin-bottom: 1em;
	}
	:global(.prose li) {
		margin-top: 0.5em;
		margin-bottom: 0.5em;
	}
	:global(.prose strong) {
		color: #f9fafb;
		font-weight: 600;
	}
	:global(.prose em) {
		font-style: italic;
	}
	:global(.prose a) {
		color: #60a5fa;
		text-decoration: underline;
	}
	:global(.prose a:hover) {
		color: #93c5fd;
	}
</style>
