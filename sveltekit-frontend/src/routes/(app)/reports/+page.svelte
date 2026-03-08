<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { reportStore } from '$lib/stores/unified/report-store.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	type ReportType = 'charging_memo' | 'intake_summary' | 'discovery_list' | 'hearing_prep' |
		'analysis' | 'summary' | 'timeline' | 'evidence_review' | 'legal_memo' | 'custom';

	let loading = $state(true);
	let error = $state<string | null>(null);

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

<div class="min-h-screen bg-background p-6">
	<!-- Header -->
	<div class="flex items-center justify-between mb-8">
		<div>
			<h1 class="text-3xl font-bold text-neutral-100">Reports</h1>
			<p class="text-sm text-neutral-400 mt-1">
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
	<div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
		<div class="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
			<div class="text-sm text-neutral-400">Total Reports</div>
			<div class="text-2xl font-bold text-neutral-100 mt-1">{reports.length}</div>
		</div>
		<div class="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
			<div class="text-sm text-neutral-400">Summaries</div>
			<div class="text-2xl font-bold text-neutral-100 mt-1">
				{reportsByType.get('summary')?.length || 0}
			</div>
		</div>
		<div class="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
			<div class="text-sm text-neutral-400">Legal Memos</div>
			<div class="text-2xl font-bold text-neutral-100 mt-1">
				{reportsByType.get('legal_memo')?.length || 0}
			</div>
		</div>
		<div class="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
			<div class="text-sm text-neutral-400">Evidence Reviews</div>
			<div class="text-2xl font-bold text-neutral-100 mt-1">
				{reportsByType.get('evidence_review')?.length || 0}
			</div>
		</div>
	</div>

	<!-- Reports List -->
	{#if loading || isLoading}
		<div class="flex items-center justify-center py-12">
			<Icon name="loader-2" class="w-6 h-6 animate-spin text-accent" />
			<span class="ml-2 text-neutral-400">Loading reports...</span>
		</div>
	{:else if error || storeError}
		<div class="rounded-lg border border-red-800/30 bg-red-950/40 p-4 text-red-300">
			<div class="flex items-center gap-2">
				<Icon name="alert-triangle" class="w-4 h-4" />
				<span>{error || storeError}</span>
			</div>
		</div>
	{:else if reports.length === 0}
		<div class="rounded-lg border border-neutral-800 bg-neutral-900/30 p-12 text-center">
			<Icon name="file-text" class="w-12 h-12 mx-auto text-neutral-600 mb-4" />
			<h3 class="text-lg font-semibold text-neutral-300 mb-2">No reports yet</h3>
			<p class="text-sm text-neutral-500 mb-4">
				Create your first report to get started
			</p>
			<Button onclick={() => goto('/reports/new')}>
				<Icon name="plus" class="w-4 h-4 mr-2" />
				Create Report
			</Button>
		</div>
	{:else}
		<div class="space-y-3">
			{#each reports as report}
				<div class="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 hover:bg-neutral-900/70 transition-colors">
					<div class="flex items-start justify-between">
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2 mb-2">
								<h3 class="text-base font-semibold text-neutral-100 truncate">
									{report.title}
								</h3>
								<span class="px-2 py-0.5 text-xs rounded bg-blue-900/30 text-blue-300 border border-blue-800/30 shrink-0">
									{getReportTypeLabel(report.type)}
								</span>
							</div>

							<div class="flex items-center gap-3 text-xs text-neutral-400">
								<span class="flex items-center gap-1">
									<Icon name="calendar" class="w-3 h-3" />
									{formatDate(report.createdAt)}
								</span>
								{#if report.updatedAt && new Date(report.updatedAt).getTime() !== new Date(report.createdAt).getTime()}
									<span class="flex items-center gap-1">
										<Icon name="clock" class="w-3 h-3" />
										Updated {formatDate(report.updatedAt)}
									</span>
								{/if}
								{#if report.isPublished}
									<span class="flex items-center gap-1 text-green-400">
										<Icon name="check-circle" class="w-3 h-3" />
										Published
									</span>
								{/if}
							</div>
						</div>

						<div class="flex items-center gap-2 ml-4">
							<Button
								variant="ghost"
								size="sm"
								onclick={() => goto(`/reports/${report.id}`)}
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
