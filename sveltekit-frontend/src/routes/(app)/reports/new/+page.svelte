<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
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

<div class="min-h-screen bg-neutral-100 p-6 text-neutral-900">
	<!-- Header -->
	<div class="mb-8">
		<button
			onclick={() => goto('/reports')}
			class="mb-4 flex items-center gap-1 text-sm text-neutral-600 transition-colors hover:text-neutral-900"
		>
			<Icon name="arrow-left" class="w-4 h-4" />
			Back to Reports
		</button>
		<h1 class="text-3xl font-bold text-neutral-950">Create New Report</h1>
		<p class="mt-1 text-sm text-neutral-600">
			Select a report type and start writing
		</p>
	</div>

	<!-- Error Message -->
	{#if error}
		<div class="mb-6 rounded-lg border border-neutral-300 bg-white p-4 text-neutral-800 shadow-sm">
			<div class="flex items-center gap-2">
				<Icon name="triangle-alert" class="w-4 h-4" />
				<span>{error}</span>
			</div>
		</div>
	{/if}

	<!-- Form -->
	<div class="max-w-3xl">
		<!-- Title Input -->
		<div class="mb-6">
			<label for="title" class="mb-2 block text-sm font-semibold text-neutral-700">
				Report Title
			</label>
			<input
				id="title"
				type="text"
				bind:value={title}
				placeholder="Enter report title..."
				class="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
			/>
		</div>

		<!-- Report Type Selection -->
		<div class="mb-8">
			<h2 class="mb-4 text-sm font-semibold text-neutral-700">Report Type</h2>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
				{#each reportTypes as type}
					<button
						onclick={() => selectedType = type.value}
						class="text-left p-4 rounded-lg border transition-all {selectedType === type.value
							? 'border-neutral-900 bg-white shadow-sm'
							: 'border-neutral-300 bg-white hover:border-neutral-400 hover:bg-neutral-50'}"
					>
						<div class="flex items-start gap-3">
							<Icon name={type.icon} class="mt-0.5 h-5 w-5 shrink-0 {selectedType === type.value ? 'text-neutral-900' : 'text-neutral-500'}" />
							<div class="flex-1 min-w-0">
								<div class="mb-1 font-semibold text-neutral-900">
									{type.label}
								</div>
								<div class="text-xs text-neutral-500">
									{type.description}
								</div>
							</div>
							{#if selectedType === type.value}
								<Icon name="circle-check" class="h-5 w-5 shrink-0 text-neutral-900" />
							{/if}
						</div>
					</button>
				{/each}
			</div>
		</div>

		<!-- Template Options -->
		{#if selectedTemplate}
			<div class="mb-6 rounded-lg border border-neutral-300 bg-white p-4 shadow-sm">
				<h3 class="mb-3 text-sm font-semibold text-neutral-700">Generation Options</h3>

				<!-- Use Template Toggle -->
				<label class="flex items-center gap-3 mb-3 cursor-pointer">
					<input
						type="checkbox"
						bind:checked={useTemplate}
						class="h-4 w-4 rounded border-neutral-400 bg-white accent-neutral-900 focus:ring-2 focus:ring-neutral-900 focus:ring-offset-0"
					/>
					<div class="flex-1">
						<div class="text-sm text-neutral-900">Use {selectedTemplate.name} template</div>
						<div class="text-xs text-neutral-500">Pre-fill report with structured template ({selectedTemplate.estimatedTime})</div>
					</div>
				</label>

				<!-- AI Enhancement Toggle -->
				{#if useTemplate}
					<label class="flex items-center gap-3 cursor-pointer">
						<input
							type="checkbox"
							bind:checked={useAI}
							class="h-4 w-4 rounded border-neutral-400 bg-white accent-neutral-900 focus:ring-2 focus:ring-neutral-900 focus:ring-offset-0"
						/>
						<div class="flex-1">
							<div class="flex items-center gap-2 text-sm text-neutral-900">
								<span>AI-powered content generation</span>
								<span class="rounded-full bg-neutral-900 px-2 py-0.5 text-xs text-white">Beta</span>
							</div>
							<div class="text-xs text-neutral-500">Generate case-specific content using AI (requires Ollama)</div>
						</div>
					</label>

					{#if useAI}
						<div class="mt-3 rounded bg-neutral-100 p-3 text-xs text-neutral-600">
							<Icon name="sparkles" class="w-3 h-3 inline-block mr-1" />
							AI will analyze your case evidence and generate tailored content following the template structure.
						</div>
					{/if}
				{/if}
			</div>
		{/if}

		<!-- Actions -->
		<div class="flex items-center gap-3">
			<button
				onclick={createReport}
				disabled={isCreating || !title.trim() || !caseId}
				class="inline-flex items-center justify-center gap-2 rounded-md border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if isCreating}
					<Icon name="loader-circle" class="w-4 h-4 animate-spin" />
					Creating...
				{:else}
					<Icon name="file-plus" class="w-4 h-4" />
					Create Report
				{/if}
			</button>
			<button
				onclick={() => goto('/reports')}
				class="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 transition hover:border-neutral-400 hover:bg-neutral-50"
			>
				Cancel
			</button>
		</div>

		{#if !caseId}
			<div class="mt-4 rounded-lg border border-neutral-300 bg-white p-3 text-sm text-neutral-700 shadow-sm">
				<div class="flex items-start gap-2">
					<Icon name="info" class="w-4 h-4 mt-0.5 shrink-0" />
					<div>
						<strong>Note:</strong> Reports must be linked to a case. Please create a report from a case page
						(e.g., <code class="rounded bg-neutral-100 px-1 py-0.5">/cases/[id]/overview</code>).
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
