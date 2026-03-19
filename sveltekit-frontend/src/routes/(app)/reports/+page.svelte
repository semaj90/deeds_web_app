<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { reportStore } from '$lib/stores/unified/report-store.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import ReportViewModal from '$lib/components/reports/ReportViewModal.svelte';

	type ReportType = 'charging_memo' | 'intake_summary' | 'discovery_list' | 'hearing_prep' |
		'analysis' | 'summary' | 'timeline' | 'evidence_review' | 'legal_memo' | 'custom';

	let loading = $state(true);
	let error = $state<string | null>(null);

	// Quick-view modal
	let viewReport = $state<any>(null);
	let showViewModal = $state(false);

	// Reactive state from store
	let reports = $derived(reportStore.reports);
	let reportsByType = $derived(reportStore.reportsByType);
	let isLoading = $derived(reportStore.isLoading);
	let storeError = $derived(reportStore.error);

	onMount(async () => {
		await loadReports();
	});

	async function loadReports() {
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/reports', { credentials: 'include' });
			if (res.ok) {
				const data = await res.json();
				reportStore.reports = data.data || [];
				reportStore.totalReports = reportStore.reports.length;
			} else {
				throw new Error('Failed to load reports');
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load reports';
		} finally {
			loading = false;
		}
	}

	async function deleteReport(reportId: string) {
		if (!confirm('Delete this report? This cannot be undone.')) return;

		try {
			await reportStore.deleteReport(reportId);
			await loadReports();
		} catch (err) {
			console.error('Delete failed:', err);
		}
	}

	function getReportTypeLabel(type: string): string {
		const labels: Record<string, string> = {
			charging_memo: 'Charging Memo',
			intake_summary: 'Intake Summary',
			discovery_list: 'Discovery List',
			hearing_prep: 'Hearing Prep',
			analysis: 'Analysis',
			summary: 'Summary',
			timeline: 'Timeline',
			evidence_review: 'Evidence Review',
			legal_memo: 'Legal Memo',
			custom: 'Custom'
		};
		return labels[type] || type;
	}

	function formatDate(dateStr: string | Date | number): string {
		const d = typeof dateStr === 'string' || typeof dateStr === 'number' ? new Date(dateStr) : dateStr;
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}
</script>

<div class="reports-page">
	<!-- Header -->
	<div class="reports-header">
		<div>
			<h1 class="reports-title">Reports</h1>
			<p class="reports-subtitle">
				Legal document generation and case reports
			</p>
		</div>
		<Button
			onclick={() => goto('/reports/new')}
			class="gap-2"
		>
			<Icon name="plus" class="w-4 h-4" />
			New Report
		</Button>
	</div>

	<!-- Stats -->
	<div class="stats-grid">
		<div class="stat-card">
			<div class="stat-icon" style="background: rgba(99,102,241,0.12); color: #818cf8;">
				<Icon name="file-stack" />
			</div>
			<div class="stat-info">
				<div class="stat-value">{reports.length}</div>
				<div class="stat-label">Total Reports</div>
			</div>
		</div>
		<div class="stat-card">
			<div class="stat-icon" style="background: rgba(59,130,246,0.12); color: #60a5fa;">
				<Icon name="file-text" />
			</div>
			<div class="stat-info">
				<div class="stat-value">{reportsByType.get('summary')?.length || 0}</div>
				<div class="stat-label">Summaries</div>
			</div>
		</div>
		<div class="stat-card">
			<div class="stat-icon" style="background: rgba(168,85,247,0.12); color: #a78bfa;">
				<Icon name="scale" />
			</div>
			<div class="stat-info">
				<div class="stat-value">{reportsByType.get('legal_memo')?.length || 0}</div>
				<div class="stat-label">Legal Memos</div>
			</div>
		</div>
		<div class="stat-card">
			<div class="stat-icon" style="background: rgba(16,185,129,0.12); color: #34d399;">
				<Icon name="search" />
			</div>
			<div class="stat-info">
				<div class="stat-value">{reportsByType.get('evidence_review')?.length || 0}</div>
				<div class="stat-label">Evidence Reviews</div>
			</div>
		</div>
	</div>

	<!-- Reports List -->
	{#if loading || isLoading}
		<div class="loading-state">
			<Icon name="loader-circle" class="w-6 h-6 animate-spin text-accent" />
			<span class="loading-text">Loading reports...</span>
		</div>
	{:else if error || storeError}
		<div class="error-state">
			<div class="error-content">
				<Icon name="triangle-alert" class="w-4 h-4" />
				<span>{error || storeError}</span>
			</div>
		</div>
	{:else if reports.length === 0}
		<div class="empty-state">
			<Icon name="file-text" class="empty-icon" />
			<h3 class="empty-title">No reports yet</h3>
			<p class="empty-desc">
				Create your first report to get started
			</p>
			<Button onclick={() => goto('/reports/new')}>
				<Icon name="plus" class="w-4 h-4 mr-2" />
				Create Report
			</Button>
		</div>
	{:else}
		<div class="report-list">
			{#each reports as report}
				<div class="report-card">
					<div class="report-row">
						<div class="report-info">
							<div class="report-title-row">
								<h3 class="report-name">
									{report.title}
								</h3>
								<span class="report-type-badge">
									{getReportTypeLabel(report.type ?? String(report.metadata?.reportType ?? 'custom'))}
								</span>
							</div>

							<div class="report-meta">
								<span class="meta-item">
									<Icon name="calendar" class="w-3 h-3" />
									{formatDate(report.createdAt)}
								</span>
								{#if report.updatedAt && new Date(report.updatedAt).getTime() !== new Date(report.createdAt).getTime()}
									<span class="meta-item">
										<Icon name="clock" class="w-3 h-3" />
										Updated {formatDate(report.updatedAt)}
									</span>
								{/if}
								{#if report.status === 'published'}
									<span class="meta-item published">
										<Icon name="circle-check" class="w-3 h-3" />
										Published
									</span>
								{/if}
							</div>
						</div>

						<div class="report-actions">
							<Button
								variant="ghost"
								size="sm"
								onclick={() => { viewReport = report; showViewModal = true; }}
								title="View report"
							>
								<Icon name="eye" class="w-4 h-4" />
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onclick={() => goto(`/reports/${report.id}/edit`)}
								title="Edit report"
							>
								<Icon name="pencil" class="w-4 h-4" />
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onclick={() => deleteReport(report.id)}
								title="Delete report"
								class="text-red-400 hover:text-red-300 hover:bg-red-950/30"
							>
								<Icon name="trash-2" class="w-4 h-4" />
							</Button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<ReportViewModal
	bind:open={showViewModal}
	report={viewReport}
	onClose={() => { showViewModal = false; viewReport = null; }}
	onEdit={(id) => goto(`/reports/${id}/edit`)}
/>

<style>
	/* Page container */
	.reports-page {
		min-height: 100vh;
		background: #0e0d0b;
		margin: -2.5rem;
		padding: 1.5rem 2.5rem;
	}
	.reports-page :global(h1), .reports-page :global(h2), .reports-page :global(h3), .reports-page :global(h4), .reports-page :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.reports-page :global(a) { color: inherit; border-bottom: none; }
	.reports-page :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.reports-page :global(input), .reports-page :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.reports-page :global(.panel), .reports-page :global(.card), .reports-page :global([class*="panel"]) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

	/* Header */
	.reports-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 2rem;
	}

	.reports-title {
		font-size: 1.875rem;
		line-height: 2.25rem;
		font-weight: 700;
		color: rgb(245 245 245);
	}

	.reports-subtitle {
		font-size: 0.875rem;
		color: rgb(163 163 163);
		margin-top: 0.25rem;
	}

	/* Stats grid */
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	@media (max-width: 768px) {
		.stats-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.stat-card {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		border-radius: 10px;
		border: 1px solid rgb(38 38 38);
		background: rgb(23 23 23 / 0.5);
		padding: 1rem 1.125rem;
		transition: border-color 0.2s, box-shadow 0.2s;
	}

	.stat-card:hover {
		border-color: rgb(63 63 70);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
	}

	.stat-icon {
		width: 40px;
		height: 40px;
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.stat-info {
		display: flex;
		flex-direction: column;
	}

	.stat-label {
		font-size: 0.75rem;
		color: rgb(163 163 163);
		line-height: 1.3;
	}

	.stat-value {
		font-size: 1.375rem;
		line-height: 1.3;
		font-weight: 700;
		color: rgb(245 245 245);
	}

	/* Loading state */
	.loading-state {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 3rem 0;
	}

	.loading-text {
		margin-left: 0.5rem;
		color: rgb(163 163 163);
	}

	/* Error state */
	.error-state {
		border-radius: 0.5rem;
		border: 1px solid rgb(127 29 29 / 0.3);
		background: rgb(69 10 10 / 0.4);
		padding: 1rem;
		color: rgb(252 165 165);
	}

	.error-content {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* Empty state */
	.empty-state {
		border-radius: 0.5rem;
		border: 1px solid rgb(38 38 38);
		background: rgb(23 23 23 / 0.3);
		padding: 3rem;
		text-align: center;
	}

	.empty-icon {
		width: 3rem;
		height: 3rem;
		margin: 0 auto;
		color: rgb(82 82 82);
		margin-bottom: 1rem;
	}

	.empty-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: rgb(212 212 212);
		margin-bottom: 0.5rem;
	}

	.empty-desc {
		font-size: 0.875rem;
		color: rgb(115 115 115);
		margin-bottom: 1rem;
	}

	/* Report list */
	.report-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.report-card {
		border-radius: 10px;
		border: 1px solid rgb(38 38 38);
		border-left: 3px solid rgb(99 102 241);
		background: rgb(23 23 23 / 0.5);
		padding: 1rem 1.25rem;
		transition: background-color 150ms ease, border-color 150ms ease, transform 150ms ease;
	}

	.report-card:hover {
		background: rgb(23 23 23 / 0.8);
		border-left-color: rgb(129 140 248);
		transform: translateX(2px);
	}

	.report-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
	}

	.report-info {
		flex: 1;
		min-width: 0;
	}

	.report-title-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.report-name {
		font-size: 1rem;
		font-weight: 600;
		color: rgb(245 245 245);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.report-type-badge {
		display: inline-flex;
		padding: 0.2rem 0.625rem;
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		border-radius: 6px;
		background: rgb(30 58 138 / 0.3);
		color: rgb(147 197 253);
		border: 1px solid rgb(30 64 175 / 0.3);
		flex-shrink: 0;
		text-transform: uppercase;
	}

	.report-meta {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.75rem;
		color: rgb(163 163 163);
	}

	.report-meta .meta-item {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.report-meta .meta-item.published {
		color: rgb(74 222 128);
	}

	.report-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: 1rem;
	}
</style>
