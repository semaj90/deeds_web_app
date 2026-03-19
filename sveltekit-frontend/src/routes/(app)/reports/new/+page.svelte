<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { getTemplate, getTemplateTypes } from '$lib/data/report-templates';

	let caseId = $derived(page.url.searchParams.get('caseId'));

	let selectedType = $state('charging_memo');
	let title = $state('');
	let useAI = $state(true);
	let useTemplate = $state(true);
	let isCreating = $state(false);
	let error = $state<string | null>(null);

	let selectedTemplate = $derived(getTemplate(selectedType));
	const reportTypes = getTemplateTypes();

	async function createReport() {
		if (!title.trim()) { error = 'Please enter a report title'; return; }
		if (!caseId) { error = 'Case ID is required. Please create report from a case page.'; return; }

		isCreating = true;
		error = null;

		try {
			let reportId;

			if (useTemplate) {
				const res = await fetch('/api/reports/generate-from-template', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify({ templateType: selectedType, caseId, customTitle: title.trim(), useAI })
				});
				if (!res.ok) { const data = await res.json(); throw new Error(data.message || 'Failed to generate report'); }
				const data = await res.json();
				reportId = data.data?.id;
			} else {
				const res = await fetch('/api/reports', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify({ caseId, title: title.trim(), contentHtml: '<p>Start writing your report...</p>', status: 'draft', metadata: { reportType: selectedType } })
				});
				if (!res.ok) { const data = await res.json(); throw new Error(data.message || 'Failed to create report'); }
				const data = await res.json();
				reportId = data.data?.id;
			}

			if (reportId) { goto(`/reports/${reportId}/edit`); }
			else { throw new Error('No report ID returned'); }
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create report';
		} finally {
			isCreating = false;
		}
	}
</script>

<div class="new-report-page">
	<!-- Header -->
	<div class="nr-header">
		<button onclick={() => goto('/reports')} class="nr-back-btn">
			<Icon name="arrow-left" />
			Back to Reports
		</button>
		<h1 class="nr-title">Create New Report</h1>
		<p class="nr-subtitle">Select a report type and start writing</p>
	</div>

	<!-- Error -->
	{#if error}
		<div class="nr-error-box">
			<Icon name="triangle-alert" />
			<span>{error}</span>
		</div>
	{/if}

	<!-- Form -->
	<div class="nr-form">
		<!-- Title Input -->
		<div class="nr-field">
			<label for="title" class="nr-label">Report Title</label>
			<input
				id="title"
				type="text"
				bind:value={title}
				placeholder="Enter report title..."
				class="nr-input"
			/>
		</div>

		<!-- Report Type Selection -->
		<div class="nr-field">
			<h2 class="nr-label">Report Type</h2>
			<div class="nr-type-grid">
				{#each reportTypes as type}
					<button
						onclick={() => selectedType = type.value}
						class="nr-type-card"
						class:selected={selectedType === type.value}
					>
						<div class="nr-type-content">
							<Icon name={type.icon} class="nr-type-icon" />
							<div class="nr-type-info">
								<div class="nr-type-name">{type.label}</div>
								<div class="nr-type-desc">{type.description}</div>
							</div>
							{#if selectedType === type.value}
								<Icon name="circle-check" class="nr-type-check" />
							{/if}
						</div>
					</button>
				{/each}
			</div>
		</div>

		<!-- Template Options -->
		{#if selectedTemplate}
			<div class="nr-options-panel">
				<h3 class="nr-options-title">Generation Options</h3>

				<label class="nr-toggle-row">
					<input type="checkbox" bind:checked={useTemplate} class="nr-checkbox" />
					<div class="nr-toggle-info">
						<div class="nr-toggle-label">Use {selectedTemplate.name} template</div>
						<div class="nr-toggle-desc">Pre-fill report with structured template ({selectedTemplate.estimatedTime})</div>
					</div>
				</label>

				{#if useTemplate}
					<label class="nr-toggle-row">
						<input type="checkbox" bind:checked={useAI} class="nr-checkbox" />
						<div class="nr-toggle-info">
							<div class="nr-toggle-label">
								AI-powered content generation
								<span class="nr-beta-badge">Beta</span>
							</div>
							<div class="nr-toggle-desc">Generate case-specific content using AI (requires Ollama)</div>
						</div>
					</label>

					{#if useAI}
						<div class="nr-ai-notice">
							<Icon name="sparkles" />
							AI will analyze your case evidence and generate tailored content following the template structure.
						</div>
					{/if}
				{/if}
			</div>
		{/if}

		<!-- Actions -->
		<div class="nr-actions">
			<button onclick={createReport} disabled={isCreating || !title.trim() || !caseId} class="nr-btn primary">
				{#if isCreating}
					<Icon name="loader-circle" class="animate-spin" />
					Creating...
				{:else}
					<Icon name="file-plus" />
					Create Report
				{/if}
			</button>
			<button onclick={() => goto('/reports')} class="nr-btn secondary">
				Cancel
			</button>
		</div>

		{#if !caseId}
			<div class="nr-info-box">
				<Icon name="info" class="nr-info-icon" />
				<div>
					<strong>Note:</strong> Reports must be linked to a case. Please create a report from a case page
					(e.g., <code>/cases/[id]/overview</code>).
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.new-report-page {
		min-height: 100vh;
		background: #0e0d0b;
		margin: -2.5rem;
		padding: 1.5rem max(1.5rem, calc(50% - 26rem));
	}

	.new-report-page :global(h1), .new-report-page :global(h2), .new-report-page :global(h3), .new-report-page :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.new-report-page :global(a) { color: inherit; border-bottom: none; }
	.new-report-page :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.new-report-page :global(input), .new-report-page :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.new-report-page :global([class*="panel"]), .new-report-page :global(.card) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

	/* ── Header ── */
	.nr-header { margin-bottom: 2rem; }
	.nr-back-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.45);
		background: none;
		border: none;
		cursor: pointer;
		margin-bottom: 1rem;
		transition: color 0.15s;
	}
	.nr-back-btn:hover { color: rgba(212, 199, 163, 0.8); }
	.nr-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.95);
		margin: 0;
	}
	.nr-subtitle { font-size: 0.8rem; color: rgba(212, 199, 163, 0.4); margin-top: 0.25rem; }

	/* ── Error ── */
	.nr-error-box {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		background: rgba(248, 113, 113, 0.08);
		border: 1px solid rgba(248, 113, 113, 0.2);
		color: #f87171;
		font-size: 0.8rem;
		margin-bottom: 1.5rem;
	}

	/* ── Form ── */
	.nr-form { max-width: 48rem; }
	.nr-field { margin-bottom: 1.5rem; }
	.nr-label {
		display: block;
		font-size: 0.8rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.65);
		margin-bottom: 0.5rem;
	}
	.nr-input {
		width: 100%;
		padding: 0.625rem 1rem;
		border-radius: 0.5rem;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(212, 199, 163, 0.12);
		color: rgba(212, 199, 163, 0.9);
		font-size: 0.85rem;
	}
	.nr-input::placeholder { color: rgba(212, 199, 163, 0.3); }
	.nr-input:focus { border-color: rgba(96, 165, 250, 0.5); outline: none; }

	/* ── Type grid ── */
	.nr-type-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.625rem;
	}
	@media (max-width: 640px) { .nr-type-grid { grid-template-columns: 1fr; } }
	.nr-type-card {
		text-align: left;
		padding: 1rem;
		border-radius: 0.5rem;
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(212, 199, 163, 0.08);
		cursor: pointer;
		transition: all 0.15s;
	}
	.nr-type-card:hover { border-color: rgba(96, 165, 250, 0.25); }
	.nr-type-card.selected {
		border-color: rgba(96, 165, 250, 0.5);
		background: rgba(96, 165, 250, 0.06);
		box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.15);
	}
	.nr-type-content {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
	}
	:global(.nr-type-icon) { width: 1.25rem; height: 1.25rem; color: rgba(212, 199, 163, 0.5); flex-shrink: 0; margin-top: 0.125rem; }
	.nr-type-card.selected :global(.nr-type-icon) { color: rgba(96, 165, 250, 0.9); }
	.nr-type-info { flex: 1; min-width: 0; }
	.nr-type-name { font-size: 0.85rem; font-weight: 600; color: rgba(212, 199, 163, 0.9); margin-bottom: 0.125rem; }
	.nr-type-desc { font-size: 0.7rem; color: rgba(212, 199, 163, 0.4); }
	:global(.nr-type-check) { width: 1.25rem; height: 1.25rem; color: rgba(96, 165, 250, 0.9); flex-shrink: 0; }

	/* ── Options panel ── */
	.nr-options-panel {
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 0.5rem;
		padding: 1rem;
		margin-bottom: 1.5rem;
	}
	.nr-options-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.65);
		margin: 0 0 0.75rem;
	}
	.nr-toggle-row {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
		cursor: pointer;
	}
	.nr-checkbox {
		width: 1rem;
		height: 1rem;
		border-radius: 0.25rem;
		border: 1px solid rgba(212, 199, 163, 0.3);
		background: rgba(0, 0, 0, 0.3);
		accent-color: rgba(96, 165, 250, 0.9);
		margin-top: 0.125rem;
		flex-shrink: 0;
	}
	.nr-toggle-info { flex: 1; }
	.nr-toggle-label { font-size: 0.8rem; color: rgba(212, 199, 163, 0.85); }
	.nr-toggle-desc { font-size: 0.7rem; color: rgba(212, 199, 163, 0.4); margin-top: 0.125rem; }
	.nr-beta-badge {
		display: inline-block;
		font-size: 0.6rem;
		font-weight: 700;
		padding: 0.1rem 0.4rem;
		border-radius: 9999px;
		background: rgba(96, 165, 250, 0.15);
		color: rgba(96, 165, 250, 0.9);
		margin-left: 0.375rem;
		vertical-align: middle;
	}
	.nr-ai-notice {
		display: flex;
		align-items: flex-start;
		gap: 0.375rem;
		padding: 0.75rem;
		border-radius: 0.375rem;
		background: rgba(96, 165, 250, 0.06);
		border: 1px solid rgba(96, 165, 250, 0.1);
		font-size: 0.75rem;
		color: rgba(212, 199, 163, 0.55);
		margin-top: 0.5rem;
	}

	/* ── Actions ── */
	.nr-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	.nr-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
		border: 1px solid;
	}
	.nr-btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.nr-btn.primary {
		background: rgba(96, 165, 250, 0.15);
		border-color: rgba(96, 165, 250, 0.4);
		color: rgba(96, 165, 250, 0.95);
	}
	.nr-btn.primary:hover:not(:disabled) { background: rgba(96, 165, 250, 0.25); }
	.nr-btn.secondary {
		background: rgba(0, 0, 0, 0.2);
		border-color: rgba(212, 199, 163, 0.15);
		color: rgba(212, 199, 163, 0.6);
	}
	.nr-btn.secondary:hover { background: rgba(212, 199, 163, 0.06); color: rgba(212, 199, 163, 0.85); }

	/* ── Info box ── */
	.nr-info-box {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(212, 199, 163, 0.08);
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.6);
		margin-top: 1rem;
	}
	:global(.nr-info-icon) { width: 1rem; height: 1rem; color: rgba(96, 165, 250, 0.6); flex-shrink: 0; margin-top: 0.125rem; }
	.nr-info-box code {
		font-size: 0.75rem;
		padding: 0.1rem 0.3rem;
		border-radius: 0.25rem;
		background: rgba(212, 199, 163, 0.06);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
	}
</style>
