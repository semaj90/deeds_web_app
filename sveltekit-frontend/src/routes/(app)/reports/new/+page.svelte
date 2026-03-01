<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	// Get caseId from query params if provided
	let caseId = $derived(page.url.searchParams.get('caseId'));

	let selectedType = $state('charging_memo');
	let title = $state('');
	let isCreating = $state(false);
	let error = $state<string | null>(null);

	const reportTypes = [
		{
			value: 'charging_memo',
			label: 'Charging Memorandum',
			description: 'Formal recommendation for charges with legal analysis',
			icon: 'scale'
		},
		{
			value: 'intake_summary',
			label: 'Intake Summary',
			description: 'Initial case assessment and preliminary findings',
			icon: 'file-text'
		},
		{
			value: 'discovery_list',
			label: 'Discovery List',
			description: 'Comprehensive inventory of evidence and materials',
			icon: 'list'
		},
		{
			value: 'hearing_prep',
			label: 'Hearing Preparation',
			description: 'Arguments, exhibits, and witness examination notes',
			icon: 'presentation'
		},
		{
			value: 'legal_memo',
			label: 'Legal Memorandum',
			description: 'Research memo on legal issues and precedents',
			icon: 'book-open'
		},
		{
			value: 'summary',
			label: 'Case Summary',
			description: 'General case overview and status report',
			icon: 'file'
		},
		{
			value: 'analysis',
			label: 'Analysis Report',
			description: 'Detailed analytical assessment',
			icon: 'bar-chart'
		},
		{
			value: 'timeline',
			label: 'Timeline Report',
			description: 'Chronological sequence of events',
			icon: 'calendar'
		},
		{
			value: 'evidence_review',
			label: 'Evidence Review',
			description: 'Systematic review of evidence items',
			icon: 'folder-open'
		},
		{
			value: 'custom',
			label: 'Custom Report',
			description: 'Blank template for custom content',
			icon: 'edit'
		}
	];

	async function createReport() {
		if (!title.trim()) {
			error = 'Please enter a report title';
			return;
		}

		if (!caseId) {
			error = 'Case ID is required. Please create report from a case page.';
			return;
		}

		isCreating = true;
		error = null;

		try {
			const res = await fetch('/api/reports', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					caseId,
					title: title.trim(),
					type: selectedType,
					contentHtml: '<p>Start writing your report...</p>',
					contentJson: null
				})
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to create report');
			}

			const data = await res.json();
			const reportId = data.data?.id;

			if (reportId) {
				goto(`/reports/${reportId}/edit`);
			} else {
				throw new Error('No report ID returned');
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create report';
		} finally {
			isCreating = false;
		}
	}
</script>

<div class="min-h-screen bg-background p-6">
	<!-- Header -->
	<div class="mb-8">
		<button
			onclick={() => goto('/reports')}
			class="flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-300 mb-4 transition-colors"
		>
			<Icon name="arrow-left" class="w-4 h-4" />
			Back to Reports
		</button>
		<h1 class="text-3xl font-bold text-neutral-100">Create New Report</h1>
		<p class="text-sm text-neutral-400 mt-1">
			Select a report type and start writing
		</p>
	</div>

	<!-- Error Message -->
	{#if error}
		<div class="rounded-lg border border-red-800/30 bg-red-950/40 p-4 text-red-300 mb-6">
			<div class="flex items-center gap-2">
				<Icon name="alert-triangle" class="w-4 h-4" />
				<span>{error}</span>
			</div>
		</div>
	{/if}

	<!-- Form -->
	<div class="max-w-3xl">
		<!-- Title Input -->
		<div class="mb-6">
			<label for="title" class="block text-sm font-semibold text-neutral-300 mb-2">
				Report Title
			</label>
			<input
				id="title"
				type="text"
				bind:value={title}
				placeholder="Enter report title..."
				class="w-full px-4 py-2 rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-accent"
			/>
		</div>

		<!-- Report Type Selection -->
		<div class="mb-8">
			<h2 class="text-sm font-semibold text-neutral-300 mb-4">Report Type</h2>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
				{#each reportTypes as type}
					<button
						onclick={() => selectedType = type.value}
						class="text-left p-4 rounded-lg border transition-all {selectedType === type.value
							? 'border-accent bg-accent/10'
							: 'border-neutral-800 bg-neutral-900/50 hover:bg-neutral-900/70'}"
					>
						<div class="flex items-start gap-3">
							<Icon name={type.icon} class="w-5 h-5 mt-0.5 shrink-0 {selectedType === type.value ? 'text-accent' : 'text-neutral-400'}" />
							<div class="flex-1 min-w-0">
								<div class="font-semibold text-neutral-100 mb-1">
									{type.label}
								</div>
								<div class="text-xs text-neutral-400">
									{type.description}
								</div>
							</div>
							{#if selectedType === type.value}
								<Icon name="check-circle" class="w-5 h-5 text-accent shrink-0" />
							{/if}
						</div>
					</button>
				{/each}
			</div>
		</div>

		<!-- Actions -->
		<div class="flex items-center gap-3">
			<Button
				onclick={createReport}
				disabled={isCreating || !title.trim() || !caseId}
				class="gap-2"
			>
				{#if isCreating}
					<Icon name="loader-2" class="w-4 h-4 animate-spin" />
					Creating...
				{:else}
					<Icon name="file-plus" class="w-4 h-4" />
					Create Report
				{/if}
			</Button>
			<Button
				variant="outline"
				onclick={() => goto('/reports')}
			>
				Cancel
			</Button>
		</div>

		{#if !caseId}
			<div class="mt-4 p-3 rounded-lg border border-yellow-800/30 bg-yellow-950/30 text-yellow-300 text-sm">
				<div class="flex items-start gap-2">
					<Icon name="info" class="w-4 h-4 mt-0.5 shrink-0" />
					<div>
						<strong>Note:</strong> Reports must be linked to a case. Please create a report from a case page
						(e.g., <code class="px-1 py-0.5 rounded bg-black/30">/cases/[id]/overview</code>).
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
