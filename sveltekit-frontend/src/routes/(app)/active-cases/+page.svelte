<script lang="ts">
	import CaseFilters from '$lib/components/yorha/cases/CaseFilters.svelte';
	import CasesList from '$lib/components/yorha/cases/CasesList.svelte';
	import CaseStats from '$lib/components/yorha/cases/CaseStats.svelte';
	import CaseCardGrid from '$lib/components/dashboard/CaseCardGrid.svelte';
	import ErrorAlert from '$lib/components/case/ErrorAlert.svelte';
	import type { PageData } from './$types';

	const { data }: { data: PageData } = $props();

	let viewMode = $state<'list' | 'cards'>('list');

	let cardCases = $state(
		(data.activeCases ?? []).map((c: any) => ({
			id: c.id,
			title: c.title ?? 'Untitled',
			status: c.status === 'closed' || c.status === 'archived' ? 'closed' as const : 'active' as const,
			createdAt: c.createdAt ?? '',
			updatedAt: c.updatedAt ?? '',
			evidence: [],
		}))
	);
</script>

<div class="active-cases-page">
	<div class="page-header">
		<div>
			<h1>Active Cases</h1>
			<p class="subtitle">
				{data.stats.active} active of {data.stats.total} total
				{#if data.user}
					<span class="user-tag">Agent: {data.user.username ?? data.user.email ?? 'Unknown'}</span>
				{/if}
			</p>
		</div>
		<div class="header-actions">
			<a href="/cases/new" class="new-case-btn">+ New Case</a>
			<div class="view-toggle">
				<button onclick={() => (viewMode = 'list')} class="view-btn" class:active={viewMode === 'list'}>
					List
				</button>
				<button onclick={() => (viewMode = 'cards')} class="view-btn" class:active={viewMode === 'cards'}>
					Cards
				</button>
			</div>
		</div>
	</div>

	{#if data.loadError}
		<ErrorAlert
			error={data.loadError}
			onRetry={() => window.location.reload()}
		/>
	{/if}

	<!-- Priority Stats -->
	<div class="priority-bar">
		<span class="pri pri-high">{data.stats.high} HIGH/CRIT</span>
		<span class="pri pri-med">{data.stats.medium} MEDIUM</span>
		<span class="pri pri-low">{data.stats.low} LOW</span>
		<span class="pri pri-closed">{data.stats.closed} CLOSED</span>
	</div>

	<CaseStats />

	{#if viewMode === 'list'}
		<CaseFilters />
		<CasesList />
	{:else}
		<CaseCardGrid cases={cardCases} isLoading={false} />
	{/if}
</div>

<style>
	.active-cases-page {
		padding: 1.5rem;
		min-height: 100vh;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1.5rem;
		gap: 1rem;
		flex-wrap: wrap;
	}

	h1 {
		font-size: 1.8rem;
		color: #22d3ee;
		text-shadow: 0 0 10px rgba(34, 211, 238, 0.5);
		margin: 0;
	}

	.subtitle {
		color: #94a3b8;
		font-size: 0.85rem;
		margin: 0.25rem 0 0;
	}

	.user-tag {
		margin-left: 0.75rem;
		font-family: monospace;
		font-size: 0.7rem;
		color: #a78bfa;
		border: 1px solid #a78bfa;
		padding: 0.1rem 0.4rem;
	}

	.header-actions {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.new-case-btn {
		padding: 0.4rem 0.8rem;
		font-size: 0.8rem;
		background: rgba(16, 185, 129, 0.2);
		border: 1px solid rgba(16, 185, 129, 0.5);
		color: #10b981;
		text-decoration: none;
		font-family: monospace;
		transition: all 0.15s;
	}

	.new-case-btn:hover {
		background: rgba(16, 185, 129, 0.3);
	}

	.priority-bar {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.pri {
		padding: 0.25rem 0.5rem;
		font-size: 0.7rem;
		font-family: monospace;
		letter-spacing: 0.05em;
	}

	.pri-high { border: 1px solid #ef4444; color: #ef4444; }
	.pri-med { border: 1px solid #eab308; color: #eab308; }
	.pri-low { border: 1px solid #3b82f6; color: #3b82f6; }
	.pri-closed { border: 1px solid #6b7280; color: #6b7280; }

	.view-toggle {
		display: flex;
		gap: 1px;
		border: 1px solid rgba(34, 211, 238, 0.3);
		overflow: hidden;
	}

	.view-btn {
		padding: 0.375rem 0.75rem;
		font-size: 0.8rem;
		color: rgba(148, 163, 184, 0.8);
		background: rgba(30, 41, 59, 0.8);
		cursor: pointer;
		transition: all 0.15s;
		border: none;
		font-family: monospace;
	}

	.view-btn:hover { background: rgba(34, 211, 238, 0.1); }
	.view-btn.active { background: rgba(34, 211, 238, 0.2); color: #22d3ee; }
</style>