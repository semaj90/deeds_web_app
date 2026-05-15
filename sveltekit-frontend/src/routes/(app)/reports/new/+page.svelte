<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { toast } from 'svelte-sonner';
	import { analytics } from '$lib/stores/analytics.svelte';
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

	// Derive sections from contentTemplate <h2> headings
	let templateSections = $derived.by(() => {
		if (!selectedTemplate?.contentTemplate) return [];
		const matches = selectedTemplate.contentTemplate.match(/<h2>([^<]+)<\/h2>/g);
		if (!matches) return [];
		return matches.map((m: string) => m.replace(/<\/?h2>/g, ''));
	});

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
					body: JSON.stringify({ templateType: selectedType, caseId, customTitle: title.trim(), useAI }),
					signal: AbortSignal.timeout(120_000)
				});
				if (!res.ok) { const data = await res.json(); throw new Error(data.message || 'Failed to generate report'); }
				const data = await res.json();
				reportId = data.data?.id;
			} else {
				const res = await fetch('/api/reports', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify({ caseId, title: title.trim(), type: selectedType, contentHtml: '<p>Start writing your report...</p>', status: 'draft', metadata: { reportType: selectedType } }),
					signal: AbortSignal.timeout(30_000)
				});
				if (!res.ok) { const data = await res.json(); throw new Error(data.message || 'Failed to create report'); }
				const data = await res.json();
				reportId = data.data?.id;
			}

			if (reportId) { analytics.track('case_created', { action: 'report_created', reportId, type: selectedType, fromTemplate: useTemplate, withAI: useAI }); toast.success('Report created successfully'); goto(`/reports/${reportId}/edit`); }
			else { throw new Error('No report ID returned'); }
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create report';
		} finally {
			isCreating = false;
		}
	}
</script>

<div class="sqex-page">
	<!-- CRT Scan Lines -->
	<div class="scanlines"></div>

	<!-- Top accent bar -->
	<div class="accent-bar"></div>

	<div class="sqex-container">
		<!-- Header -->
		<div class="sqex-header">
			<button onclick={() => goto('/reports')} class="sqex-back">
				<Icon name="arrow-left" size={14} />
				<span>Back to Reports</span>
			</button>

			<div class="sqex-title-block">
				<div class="sqex-title-row">
					<div class="sqex-icon-badge">
						<Icon name="file-plus" size={18} />
					</div>
					<div>
						<h1 class="sqex-title">Create New Report</h1>
						<p class="sqex-subtitle">Select a report type and start writing</p>
					</div>
				</div>
				<div class="sqex-status-chip">
					<span class="status-dot"></span>
					DRAFT MODE
				</div>
			</div>
		</div>

		<!-- Error -->
		{#if error}
			<div class="sqex-error">
				<Icon name="triangle-alert" size={14} />
				<span>{error}</span>
			</div>
		{/if}

		<!-- Main Content — Two Column -->
		<div class="sqex-layout">
			<!-- LEFT: Form -->
			<div class="sqex-form-col">
				<!-- Title Input -->
				<div class="sqex-field">
					<label for="title" class="sqex-label">
						<span class="label-marker"></span>
						REPORT TITLE
					</label>
					<input
						id="title"
						type="text"
						bind:value={title}
						placeholder="Enter report title..."
						class="sqex-input"
					/>
				</div>

				<!-- Report Type Selection -->
				<div class="sqex-field">
					<h2 class="sqex-label">
						<span class="label-marker"></span>
						REPORT TYPE
					</h2>
					<div class="sqex-type-grid">
						{#each reportTypes as type}
							<button
								onclick={() => selectedType = type.value}
								class="sqex-type-card"
								class:selected={selectedType === type.value}
							>
								<div class="type-indicator">
									{#if selectedType === type.value}
										<span class="indicator-active"></span>
									{:else}
										<span class="indicator-idle"></span>
									{/if}
								</div>
								<Icon name={type.icon} size={16} />
								<div class="type-text">
									<span class="type-name">{type.label}</span>
									<span class="type-desc">{type.description}</span>
								</div>
							</button>
						{/each}
					</div>
				</div>

				<!-- Template Options -->
				{#if selectedTemplate}
					<div class="sqex-options-panel">
						<div class="options-header">
							<span class="options-title">GENERATION OPTIONS</span>
							<span class="options-badge">{selectedTemplate.estimatedTime}</span>
						</div>

						<label class="sqex-toggle">
							<input type="checkbox" bind:checked={useTemplate} class="sqex-checkbox" />
							<div class="toggle-content">
								<span class="toggle-label">Use {selectedTemplate.name} template</span>
								<span class="toggle-desc">Pre-fill report with structured template</span>
							</div>
						</label>

						{#if useTemplate}
							<label class="sqex-toggle">
								<input type="checkbox" bind:checked={useAI} class="sqex-checkbox" />
								<div class="toggle-content">
									<span class="toggle-label">
										AI-powered content generation
										<span class="ai-badge">AI</span>
									</span>
									<span class="toggle-desc">Generate case-specific content using Ollama</span>
								</div>
							</label>

							{#if useAI}
								<div class="sqex-ai-notice">
									<div class="ai-glow"></div>
									<Icon name="sparkles" size={14} />
									<span>Neural analysis will generate tailored content from case evidence.</span>
								</div>
							{/if}
						{/if}
					</div>
				{/if}

				<!-- Actions -->
				<div class="sqex-actions">
					<button onclick={createReport} disabled={isCreating || !title.trim() || !caseId} class="sqex-btn-primary">
						{#if isCreating}
							<Icon name="loader-circle" size={14} class="animate-spin" />
							<span>GENERATING...</span>
						{:else}
							<Icon name="file-plus" size={14} />
							<span>CREATE REPORT</span>
						{/if}
					</button>
					<button onclick={() => goto('/reports')} class="sqex-btn-ghost">
						CANCEL
					</button>
				</div>
			</div>

			<!-- RIGHT: Preview Panel -->
			<div class="sqex-preview-col">
				<div class="preview-panel">
					<div class="preview-header">
						<span class="preview-label">PREVIEW</span>
						<span class="preview-dot"></span>
					</div>

					{#if selectedTemplate}
						<div class="preview-content">
							<div class="preview-icon-wrap">
								<Icon name="file-text" size={28} />
							</div>
							<h3 class="preview-title">{selectedTemplate.name}</h3>
							<p class="preview-desc">{selectedTemplate.description}</p>

							<div class="preview-meta">
								<div class="meta-row">
									<span class="meta-key">TYPE</span>
									<span class="meta-val">{selectedType.replace(/_/g, ' ').toUpperCase()}</span>
								</div>
								<div class="meta-row">
									<span class="meta-key">MODE</span>
									<span class="meta-val">{useTemplate ? (useAI ? 'AI GENERATED' : 'TEMPLATE') : 'BLANK'}</span>
								</div>
								<div class="meta-row">
									<span class="meta-key">TIME</span>
									<span class="meta-val">{selectedTemplate.estimatedTime}</span>
								</div>
								<div class="meta-row">
									<span class="meta-key">SECTIONS</span>
									<span class="meta-val">{templateSections.length || '—'}</span>
								</div>
							</div>

							{#if templateSections.length > 0}
								<div class="preview-sections">
									<span class="sections-label">STRUCTURE</span>
									{#each templateSections.slice(0, 6) as section}
										<div class="section-row">
											<span class="section-bullet"></span>
											<span class="section-name">{section}</span>
										</div>
									{/each}
									{#if templateSections.length > 6}
										<div class="section-more">+{templateSections.length - 6} more sections</div>
									{/if}
								</div>
							{/if}
						</div>
					{:else}
						<div class="preview-empty">
							<Icon name="monitor" size={24} />
							<span>Select a report type</span>
						</div>
					{/if}
				</div>
			</div>
		</div>

		{#if !caseId}
			<div class="sqex-info-bar">
				<Icon name="info" size={13} />
				<span>Reports must be linked to a case. Create a report from a case page (<code>/cases/[id]/overview</code>).</span>
			</div>
		{/if}
	</div>
</div>

<style>
	/* ═══════════════════════════════════════
	   SQUARE ENIX / NieR DESIGN SYSTEM
	   ═══════════════════════════════════════ */

	.sqex-page {
		position: relative;
		min-height: 100vh;
		margin: -2.5rem;
		padding: 0;
		background:
			radial-gradient(ellipse at 15% 5%, rgba(126, 231, 255, 0.06), transparent 45%),
			radial-gradient(ellipse at 85% 90%, rgba(255, 212, 121, 0.04), transparent 40%),
			radial-gradient(ellipse at 50% 50%, rgba(83, 226, 164, 0.02), transparent 60%),
			linear-gradient(180deg, #060a12 0%, #0a0e18 40%, #080c14 100%);
		color: rgba(233, 240, 255, 0.85);
		font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
		overflow: hidden;
	}

	/* Reset inherited styles */
	.sqex-page :global(h1), .sqex-page :global(h2), .sqex-page :global(h3), .sqex-page :global(p) {
		color: inherit; text-transform: none; letter-spacing: normal; margin: 0;
	}
	.sqex-page :global(button) {
		text-transform: none; letter-spacing: normal; background: none; border: none;
		box-shadow: none; padding: 0; color: inherit; font-family: inherit;
	}
	.sqex-page :global(button)::before { display: none; }
	.sqex-page :global(button):hover { transform: none; }
	.sqex-page :global(input) {
		background: transparent; border: none; box-shadow: none; color: inherit; font-family: inherit;
	}

	/* CRT Scan Lines */
	.scanlines {
		position: fixed;
		inset: 0;
		pointer-events: none;
		z-index: 1;
		background: repeating-linear-gradient(
			0deg,
			rgba(126, 231, 255, 0.012),
			rgba(126, 231, 255, 0.012) 1px,
			transparent 1px,
			transparent 3px
		);
		mix-blend-mode: screen;
		opacity: 0.5;
	}

	/* Top Accent Bar */
	.accent-bar {
		position: relative;
		height: 2px;
		background: linear-gradient(90deg,
			transparent 5%,
			rgba(126, 231, 255, 0.6) 25%,
			rgba(255, 212, 121, 0.5) 50%,
			rgba(83, 226, 164, 0.5) 75%,
			transparent 95%
		);
		z-index: 2;
	}

	.sqex-container {
		position: relative;
		z-index: 2;
		max-width: 1200px;
		margin: 0 auto;
		padding: 1.5rem 2rem 3rem;
	}

	/* ═══ HEADER ═══ */
	.sqex-header {
		margin-bottom: 2rem;
	}

	.sqex-back {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: rgba(183, 224, 255, 0.38);
		cursor: pointer;
		transition: color 0.15s;
		margin-bottom: 1.25rem;
	}
	.sqex-back:hover { color: rgba(126, 231, 255, 0.8); }

	.sqex-title-block {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	.sqex-title-row {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.sqex-icon-badge {
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid rgba(126, 231, 255, 0.2);
		border-radius: 2px;
		background: linear-gradient(135deg, rgba(126, 231, 255, 0.08) 0%, rgba(83, 183, 255, 0.04) 100%);
		color: rgba(126, 231, 255, 0.72);
		flex-shrink: 0;
	}

	.sqex-title {
		font-size: 1.375rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: rgba(233, 240, 255, 0.95);
	}

	.sqex-subtitle {
		font-size: 0.6875rem;
		color: rgba(183, 224, 255, 0.42);
		margin-top: 0.25rem;
		letter-spacing: 0.02em;
	}

	.sqex-status-chip {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.75rem;
		font-size: 0.5625rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		border: 1px solid rgba(255, 212, 121, 0.2);
		border-radius: 2px;
		color: rgba(255, 212, 121, 0.72);
		background: rgba(255, 212, 121, 0.06);
	}

	.status-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: rgba(255, 212, 121, 0.72);
		box-shadow: 0 0 6px rgba(255, 212, 121, 0.4);
	}

	/* ═══ ERROR ═══ */
	.sqex-error {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1rem;
		margin-bottom: 1.5rem;
		font-size: 0.75rem;
		color: rgba(248, 113, 113, 0.9);
		background: rgba(248, 113, 113, 0.06);
		border: 1px solid rgba(248, 113, 113, 0.18);
		border-radius: 2px;
	}

	/* ═══ LAYOUT ═══ */
	.sqex-layout {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 1.5rem;
		align-items: start;
	}

	@media (max-width: 900px) {
		.sqex-layout { grid-template-columns: 1fr; }
		.sqex-preview-col { display: none; }
	}

	/* ═══ FORM COLUMN ═══ */
	.sqex-form-col {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.sqex-field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.sqex-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.625rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: rgba(126, 231, 255, 0.6);
	}

	.label-marker {
		width: 3px;
		height: 12px;
		background: linear-gradient(180deg, rgba(126, 231, 255, 0.7), rgba(83, 226, 164, 0.5));
		border-radius: 1px;
	}

	.sqex-input {
		width: 100%;
		padding: 0.75rem 1rem;
		font-size: 0.8125rem;
		color: rgba(233, 240, 255, 0.9);
		background: rgba(6, 10, 18, 0.6);
		border: 1px solid rgba(126, 231, 255, 0.12);
		border-radius: 2px;
		outline: none;
		transition: border-color 0.2s, box-shadow 0.2s;
	}
	.sqex-input::placeholder { color: rgba(140, 160, 199, 0.32); }
	.sqex-input:focus {
		border-color: rgba(126, 231, 255, 0.5);
		box-shadow: 0 0 12px rgba(126, 231, 255, 0.08), inset 0 0 12px rgba(126, 231, 255, 0.03);
	}

	/* ═══ TYPE GRID ═══ */
	.sqex-type-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	@media (max-width: 640px) { .sqex-type-grid { grid-template-columns: 1fr; } }

	.sqex-type-card {
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
		padding: 0.875rem;
		text-align: left;
		cursor: pointer;
		border: 1px solid rgba(126, 231, 255, 0.06);
		border-radius: 2px;
		background: rgba(6, 10, 18, 0.5);
		color: rgba(183, 224, 255, 0.6);
		transition: all 0.15s ease;
	}
	.sqex-type-card:hover {
		border-color: rgba(126, 231, 255, 0.18);
		background: rgba(126, 231, 255, 0.03);
		color: rgba(233, 240, 255, 0.85);
	}
	.sqex-type-card.selected {
		border-color: rgba(126, 231, 255, 0.4);
		background: linear-gradient(135deg, rgba(126, 231, 255, 0.08) 0%, rgba(83, 226, 164, 0.04) 100%);
		color: rgba(233, 240, 255, 0.95);
		box-shadow: 0 0 16px rgba(126, 231, 255, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.03);
	}

	.type-indicator {
		width: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		margin-top: 0.25rem;
	}
	.indicator-idle {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		border: 1px solid rgba(183, 224, 255, 0.2);
	}
	.indicator-active {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: rgba(126, 231, 255, 0.8);
		box-shadow: 0 0 8px rgba(126, 231, 255, 0.5);
	}

	.type-text { flex: 1; min-width: 0; }
	.type-name {
		display: block;
		font-size: 0.75rem;
		font-weight: 600;
		color: inherit;
		margin-bottom: 0.125rem;
	}
	.type-desc {
		display: block;
		font-size: 0.625rem;
		color: rgba(140, 160, 199, 0.5);
	}
	.sqex-type-card.selected .type-desc { color: rgba(183, 224, 255, 0.5); }

	/* ═══ OPTIONS PANEL ═══ */
	.sqex-options-panel {
		border: 1px solid rgba(126, 231, 255, 0.08);
		border-radius: 2px;
		background: rgba(6, 10, 18, 0.5);
		overflow: hidden;
	}

	.options-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.625rem 1rem;
		border-bottom: 1px solid rgba(126, 231, 255, 0.06);
		background: rgba(14, 20, 32, 0.5);
	}

	.options-title {
		font-size: 0.5625rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: rgba(126, 231, 255, 0.55);
	}

	.options-badge {
		font-size: 0.5625rem;
		padding: 0.15rem 0.5rem;
		border-radius: 2px;
		border: 1px solid rgba(83, 226, 164, 0.2);
		background: rgba(83, 226, 164, 0.06);
		color: rgba(83, 226, 164, 0.72);
	}

	.sqex-toggle {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		cursor: pointer;
		border-bottom: 1px solid rgba(126, 231, 255, 0.04);
		transition: background 0.15s;
	}
	.sqex-toggle:hover { background: rgba(126, 231, 255, 0.02); }
	.sqex-toggle:last-child { border-bottom: none; }

	.sqex-checkbox {
		width: 14px;
		height: 14px;
		margin-top: 0.125rem;
		flex-shrink: 0;
		accent-color: rgba(126, 231, 255, 0.9);
		border-radius: 2px;
	}

	.toggle-content { flex: 1; }
	.toggle-label {
		display: block;
		font-size: 0.75rem;
		font-weight: 500;
		color: rgba(233, 240, 255, 0.78);
	}
	.toggle-desc {
		display: block;
		font-size: 0.625rem;
		color: rgba(140, 160, 199, 0.42);
		margin-top: 0.125rem;
	}

	.ai-badge {
		display: inline-block;
		font-size: 0.5rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		padding: 0.1rem 0.35rem;
		border-radius: 2px;
		background: linear-gradient(135deg, rgba(83, 226, 164, 0.15), rgba(126, 231, 255, 0.1));
		border: 1px solid rgba(83, 226, 164, 0.25);
		color: rgba(83, 226, 164, 0.9);
		vertical-align: middle;
		margin-left: 0.375rem;
	}

	.sqex-ai-notice {
		position: relative;
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		margin: 0 0.75rem 0.75rem;
		border: 1px solid rgba(83, 226, 164, 0.12);
		border-radius: 2px;
		background: rgba(83, 226, 164, 0.04);
		font-size: 0.6875rem;
		color: rgba(183, 224, 255, 0.56);
		overflow: hidden;
	}
	.sqex-ai-notice :global(svg) { color: rgba(83, 226, 164, 0.72); flex-shrink: 0; margin-top: 1px; }
	.ai-glow {
		position: absolute;
		top: -20px;
		right: -20px;
		width: 80px;
		height: 80px;
		border-radius: 50%;
		background: radial-gradient(circle, rgba(83, 226, 164, 0.08), transparent 60%);
		pointer-events: none;
	}

	/* ═══ ACTIONS ═══ */
	.sqex-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.sqex-btn-primary {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.65rem 1.5rem;
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: rgba(126, 231, 255, 0.95);
		background: linear-gradient(135deg, rgba(126, 231, 255, 0.14) 0%, rgba(83, 183, 255, 0.08) 100%);
		border: 1px solid rgba(126, 231, 255, 0.3);
		border-radius: 2px;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.sqex-btn-primary:hover:not(:disabled) {
		background: linear-gradient(135deg, rgba(126, 231, 255, 0.22) 0%, rgba(255, 212, 121, 0.1) 100%);
		border-color: rgba(126, 231, 255, 0.5);
		box-shadow: 0 0 20px rgba(126, 231, 255, 0.1);
	}
	.sqex-btn-primary:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.sqex-btn-ghost {
		display: inline-flex;
		align-items: center;
		padding: 0.65rem 1.25rem;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: rgba(183, 224, 255, 0.42);
		border: 1px solid rgba(126, 231, 255, 0.08);
		border-radius: 2px;
		cursor: pointer;
		transition: all 0.15s;
	}
	.sqex-btn-ghost:hover {
		color: rgba(233, 240, 255, 0.78);
		border-color: rgba(126, 231, 255, 0.18);
		background: rgba(126, 231, 255, 0.03);
	}

	/* ═══ PREVIEW PANEL ═══ */
	.sqex-preview-col {
		position: sticky;
		top: 1.5rem;
	}

	.preview-panel {
		border: 1px solid rgba(126, 231, 255, 0.1);
		border-radius: 2px;
		background: rgba(8, 12, 20, 0.6);
		backdrop-filter: blur(12px) saturate(1.1);
		overflow: hidden;
	}

	.preview-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.625rem 1rem;
		border-bottom: 1px solid rgba(126, 231, 255, 0.08);
		background: rgba(14, 20, 32, 0.5);
	}

	.preview-label {
		font-size: 0.5625rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: rgba(126, 231, 255, 0.55);
	}

	.preview-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: rgba(83, 226, 164, 0.6);
		box-shadow: 0 0 6px rgba(83, 226, 164, 0.3);
	}

	.preview-content {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.preview-icon-wrap {
		width: 56px;
		height: 56px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid rgba(126, 231, 255, 0.15);
		border-radius: 2px;
		background: linear-gradient(135deg, rgba(126, 231, 255, 0.06) 0%, rgba(83, 226, 164, 0.03) 100%);
		color: rgba(126, 231, 255, 0.6);
	}

	.preview-title {
		font-size: 0.875rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: rgba(233, 240, 255, 0.9);
		text-align: center;
	}

	.preview-desc {
		font-size: 0.6875rem;
		color: rgba(183, 224, 255, 0.42);
		text-align: center;
		line-height: 1.5;
	}

	.preview-meta {
		width: 100%;
		border: 1px solid rgba(126, 231, 255, 0.06);
		border-radius: 2px;
		overflow: hidden;
	}

	.meta-row {
		display: flex;
		align-items: center;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid rgba(126, 231, 255, 0.04);
	}
	.meta-row:last-child { border-bottom: none; }

	.meta-key {
		width: 80px;
		font-size: 0.5625rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: rgba(183, 224, 255, 0.32);
	}

	.meta-val {
		flex: 1;
		font-size: 0.6875rem;
		color: rgba(233, 240, 255, 0.72);
	}

	.preview-sections {
		width: 100%;
	}

	.sections-label {
		display: block;
		font-size: 0.5625rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: rgba(255, 212, 121, 0.5);
		margin-bottom: 0.5rem;
	}

	.section-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0;
		font-size: 0.6875rem;
		color: rgba(183, 224, 255, 0.56);
	}

	.section-bullet {
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: rgba(126, 231, 255, 0.4);
		flex-shrink: 0;
	}

	.section-name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.section-more {
		font-size: 0.625rem;
		color: rgba(126, 231, 255, 0.35);
		padding-left: 1rem;
		margin-top: 0.25rem;
	}

	.preview-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 3rem 1rem;
		color: rgba(183, 224, 255, 0.2);
		font-size: 0.75rem;
	}

	/* ═══ INFO BAR ═══ */
	.sqex-info-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1rem;
		margin-top: 1.5rem;
		font-size: 0.6875rem;
		color: rgba(183, 224, 255, 0.42);
		border: 1px solid rgba(126, 231, 255, 0.06);
		border-radius: 2px;
		background: rgba(6, 10, 18, 0.4);
	}
	.sqex-info-bar :global(svg) { color: rgba(126, 231, 255, 0.42); flex-shrink: 0; }
	.sqex-info-bar code {
		font-size: 0.625rem;
		padding: 0.1rem 0.35rem;
		border-radius: 2px;
		background: rgba(126, 231, 255, 0.06);
		border: 1px solid rgba(126, 231, 255, 0.1);
		color: rgba(183, 224, 255, 0.6);
	}

	/* ═══ SCROLLBAR ═══ */
	.sqex-page ::-webkit-scrollbar { width: 4px; }
	.sqex-page ::-webkit-scrollbar-track { background: transparent; }
	.sqex-page ::-webkit-scrollbar-thumb { background: rgba(126, 231, 255, 0.15); border-radius: 2px; }
	.sqex-page ::-webkit-scrollbar-thumb:hover { background: rgba(126, 231, 255, 0.28); }
</style>
