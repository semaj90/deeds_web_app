<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface ErrorSummary {
		file_path: string;
		error_count: number;
		latest_error?: string;
	}

	let results = $state<ErrorSummary[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	$effect(() => {
		fetchResults();
	});

	async function fetchResults() {
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/errors/summary', {
				signal: AbortSignal.timeout(5000)
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			results = data.errors ?? data ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load audit results';
			results = [];
		} finally {
			loading = false;
		}
	}

	let totalErrors = $derived(results.reduce((sum, r) => sum + r.error_count, 0));
</script>

<div class="audit-results">
	<div class="audit-header">
		<Icon name="alert-triangle" size={16} />
		<h3>Pipeline Audit Results</h3>
		<Button variant="ghost" size="sm" onclick={fetchResults} disabled={loading}>
			{loading ? 'Loading...' : 'Refresh'}
		</Button>
	</div>

	{#if loading}
		<p class="audit-status">Loading audit results...</p>
	{:else if error}
		<p class="audit-error">{error}</p>
	{:else if results.length === 0}
		<div class="audit-empty">
			<Icon name="check-circle" size={20} />
			<span>No errors found</span>
		</div>
	{:else}
		<div class="audit-summary">
			<span class="error-total">{totalErrors} errors</span>
			<span class="file-count">across {results.length} files</span>
		</div>
		<ul class="audit-list">
			{#each results as item}
				<li class="audit-item">
					<div class="item-header">
						<Icon name="file" size={12} />
						<span class="file-path">{item.file_path}</span>
						<span class="error-badge">{item.error_count}</span>
					</div>
					{#if item.latest_error}
						<p class="latest-error">{item.latest_error}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.audit-results {
		padding: 0.75rem;
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.5rem;
		background: var(--color-panel-soft, #1c1917);
	}
	.audit-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}
	.audit-header h3 {
		flex: 1;
		font-size: 0.875rem;
		font-weight: 600;
		margin: 0;
	}
	.audit-status,
	.audit-error {
		font-size: 0.8125rem;
		margin: 0;
	}
	.audit-error {
		color: var(--color-danger, #ef4444);
	}
	.audit-empty {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		opacity: 0.6;
	}
	.audit-summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		font-size: 0.75rem;
	}
	.error-total {
		font-weight: 600;
		color: var(--color-danger, #ef4444);
	}
	.file-count {
		opacity: 0.6;
	}
	.audit-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	.audit-item {
		padding: 0.5rem;
		border-radius: 0.25rem;
		background: rgba(255, 255, 255, 0.03);
	}
	.item-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8125rem;
	}
	.file-path {
		flex: 1;
		font-family: monospace;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.error-badge {
		font-size: 0.6875rem;
		font-weight: 600;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		background: rgba(239, 68, 68, 0.15);
		color: var(--color-danger, #ef4444);
	}
	.latest-error {
		font-size: 0.75rem;
		opacity: 0.6;
		margin: 0.25rem 0 0 1.25rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
