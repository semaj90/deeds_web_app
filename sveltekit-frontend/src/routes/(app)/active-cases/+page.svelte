<script lang="ts">
	import CaseFilters from '$lib/components/yorha/cases/CaseFilters.svelte';
	import CasesList from '$lib/components/yorha/cases/CasesList.svelte';
	import CaseStats from '$lib/components/yorha/cases/CaseStats.svelte';
	import CaseCardGrid from '$lib/components/dashboard/CaseCardGrid.svelte';
	import ErrorAlert from '$lib/components/case/ErrorAlert.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import CaseCard from '$lib/components/cases/CaseCard.svelte';
	import CaseScoringDashboard from '$lib/components/ai/CaseScoringDashboard.svelte';
	import CaseViewModal from '$lib/components/cases/CaseViewModal.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { invalidateAll, goto } from '$app/navigation';
	import type { PageData } from './$types';

	const { data }: { data: PageData } = $props();

	let viewMode = $state<'list' | 'cards' | 'rich'>('list');
	let showScoring = $state(false);
	let caseSearchQuery = $state('');
	let analyzingCaseId = $state<string | null>(null);
	let lastAnalyzedCase = $state<{ id: string; title: string } | null>(null);

	// Case quick-view modal
	let viewCaseId = $state<string | null>(null);
	let showViewModal = $state(false);
	let analysisResult = $state<any>(null);
	let analysisError = $state<string | null>(null);

	let filteredActiveCases = $derived.by(() => {
		const all = data.activeCases ?? [];
		if (!caseSearchQuery) return all;
		const q = caseSearchQuery.toLowerCase();
		return all.filter((c: any) =>
			(c.title ?? '').toLowerCase().includes(q) ||
			(c.caseNumber ?? '').toLowerCase().includes(q) ||
			(c.description ?? '').toLowerCase().includes(q) ||
			(c.status ?? '').toLowerCase().includes(q)
		);
	});

	let cardCases = $derived(
		filteredActiveCases.map((c: any) => ({
			id: c.id,
			title: c.title ?? 'Untitled',
			status: c.status === 'closed' || c.status === 'archived' ? 'closed' as const : 'active' as const,
			createdAt: c.createdAt ?? '',
			updatedAt: c.updatedAt ?? '',
			evidence: [],
		}))
	);

	let richCaseCards = $derived(
		filteredActiveCases.map((c: any) => ({
			id: c.id,
			title: c.title ?? 'Untitled',
			description: c.description ?? '',
			status: (c.status === 'active' || c.status === 'pending' || c.status === 'closed' || c.status === 'archived') ? c.status : 'active' as const,
			priority: (c.priority === 'critical' || c.priority === 'high' || c.priority === 'medium' || c.priority === 'low') ? c.priority : 'medium' as const,
			created: c.createdAt ?? new Date().toISOString(),
			updated: c.updatedAt,
			stats: { evidence: c.evidenceCount ?? 0, witnesses: c.witnessCount ?? 0, documents: c.documentCount ?? 0 },
			tags: c.tags ?? [],
			progress: c.progress,
		}))
	);

	async function analyzeCase(caseId: string, caseTitle: string) {
		analyzingCaseId = caseId;
		lastAnalyzedCase = { id: caseId, title: caseTitle };
		analysisError = null;
		analysisResult = null;

		try {
			const response = await fetch('/api/orchestrator/analyze', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					task: 'analyze-case',
					payload: {
						caseId,
						query: `Analyze case "${caseTitle}" and provide:
1. Case strength assessment
2. Key legal issues identified
3. Evidence gaps or weaknesses
4. Recommended next steps
5. Potential legal precedents`
					}
				})
			});

			const result = await response.json();

			if (result.success) {
				analysisResult = {
					caseId,
					caseTitle,
					...result.data
				};
			} else {
				analysisError = result.error || 'Analysis failed';
			}
		} catch (error) {
			analysisError = error instanceof Error ? error.message : 'Network error';
		} finally {
			analyzingCaseId = null;
		}
	}

	function closeAnalysis() {
		analysisResult = null;
		analysisError = null;
	}
</script>

<div class="terminal-page">
	<!-- Terminal Header -->
	<div class="terminal-header">
		<div class="header-left">
			<div class="ac-icon-badge">
				<Icon name="folder-open" />
			</div>
			<div class="system-tag">LEGAL-AI.CORPUS</div>
			<div class="header-divider"></div>
			<h1 class="terminal-title">ACTIVE CASE FILES</h1>
		</div>
		<div class="header-right">
			<div class="status-indicator">
				<span class="status-dot"></span>
				<span class="status-text">SECURE LINK</span>
			</div>
			<div class="case-count">{data.stats.active} OPEN / {data.stats.total} TOTAL</div>
		</div>
	</div>

	{#if data.loadError}
		<ErrorAlert
			error={data.loadError}
			onRetry={() => invalidateAll()}
		/>
	{/if}

	<!-- Action Bar -->
	<div class="action-bar">
		<div class="action-left">
			<a href="/cases/new" class="btn-terminal btn-primary">
				<Icon name="plus" />
				NEW CASE
			</a>
			<button onclick={() => (showScoring = !showScoring)} class="btn-terminal">
				{showScoring ? 'HIDE AI SCORING' : 'AI SCORING'}
			</button>
		</div>
		<div class="view-mode-selector">
			<button
				onclick={() => (viewMode = 'list')}
				class="mode-btn"
				class:active={viewMode === 'list'}
			>
				LIST
			</button>
			<button
				onclick={() => (viewMode = 'cards')}
				class="mode-btn"
				class:active={viewMode === 'cards'}
			>
				CARDS
			</button>
			<button
				onclick={() => (viewMode = 'rich')}
				class="mode-btn"
				class:active={viewMode === 'rich'}
			>
				RICH
			</button>
		</div>
	</div>

	<!-- Priority Stats Cards -->
	<div class="stats-cards-row">
		<div class="pstat-card pstat-critical">
			<span class="pstat-value">{data.stats.high}</span>
			<span class="pstat-label">HIGH / CRITICAL</span>
		</div>
		<div class="pstat-card pstat-medium">
			<span class="pstat-value">{data.stats.medium}</span>
			<span class="pstat-label">MEDIUM</span>
		</div>
		<div class="pstat-card pstat-low">
			<span class="pstat-value">{data.stats.low}</span>
			<span class="pstat-label">LOW</span>
		</div>
		<div class="pstat-card pstat-closed">
			<span class="pstat-value">{data.stats.closed}</span>
			<span class="pstat-label">CLOSED</span>
		</div>
		{#if data.user}
			<div class="pstat-card pstat-agent">
				<span class="pstat-label">AGENT</span>
				<span class="pstat-value agent-name">{data.user.username ?? data.user.email ?? 'Unknown'}</span>
			</div>
		{/if}
	</div>

	<!-- Search Section -->
	<div class="search-wrapper">
		<SearchBar
			placeholder="SEARCH CASES BY TITLE, NUMBER, OR STATUS..."
			value={caseSearchQuery}
			onsearch={(q) => { caseSearchQuery = q; }}
		/>
		{#if caseSearchQuery}
			<div class="search-result-count">
				{filteredActiveCases.length} / {(data.activeCases ?? []).length} MATCHED
			</div>
		{/if}
	</div>

	<CaseStats />

	{#if showScoring}
		<div class="scoring-panel">
			<CaseScoringDashboard />
		</div>
	{/if}

	<!-- Case Display -->
	{#if viewMode === 'list'}
		<div class="terminal-table-wrapper">
			<table class="terminal-table">
				<thead>
					<tr>
						<th>CASE TITLE</th>
						<th>CASE NO.</th>
						<th>LAST MODIFIED</th>
						<th>STATUS</th>
						<th>ACTIONS</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredActiveCases as caseItem (caseItem.id)}
						<tr class="case-row">
							<td class="case-title">
								<a href="/cases/{caseItem.id}" class="case-link" onclick={(e) => { e.preventDefault(); viewCaseId = caseItem.id; showViewModal = true; }}>
									{caseItem.title ?? 'Untitled Case'}
								</a>
							</td>
							<td class="case-number">{caseItem.caseNumber ?? caseItem.id?.slice(0, 8) ?? 'N/A'}</td>
							<td class="case-date">{new Date(caseItem.updatedAt ?? caseItem.createdAt).toLocaleDateString()}</td>
							<td class="case-status">
								<span class="status-badge status-{caseItem.status?.toLowerCase() ?? 'pending'}">
									{caseItem.status?.toUpperCase() ?? 'PENDING'}
								</span>
							</td>
							<td class="case-actions">
								<button
									onclick={() => analyzeCase(caseItem.id, caseItem.title ?? 'Untitled')}
									class="action-icon"
									title="AI Analysis"
									disabled={analyzingCaseId === caseItem.id}
								>
									{#if analyzingCaseId === caseItem.id}
										<Icon name="loader-circle" class="animate-spin" />
									{:else}
										<Icon name="brain" />
									{/if}
								</button>
								<a href="/cases/{caseItem.id}" class="action-icon" title="View" onclick={(e) => { e.preventDefault(); viewCaseId = caseItem.id; showViewModal = true; }}>
									<Icon name="eye" />
								</a>
								<a href="/cases/{caseItem.id}/edit" class="action-icon" title="Edit">
									<Icon name="pencil" />
								</a>
							</td>
						</tr>
					{/each}
					{#if filteredActiveCases.length === 0}
						<tr>
							<td colspan="5" class="empty-state">NO CASES FOUND</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	{:else if viewMode === 'rich'}
		<div class="rich-cards-grid">
			{#each richCaseCards as caseItem (caseItem.id)}
				<CaseCard
					{caseItem}
					onView={(id) => { viewCaseId = id; showViewModal = true; }}
					onEdit={(id) => { goto(`/cases/${id}`); }}
				/>
			{/each}
			{#if richCaseCards.length === 0}
				<p class="empty-msg">NO CASES FOUND</p>
			{/if}
		</div>
	{:else}
		<CaseCardGrid cases={cardCases} isLoading={false} />
	{/if}

	<!-- AI Analysis Modal -->
	{#if analysisResult || analysisError}
		<div class="analysis-modal-overlay" onclick={closeAnalysis}>
			<div class="analysis-modal" onclick={(e) => e.stopPropagation()}>
				<div class="modal-header">
					<div class="modal-title">
						<Icon name="brain" />
						LEGAL AI ANALYSIS
					</div>
					<button onclick={closeAnalysis} class="close-btn">
						<Icon name="x" />
					</button>
				</div>

				{#if analysisError}
					<div class="modal-body">
						<div class="error-message">
							<Icon name="triangle-alert" />
							<div>
								<div class="error-title">ANALYSIS FAILED</div>
								<div class="error-detail">{analysisError}</div>
							</div>
						</div>
						<div class="service-info">
							<strong>Service:</strong> Legal AI Orchestrator (Port 8102)<br/>
							<strong>Backend:</strong> Ollama gemma3-legal:latest
						</div>
						<button
							class="retry-btn"
							onclick={() => { if (lastAnalyzedCase) analyzeCase(lastAnalyzedCase.id, lastAnalyzedCase.title); }}
						>
							<Icon name="refresh-cw" />
							Retry Analysis
						</button>
					</div>
				{:else if analysisResult}
					<div class="modal-body">
						<div class="case-info">
							<div class="info-label">CASE ANALYZED:</div>
							<div class="info-value">{analysisResult.caseTitle}</div>
							<div class="info-meta">ID: {analysisResult.caseId}</div>
						</div>

						<div class="analysis-content">
							<div class="analysis-section">
								<div class="section-header">
									<Icon name="activity" />
									<span>ANALYSIS RESPONSE</span>
								</div>
								<div class="section-content">
									{#if typeof analysisResult.result === 'string'}
										<pre class="analysis-text">{analysisResult.result}</pre>
									{:else if analysisResult.response}
										<pre class="analysis-text">{JSON.stringify(analysisResult.response, null, 2)}</pre>
									{:else}
										<pre class="analysis-text">{JSON.stringify(analysisResult, null, 2)}</pre>
									{/if}
								</div>
							</div>

							<div class="analysis-metadata">
								<div class="meta-item">
									<Icon name="cpu" size={14} />
									<span>Provider: {analysisResult.provider || 'legal-orchestrator'}</span>
								</div>
								<div class="meta-item">
									<Icon name="clock" size={14} />
									<span>Timestamp: {new Date(analysisResult.timestamp || Date.now()).toLocaleString()}</span>
								</div>
							</div>
						</div>
					</div>
				{/if}

				<div class="modal-footer">
					<button onclick={closeAnalysis} class="btn-modal btn-secondary">
						CLOSE
					</button>
					{#if analysisResult}
						<a href="/cases/{analysisResult.caseId}" class="btn-modal btn-primary">
							VIEW FULL CASE
							<Icon name="arrow-right" />
						</a>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<CaseViewModal
		bind:open={showViewModal}
		caseId={viewCaseId}
		onClose={() => { showViewModal = false; viewCaseId = null; }}
		onEdit={(id) => goto(`/cases/${id}`)}
	/>

	<!-- Terminal Footer -->
	<div class="terminal-footer">
		<div class="footer-left">31 LEGAL AUTHORITY / MANUAL ACCESS</div>
		<div class="footer-right">SYSTEM READY</div>
	</div>
</div>

<style>
	.terminal-page {
		min-height: 100vh;
		background: #0a0a0a;
		color: #e0e0e0;
		font-family: 'JetBrains Mono', 'Courier New', monospace;
		padding: 0;
		margin: -2.5rem;
	}
	.terminal-page :global(h1), .terminal-page :global(h2), .terminal-page :global(h3), .terminal-page :global(h4), .terminal-page :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.terminal-page :global(a) { color: inherit; border-bottom: none; }
	.terminal-page :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.terminal-page :global(input), .terminal-page :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.terminal-page :global(.panel), .terminal-page :global(.card), .terminal-page :global([class*="panel"]) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

	/* Terminal Header */
	.terminal-header {
		background: #000;
		border-bottom: 2px solid #1a1a1a;
		padding: 0.75rem 1.5rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.ac-icon-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.5rem;
		background: rgba(212, 199, 163, 0.08);
		border: 1px solid rgba(212, 199, 163, 0.2);
		color: rgba(212, 199, 163, 0.7);
	}

	.system-tag {
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		color: #666;
		padding: 0.25rem 0.5rem;
		border: 1px solid #333;
	}

	.header-divider {
		width: 1px;
		height: 1.25rem;
		background: #333;
	}

	.terminal-title {
		font-size: 1rem;
		font-weight: 600;
		letter-spacing: 0.15em;
		color: #fff;
		margin: 0;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}

	.status-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		color: #666;
	}

	.status-dot {
		width: 6px;
		height: 6px;
		background: #00ff00;
		border-radius: 50%;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	.status-text {
		text-transform: uppercase;
	}

	.case-count {
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		color: #999;
	}

	/* Action Bar */
	.action-bar {
		background: #0f0f0f;
		border-bottom: 1px solid #1a1a1a;
		padding: 0.75rem 1.5rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.action-left {
		display: flex;
		gap: 0.75rem;
	}

	.btn-terminal {
		background: #1a1a1a;
		border: 1px solid #333;
		color: #999;
		padding: 0.5rem 1rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		font-family: 'JetBrains Mono', monospace;
		cursor: pointer;
		transition: all 0.2s;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}

	.btn-terminal:hover {
		background: #222;
		border-color: #555;
		color: #fff;
	}

	.btn-terminal.btn-primary {
		background: #1a3a1a;
		border-color: #2a5a2a;
		color: #4ade80;
	}

	.btn-terminal.btn-primary:hover {
		background: #2a4a2a;
		border-color: #3a6a3a;
	}

	.view-mode-selector {
		display: flex;
		border: 1px solid #333;
		overflow: hidden;
	}

	.mode-btn {
		background: #1a1a1a;
		border: none;
		border-right: 1px solid #333;
		color: #666;
		padding: 0.5rem 1rem;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		font-family: 'JetBrains Mono', monospace;
		cursor: pointer;
		transition: all 0.2s;
	}

	.mode-btn:last-child {
		border-right: none;
	}

	.mode-btn:hover {
		background: #222;
		color: #999;
	}

	.mode-btn.active {
		background: #2a2a2a;
		color: #fff;
	}

	/* Stats Cards Row */
	.stats-cards-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 0.75rem;
		padding: 1rem 1.5rem;
		background: #0a0a0a;
		border-bottom: 1px solid #1a1a1a;
	}

	.pstat-card {
		background: #111;
		border: 1px solid #222;
		border-top: 3px solid #333;
		padding: 0.875rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		transition: border-color 0.2s, transform 0.15s;
	}

	.pstat-card:hover {
		transform: translateY(-1px);
		border-color: #333;
	}

	.pstat-value {
		font-size: 1.375rem;
		font-weight: 800;
		line-height: 1.2;
	}

	.pstat-value.agent-name {
		font-size: 0.8rem;
		font-weight: 600;
	}

	.pstat-label {
		font-size: 0.6rem;
		letter-spacing: 0.15em;
		color: #555;
		font-weight: 600;
	}

	.pstat-critical { border-top-color: #ef4444; }
	.pstat-critical .pstat-value { color: #ef4444; }
	.pstat-medium { border-top-color: #f59e0b; }
	.pstat-medium .pstat-value { color: #f59e0b; }
	.pstat-low { border-top-color: #3b82f6; }
	.pstat-low .pstat-value { color: #3b82f6; }
	.pstat-closed { border-top-color: #6b7280; }
	.pstat-closed .pstat-value { color: #6b7280; }
	.pstat-agent { border-top-color: #8b5cf6; }
	.pstat-agent .pstat-value { color: #8b5cf6; }

	/* Search */
	.search-wrapper {
		padding: 1rem 1.5rem;
		background: #0a0a0a;
		border-bottom: 1px solid #1a1a1a;
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.search-result-count {
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		color: #666;
		white-space: nowrap;
	}

	.scoring-panel {
		padding: 1rem 1.5rem;
		background: #0a0a0a;
		border-bottom: 1px solid #1a1a1a;
	}

	/* Terminal Table */
	.terminal-table-wrapper {
		padding: 1.5rem;
		background: #0a0a0a;
	}

	.terminal-table {
		width: 100%;
		border-collapse: collapse;
		border: 1px solid #1a1a1a;
	}

	.terminal-table thead {
		background: #0f0f0f;
		border-bottom: 2px solid #1a1a1a;
	}

	.terminal-table th {
		text-align: left;
		padding: 0.75rem 1rem;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.15em;
		color: #666;
		border-right: 1px solid #1a1a1a;
	}

	.terminal-table th:last-child {
		border-right: none;
	}

	.case-row {
		border-bottom: 1px solid #1a1a1a;
		transition: background 0.15s;
	}

	.case-row:hover {
		background: #0f0f0f;
	}

	.terminal-table td {
		padding: 1rem;
		font-size: 0.8rem;
		border-right: 1px solid #1a1a1a;
	}

	.terminal-table td:last-child {
		border-right: none;
	}

	.case-title {
		font-weight: 500;
	}

	.case-link {
		color: #e0e0e0;
		text-decoration: none;
		transition: color 0.2s;
	}

	.case-link:hover {
		color: #4ade80;
	}

	.case-number {
		font-family: 'JetBrains Mono', monospace;
		color: #999;
		font-size: 0.75rem;
	}

	.case-date {
		color: #999;
		font-size: 0.75rem;
	}

	.status-badge {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		border-radius: 2px;
	}

	.status-active {
		background: rgba(34, 197, 94, 0.15);
		color: #4ade80;
		border: 1px solid rgba(34, 197, 94, 0.3);
	}

	.status-pending {
		background: rgba(251, 191, 36, 0.15);
		color: #fbbf24;
		border: 1px solid rgba(251, 191, 36, 0.3);
	}

	.status-closed {
		background: rgba(107, 114, 128, 0.15);
		color: #9ca3af;
		border: 1px solid rgba(107, 114, 128, 0.3);
	}

	.status-archived {
		background: rgba(75, 85, 99, 0.15);
		color: #6b7280;
		border: 1px solid rgba(75, 85, 99, 0.3);
	}

	.case-actions {
		display: flex;
		gap: 0.75rem;
	}

	.action-icon {
		color: #666;
		transition: color 0.2s;
		cursor: pointer;
		background: none;
		border: none;
		padding: 0;
		display: inline-flex;
		align-items: center;
	}

	.action-icon:hover {
		color: #4ade80;
	}

	.action-icon:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.empty-state {
		text-align: center;
		padding: 3rem !important;
		color: #666;
		letter-spacing: 0.15em;
		font-size: 0.8rem;
	}

	/* Rich Cards Grid */
	.rich-cards-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
		gap: 1.25rem;
		padding: 1.5rem;
		background: #0a0a0a;
	}

	.empty-msg {
		color: #666;
		font-family: monospace;
		font-size: 0.85rem;
		letter-spacing: 0.1em;
		grid-column: 1 / -1;
		text-align: center;
		padding: 2rem;
	}

	/* Terminal Footer */
	.terminal-footer {
		background: #000;
		border-top: 2px solid #1a1a1a;
		padding: 0.5rem 1.5rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 10;
	}

	.footer-left,
	.footer-right {
		font-size: 0.65rem;
		letter-spacing: 0.15em;
		color: #666;
	}

	/* AI Analysis Modal */
	.analysis-modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 2rem;
	}

	.analysis-modal {
		background: #0f0f0f;
		border: 2px solid #1a1a1a;
		max-width: 900px;
		width: 100%;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 0 40px rgba(0, 0, 0, 0.5);
	}

	.modal-header {
		background: #000;
		border-bottom: 2px solid #1a1a1a;
		padding: 1rem 1.5rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.modal-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: 0.15em;
		color: #4ade80;
	}

	.close-btn {
		background: none;
		border: none;
		color: #666;
		cursor: pointer;
		padding: 0.25rem;
		transition: color 0.2s;
	}

	.close-btn:hover {
		color: #fff;
	}

	.retry-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 1rem;
		padding: 0.5rem 1rem;
		background: rgba(16, 185, 129, 0.15);
		border: 1px solid #10b981;
		color: #10b981;
		border-radius: 4px;
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8rem;
		transition: background 0.2s;
	}

	.retry-btn:hover {
		background: rgba(16, 185, 129, 0.3);
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
	}

	.case-info {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		padding: 1rem;
		margin-bottom: 1.5rem;
	}

	.info-label {
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		color: #666;
		margin-bottom: 0.5rem;
	}

	.info-value {
		font-size: 1rem;
		color: #fff;
		font-weight: 600;
		margin-bottom: 0.25rem;
	}

	.info-meta {
		font-size: 0.75rem;
		color: #999;
		font-family: 'JetBrains Mono', monospace;
	}

	.analysis-content {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.analysis-section {
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		overflow: hidden;
	}

	.section-header {
		background: #0f0f0f;
		border-bottom: 1px solid #1a1a1a;
		padding: 0.75rem 1rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		letter-spacing: 0.1em;
		color: #4ade80;
		font-weight: 600;
	}

	.section-content {
		padding: 1rem;
	}

	.analysis-text {
		font-family: 'JetBrains Mono', 'Courier New', monospace;
		font-size: 0.85rem;
		line-height: 1.6;
		color: #e0e0e0;
		white-space: pre-wrap;
		margin: 0;
	}

	.analysis-metadata {
		display: flex;
		gap: 1.5rem;
		padding: 1rem;
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		font-size: 0.75rem;
		color: #999;
	}

	.meta-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.error-message {
		display: flex;
		gap: 1rem;
		padding: 1.5rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		color: #ef4444;
		margin-bottom: 1rem;
	}

	.error-title {
		font-weight: 600;
		font-size: 0.9rem;
		letter-spacing: 0.1em;
		margin-bottom: 0.5rem;
	}

	.error-detail {
		font-size: 0.8rem;
		color: #fca5a5;
	}

	.service-info {
		padding: 1rem;
		background: #0a0a0a;
		border: 1px solid #1a1a1a;
		font-size: 0.75rem;
		line-height: 1.8;
		color: #999;
	}

	.modal-footer {
		background: #000;
		border-top: 2px solid #1a1a1a;
		padding: 1rem 1.5rem;
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
	}

	.btn-modal {
		padding: 0.6rem 1.25rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		font-family: 'JetBrains Mono', monospace;
		cursor: pointer;
		transition: all 0.2s;
		border: 1px solid;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		text-decoration: none;
	}

	.btn-modal.btn-secondary {
		background: #1a1a1a;
		border-color: #333;
		color: #999;
	}

	.btn-modal.btn-secondary:hover {
		background: #222;
		border-color: #555;
		color: #fff;
	}

	.btn-modal.btn-primary {
		background: #1a3a1a;
		border-color: #2a5a2a;
		color: #4ade80;
	}

	.btn-modal.btn-primary:hover {
		background: #2a4a2a;
		border-color: #3a6a3a;
	}
</style>
