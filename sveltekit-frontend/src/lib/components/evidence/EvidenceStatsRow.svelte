<script lang="ts">
	let {
		totalCount = 0,
		filteredCount = 0,
		caseId = null,
		searchMode = 'local',
		semanticResultsCount = 0,
		searchTimingMs = null
	}: {
		totalCount?: number;
		filteredCount?: number;
		caseId?: string | null;
		searchMode?: string;
		semanticResultsCount?: number;
		searchTimingMs?: number | null;
	} = $props();

	let hasFilter = $derived(filteredCount !== totalCount);
</script>

<div class="stats-row">
	<span class="stat-pill">
		<span class="stat-value">{totalCount}</span>
		<span class="stat-label">Total Items</span>
	</span>

	{#if hasFilter}
		<span class="stat-pill filtered">
			<span class="stat-value">{filteredCount}</span>
			<span class="stat-label">Showing</span>
		</span>
	{/if}

	{#if caseId}
		<span class="stat-pill case">
			<span class="stat-label">Case</span>
			<span class="stat-value mono">#{caseId.slice(0, 8)}</span>
		</span>
	{/if}

	{#if searchMode === 'semantic' && semanticResultsCount > 0}
		<span class="stat-pill semantic">
			<span class="stat-value">{semanticResultsCount}</span>
			<span class="stat-label">semantic {#if searchTimingMs}({searchTimingMs}ms){/if}</span>
		</span>
	{/if}
</div>

<style>
	.stats-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		flex-wrap: wrap;
	}
	.stat-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.06);
		font-size: 0.75rem;
	}
	.stat-value {
		font-weight: 600;
		color: rgba(212, 199, 163, 0.9);
	}
	.stat-label {
		color: rgba(212, 199, 163, 0.4);
	}
	.stat-pill.filtered .stat-value {
		color: #60a5fa;
	}
	.stat-pill.case .stat-value {
		color: #f59e0b;
	}
	.stat-pill.semantic .stat-value {
		color: #a78bfa;
	}
	.mono {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.7rem;
	}
</style>
