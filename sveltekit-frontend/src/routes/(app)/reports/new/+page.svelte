<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { getTemplate, getTemplateTypes } from '$lib/data/report-templates';

	// Get caseId from query params if provided
	let caseId = $derived(page.url.searchParams.get('caseId'));

	let selectedType = $state('charging_memo');
	let title = $state('');
	let useAI = $state(true);
	let useTemplate = $state(true);
	let isCreating = $state(false);
	let error = $state<string | null>(null);

	// Get selected template details
	let selectedTemplate = $derived(getTemplate(selectedType));

	// Get report types from template system
	const reportTypes = getTemplateTypes();

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
			let reportId;

			if (useTemplate) {
				// Use template generation endpoint
				const res = await fetch('/api/reports/generate-from-template', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify({
						templateType: selectedType,
						caseId,
						customTitle: title.trim(),
						useAI
					})
				});

				if (!res.ok) {
					const data = await res.json();
					throw new Error(data.message || 'Failed to generate report');
				}

				const data = await res.json();
				reportId = data.data?.id;
			} else {
				// Create blank report
				const res = await fetch('/api/reports', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify({
						caseId,
						title: title.trim(),
						contentHtml: '<p>Start writing your report...</p>',
						status: 'draft',
						metadata: { reportType: selectedType }
					})
				});

				if (!res.ok) {
					const data = await res.json();
					throw new Error(data.message || 'Failed to create report');
				}

				const data = await res.json();
				reportId = data.data?.id;
			}

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

		<!-- Template Options -->
		{#if selectedTemplate}
			<div class="mb-6 p-4 rounded-lg border border-neutral-800 bg-neutral-900/50">
				<h3 class="text-sm font-semibold text-neutral-300 mb-3">Generation Options</h3>

				<!-- Use Template Toggle -->
				<label class="flex items-center gap-3 mb-3 cursor-pointer">
					<input
						type="checkbox"
						bind:checked={useTemplate}
						class="w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-accent focus:ring-2 focus:ring-accent focus:ring-offset-0"
					/>
					<div class="flex-1">
						<div class="text-sm text-neutral-200">Use {selectedTemplate.name} template</div>
						<div class="text-xs text-neutral-500">Pre-fill report with structured template ({selectedTemplate.estimatedTime})</div>
					</div>
				</label>

				<!-- AI Enhancement Toggle -->
				{#if useTemplate}
					<label class="flex items-center gap-3 cursor-pointer">
						<input
							type="checkbox"
							bind:checked={useAI}
							class="w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-accent focus:ring-2 focus:ring-accent focus:ring-offset-0"
						/>
						<div class="flex-1">
							<div class="text-sm text-neutral-200 flex items-center gap-2">
								<span>AI-powered content generation</span>
								<span class="px-2 py-0.5 text-xs rounded-full bg-accent/20 text-accent">Beta</span>
							</div>
							<div class="text-xs text-neutral-500">Generate case-specific content using AI (requires Ollama)</div>
						</div>
					</label>

					{#if useAI}
						<div class="mt-3 p-3 rounded bg-neutral-800/50 text-xs text-neutral-400">
							<Icon name="sparkles" class="w-3 h-3 inline-block mr-1" />
							AI will analyze your case evidence and generate tailored content following the template structure.
						</div>
					{/if}
				{/if}
			</div>
		{/if}

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
