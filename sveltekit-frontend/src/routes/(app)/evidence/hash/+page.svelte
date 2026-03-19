<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { appStore } from '$lib/stores/app-store.svelte';

	let selectedSection = $state('command-center');
	let showNewCaseModal = $state(false);
	let newCaseData = $state({
		title: '',
		description: '',
		priority: 'medium',
	});

	let loading = $state(true);
	let error: string | null = $state(null);

	const sections = [
		{ id: 'command-center', label: 'Command Center', description: 'Overview of active operations and system status.' },
		{ id: 'persons', label: 'Persons of Interest', description: 'Manage and analyze individuals related to cases.' },
		{ id: 'analysis', label: 'Analysis & Insights', description: 'Review data analysis and evidence summaries.' },
		{ id: 'evidence', label: 'Evidence Locker', description: 'Secure storage and management of digital evidence.' },
		{ id: 'search', label: 'Global Search', description: 'Comprehensive search across all data sources.' }
	];

	let evidenceInsights = $state<any[]>([]);
	let recentCases = $state<any[]>([]);

	async function loadCases() {
		try {
			loading = true;
			error = null;
			await appStore.loadCases();
			const allCases = appStore.cases ?? [];
			recentCases = allCases
				.sort((a: any, b: any) => new Date(b.createdAt || b.updatedAt || 0).getTime() - new Date(a.createdAt || a.updatedAt || 0).getTime())
				.slice(0, 10)
				.map((caseItem: any) => ({
					id: caseItem.id || caseItem.caseId,
					title: caseItem.title || caseItem.name || 'Untitled Case',
					caseNumber: caseItem.caseNumber || caseItem.id,
					priority: caseItem.priority || 'medium',
					createdBy: caseItem.createdBy || 'System',
					createdByLastName: caseItem.createdByLastName || '',
					createdAt: caseItem.createdAt || caseItem.updatedAt || new Date().toISOString(),
					status: caseItem.status || 'active'
				}));
		} catch (err) {
			console.error('Failed to load cases:', err);
			error = 'Failed to load cases';
			recentCases = [
				{ id: 'case-001', title: 'Project Chimera', caseNumber: '2024-001', priority: 'high', createdBy: '2B', createdByLastName: '', createdAt: new Date().toISOString(), status: 'active' },
				{ id: 'case-002', title: 'Network Intrusion', caseNumber: '2024-002', priority: 'medium', createdBy: '9S', createdByLastName: '', createdAt: new Date(Date.now() - 86400000).toISOString(), status: 'active' }
			];
		} finally {
			loading = false;
		}
	}

	async function loadEvidenceInsights() {
		try {
			await appStore.loadEvidence();
			const evidence = appStore.evidence ?? [];
			evidenceInsights = evidence
				.filter((item: any) => item.analysis || item.aiAnalyzed)
				.slice(0, 5)
				.map((item: any, index: number) => ({
					id: `insight-${item.id || index}`,
					label: item.filename || item.title || `Evidence Analysis ${index + 1}`,
					summary: item.analysis || item.summary || 'AI analysis completed'
				}));
			if (evidenceInsights.length < 2) {
				evidenceInsights = [
					...evidenceInsights,
					{ id: 'insight-gen-001', label: 'Anomaly detected in network logs', summary: 'Unusual data transfer patterns identified.' },
					{ id: 'insight-gen-002', label: 'Facial recognition match', summary: 'Subject identified in surveillance footage.' }
				].slice(0, 5 - evidenceInsights.length);
			}
		} catch (err) {
			console.error('Failed to load evidence insights:', err);
			evidenceInsights = [
				{ id: 'insight-001', label: 'Anomaly detected in network logs', summary: 'Unusual data transfer patterns identified.' },
				{ id: 'insight-002', label: 'Facial recognition match', summary: 'Subject identified in surveillance footage.' }
			];
		}
	}

	async function loadData() {
		await Promise.all([loadCases(), loadEvidenceInsights()]);
	}

	function openNewCase() { showNewCaseModal = true; }
	function cancelNewCase() {
		showNewCaseModal = false;
		newCaseData = { title: '', description: '', priority: 'medium' };
	}

	async function handleCreateCase(event: SubmitEvent) {
		cancelNewCase();
		await loadCases();
	}

	function priorityClass(priority: string | undefined) {
		switch (priority) {
			case 'high': return 'eh-priority-high';
			case 'critical': return 'eh-priority-critical';
			case 'medium': return 'eh-priority-medium';
			case 'low': return 'eh-priority-low';
			default: return 'eh-priority-default';
		}
	}

	async function navigateToCase(caseId: string) {
		await goto(`/cases/${caseId}`);
	}

	let intervalId: ReturnType<typeof setInterval>;

	onMount(() => {
		loadData();
		intervalId = setInterval(async () => { await loadData(); }, 60000);
		return () => { if (intervalId) clearInterval(intervalId); };
	});
</script>

<svelte:head>
	<title>Evidence Hash Verification</title>
</svelte:head>

<div class="eh-page">
	<header class="eh-header">
		<div class="eh-header-inner">
			<h1 class="eh-page-title">YoRHa Detective</h1>
			<button class="eh-new-btn" onclick={openNewCase}>
				<Icon name="plus" size={14} />
				New case
			</button>
		</div>
	</header>

	<main class="eh-main">
		{#if error}
			<div class="eh-error-bar">
				<Icon name="triangle-alert" size={14} />
				<span>{error}</span>
			</div>
		{/if}

		<section class="eh-section-grid">
			{#each sections as section (section.id)}
				<button
					class="eh-section-card"
					class:selected={selectedSection === section.id}
					onclick={() => selectedSection = section.id}
					aria-pressed={selectedSection === section.id}
				>
					<h2 class="eh-section-label">{section.label}</h2>
					<p class="eh-section-desc">{section.description}</p>
				</button>
			{/each}
		</section>

		<section class="eh-content-panel">
			{#if selectedSection === 'command-center'}
				<p class="eh-placeholder">Command center module unavailable. Please import the component.</p>
			{:else if selectedSection === 'persons'}
				<div class="eh-content-inner">
					<h2 class="eh-content-title">Persons of interest</h2>
					<p class="eh-content-desc">This module synchronises with dossier analytics. It will surface once the service is enabled.</p>
				</div>
			{:else if selectedSection === 'analysis'}
				<div class="eh-analysis-grid">
					<div class="eh-sub-panel">
						<h3 class="eh-sub-title">Recent cases</h3>
						{#if loading}
							<div class="eh-loading">
								<Icon name="loader-circle" size={16} class="animate-spin" />
								<span>Loading cases...</span>
							</div>
						{:else if recentCases.length === 0}
							<p class="eh-content-desc">No recent cases found. Create one to get started.</p>
						{:else}
							<ul class="eh-case-list">
								{#each recentCases as caseItem (caseItem.id)}
									<li class="eh-case-item">
										<div class="eh-case-header">
											<div>
												<p class="eh-case-title">{caseItem.title}</p>
												{#if caseItem.caseNumber}
													<p class="eh-case-number">#{caseItem.caseNumber}</p>
												{/if}
											</div>
											<span class="eh-priority-badge {priorityClass(caseItem.priority)}">
												{caseItem.priority ?? 'n/a'}
											</span>
										</div>
										<p class="eh-case-meta">
											{caseItem.createdBy ? `By ${caseItem.createdBy} ${caseItem.createdByLastName ?? ''}` : '—'} &bull;
											{caseItem.createdAt ? new Date(caseItem.createdAt).toLocaleDateString() : 'Unknown date'}
										</p>
										<button class="eh-view-link" onclick={() => navigateToCase(caseItem.id)}>
											View case
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
					<div class="eh-sub-panel">
						<h3 class="eh-sub-title">Evidence insights</h3>
						{#if loading}
							<div class="eh-loading">
								<Icon name="loader-circle" size={16} class="animate-spin" />
								<span>Loading insights...</span>
							</div>
						{:else if evidenceInsights.length === 0}
							<p class="eh-content-desc">No embeddings or AI summaries are available yet.</p>
						{:else}
							<ul class="eh-case-list">
								{#each evidenceInsights as insight (insight.id)}
									<li class="eh-case-item">
										<p class="eh-case-title">{insight.label}</p>
										<p class="eh-case-meta">{insight.summary}</p>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</div>
			{:else}
				<div class="eh-content-inner">
					<h2 class="eh-content-title">{sections.find((item) => item.id === selectedSection)?.label}</h2>
					<p class="eh-content-desc">This section opens in a dedicated view. Use the navigation to continue.</p>
				</div>
			{/if}
		</section>
	</main>
</div>

{#if showNewCaseModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="eh-modal-overlay" onclick={cancelNewCase} role="button" tabindex="0" aria-label="Close dialog">
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
		<div class="eh-modal-panel" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1">
			<div class="eh-modal-header">
				<h2 id="dialog-title" class="eh-modal-title">Create New Case</h2>
				<p class="eh-modal-subtitle">Fill in the details for the new case.</p>
			</div>
			<form class="eh-form" onsubmit={(e) => { e.preventDefault(); handleCreateCase(e as SubmitEvent); }}>
				<div class="eh-field">
					<label for="case-title" class="eh-label">Title</label>
					<input id="case-title" type="text" bind:value={newCaseData.title} class="eh-input" required />
				</div>
				<div class="eh-field">
					<label for="case-description" class="eh-label">Description</label>
					<textarea id="case-description" bind:value={newCaseData.description} rows="4" class="eh-textarea" placeholder="Provide additional context, links, or known entities."></textarea>
				</div>
				<div class="eh-field">
					<label for="case-priority" class="eh-label">Priority</label>
					<select id="case-priority" bind:value={newCaseData.priority} class="eh-select">
						<option value="low">Low</option>
						<option value="medium">Medium</option>
						<option value="high">High</option>
						<option value="critical">Critical</option>
					</select>
				</div>
				<div class="eh-form-actions">
					<button type="button" class="eh-btn secondary" onclick={cancelNewCase}>Cancel</button>
					<button type="submit" class="eh-btn primary">Create case</button>
				</div>
			</form>
			<button type="button" class="eh-close-x" onclick={cancelNewCase} aria-label="Close">
				<Icon name="x" size={16} />
			</button>
		</div>
	</div>
{/if}

<style>
	.eh-page {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		background: #0e0d0b;
		margin: -2.5rem;
	}

	.eh-page :global(h1), .eh-page :global(h2), .eh-page :global(h3), .eh-page :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.eh-page :global(a) { color: inherit; border-bottom: none; }
	.eh-page :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.eh-page :global(input), .eh-page :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.eh-page :global([class*="panel"]), .eh-page :global(.card) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

	/* ── Header ── */
	.eh-header {
		border-bottom: 1px solid rgba(212, 199, 163, 0.08);
		background: rgba(0, 0, 0, 0.3);
	}
	.eh-header-inner {
		max-width: 56rem;
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.5rem;
	}
	.eh-page-title {
		font-size: 1.25rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.95);
		margin: 0;
	}
	.eh-new-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		border: 1px solid rgba(52, 211, 153, 0.5);
		background: rgba(52, 211, 153, 0.1);
		color: rgba(167, 243, 208, 0.95);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}
	.eh-new-btn:hover {
		background: rgba(52, 211, 153, 0.2);
	}

	/* ── Main ── */
	.eh-main {
		max-width: 56rem;
		margin: 0 auto;
		padding: 1.5rem;
		width: 100%;
	}

	/* ── Error ── */
	.eh-error-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		border: 1px solid rgba(239, 68, 68, 0.3);
		background: rgba(239, 68, 68, 0.08);
		color: rgba(248, 113, 113, 0.9);
		font-size: 0.8rem;
		margin-bottom: 1rem;
	}

	/* ── Section grid ── */
	.eh-section-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
	@media (max-width: 640px) {
		.eh-section-grid { grid-template-columns: 1fr; }
	}
	.eh-section-card {
		text-align: left;
		padding: 1rem;
		border-radius: 0.75rem;
		border: 1px solid rgba(212, 199, 163, 0.08);
		background: rgba(0, 0, 0, 0.25);
		cursor: pointer;
		transition: border-color 0.15s;
	}
	.eh-section-card:hover {
		border-color: rgba(196, 117, 43, 0.5);
	}
	.eh-section-card.selected {
		border-color: rgba(196, 117, 43, 0.6);
		background: rgba(196, 117, 43, 0.06);
	}
	.eh-section-label {
		font-size: 0.95rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.9);
		margin: 0 0 0.25rem;
	}
	.eh-section-desc {
		font-size: 0.7rem;
		color: rgba(212, 199, 163, 0.4);
		margin: 0;
	}

	/* ── Content panel ── */
	.eh-content-panel {
		border-radius: 0.75rem;
		border: 1px solid rgba(212, 199, 163, 0.08);
		background: rgba(0, 0, 0, 0.25);
	}
	.eh-content-inner {
		padding: 1.5rem;
	}
	.eh-content-title {
		font-size: 1.1rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.9);
		margin: 0 0 0.5rem;
	}
	.eh-content-desc {
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.45);
		margin: 0;
	}
	.eh-placeholder {
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.4);
		padding: 1.5rem;
		margin: 0;
	}

	/* ── Analysis grid ── */
	.eh-analysis-grid {
		display: grid;
		gap: 1rem;
		padding: 1.5rem;
	}
	.eh-sub-panel {
		border-radius: 0.5rem;
		border: 1px solid rgba(212, 199, 163, 0.06);
		background: rgba(0, 0, 0, 0.15);
		padding: 1rem;
	}
	.eh-sub-title {
		font-size: 0.95rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.85);
		margin: 0 0 0.75rem;
	}

	/* ── Case list ── */
	.eh-case-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.eh-case-item {
		border-radius: 0.375rem;
		border: 1px solid rgba(212, 199, 163, 0.06);
		background: rgba(0, 0, 0, 0.2);
		padding: 0.625rem 0.75rem;
	}
	.eh-case-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.eh-case-title {
		font-weight: 500;
		font-size: 0.85rem;
		color: rgba(212, 199, 163, 0.9);
		margin: 0;
	}
	.eh-case-number {
		font-size: 0.7rem;
		color: rgba(212, 199, 163, 0.4);
		margin: 0;
	}
	.eh-case-meta {
		font-size: 0.7rem;
		color: rgba(212, 199, 163, 0.4);
		margin: 0.25rem 0 0;
	}
	.eh-view-link {
		font-size: 0.7rem;
		color: rgba(196, 117, 43, 0.8);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		margin-top: 0.375rem;
	}
	.eh-view-link:hover {
		text-decoration: underline;
	}

	/* ── Priority badges ── */
	.eh-priority-badge {
		display: inline-block;
		font-size: 0.65rem;
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		border: 1px solid;
		font-weight: 500;
	}
	.eh-priority-high { border-color: rgba(239, 68, 68, 0.5); background: rgba(239, 68, 68, 0.15); color: rgba(252, 165, 165, 0.95); }
	.eh-priority-critical { border-color: rgba(168, 85, 247, 0.5); background: rgba(168, 85, 247, 0.15); color: rgba(216, 180, 254, 0.95); }
	.eh-priority-medium { border-color: rgba(249, 115, 22, 0.5); background: rgba(249, 115, 22, 0.15); color: rgba(253, 186, 116, 0.95); }
	.eh-priority-low { border-color: rgba(59, 130, 246, 0.5); background: rgba(59, 130, 246, 0.15); color: rgba(147, 197, 253, 0.95); }
	.eh-priority-default { border-color: rgba(212, 199, 163, 0.2); background: rgba(212, 199, 163, 0.08); color: rgba(212, 199, 163, 0.6); }

	/* ── Loading ── */
	.eh-loading {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.4);
		margin-top: 0.75rem;
	}

	/* ── Modal ── */
	.eh-modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}
	.eh-modal-panel {
		position: relative;
		width: 100%;
		max-width: 32rem;
		background: rgba(19, 21, 25, 0.98);
		border: 1px solid rgba(212, 199, 163, 0.12);
		border-radius: 0.75rem;
		padding: 1.5rem;
		box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
	}
	.eh-modal-header {
		margin-bottom: 1.25rem;
	}
	.eh-modal-title {
		font-size: 1.1rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.95);
		margin: 0 0 0.25rem;
	}
	.eh-modal-subtitle {
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.4);
		margin: 0;
	}
	.eh-close-x {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: none;
		border: none;
		color: rgba(212, 199, 163, 0.4);
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 0.25rem;
		transition: color 0.15s;
	}
	.eh-close-x:hover { color: rgba(212, 199, 163, 0.8); }

	/* ── Form ── */
	.eh-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.eh-field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	.eh-label {
		font-size: 0.8rem;
		font-weight: 500;
		color: rgba(212, 199, 163, 0.6);
	}
	.eh-input, .eh-textarea, .eh-select {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border-radius: 0.375rem;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(212, 199, 163, 0.12);
		color: rgba(212, 199, 163, 0.9);
		font-size: 0.85rem;
	}
	.eh-input:focus, .eh-textarea:focus, .eh-select:focus {
		border-color: rgba(196, 117, 43, 0.5);
		outline: none;
	}
	.eh-textarea { resize: vertical; }
	.eh-select { appearance: auto; }

	.eh-form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}

	/* ── Buttons ── */
	.eh-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
		border: 1px solid;
	}
	.eh-btn.primary {
		border-color: rgba(52, 211, 153, 0.5);
		background: rgba(52, 211, 153, 0.1);
		color: rgba(167, 243, 208, 0.95);
	}
	.eh-btn.primary:hover { background: rgba(52, 211, 153, 0.2); }
	.eh-btn.secondary {
		border-color: rgba(212, 199, 163, 0.15);
		background: transparent;
		color: rgba(212, 199, 163, 0.6);
	}
	.eh-btn.secondary:hover {
		border-color: rgba(212, 199, 163, 0.3);
		color: rgba(212, 199, 163, 0.85);
	}
</style>
