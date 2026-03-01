<script lang="ts">
	import CaseFilters from '$lib/components/yorha/cases/CaseFilters.svelte';
	import CasesList from '$lib/components/yorha/cases/CasesList.svelte';
	import CaseStats from '$lib/components/yorha/cases/CaseStats.svelte';
	import CaseCardGrid from '$lib/components/dashboard/CaseCardGrid.svelte';
	import ErrorAlert from '$lib/components/case/ErrorAlert.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import CaseCard from '$lib/components/cases/CaseCard.svelte';
	import CaseScoringDashboard from '$lib/components/ai/CaseScoringDashboard.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { PageData } from './$types';

	const { data }: { data: PageData } = $props();

	let viewMode = $state<'list' | 'cards' | 'rich'>('list');
	let showScoring = $state(false);
	let caseSearchQuery = $state('');

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
</script>

<div class="terminal-page">
	<!-- Terminal Header -->
	<div class="terminal-header">
		<div class="header-left">
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
			onRetry={() => window.location.reload()}
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

	<!-- Priority Stats Bar -->
	<div class="stats-bar">
		<div class="stat-item critical">
			<span class="stat-value">{data.stats.high}</span>
			<span class="stat-label">HIGH/CRITICAL</span>
		</div>
		<div class="stat-divider"></div>
		<div class="stat-item medium">
			<span class="stat-value">{data.stats.medium}</span>
			<span class="stat-label">MEDIUM</span>
		</div>
		<div class="stat-divider"></div>
		<div class="stat-item low">
			<span class="stat-value">{data.stats.low}</span>
			<span class="stat-label">LOW</span>
		</div>
		<div class="stat-divider"></div>
		<div class="stat-item closed">
			<span class="stat-value">{data.stats.closed}</span>
			<span class="stat-label">CLOSED</span>
		</div>
		{#if data.user}
			<div class="stat-divider"></div>
			<div class="stat-item agent">
				<span class="stat-label">AGENT:</span>
				<span class="stat-value">{data.user.username ?? data.user.email ?? 'Unknown'}</span>
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
								<a href="/cases/{caseItem.id}" class="case-link">
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
								<a href="/cases/{caseItem.id}" class="action-icon" title="View">
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
					onView={(id) => { window.location.href = `/cases/${id}`; }}
					onEdit={(id) => { window.location.href = `/cases/${id}`; }}
				/>
			{/each}
			{#if richCaseCards.length === 0}
				<p class="empty-msg">NO CASES FOUND</p>
			{/if}
		</div>
	{:else}
		<CaseCardGrid cases={cardCases} isLoading={false} />
	{/if}

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
	}

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

	/* Stats Bar */
	.stats-bar {
		background: #0a0a0a;
		border-bottom: 1px solid #1a1a1a;
		padding: 0.75rem 1.5rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.stat-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.7rem;
		letter-spacing: 0.1em;
	}

	.stat-value {
		font-weight: 700;
		font-size: 0.85rem;
	}

	.stat-label {
		color: #666;
	}

	.stat-item.critical .stat-value { color: #ef4444; }
	.stat-item.medium .stat-value { color: #f59e0b; }
	.stat-item.low .stat-value { color: #3b82f6; }
	.stat-item.closed .stat-value { color: #6b7280; }
	.stat-item.agent .stat-value { color: #8b5cf6; }

	.stat-divider {
		width: 1px;
		height: 1rem;
		background: #333;
		margin: 0 0.5rem;
	}

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
	}

	.action-icon:hover {
		color: #4ade80;
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
</style>
